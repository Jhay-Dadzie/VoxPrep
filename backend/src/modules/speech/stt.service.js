/**
 * Speech-to-Text Service
 *
 * Powered by Deepgram Nova-2 — the highest accuracy English model.
 *
 * Design decisions:
 *  - Singleton class (matches user.service.js / auth.service.js pattern)
 *  - All public methods are async and throw on failure — controller handles 4xx/5xx
 *  - Result is always shaped through _formatResult; raw SDK objects never leave this service
 *  - Options are merged (defaults → caller overrides) so callers only specify what they need
 *
 * Supported use cases:
 *  1. transcribeBuffer  — uploaded audio file (multipart/form-data)
 *  2. transcribeUrl     — stored audio already accessible by URL
 */

import { getDeepgramClient } from '../../config/deepgram.js';
import { error as _error, info } from '../../core/errors/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STT_MODEL = 'nova-2';

/**
 * Defaults applied to every transcription request.
 * Callers may override any individual option.
 */
const DEFAULT_STT_OPTIONS = {
  model: STT_MODEL,
  smart_format: true,   // handles numbers, dates, currency etc.
  punctuate: true,
  paragraphs: true,
  utterances: false,    // off by default — expensive, enable per-request if needed
  diarize: false,       // speaker diarization off by default
  language: 'en',
  filler_words: false,  // strip 'um', 'uh', etc. from transcript
};

// ─── Service ──────────────────────────────────────────────────────────────────

class STTService {
  /**
   * Transcribe audio from a Node.js Buffer (multipart file upload).
   *
   * @param {Buffer} buffer    - Raw audio bytes
   * @param {string} mimetype  - Audio MIME type, e.g. 'audio/webm', 'audio/mp3'
   * @param {object} [options] - Deepgram option overrides (language, diarize, etc.)
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeBuffer(buffer, mimetype, options = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('A non-empty audio buffer is required');
    }

    const deepgram = getDeepgramClient();

    // Support both older test-friendly shape (listen.prerecorded)
    // and the current SDK shape (listen.v1.media)
    const mediaApi = deepgram?.listen?.prerecorded ?? deepgram?.listen?.v1?.media;

    if (!mediaApi || (typeof mediaApi.transcribeFile !== 'function' && typeof mediaApi.transcribe_file !== 'function')) {
      _error('Deepgram client initialization failed or SDK version mismatch. Expected prerecorded transcription API (listen.prerecorded or listen.v1.media)');
      throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
    }

    const opts = { ...DEFAULT_STT_OPTIONS, ...options };

    try {
      const transcribeFn = mediaApi.transcribeFile ?? mediaApi.transcribe_file;
      const uploadable = {
        data: buffer,
        contentType: mimetype,
        filename: this._guessFilename(mimetype),
      };

      const response = await transcribeFn.call(mediaApi, uploadable, opts);
      const { payload, error } = this._normalizeDeepgramResponse(response);

      if (error) {
        _error('Deepgram STT error (buffer):', error);
        throw new Error(`Transcription failed: ${error.message}`);
      }

      const shaped = this._formatResult(payload);
      info(`STT buffer transcribed — ${shaped.transcript.length} chars, confidence ${shaped.confidence.toFixed(2)}`);
      return shaped;
    } catch (err) {
      _error('STTService.transcribeBuffer error:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Transcribe audio from a publicly accessible URL.
   * Useful for audio already in Supabase Storage (pass a signed URL).
   *
   * @param {string} url       - Public or signed audio URL
   * @param {object} [options] - Deepgram option overrides
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeUrl(url, options = {}) {
    if (!url || typeof url !== 'string') {
      throw new Error('A valid audio URL is required');
    }

    const deepgram = getDeepgramClient();

    // Support both older test-friendly shape (listen.prerecorded)
    // and the current SDK shape (listen.v1.media)
    const mediaApi = deepgram?.listen?.prerecorded ?? deepgram?.listen?.v1?.media;

    if (!mediaApi) {
      _error('Deepgram client initialization failed or SDK version mismatch. Expected prerecorded transcription API (listen.prerecorded or listen.v1.media)');
      throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
    }

    const opts = { ...DEFAULT_STT_OPTIONS, ...options };

    try {
      // Prefer an SDK transcribeUrl method when present
      const transcribeUrlFn = mediaApi.transcribeUrl ?? mediaApi.transcribe_url;
      let response;

      if (typeof transcribeUrlFn === 'function') {
        response = await transcribeUrlFn.call(mediaApi, { url }, opts);
      } else if (typeof (mediaApi.transcribeFile ?? mediaApi.transcribe_file) === 'function') {
        // Fallback: call the media.transcribeFile REST-backed helper via the SDK
        const transcribeFileFn = mediaApi.transcribeFile ?? mediaApi.transcribe_file;
        response = await transcribeFileFn.call(mediaApi, { url }, opts);
      } else {
        // Last resort: call Deepgram REST API directly
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
          _error('DEEPGRAM_API_KEY missing for REST fallback');
          throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
        }

        const axios = (await import('axios')).default;
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(opts)) {
          if (v === undefined || v === null) continue;
          params.append(k, Array.isArray(v) ? v.join(',') : String(v));
        }

        const endpoint = `https://api.deepgram.com/v1/listen?${params.toString()}`;
        const resp = await axios.post(endpoint, { url }, {
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });

        response = { data: resp.data };
      }

      const { payload, error } = this._normalizeDeepgramResponse(response);

      if (error) {
        _error('Deepgram STT error (url):', error);
        throw new Error(`Transcription failed: ${error.message}`);
      }

      const shaped = this._formatResult(payload);
      info(`STT URL transcribed — ${shaped.transcript.length} chars, confidence ${shaped.confidence.toFixed(2)}`);
      return shaped;
    } catch (err) {
      _error('STTService.transcribeUrl error:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Normalize Deepgram SDK response shapes across versions.
   *
   * The current SDK resolves to `{ data, rawResponse }`, while older mocks
   * in this repo used `{ result, error }`.
   *
   * @param {object|null|undefined} response
   * @returns {{ payload: object|null, error: { message?: string }|null }}
   */
  _normalizeDeepgramResponse(response) {
    if (!response) {
      return { payload: null, error: null };
    }

    const payload = response.data ?? response.result ?? response;
    const error = response.error ?? payload?.error ?? null;

    return { payload, error };
  }

