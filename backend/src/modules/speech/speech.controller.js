/**
 * Speech Controller
 *
 * Thin HTTP layer — follows the same discipline as user.controller.js:
 *  1. Validate → 2. Delegate to service(s) → 3. Send response
 *
 * No business logic here.  All Deepgram and storage concerns live in
 * stt.service.js, tts.service.js, and audio.service.js respectively.
 *
 * ── Response persistence strategy ────────────────────────────────────────────
 *
 *  When session_id + question_id are present in the request we ALWAYS write
 *  to user_responses, even before transcription completes.  This guarantees
 *  the audio URL and storage path are never lost if the STT step fails.
 *
 *  Phase 1  — Upload audio to Supabase Storage   (always)
 *  Phase 2  — Upsert user_responses with audio metadata + placeholder text
 *             (only when session_id + question_id are provided)
 *  Phase 3  — Transcribe via Deepgram             (always)
 *  Phase 4  — Update the same user_responses row with the real transcript,
 *             duration, and confidence score
 *             (only when Phase 2 succeeded)
 *
 *  If Phase 3 fails the row still exists with the audio URL so the client
 *  can retry transcription later via PATCH /responses/:id or
 *  POST /speech/transcribe-url.
 *
 * Endpoints:
 *   POST /speech/transcribe          — upload audio file → transcript
 *   POST /speech/transcribe-url      — audio URL → transcript
 *   POST /speech/synthesize          — text → audio stream (≤ 2 s latency per SRS)
 *   GET  /speech/voices              — list available TTS voices
 *   GET  /speech/formats             — list supported audio input formats
 */

import sttService    from './stt.service.js';
import ttsService    from './tts.service.js';
import audioService  from './audio.service.js';
import * as responseService from '../responses/response.service.js';
import {
  transcribeFileSchema,
  transcribeUrlSchema,
  synthesizeSchema,
  validateInput,
} from './speech.validation.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError }     from '../../core/errors/appError.js';
import { info, error as _error, warn } from '../../core/errors/logger.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Safely upsert a user_responses row with audio metadata only (no transcript yet).
 *
 * Returns the created/updated row on success, or null on failure.
 * Never throws — caller decides how to react.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.questionId
 * @param {string} params.userId
 * @param {string} params.audioUrl      - Signed Supabase Storage URL
 * @param {string} params.storagePath   - Raw storage path (for signed URL regeneration)
 * @returns {Promise<object|null>}
 */
async function _createAudioResponseRow({ sessionId, questionId, userId, audioUrl, storagePath }) {
  try {
    const row = await responseService.submitResponse(
      sessionId,
      questionId,
      userId,
      {
        // Placeholder text so the NOT NULL constraint is satisfied.
        // Replaced with the real transcript in Phase 4.
        transcribed_text:          '[Transcription in progress…]',
        original_audio_url:        audioUrl,
        storage_path:              storagePath,
        response_duration_seconds: null,   // populated after STT
        transcription_confidence:  null,   // populated after STT
      }
    );
    info(`[speech] Response row created (audio only) [session=${sessionId}, question=${questionId}, id=${row?.id}]`);
    return row;
  } catch (err) {
    _error(`[speech] Phase 2 failed — could not create response row [session=${sessionId}, question=${questionId}]:`, err.message);
    return null;
  }
}

/**
 * Safely update a user_responses row with the completed transcript data.
 *
 * Returns the updated row on success, or the original row on failure.
 * Never throws.
 *
 * @param {object} params
 * @param {string} params.responseId
 * @param {string} params.userId
 * @param {string} params.transcript
 * @param {number|null} params.duration
 * @param {number|null} params.confidence
 * @param {string|null} params.detected_language - Language detected by STT
 * @param {string|null} params.request_id        - Provider request ID
 * @param {object} params.existingRow   - Fallback if update fails
 * @returns {Promise<object>}
 */
