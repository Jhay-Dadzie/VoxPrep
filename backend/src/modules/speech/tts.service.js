/**
 * Text-to-Speech Service
 *
 * Speaks the interviewer's questions during a live session.
 *
 * ── Why Deepgram speaks first ────────────────────────────────────────────────
 *
 * The interview is meant to feel like a conversation, and the gap between the
 * candidate finishing an answer and hearing the next question is the whole of
 * that feeling. Measured against this project's key:
 *
 *   Deepgram Aura-2 : ~0.6s, ~5KB MP3 for a short question
 *   Gemini TTS      : several seconds, ~244KB WAV for the same sentence
 *
 * Ten times the latency and fifty times the bytes to push down a phone
 * connection, so Aura leads and Gemini is the reserve. Gemini also enforces a
 * ten-request-per-minute free tier, which a fifteen-question interview walks
 * straight into.
 *
 * ── Two providers, two formats ───────────────────────────────────────────────
 *
 * Aura returns MP3; Gemini returns headerless PCM that this service frames as
 * WAV. Nothing converts between them — the result carries its own content type
 * and callers are expected to read it, because handing a player the wrong file
 * extension is silence with no error.
 *
 * Design decisions:
 *  - Singleton class (matches stt.service.js / audio.service.js)
 *  - Voice keys are short friendly names; each maps to a voice per provider
 *  - All errors throw so the controller's try/catch handles HTTP status codes
 */

import axios from 'axios';
import {
  GEMINI_API_KEY,
  GEMINI_ENDPOINT,
  GEMINI_TTS_MODEL,
} from '../../config/gemini.js';
import { getDeepgramClient } from '../../config/deepgram.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

// ─── Voice catalogue ──────────────────────────────────────────────────────────

/**
 * The interviewer roster's voices, with a model per provider so a panelist
 * sounds like themselves whichever provider answers.
 *
 * Every Deepgram model here was verified against the live API — `aura-2` has
 * gaps that look plausible but 400 (there is no `aura-2-helios-en`), and an
 * unrecognised voice is rejected rather than defaulted.
 */
export const TTS_VOICES = {
  // Female-presenting
  kore:      { deepgram: 'aura-2-thalia-en',    gemini: 'Kore',      gender: 'female', accent: 'American', description: 'Clear and composed — recommended default' },
  sulafat:   { deepgram: 'aura-2-andromeda-en', gemini: 'Sulafat',   gender: 'female', accent: 'American', description: 'Warm and conversational' },
  erinome:   { deepgram: 'aura-2-athena-en',    gemini: 'Erinome',   gender: 'female', accent: 'American', description: 'Precise and articulate' },
  laomedeia: { deepgram: 'aura-2-cora-en',      gemini: 'Laomedeia', gender: 'female', accent: 'American', description: 'Upbeat and energetic' },
  gacrux:    { deepgram: 'aura-2-hera-en',      gemini: 'Gacrux',    gender: 'female', accent: 'American', description: 'Mature and authoritative' },
  achernar:  { deepgram: 'aura-2-luna-en',      gemini: 'Achernar',  gender: 'female', accent: 'American', description: 'Soft and unhurried' },

  // Male-presenting
  iapetus:    { deepgram: 'aura-2-apollo-en',   gemini: 'Iapetus',    gender: 'male', accent: 'American', description: 'Clear and professional' },
  alnilam:    { deepgram: 'aura-2-orion-en',    gemini: 'Alnilam',    gender: 'male', accent: 'American', description: 'Firm and direct' },
  schedar:    { deepgram: 'aura-2-arcas-en',    gemini: 'Schedar',    gender: 'male', accent: 'American', description: 'Even and neutral' },
  rasalgethi: { deepgram: 'aura-2-atlas-en',    gemini: 'Rasalgethi', gender: 'male', accent: 'American', description: 'Measured and informative' },
  orus:       { deepgram: 'aura-2-zeus-en',     gemini: 'Orus',       gender: 'male', accent: 'American', description: 'Deep and forceful' },
  algieba:    { deepgram: 'aura-2-draco-en',    gemini: 'Algieba',    gender: 'male', accent: 'British',  description: 'Smooth and natural' },
};

