/**
 * Text-to-Speech Service
 *
 * Powered by Gemini's speech-generation models. Speaks the interviewer's
 * questions during a live session.
 *
 * ── Why the output is WAV ────────────────────────────────────────────────────
 *
 * Gemini TTS does not return a container format. It returns raw signed 16-bit
 * little-endian PCM (mono, 24 kHz) as base64 inside inlineData. Mobile audio
 * players cannot open headerless PCM, so this service prepends a 44-byte RIFF
 * header before the bytes leave here — every caller gets a playable file.
 *
 * ── Why synthesizeToStream no longer streams ─────────────────────────────────
 *
 * generateContent is a single-shot call: the audio arrives whole or not at all,
 * so there is nothing to pipe incrementally. The method keeps its name and
 * signature because the controller's contract is unchanged, and the latency
 * budget still holds — a one-sentence question comes back well inside a second.
 *
 * Design decisions:
 *  - Singleton class (matches stt.service.js / audio.service.js)
 *  - Voice keys are short friendly names; the service maps to Gemini voice names
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
 * Gemini prebuilt voices, filtered to the ones that read as interviewers.
 * Key: short friendly name used in the API.
 * Model: the `voiceName` Gemini expects in speechConfig.
 *
 * `accent` is descriptive only — Gemini voices are not accent-locked the way
 * Aura's were, so the field records the register the voice actually reads as.
 */
export const GEMINI_VOICES = {
  // Female-presenting
  kore:      { model: 'Kore',      gender: 'female', accent: 'Neutral', description: 'Firm and composed — recommended default' },
  sulafat:   { model: 'Sulafat',   gender: 'female', accent: 'Neutral', description: 'Warm and conversational' },
  erinome:   { model: 'Erinome',   gender: 'female', accent: 'Neutral', description: 'Clear and precise' },
  laomedeia: { model: 'Laomedeia', gender: 'female', accent: 'Neutral', description: 'Upbeat and energetic' },
  aoede:     { model: 'Aoede',     gender: 'female', accent: 'Neutral', description: 'Light and easy-going' },
  achernar:  { model: 'Achernar',  gender: 'female', accent: 'Neutral', description: 'Soft and unhurried' },
  gacrux:    { model: 'Gacrux',    gender: 'female', accent: 'Neutral', description: 'Mature and authoritative' },

  // Male-presenting
  iapetus:     { model: 'Iapetus',     gender: 'male', accent: 'Neutral', description: 'Clear and professional' },
  alnilam:     { model: 'Alnilam',     gender: 'male', accent: 'Neutral', description: 'Firm and direct' },
  schedar:     { model: 'Schedar',     gender: 'male', accent: 'Neutral', description: 'Even and neutral' },
  rasalgethi:  { model: 'Rasalgethi',  gender: 'male', accent: 'Neutral', description: 'Measured and informative' },
  orus:        { model: 'Orus',        gender: 'male', accent: 'Neutral', description: 'Deep and forceful' },
  algieba:     { model: 'Algieba',     gender: 'male', accent: 'Neutral', description: 'Smooth and natural' },
  charon:      { model: 'Charon',      gender: 'male', accent: 'Neutral', description: 'Informative and steady' },
  puck:        { model: 'Puck',        gender: 'male', accent: 'Neutral', description: 'Bright and quick' },
};

/**
 * Deepgram Aura stand-ins, used when Gemini will not synthesize.
 *
 * Gemini's free TTS tier allows ten requests a minute, and a fifteen-question
 * interview can walk into that ceiling — at which point the question is never
 * spoken and the candidate is left reading. Deepgram is already a dependency
 * for transcription, so it doubles as the safety net. The mapping is by
 * register rather than by name: the point is that the interviewer keeps a
 * consistent-sounding voice, not that it is the same synthesiser.
 */
const DEEPGRAM_FALLBACK_VOICES = {
  female: 'aura-2-thalia-en',
  male: 'aura-2-apollo-en',
};

const DEFAULT_DEEPGRAM_VOICE = DEEPGRAM_FALLBACK_VOICES.female;
const MP3_MIME = 'audio/mpeg';

const DEFAULT_VOICE = 'kore';
const MAX_TEXT_LENGTH = 4096;          // characters per request

/** Gemini TTS always returns mono 16-bit PCM at this rate. */
export const TTS_SAMPLE_RATE = 24000;
const TTS_CHANNELS = 1;
const TTS_BITS_PER_SAMPLE = 16;

const WAV_MIME = 'audio/wav';

/**
 * Read style prefix. Gemini TTS takes direction in the prompt itself, so this
 * is how the interviewer ends up sounding like an interviewer rather than a
 * narrator reading a sentence off a page.
 */
const DEFAULT_STYLE = 'Say this the way an interviewer speaks to a candidate — calm, clear, unhurried, and neutral';

// ─── Service ──────────────────────────────────────────────────────────────────

