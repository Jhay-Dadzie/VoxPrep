/**
 * Text-to-Speech Service
 *
 * Powered by Deepgram Aura voice models.
 * Converts interview questions (and optional feedback) into natural audio.
 *
 * SRS requirement: TTS playback must start within 1–2 seconds.
 * We meet this by streaming directly to the HTTP response rather than
 * fully buffering — see synthesizeToStream(). A full-buffer helper
 * (synthesize) is also provided for storage-upload flows.
 *
 * Design decisions:
 *  - synthesizeToStream:  pipes Web ReadableStream → Node stream → HTTP response (low latency)
 *  - synthesize:          buffers fully for upload or test scenarios
 *  - Voice keys are short friendly names; the service maps to full model IDs
 *  - All errors throw so the controller's try/catch handles HTTP status codes
 */

import { Readable } from 'node:stream';
import { getDeepgramClient } from '../../config/deepgram.js';
import { error as _error, info } from '../../core/errors/logger.js';

// ─── Voice catalogue ──────────────────────────────────────────────────────────

/**
 * Deepgram Aura voice models (as of 2025).
 * Key: short friendly name used in the API.
 * Model: full Deepgram model string.
 */
export const DEEPGRAM_VOICES = {
  // Female
  asteria:  { model: 'aura-asteria-en',  gender: 'female', accent: 'American',  description: 'Clear, professional — recommended default' },
  luna:     { model: 'aura-luna-en',     gender: 'female', accent: 'American',  description: 'Soft and calm' },
  stella:   { model: 'aura-stella-en',   gender: 'female', accent: 'American',  description: 'Warm and energetic' },
  athena:   { model: 'aura-athena-en',   gender: 'female', accent: 'British',   description: 'Polished British English' },
  hera:     { model: 'aura-hera-en',     gender: 'female', accent: 'American',  description: 'Authoritative and calm' },
  // Male
  orion:    { model: 'aura-orion-en',    gender: 'male',   accent: 'American',  description: 'Deep and authoritative' },
  arcas:    { model: 'aura-arcas-en',    gender: 'male',   accent: 'American',  description: 'Professional and clear' },
  perseus:  { model: 'aura-perseus-en',  gender: 'male',   accent: 'American',  description: 'Neutral and professional' },
  angus:    { model: 'aura-angus-en',    gender: 'male',   accent: 'Irish',     description: 'Warm Irish accent' },
  orpheus:  { model: 'aura-orpheus-en',  gender: 'male',   accent: 'American',  description: 'Smooth and natural' },
  helios:   { model: 'aura-helios-en',   gender: 'male',   accent: 'British',   description: 'Polished British English' },
  zeus:     { model: 'aura-zeus-en',     gender: 'male',   accent: 'American',  description: 'Deep and powerful' },
};

const DEFAULT_VOICE      = 'asteria';
const DEFAULT_ENCODING   = 'mp3';    // widest mobile compatibility
const DEFAULT_SAMPLE_RATE = 24000;
const MAX_TEXT_LENGTH    = 4096;     // characters per request

/** Maps encoding → MIME type sent in Content-Type */
const ENCODING_MIME = {
  mp3:      'audio/mpeg',
  wav:      'audio/wav',
  ogg:      'audio/ogg',
  flac:     'audio/flac',
  aac:      'audio/aac',
  linear16: 'audio/wav',
  mulaw:    'audio/basic',
};

// ─── Service ──────────────────────────────────────────────────────────────────