async function _enrichResponseWithTranscript({ responseId, userId, transcript, duration, confidence, detected_language, request_id, existingRow }) {
  try {
    // First update the basic transcript fields via the client-controlled path
    const updated = await responseService.updateResponse(
      responseId,
      userId,
      {
        transcribed_text:          transcript,
        response_duration_seconds: duration   ?? null,
        // transcription_confidence is read-only on the updateResponse schema
        // (clients shouldn't set it manually), so we go via submitResponse's
        // internal payload path.  Use a direct service call instead:
      }
    );

    // updateResponse intentionally strips transcription_confidence (client-
    // controlled updates shouldn't touch it).  Patch it via the admin path.
    if (updated && confidence != null) {
      try {
        await responseService.patchConfidence(responseId, confidence);
      } catch {
        // Non-fatal — confidence is optional metadata
      }
    }

    // Patch STT metadata (detected_language, request_id) via admin path
    if (updated && (detected_language != null || request_id != null)) {
      try {
        await responseService.patchSttMetadata(responseId, { detected_language, request_id });
      } catch {
        // Non-fatal — metadata is optional
      }
    }

    info(`[speech] Response enriched with transcript [id=${responseId}]`);
    return updated ?? existingRow;
  } catch (err) {
    _error(`[speech] Phase 4 failed — could not update response with transcript [id=${responseId}]:`, err.message);
    return existingRow;  // Return the phase-2 row; audio metadata is still preserved
  }
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/speech/transcribe
 *
 * Four-phase pipeline:
 *   1. Upload audio to Supabase Storage  (always)
 *   2. Upsert user_responses with audio metadata  (when session+question given)
 *   3. Transcribe via Deepgram  (always)
 *   4. Update user_responses with transcript  (when Phase 2 succeeded)
 *
 * Multipart fields:
 *  - audio        {file}    required
 *  - session_id   {UUID}    optional — enables response persistence
 *  - question_id  {UUID}    optional — enables response persistence
 *  - language     {string}  default "en"
 *  - smart_format {boolean} default true
 *  - punctuate    {boolean} default true
 *  - paragraphs   {boolean} default true
 *  - diarize      {boolean} default false
 *  - utterances   {boolean} default false
 */
export const transcribeAudio = asyncHandler(async (req, res, next) => {
  // ── Pre-flight ─────────────────────────────────────────────────────────────
  if (!req.file) {
    return next(new AppError('No audio file provided. Include an "audio" field in the form-data.', 400));
  }

  const { valid, errors, value } = validateInput(req.body, transcribeFileSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  const { buffer, mimetype } = req.file;

  try {
    audioService.validateAudio(buffer, mimetype);
  } catch (err) {
    return next(new AppError(err.message, 400));
  }

  const hasContext = Boolean(value.session_id && value.question_id);

  // ── PHASE 1: Upload audio ──────────────────────────────────────────────────
  let uploaded;
  try {
    uploaded = await audioService.uploadAudio(buffer, mimetype, req.user.id, {
      sessionId:  value.session_id  ?? null,
      questionId: value.question_id ?? null,
    });
  } catch (err) {
    _error('[transcribeAudio] Storage upload failed:', err.message);
    return next(new AppError(`Audio upload failed: ${err.message}`, 502));
  }

  info(`[transcribeAudio] Audio uploaded [user=${req.user.id}] path=${uploaded.path}`);

  // ── PHASE 2: Create response row with audio metadata ──────────────────────
  // Runs before STT so audio metadata is persisted even if transcription fails.
  let responseRow = null;

  if (hasContext) {
    responseRow = await _createAudioResponseRow({
      sessionId:   value.session_id,
      questionId:  value.question_id,
      userId:      req.user.id,
      audioUrl:    uploaded.url,
      storagePath: uploaded.path,
    });
  }

  // ── PHASE 3: Transcribe ────────────────────────────────────────────────────
  const transcriptionOptions = {
    language:     value.language,
    smart_format: value.smart_format,
    punctuate:    value.punctuate,
    paragraphs:   value.paragraphs,
    diarize:      value.diarize,
    utterances:   value.utterances,
  };

  let transcriptionResult;
  try {
    transcriptionResult = await sttService.transcribeBuffer(buffer, mimetype, transcriptionOptions);
  } catch (err) {
    _error('[transcribeAudio] STT failed:', err.message);

    // Return a partial success — audio is stored and the response row (if any)
    // preserves the audio URL.  The client can retry transcription later.
    return res.status(200).json({
      status:  'partial',
      message: 'Audio uploaded and saved. Transcription failed — retry via POST /speech/transcribe-url.',
      data: {
        transcript:        null,
        confidence:        null,
        duration:          null,
        detected_language: null,
        words:             [],
        paragraphs:        [],
        utterances:        [],
        audio_url:         uploaded.url,
        storage_path:      uploaded.path,
        // Expose whatever we saved so the client knows the row ID
        response: responseRow
          ? { id: responseRow.id, transcription_status: 'pending' }
          : null,
        error: err.message,
      },
    });
  }

  info(`[transcribeAudio] STT complete [chars=${transcriptionResult.transcript.length} confidence=${transcriptionResult.confidence.toFixed(3)}]`);

  // ── PHASE 4: Enrich response row with transcript ───────────────────────────
  if (hasContext && responseRow) {
    responseRow = await _enrichResponseWithTranscript({
      responseId:  responseRow.id,
      userId:      req.user.id,
      transcript:  transcriptionResult.transcript,
      duration:    transcriptionResult.duration,
      confidence:  transcriptionResult.confidence,
      detected_language: transcriptionResult.detected_language,
      request_id: transcriptionResult.request_id,
      existingRow: responseRow,
    });
  }

  return res.status(200).json({
    status: 'success',
    data: {
      transcript:        transcriptionResult.transcript,
      confidence:        transcriptionResult.confidence,
      duration:          transcriptionResult.duration,
      detected_language: transcriptionResult.detected_language,
      words:             transcriptionResult.words,
      paragraphs:        transcriptionResult.paragraphs,
      utterances:        transcriptionResult.utterances,
      audio_url:         uploaded.url,
      storage_path:      uploaded.path,
      response:          responseRow,   // null when no context was provided
    },
  });
});

/**
 * POST /api/v1/speech/transcribe-url
 *
 * Same four-phase strategy as transcribeAudio but the audio already lives
 * at a URL — there is no Phase 1 upload.
 *
 * Body: { url, session_id?, question_id?, language?, smart_format?,
 *         punctuate?, paragraphs?, diarize?, utterances? }
 */
export const transcribeUrl = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, transcribeUrlSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  const hasContext = Boolean(value.session_id && value.question_id);

  // ── PHASE 2: Create response row with audio URL (no upload needed) ─────────
  let responseRow = null;

  if (hasContext) {
    responseRow = await _createAudioResponseRow({
      sessionId:   value.session_id,
      questionId:  value.question_id,
      userId:      req.user.id,
      audioUrl:    value.url,
      storagePath: null,   // external URL — no local storage path
    });
  }

  // ── PHASE 3: Transcribe ────────────────────────────────────────────────────
  const transcriptionOptions = {
    language:     value.language,
    smart_format: value.smart_format,
    punctuate:    value.punctuate,
    paragraphs:   value.paragraphs,
    diarize:      value.diarize,
    utterances:   value.utterances,
  };

  let result;
  try {
    result = await sttService.transcribeUrl(value.url, transcriptionOptions);
  } catch (err) {
    _error('[transcribeUrl] STT failed:', err.message);

    return res.status(200).json({
      status:  'partial',
      message: 'Transcription failed. Audio URL is saved — retry later.',
      data: {
        transcript:        null,
        confidence:        null,
        duration:          null,
        detected_language: null,
        words:             [],
        paragraphs:        [],
        utterances:        [],
        response: responseRow
          ? { id: responseRow.id, transcription_status: 'pending' }
          : null,
        error: err.message,
      },
    });
  }

  info(`[transcribeUrl] STT complete [user=${req.user.id} chars=${result.transcript.length}]`);

  // ── PHASE 4: Enrich response row with transcript ───────────────────────────
  if (hasContext && responseRow) {
    responseRow = await _enrichResponseWithTranscript({
      responseId:  responseRow.id,
      userId:      req.user.id,
      transcript:  result.transcript,
      duration:    result.duration,
      confidence:  result.confidence,
      existingRow: responseRow,
    });
  }

  return res.status(200).json({
    status: 'success',
    data: {
      transcript:        result.transcript,
      confidence:        result.confidence,
      duration:          result.duration,
      detected_language: result.detected_language,
      words:             result.words,
      paragraphs:        result.paragraphs,
      utterances:        result.utterances,
      response:          responseRow,
    },
  });
});