class TTSService {
  /**
   * Synthesize speech and write the audio to an HTTP response.
   *
   * @param {string} text     - Text to speak (≤ 4096 chars)
   * @param {object} options
   * @param {string} [options.voice='kore'] - Voice key or raw Gemini voice name
   * @param {string} [options.style]        - Delivery direction for the model
   * @param {import('http').ServerResponse} res  - Express response object
   * @returns {Promise<{ character_count: number, voice: string, content_type: string }>}
   *          content_type is 'audio/wav' or 'audio/mpeg' depending on which
   *          provider answered — do not assume one.
   */
  async synthesizeToStream(text, options = {}, res) {
    const { buffer, voice, character_count, content_type } = await this.synthesize(text, options);

    // The content type is whichever provider answered — WAV from Gemini, MP3
    // from the Deepgram fallback — so the client can name the file correctly
    // instead of guessing and handing the player an unreadable extension.
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
   * Synthesize speech and return a fully-buffered WAV file.
   *
   * @param {string}  text
   * @param {object}  options
   * @returns {Promise<{ buffer: Buffer, content_type: string, character_count: number, voice: string, model: string }>}
   */
  async synthesize(text, options = {}) {
    const { voice: voiceKey, voiceName, style } = this._resolveOptions(text, options);
    const spoken = text.trim();

    if (!GEMINI_API_KEY) {
      throw new Error('Speech synthesis is unavailable (missing Gemini API key)');
    }

    try {
      return await this._request({ spoken, style, voiceKey, voiceName });
    } catch (err) {
      // An unrecognised voice is rejected outright — Gemini does not fall back
      // to a default the way the old provider did. Silence mid-interview is a
      // far worse outcome than the wrong voice, so retry once with the default
      // rather than failing the question.
      if (this._isUnknownVoiceError(err) && voiceName !== GEMINI_VOICES[DEFAULT_VOICE].model) {
        warn(`TTS voice "${voiceName}" was rejected; falling back to "${DEFAULT_VOICE}"`);
        return this._request({
          spoken,
          style,
          voiceKey: DEFAULT_VOICE,
          voiceName: GEMINI_VOICES[DEFAULT_VOICE].model,
        });
      }

      // Anything else — a rate limit, an outage, a safety refusal — means this
      // question would go unspoken. Try the other provider before giving up.
      warn(`Gemini TTS failed (${err.statusCode ?? 'no status'}: ${err.message}); trying Deepgram`);
      try {
        return await this._synthesizeWithDeepgram({ spoken, voiceKey });
      } catch (fallbackErr) {
        _error('Deepgram TTS fallback also failed:', fallbackErr?.message ?? fallbackErr);
        throw err;   // report the primary failure; the fallback is an implementation detail
      }
    }
  }

  /**
   * Speak the question through Deepgram Aura.
   *
   * Returns MP3 rather than WAV, which is why every caller reads the content
   * type off the result instead of assuming one — the two providers do not
   * agree on a format and converting between them server-side would buy
   * nothing that the client's own player cannot do.
   */
  async _synthesizeWithDeepgram({ spoken, voiceKey }) {
    const gender = GEMINI_VOICES[voiceKey]?.gender;
    const model = DEEPGRAM_FALLBACK_VOICES[gender] ?? DEFAULT_DEEPGRAM_VOICE;

    const deepgram = getDeepgramClient();
    const audio = deepgram?.speak?.v1?.audio;

    if (typeof audio?.generate !== 'function') {
      throw new Error('Deepgram SDK exposes no speak.v1.audio.generate method');
    }

    const response = await audio.generate({ text: spoken, model, encoding: 'mp3' });
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      throw new Error('Deepgram TTS returned an empty audio payload');
    }

    info(`TTS synthesized via Deepgram: "${model}", ${spoken.length} chars → ${buffer.length} bytes`);

    return {
      buffer,
      content_type: MP3_MIME,
      character_count: spoken.length,
      voice: voiceKey,
      model,
    };
  }

  /** One synthesis request. Split out so the voice fallback can repeat it. */
  async _request({ spoken, style, voiceKey, voiceName }) {
    try {
      const response = await axios.post(
        `${GEMINI_ENDPOINT}/models/${GEMINI_TTS_MODEL}:generateContent`,
        {
          contents: [{ parts: [{ text: `${style}: ${spoken}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
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

      const pcm = this._extractAudio(response.data);
      const buffer = this._pcmToWav(pcm);

      info(`TTS synthesized: "${voiceKey}" voice, ${spoken.length} chars → ${buffer.length} bytes`);

      return {
        buffer,
        content_type: WAV_MIME,
        character_count: spoken.length,
        voice: voiceKey,
        model: GEMINI_TTS_MODEL,
      };
    } catch (err) {
      _error('TTSService.synthesize error:', err.response?.data || err.message || err);
      throw this._toSurfacedError(err);
    }
  }

  /** Distinguishes "that voice does not exist" from every other 400. */
  _isUnknownVoiceError(err) {
    return err?.statusCode === 400 && /voice name/i.test(err.message || '');
  }

  /**
   * Returns the available voice catalogue for GET /speech/voices.
   *
   * @returns {VoiceInfo[]}
   */
  getAvailableVoices() {
    return Object.entries(GEMINI_VOICES).map(([key, meta]) => ({
      key,
      model:       meta.model,
      gender:      meta.gender,
      accent:      meta.accent,
      description: meta.description,
    }));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Validate text and resolve all option fields with defaults.
   *
   * Unknown voice keys are passed through as raw Gemini voice names, since the
   * catalogue here is a curated subset of the ones Gemini offers. If the name
   * turns out not to exist, synthesize() retries with the default rather than
   * letting the question go unspoken.
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

    const requested = String(options.voice ?? DEFAULT_VOICE).trim();
    const voiceDef = GEMINI_VOICES[requested.toLowerCase()];

    return {
      voice: voiceDef ? requested.toLowerCase() : requested,
      voiceName: voiceDef?.model ?? requested,
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