class TTSService {
  /**
   * Synthesize speech and pipe the audio stream directly to an HTTP response.
   *
   * This is the primary method for the `/speech/synthesize` endpoint.
   * Streaming means the first audio chunk reaches the client in ~200–500 ms
   * (network permitting), meeting the SRS < 2 s playback-start requirement.
   *
   * @param {string}         text     - Text to speak (≤ 4096 chars)
   * @param {object}         options
   * @param {string}         [options.voice='asteria']   - Voice key
   * @param {string}         [options.encoding='mp3']
   * @param {number}         [options.sample_rate=24000]
   * @param {import('http').ServerResponse} res  - Express response object
   * @returns {Promise<{ character_count: number, voice: string, content_type: string }>}
   */
  async synthesizeToStream(text, options = {}, res) {
    const { voice: voiceKey, encoding, sample_rate, model } =
      this._resolveOptions(text, options);

    const deepgram = getDeepgramClient();

    try {
      const response = await deepgram.speak.request(
        { text: text.trim() },
        { model, encoding, sample_rate }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error('Deepgram TTS returned no audio stream');
      }

      const contentType = ENCODING_MIME[encoding] ?? `audio/${encoding}`;

      // Set headers before piping — they cannot be changed after the stream starts
      res.set({
        'Content-Type':     contentType,
        'Transfer-Encoding': 'chunked',
        'X-Voice':          voiceKey,
        'X-Character-Count': String(text.trim().length),
      });

      // Convert Web ReadableStream → Node.js Readable → pipe to HTTP response
      const nodeStream = Readable.fromWeb(stream);
      await new Promise((resolve, reject) => {
        nodeStream.on('error', reject);
        res.on('error', reject);
        res.on('finish', resolve);
        nodeStream.pipe(res);
      });

      info(`TTS streamed: "${voiceKey}" voice, ${text.trim().length} chars`);

      return {
        character_count: text.trim().length,
        voice: voiceKey,
        content_type: contentType,
      };
    } catch (err) {
      _error('TTSService.synthesizeToStream error:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Synthesize speech and return a fully-buffered result.
   *
   * Use this when you need the audio bytes (e.g. to upload to Supabase Storage).
   * For direct playback, prefer synthesizeToStream — it is faster.
   *
   * @param {string}  text
   * @param {object}  options
   * @returns {Promise<{ buffer: Buffer, content_type: string, character_count: number, voice: string, model: string }>}
   */
  async synthesize(text, options = {}) {
    const { voice: voiceKey, encoding, sample_rate, model } =
      this._resolveOptions(text, options);

    const deepgram = getDeepgramClient();

    try {
      const response = await deepgram.speak.request(
        { text: text.trim() },
        { model, encoding, sample_rate }
      );

      const stream = await response.getStream();
      if (!stream) {
        throw new Error('Deepgram TTS returned no audio stream');
      }

      const buffer = await this._streamToBuffer(stream);

      info(`TTS buffered: "${voiceKey}" voice, ${text.trim().length} chars → ${buffer.length} bytes`);

      return {
        buffer,
        content_type: ENCODING_MIME[encoding] ?? `audio/${encoding}`,
        character_count: text.trim().length,
        voice: voiceKey,
        model,
      };
    } catch (err) {
      _error('TTSService.synthesize error:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Returns the available voice catalogue for GET /speech/voices.
   *
   * @returns {VoiceInfo[]}
   */
  getAvailableVoices() {
    return Object.entries(DEEPGRAM_VOICES).map(([key, meta]) => ({
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

    const voiceKey = (options.voice ?? DEFAULT_VOICE).toLowerCase();
    const voiceDef = DEEPGRAM_VOICES[voiceKey];

    // Allow a raw Deepgram model string as fallback (e.g. 'aura-asteria-en')
    const model = voiceDef?.model ?? voiceKey;

    const encoding   = options.encoding    ?? DEFAULT_ENCODING;
    const sample_rate = options.sample_rate ?? DEFAULT_SAMPLE_RATE;

    return { voice: voiceKey, encoding, sample_rate, model };
  }

  /**
   * Drain a Web ReadableStream into a single Node.js Buffer.
   */
  async _streamToBuffer(stream) {
    const reader = stream.getReader();
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }

    if (chunks.length === 0) {
      throw new Error('Deepgram TTS returned an empty audio stream');
    }

    return Buffer.concat(chunks);
  }
}

export default new TTSService();