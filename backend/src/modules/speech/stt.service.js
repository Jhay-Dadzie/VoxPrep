/**
 * Speech-to-Text Service
 *
 * Powered by Deepgram Nova-2 — the highest accuracy English model.
 *
 * ── Why not Gemini ───────────────────────────────────────────────────────────
 *
 * Transcription briefly ran on Gemini audio understanding. It does not work:
 * the audio-capable Flash-Lite tier answers 404 "no longer available to new
 * users" on current keys, which is why answers were being stored to the bucket
 * and never transcribed. Deepgram also returns two things Gemini does not —
 * a confidence score and the measured duration — both of which are columns on
 * user_responses and inputs to grading.
 *
 * ── SDK shape ────────────────────────────────────────────────────────────────
 *
 * @deepgram/sdk v5 dropped the v3-era `listen.prerecorded.*` namespace in
 * favour of `listen.v1.media.*`, and awaiting the call yields the parsed body
 * directly rather than a `{ data, error }` envelope. Both are handled here, and
 * both are asserted in the tests, because reaching for the old shape is exactly
 * how this broke: it fails at call time, not at import time.
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
   * @param {string} mimetype  - Audio MIME type, e.g. 'audio/m4a', 'audio/wav'
   * @param {object} [options] - Deepgram option overrides (language, diarize, etc.)
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeBuffer(buffer, mimetype, options = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('A non-empty audio buffer is required');
    }

    const media = this._getMediaApi();
    const transcribeFn = media.transcribeFile ?? media.transcribe_file;

    if (typeof transcribeFn !== 'function') {
      _error('Deepgram SDK exposes no file transcription method on listen.v1.media');
      throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
    }

    const opts = { ...DEFAULT_STT_OPTIONS, ...options };

    try {
      const uploadable = {
        data: buffer,
        contentType: mimetype,
        filename: this._guessFilename(mimetype),
      };

      const response = await transcribeFn.call(media, uploadable, opts);
      const { payload, error } = this._normalizeDeepgramResponse(response);

      if (error) {
        _error('Deepgram STT error (buffer):', error);
        throw new Error(`Transcription failed: ${error.message}`);
      }

      const shaped = this._formatResult(payload);
      info(`STT buffer transcribed — ${shaped.transcript.length} chars, confidence ${shaped.confidence.toFixed(2)}`);
      return shaped;
    } catch (err) {
      _error('STTService.transcribeBuffer error:', err?.body ?? err?.message ?? err);
      throw this._toSurfacedError(err);
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

    const media = this._getMediaApi();
    const transcribeUrlFn = media.transcribeUrl ?? media.transcribe_url;

    if (typeof transcribeUrlFn !== 'function') {
      _error('Deepgram SDK exposes no URL transcription method on listen.v1.media');
      throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
    }

    const opts = { ...DEFAULT_STT_OPTIONS, ...options };

    try {
      const response = await transcribeUrlFn.call(media, { url }, opts);
      const { payload, error } = this._normalizeDeepgramResponse(response);

      if (error) {
        _error('Deepgram STT error (url):', error);
        throw new Error(`Transcription failed: ${error.message}`);
      }

      const shaped = this._formatResult(payload);
      info(`STT URL transcribed — ${shaped.transcript.length} chars, confidence ${shaped.confidence.toFixed(2)}`);
      return shaped;
    } catch (err) {
      _error('STTService.transcribeUrl error:', err?.body ?? err?.message ?? err);
      throw this._toSurfacedError(err);
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the prerecorded transcription API across SDK generations.
   *
   * v5 exposes `listen.v1.media`; v3/v4 exposed `listen.prerecorded`. Resolving
   * both means a dependency bump cannot silently take transcription offline —
   * and if neither is present, that is reported here rather than as an
   * undefined-is-not-a-function deep inside a request.
   */
  _getMediaApi() {
    const deepgram = getDeepgramClient();
    const media = deepgram?.listen?.v1?.media ?? deepgram?.listen?.prerecorded;

    if (!media) {
      _error('Deepgram client initialization failed or SDK version mismatch. Expected listen.v1.media or listen.prerecorded');
      throw new Error('Transcription service is currently unavailable (Internal Configuration Error)');
    }

    return media;
  }

  /**
   * Normalize Deepgram SDK response shapes across versions.
   *
   * v5 resolves to the parsed body itself (`{ metadata, results }`); older
   * versions wrapped it as `{ data, rawResponse }` or `{ result, error }`.
   *
   * @param {object|null|undefined} response
   * @returns {{ payload: object|null, error: { message?: string }|null }}
   */
  _normalizeDeepgramResponse(response) {
    if (!response) {
      return { payload: null, error: null };
    }

    // `results` present means this is already the parsed body — checked first so
    // a body that happens to carry a `data` field is not mistaken for a wrapper.
    const payload = response.results ? response : (response.data ?? response.result ?? response);
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
   * Surface a Deepgram SDK failure with its status and message intact.
   *
   * The v5 client throws typed errors carrying `statusCode` and a parsed `body`;
   * without unwrapping them the controller only ever sees "Bad Request".
   */
  _toSurfacedError(err) {
    if (!err) return new Error('Transcription failed');
    if (typeof err.statusCode !== 'number') {
      return err instanceof Error ? err : new Error(String(err));
    }

    const detail =
      err.body?.err_msg ||
      err.body?.error ||
      err.body?.message ||
      err.message ||
      'Deepgram request failed';

    const surfaced = new Error(`Transcription failed: ${detail}`);
    surfaced.statusCode = err.statusCode;
    return surfaced;
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
