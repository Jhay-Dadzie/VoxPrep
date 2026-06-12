/**
 * Speech Routes
 * Pattern: /api/v1/speech/*
 *
 * All endpoints are protected (require a valid JWT).
 *
 * Endpoints:
 *   POST  /speech/transcribe       — upload audio file for transcription
 *   POST  /speech/transcribe-url   — transcribe audio from a URL
 *   POST  /speech/synthesize       — text-to-speech (streams audio)
 *   GET   /speech/voices           — list available TTS voices
 *   GET   /speech/formats          — list supported audio input formats
 *   GET   /speech/health           — health check
 */

import { Router } from 'express';
import multer from 'multer';
import { protect } from '../auth/auth.middleware.js';
import {
  transcribeAudio,
  transcribeUrl,
  synthesizeSpeech,
  getVoices,
  getSupportedFormats,
} from './speech.controller.js';
import { SUPPORTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from './audio.service.js';
import { AppError } from '../../core/errors/appError.js';

const router = Router();

// ─── Inline async wrapper ─────────────────────────────────────────────────────
// Matches the pattern in auth.routes.js and interview.routes.js
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── Multer configuration ─────────────────────────────────────────────────────

/**
 * Memory storage — audio goes to buffer, never touches disk.
 * fileFilter mirrors SUPPORTED_AUDIO_TYPES from audio.service.js (single source of truth).
 */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_BYTES, // 25 MB — matches audioService.validateAudio
    files:    1,
  },
  fileFilter: (_req, file, cb) => {
    if (SUPPORTED_AUDIO_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      // Pass the error to cb so multer propagates it to handleAudioUpload
      cb(new Error(
        `Unsupported audio format "${file.mimetype}". ` +
        `Supported: ${Object.keys(SUPPORTED_AUDIO_TYPES).join(', ')}`
      ));
    }
  },
});

/**
 * Wraps multer in a named middleware that converts MulterErrors and
 * fileFilter errors into AppErrors (consistent with the rest of the API).
 *
 * Pattern: call multer inside a callback so we control the error shape.
 */
const handleAudioUpload = (req, res, next) => {
  audioUpload.single('audio')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(
        `Audio file exceeds the ${MAX_AUDIO_BYTES / (1024 * 1024)} MB limit`, 400
      ));
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(
        'Unexpected file field. Use "audio" as the field name.', 400
      ));
    }

    // fileFilter rejection or other multer error
    return next(new AppError(err.message || 'File upload failed', 400));
  });
};

// ─── All speech routes require authentication ─────────────────────────────────
router.use(protect);

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/speech/transcribe
 * Upload an audio file and receive a transcript.
 *
 * Content-Type: multipart/form-data
 * Fields:
 *   audio        {file}    required
 *   session_id   {UUID}    optional — used for storage path grouping
 *   question_id  {UUID}    optional — used for storage path grouping
 *   save_audio   {boolean} legacy flag kept for backwards compatibility
 *   language     {string}  default "en"
 *   smart_format {boolean} default true
 *   punctuate    {boolean} default true
 *   paragraphs   {boolean} default true
 *   diarize      {boolean} default false
 *   utterances   {boolean} default false
 *
 * Response 200:
 *   { status, data: { transcript, confidence, duration, detected_language,
 *                     words, paragraphs, utterances, audio_url, storage_path } }
 */
router.post('/transcribe', handleAudioUpload, asyncHandler(transcribeAudio));

/**
 * POST /api/v1/speech/transcribe-url
 * Transcribe audio from a URL (e.g. a Supabase signed URL).
 *
 * Body: { url, language?, smart_format?, punctuate?, paragraphs?, diarize?, utterances? }
 *
 * Response 200: same shape as /transcribe (minus audio_url, storage_path)
 */
router.post('/transcribe-url', asyncHandler(transcribeUrl));

/**
 * POST /api/v1/speech/synthesize
 * Convert text to speech.
 *
 * Body: { text, voice?, encoding?, sample_rate? }
 *
 * Response 200: audio binary stream
 *   Content-Type: audio/mpeg  (or chosen encoding)
 *   Transfer-Encoding: chunked
 *   X-Voice: <voice key>
 *   X-Character-Count: <number>
 *
 * Voice options: asteria, luna, stella, athena, hera, orion, arcas,
 *                perseus, angus, orpheus, helios, zeus
 */
router.post('/synthesize', asyncHandler(synthesizeSpeech));

/**
 * GET /api/v1/speech/voices
 * List available TTS voices with metadata.
 *
 * Response 200: { status, data: VoiceInfo[] }
 */
router.get('/voices', asyncHandler(getVoices));

/**
 * GET /api/v1/speech/formats
 * List supported audio input MIME types.
 *
 * Response 200: { status, data: string[] }
 */
router.get('/formats', asyncHandler(getSupportedFormats));

/**
 * GET /api/v1/speech/health
 */
router.get('/health', (_req, res) =>
  res.status(200).json({ status: 'success', message: 'Speech service is healthy' })
);

export default router;