// ─── Synthesis ────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/speech/synthesize
 *
 * Converts text to speech and streams the audio directly to the client.
 *
 * SRS requirement: playback must start within 1–2 seconds.
 * We stream (Transfer-Encoding: chunked) so the first audio chunk
 * arrives at the client as soon as Deepgram starts generating audio.
 *
 * Body: { text, voice?, encoding?, sample_rate? }
 */
export const synthesizeSpeech = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, synthesizeSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  await ttsService.synthesizeToStream(
    value.text,
    {
      voice:       value.voice,
      encoding:    value.encoding,
      sample_rate: value.sample_rate,
    },
    res
  );

  info(`[synthesizeSpeech] user=${req.user.id} voice=${value.voice} chars=${value.text.trim().length}`);
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/speech/voices
 */
export const getVoices = asyncHandler(async (_req, res) => {
  const voices = ttsService.getAvailableVoices();
  return res.status(200).json({ status: 'success', data: voices });
});

/**
 * GET /api/v1/speech/formats
 */
export const getSupportedFormats = asyncHandler(async (_req, res) => {
  const formats = audioService.getSupportedFormats();
  return res.status(200).json({ status: 'success', data: formats });
});

export default {
  transcribeAudio,
  transcribeUrl,
  synthesizeSpeech,
  getVoices,
  getSupportedFormats,
};