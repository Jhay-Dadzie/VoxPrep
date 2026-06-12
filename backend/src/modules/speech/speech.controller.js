/**
 * Speech Controller
 *
 * Thin HTTP layer — follows the same discipline as user.controller.js:
 *  1. Validate → 2. Delegate to service(s) → 3. Send response
 *
 * No business logic here.  All Deepgram and storage concerns live in
 * stt.service.js, tts.service.js, and audio.service.js respectively.
 *
 * Endpoints:
 *   POST /speech/transcribe          — upload audio file → transcript
 *   POST /speech/transcribe-url      — audio URL → transcript
 *   POST /speech/synthesize          — text → audio stream (≤ 2 s latency per SRS)
 *   GET  /speech/voices              — list available TTS voices
 *   GET  /speech/formats             — list supported audio input formats
 */

import sttService from './stt.service.js';
import ttsService from './tts.service.js';
import audioService from './audio.service.js';
import * as responseService from '../responses/response.service.js';
import {
  transcribeFileSchema,
  transcribeUrlSchema,
  synthesizeSchema,
  validateInput,
} from './speech.validation.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import { info, error as _error } from '../../core/errors/logger.js';

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/speech/transcribe
 *
 * Accepts a multipart audio upload and returns a transcript.
 *
 * Audio is always uploaded to Supabase Storage (bucket: interview-audio)
 * so the caller can persist `audio_url` alongside the transcript.
 * session_id and question_id are optional and only influence the storage path.
 *
 * Multipart fields:
 *  - audio        {file}    required — audio file (field name must be "audio")
 *  - session_id   {UUID}    optional — used for storage path grouping
 *  - question_id  {UUID}    optional — used for storage path grouping
 *  - save_audio   {boolean} legacy flag kept for backwards compatibility
 *  - language     {string}  default "en"
 *  - smart_format {boolean} default true
 *  - punctuate    {boolean} default true
 *  - paragraphs   {boolean} default true
 *  - diarize      {boolean} default false
 *  - utterances   {boolean} default false
 */
export const transcribeAudio = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No audio file provided. Include an "audio" field in the form-data.', 400));
  }

  const { valid, errors, value } = validateInput(req.body, transcribeFileSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  const { buffer, mimetype } = req.file;

  // Validate audio format and size before hitting Deepgram
  try {
    audioService.validateAudio(buffer, mimetype);
  } catch (err) {
    return next(new AppError(err.message, 400));
  }

  const uploaded = await audioService.uploadAudio(buffer, mimetype, req.user.id, {
    sessionId: value.session_id ?? null,
    questionId: value.question_id ?? null,
  });

  // Transcribe via Deepgram
  const transcriptionOptions = {
    language:     value.language,
    smart_format: value.smart_format,
    punctuate:    value.punctuate,
    paragraphs:   value.paragraphs,
    diarize:      value.diarize,
    utterances:   value.utterances,
  };

  const result = await sttService.transcribeBuffer(buffer, mimetype, transcriptionOptions);

  info(`[transcribeAudio] user=${req.user.id} chars=${result.transcript.length} confidence=${result.confidence.toFixed(2)} audio=${uploaded.path}`);

  // Persist response when session_id and question_id are provided.
  // Non-fatal: failures to persist should not block returning the transcript.
  let savedResponse = null;
  if (value.session_id && value.question_id) {
    try {
      savedResponse = await responseService.submitResponse(
        value.session_id,
        value.question_id,
        req.user.id,
        {
          transcribed_text: result.transcript,
          audio_url: uploaded.url,
          storage_path: uploaded.path,
          response_duration_seconds: result.duration,
          transcription_confidence: result.confidence,
        }
      );
    } catch (err) {
      _error(`[transcribeAudio] failed to persist response [session=${value.session_id}, question=${value.question_id}, user=${req.user.id}]:`, err);
    }
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
      audio_url:         uploaded.url,
      storage_path:      uploaded.path,
      response:          savedResponse,
    },
  });
});

/**
 * POST /api/v1/speech/transcribe-url
 *
 * Transcribes audio at a publicly accessible URL (e.g. a Supabase signed URL).
 * Useful for re-transcribing stored recordings or processing remote audio.
 *
 * Body: { url, language?, smart_format?, punctuate?, paragraphs?, diarize?, utterances? }
 */
export const transcribeUrl = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, transcribeUrlSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  const transcriptionOptions = {
    language:     value.language,
    smart_format: value.smart_format,
    punctuate:    value.punctuate,
    paragraphs:   value.paragraphs,
    diarize:      value.diarize,
    utterances:   value.utterances,
  };

  const result = await sttService.transcribeUrl(value.url, transcriptionOptions);

  info(`[transcribeUrl] user=${req.user.id} chars=${result.transcript.length}`);

  // Persist response when session_id and question_id are provided.
  let savedResponse = null;
  if (value.session_id && value.question_id) {
    try {
      savedResponse = await responseService.submitResponse(
        value.session_id,
        value.question_id,
        req.user.id,
        {
          transcribed_text: result.transcript,
          audio_url: value.url,
          response_duration_seconds: result.duration,
          transcription_confidence: result.confidence,
        }
      );
    } catch (err) {
      _error(`[transcribeUrl] failed to persist response [session=${value.session_id}, question=${value.question_id}, user=${req.user.id}]:`, err);
    }
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
      response:          savedResponse,
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
 * arrives at the client as soon as Deepgram starts generating audio —
 * typically 200–500 ms.  The client does NOT need to wait for the full
 * buffer before beginning playback.
 *
 * Response:  audio/mpeg  (or chosen encoding) binary stream
 * Headers:
 *   Content-Type:       audio/mpeg  (or chosen encoding)
 *   Transfer-Encoding:  chunked
 *   X-Voice:            <voice key>
 *   X-Character-Count:  <number>
 *
 * Body: { text, voice?, encoding?, sample_rate? }
 *
 * NOTE: Because we pipe to res before the async work finishes, errors
 * that occur *after* headers are sent cannot return a JSON error — they
 * are logged server-side and the stream is terminated.  The client should
 * treat an incomplete audio stream as an error.
 */
export const synthesizeSpeech = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, synthesizeSchema);
  if (!valid) {
    return next(new AppError(Object.values(errors).join('; '), 400));
  }

  // synthesizeToStream sets headers and pipes to res internally
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
  // Response is already finished (piped) — no further res.* calls needed
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/speech/voices
 *
 * Returns available TTS voice options so the frontend can build a voice-picker.
 */
export const getVoices = asyncHandler(async (_req, res) => {
  const voices = ttsService.getAvailableVoices();

  return res.status(200).json({
    status: 'success',
    data: voices,
  });
});

/**
 * GET /api/v1/speech/formats
 *
 * Returns supported audio input formats so the frontend can validate
 * recordings before upload.
 */
export const getSupportedFormats = asyncHandler(async (_req, res) => {
  const formats = audioService.getSupportedFormats();

  return res.status(200).json({
    status: 'success',
    data: formats,
  });
});

export default {
  transcribeAudio,
  transcribeUrl,
  synthesizeSpeech,
  getVoices,
  getSupportedFormats,
};