/** Kept as the old export name so existing importers keep working. */
export const GEMINI_VOICES = TTS_VOICES;

const DEFAULT_VOICE = 'kore';
const MAX_TEXT_LENGTH = 4096;          // characters per request

/** Gemini TTS always returns mono 16-bit PCM at this rate. */
export const TTS_SAMPLE_RATE = 24000;
const TTS_CHANNELS = 1;
const TTS_BITS_PER_SAMPLE = 16;

const WAV_MIME = 'audio/wav';
const MP3_MIME = 'audio/mpeg';

/**
 * Read style prefix, used by Gemini only — Aura takes its delivery from the
 * voice itself. This is how the interviewer ends up sounding like an
 * interviewer rather than a narrator reading a sentence off a page.
 */
const DEFAULT_STYLE = 'Say this the way an interviewer speaks to a candidate — calm, clear, unhurried, and neutral';

// ─── Service ──────────────────────────────────────────────────────────────────

class TTSService {
  /**
   * Synthesize speech and write the audio to an HTTP response.
   *
   * @param {string} text     - Text to speak (≤ 4096 chars)
   * @param {object} options
   * @param {string} [options.voice='kore'] - Voice key or raw provider voice name
   * @param {string} [options.style]        - Delivery direction (Gemini only)
   * @param {import('http').ServerResponse} res  - Express response object
   * @returns {Promise<{ character_count: number, voice: string, content_type: string }>}
   *          content_type is 'audio/mpeg' or 'audio/wav' depending on which
   *          provider answered — do not assume one.
   */
  async synthesizeToStream(text, options = {}, res) {
    const { buffer, voice, character_count, content_type } = await this.synthesize(text, options);

    res.set({
      'Content-Type': content_type,
      'Content-Length': String(buffer.length),
      'X-Voice': voice,
      'X-Character-Count': String(character_count),
    });

    res.end(buffer);

    return { character_count, voice, content_type };
  }

  /**
   * Synthesize speech and return the audio bytes.
   *
   * Deepgram answers unless it cannot, in which case Gemini does. A question
   * that goes unspoken strands the candidate mid-interview, so both providers
   * have to fail before this does.
   *
   * @param {string}  text
   * @param {object}  options
   * @returns {Promise<{ buffer: Buffer, content_type: string, character_count: number, voice: string, model: string }>}
   */
  async synthesize(text, options = {}) {
    const resolved = this._resolveOptions(text, options);

    try {
      return await this._synthesizeWithDeepgram(resolved);
    } catch (primaryError) {
      warn(
        `Deepgram TTS failed (${primaryError.statusCode ?? 'no status'}: ${primaryError.message}); ` +
        'trying Gemini'
      );

      try {
        return await this._synthesizeWithGemini(resolved);
      } catch (fallbackError) {
        _error('Gemini TTS fallback also failed:', fallbackError?.message ?? fallbackError);
        throw primaryError;   // report the primary failure; the reserve is an implementation detail
      }
    }
  }

  /**
   * Returns the available voice catalogue for GET /speech/voices.
   *
   * @returns {VoiceInfo[]}
   */
  getAvailableVoices() {
    return Object.entries(TTS_VOICES).map(([key, meta]) => ({
      key,
      model:       meta.deepgram,
      gender:      meta.gender,
      accent:      meta.accent,
      description: meta.description,
    }));
  }

  // ── Providers ─────────────────────────────────────────────────────────────

  /** Aura: fast, small, MP3. The one the conversation depends on. */
  async _synthesizeWithDeepgram({ spoken, voiceKey, deepgramVoice }) {
    const deepgram = getDeepgramClient();
    const audio = deepgram?.speak?.v1?.audio;

    if (typeof audio?.generate !== 'function') {
      throw new Error('Deepgram SDK exposes no speak.v1.audio.generate method');
    }

    const response = await audio.generate({ text: spoken, model: deepgramVoice, encoding: 'mp3' });
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new Error('Deepgram TTS returned an empty audio payload');
    }

    info(`TTS: "${voiceKey}" via ${deepgramVoice}, ${spoken.length} chars → ${buffer.length} bytes`);