  /**
   * Build a safe filename for Deepgram upload requests.
   *
   * @param {string} mimetype
   * @returns {string}
   */
  _guessFilename(mimetype) {
    const extMap = {
      'audio/wav': '.wav',
      'audio/wave': '.wav',
      'audio/mp3': '.mp3',
      'audio/mpeg': '.mp3',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/mp4': '.mp4',
      'audio/m4a': '.m4a',
      'audio/x-m4a': '.m4a',
      'audio/flac': '.flac',
      'audio/aac': '.aac',
      'audio/x-wav': '.wav',
    };

    return `audio${extMap[mimetype] ?? '.audio'}`;
  }

  /**
   * Normalise the raw Deepgram response into a stable API shape.
   * Internal fields (request_id, model_info) are included for debugging.
   *
   * @param {object} result - Raw Deepgram PrerecordedResponse
   * @returns {TranscriptionResult}
   *
   * @typedef {object} TranscriptionResult
   * @property {string}   transcript        - Full transcript string
   * @property {number}   confidence        - 0–1 confidence of the top alternative
   * @property {Word[]}   words             - Word-level timestamps and confidences
   * @property {object[]} paragraphs        - Paragraph segments (if paragraphs: true)
   * @property {object[]} utterances        - Speaker turns (if utterances: true)
   * @property {number|null} duration       - Audio duration in seconds
   * @property {string|null} detected_language
   * @property {string|null} request_id     - Deepgram request ID for support
   */
  _formatResult(result) {
    const channel = result?.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];

    return {
      transcript:        alt?.transcript ?? '',
      confidence:        alt?.confidence ?? 0,
      words:             (alt?.words ?? []).map(w => ({
        word:            w.word,
        punctuated_word: w.punctuated_word ?? w.word,
        start:           w.start,
        end:             w.end,
        confidence:      w.confidence,
        speaker:         w.speaker ?? null,
      })),
      paragraphs:        alt?.paragraphs?.paragraphs ?? [],
      utterances:        result?.results?.utterances ?? [],
      duration:          result?.metadata?.duration ?? null,
      detected_language: result?.metadata?.detected_language ?? null,
      request_id:        result?.metadata?.request_id ?? null,
    };
  }
}

export default new STTService();