    return {
      buffer,
      content_type: MP3_MIME,
      character_count: spoken.length,
      voice: voiceKey,
      model: deepgramVoice,
    };
  }

  /** Gemini: slower and much larger, held in reserve. */
  async _synthesizeWithGemini({ spoken, voiceKey, geminiVoice, style }) {
    if (!GEMINI_API_KEY) {
      throw new Error('Gemini speech synthesis is unavailable (missing API key)');
    }

    try {
      const response = await axios.post(
        `${GEMINI_ENDPOINT}/models/${GEMINI_TTS_MODEL}:generateContent`,
        {
          contents: [{ parts: [{ text: `${style}: ${spoken}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoice } },
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_API_KEY,
          },
        }
      );

      const buffer = this._pcmToWav(this._extractAudio(response.data));

      info(`TTS (fallback): "${voiceKey}" via Gemini ${geminiVoice}, ${spoken.length} chars → ${buffer.length} bytes`);

      return {
        buffer,
        content_type: WAV_MIME,
        character_count: spoken.length,
        voice: voiceKey,
        model: GEMINI_TTS_MODEL,
      };
    } catch (err) {
      throw this._toSurfacedError(err);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Validate text and resolve the voice for both providers.
   *
   * An unknown key falls back to the default rather than being passed through:
   * both providers reject unrecognised voice names outright, so passing one on
   * would turn a stale voice id from an older build into a failed question.
   */
  _resolveOptions(text, options) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('text is required for speech synthesis');
    }

    if (text.trim().length > MAX_TEXT_LENGTH) {
      throw new Error(
        `Text exceeds the ${MAX_TEXT_LENGTH}-character limit. ` +
        'Break long text into multiple requests.'
      );
    }

    const requested = String(options.voice ?? DEFAULT_VOICE).trim().toLowerCase();
    const voiceKey = TTS_VOICES[requested] ? requested : DEFAULT_VOICE;
    const voice = TTS_VOICES[voiceKey];

    return {
      spoken: text.trim(),
      voiceKey,
      deepgramVoice: voice.deepgram,
      geminiVoice: voice.gemini,
      style: options.style?.trim() || DEFAULT_STYLE,
    };
  }

  /**
   * Pull the base64 PCM payload out of a generateContent response.
   *
   * A refusal or a safety block comes back as a well-formed response with no
   * audio part, so the absence of inlineData is reported as a first-class
   * failure rather than an undefined further down.
   */
  _extractAudio(payload) {
    const parts = payload?.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((part) => part?.inlineData?.data || part?.inline_data?.data);
    const data = audioPart?.inlineData?.data ?? audioPart?.inline_data?.data;

    if (!data) {
      const reason =
        payload?.promptFeedback?.blockReason ||
        payload?.candidates?.[0]?.finishReason ||
        'no audio in response';
      throw new Error(`Gemini TTS returned no audio (${reason})`);
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      throw new Error('Gemini TTS returned an empty audio payload');
    }

    return buffer;
  }

  /**
   * Wrap raw PCM in a RIFF/WAVE container.
   *
   * Gemini returns headerless signed 16-bit little-endian samples, which is
   * exactly what a WAV data chunk holds — so this is a 44-byte prefix, not a
   * re-encode.
   */
  _pcmToWav(pcm, sampleRate = TTS_SAMPLE_RATE) {
    const byteRate = (sampleRate * TTS_CHANNELS * TTS_BITS_PER_SAMPLE) / 8;
    const blockAlign = (TTS_CHANNELS * TTS_BITS_PER_SAMPLE) / 8;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);   // chunk size: everything after this field
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);               // PCM fmt chunk length
    header.writeUInt16LE(1, 20);                // audio format: 1 = PCM
    header.writeUInt16LE(TTS_CHANNELS, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(TTS_BITS_PER_SAMPLE, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);

    return Buffer.concat([header, pcm]);
  }

  /** Turn an axios/Gemini failure into an Error carrying the upstream status. */
  _toSurfacedError(err) {
    if (!err?.response) {
      return err instanceof Error ? err : new Error(String(err));
    }

    const apiError = err.response.data?.error || {};
    const surfaced = new Error(
      apiError.message || err.response.statusText || 'Gemini TTS request failed'
    );
    surfaced.statusCode = err.response.status || 502;
    return surfaced;
  }
}

export default new TTSService();
