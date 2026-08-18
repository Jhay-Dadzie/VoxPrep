/**
 * Speech Module Tests
 *
 * Coverage:
 *  - STT Service       — Deepgram transcribeBuffer/transcribeUrl, response shapes
 *  - TTS Service       — Gemini synthesize, WAV framing, voices, _resolveOptions
 *  - Audio Service     — validateAudio, uploadAudio, getSignedUrl, deleteAudio
 *  - Speech Controller — all 5 endpoints via supertest (mocked services)
 *
 * Mocking strategy:
 *  - Deepgram is mocked at the config level, shaped like SDK v5 (listen.v1.media)
 *  - Gemini is reached over HTTP, so axios is mocked (jest.mock axios)
 *  - Supabase is mocked at the config level (jest.mock config/supabase.js)
 *  - Auth middleware is bypassed (req.user injected directly)
 *  - Each test resets mocks in beforeEach to avoid test pollution
 */

import { jest } from '@jest/globals';

// ─── Mock Deepgram ────────────────────────────────────────────────────────────
// Shaped as @deepgram/sdk v5: listen.v1.media, no listen.prerecorded. The
// service supports both, and the tests below assert it reaches for the one the
// installed SDK actually has — using the retired v3 path is how transcription
// silently stopped working.
const mockTranscribeFile = jest.fn();
const mockTranscribeUrl  = jest.fn();

const mockSpeakGenerate = jest.fn();

jest.mock('../../config/deepgram.js', () => ({
  getDeepgramClient: jest.fn(() => ({
    listen: {
      v1: {
        media: {
          transcribeFile: mockTranscribeFile,
          transcribeUrl:  mockTranscribeUrl,
        },
      },
    },
    speak: {
      v1: {
        audio: { generate: mockSpeakGenerate },
      },
    },
  })),
}));

// ─── Mock Gemini transport (TTS) ──────────────────────────────────────────────
const mockPost = jest.fn();
const mockGet  = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...args) => mockPost(...args),
    get:  (...args) => mockGet(...args),
  },
}));

/**
 * The services read their model ids and key from config at import time. Mocking
 * the config rather than the environment keeps these tests independent of
 * whatever .env happens to hold on the machine running them.
 */
jest.mock('../../config/gemini.js', () => ({
  GEMINI_API_KEY: 'test-key',
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta',
  GEMINI_MODEL: 'test-interviewer-model',
  GEMINI_TTS_MODEL: 'test-tts-model-preview-tts',
  GEMINI_ASSESSMENT_MODEL: 'test-assessment-model',
}));

// ─── Mock Supabase ────────────────────────────────────────────────────────────
const mockStorageUpload       = jest.fn();
const mockStorageCreateSigned = jest.fn();
const mockStorageRemove       = jest.fn();

jest.mock('../../config/supabase.js', () => ({
  getSupabaseClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload:           mockStorageUpload,
        createSignedUrl:  mockStorageCreateSigned,
        remove:           mockStorageRemove,
      })),
    },
  })),
  getSupabaseAdminClient: jest.fn(() => ({
    storage: {
      from: jest.fn(() => ({
        upload:           mockStorageUpload,
        createSignedUrl:  mockStorageCreateSigned,
        remove:           mockStorageRemove,
      })),
    },
  })),
}));

// ─── Mock Auth Middleware ─────────────────────────────────────────────────────
jest.mock('../auth/auth.middleware.js', () => ({
  protect: (req, _res, next) => {
    req.user  = { id: 'user-uuid-123' };
    req.token = 'mock-token';
    next();
  },
}));

// ─── Mock AppError & asyncHandler (use real ones if available) ────────────────
jest.mock('../../core/errors/appError.js', () => ({
  AppError: class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      this.status = statusCode >= 500 ? 'error' : 'fail';
    }
  },
}));

jest.mock('../../core/utils/asyncHandler.js', () => ({
  asyncHandler: (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
}));

// ─── Now import services (after mocks are set up) ────────────────────────────
import sttService from '../speech/stt.service.js';
import ttsService, { TTS_VOICES, TTS_SAMPLE_RATE } from '../speech/tts.service.js';
import audioService, { SUPPORTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from '../speech/audio.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * A Deepgram v5 prerecorded response. Awaiting the SDK call yields the parsed
 * body directly — there is no `{ data }` envelope, which is exactly the detail
 * the previous implementation got wrong.
 */
const buildDgSTTResult = (transcript = 'Hello world', confidence = 0.98) => ({
  results: {
    channels: [{
      alternatives: [{
        transcript,
        confidence,
        words: [
          { word: 'hello', punctuated_word: 'Hello', start: 0.1, end: 0.4, confidence: 0.99 },
          { word: 'world', punctuated_word: 'world.', start: 0.5, end: 0.9, confidence: 0.97 },
        ],
        paragraphs: { paragraphs: [] },
      }],
    }],
    utterances: [],
  },
  metadata: {
    duration: 1.2,
    detected_language: 'en',
    request_id: 'req-abc123',
  },
});

/** A generateContent response carrying an audio part (synthesis). */
const buildAudioResponse = (pcm = Buffer.from('raw-pcm-samples')) => ({
  data: {
    candidates: [
      {
        content: {
          parts: [
            { inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcm.toString('base64') } },
          ],
        },
      },
    ],
  },
});

/** The body of the last Gemini request, for asserting what was sent. */
const lastRequestBody = () => mockPost.mock.calls.at(-1)[1];
const lastRequestUrl = () => mockPost.mock.calls.at(-1)[0];

// ─────────────────────────────────────────────────────────────────────────────
// STT Service Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('STT Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('transcribeBuffer', () => {
    it('should return a shaped transcript on success', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('Tell me about yourself', 0.95));

      const buf = Buffer.from('fake-audio');
      const result = await sttService.transcribeBuffer(buf, 'audio/m4a');

      expect(mockTranscribeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: buf,
          contentType: 'audio/m4a',
          filename: 'audio.m4a',
        }),
        expect.objectContaining({ model: 'nova-2', smart_format: true })
      );

      expect(result.transcript).toBe('Tell me about yourself');
      expect(result.confidence).toBe(0.95);
      expect(result.words).toHaveLength(2);
      expect(result.duration).toBe(1.2);
      expect(result.detected_language).toBe('en');
      expect(result.request_id).toBe('req-abc123');
    });

    /**
     * The v5 SDK returns the parsed body itself. Reading it as a `{ data }`
     * envelope yields an empty transcript, which the controller then reports as
     * a failed transcription — audio stored, nothing transcribed.
     */
    it('should read a v5 response that is the parsed body itself', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('Body, not envelope', 0.9));

      const result = await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/m4a');

      expect(result.transcript).toBe('Body, not envelope');
    });

    it('should still read an older { data } envelope', async () => {
      mockTranscribeFile.mockResolvedValue({ data: buildDgSTTResult('Wrapped', 0.9), rawResponse: {} });

      const result = await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/m4a');

      expect(result.transcript).toBe('Wrapped');
    });

    it('should merge caller options with defaults', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult());

      await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/mp3', {
        language: 'es',
        diarize: true,
        utterances: true,
      });

      expect(mockTranscribeFile).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'audio/mp3', filename: 'audio.mp3' }),
        expect.objectContaining({ language: 'es', diarize: true, utterances: true, model: 'nova-2' })
      );
    });

    it('should throw when Deepgram returns an error', async () => {
      mockTranscribeFile.mockResolvedValue({ result: null, error: { message: 'Bad audio' } });

      await expect(
        sttService.transcribeBuffer(Buffer.from('audio'), 'audio/m4a')
      ).rejects.toThrow('Transcription failed: Bad audio');
    });

    /** The typed SDK error carries the useful detail in `body`, not `message`. */
    it('should surface the detail from a thrown SDK error', async () => {
      const err = new Error('Bad Request');
      err.statusCode = 400;
      err.body = { err_msg: 'failed to process audio: corrupt or unsupported data' };
      mockTranscribeFile.mockRejectedValue(err);

      await expect(
        sttService.transcribeBuffer(Buffer.from('audio'), 'audio/m4a')
      ).rejects.toThrow(/corrupt or unsupported data/);
    });

    it('should throw on empty buffer', async () => {
      await expect(
        sttService.transcribeBuffer(Buffer.alloc(0), 'audio/m4a')
      ).rejects.toThrow('non-empty audio buffer');
    });

    it('should handle missing result fields gracefully', async () => {
      mockTranscribeFile.mockResolvedValue({});

      const result = await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/m4a');

      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.words).toEqual([]);
      expect(result.duration).toBeNull();
    });
  });

  describe('transcribeUrl', () => {
    it('should pass the URL to Deepgram and return the transcript', async () => {
      mockTranscribeUrl.mockResolvedValue(buildDgSTTResult('What is your greatest strength?', 0.97));

      const result = await sttService.transcribeUrl('https://storage.example.com/audio.m4a');

      expect(mockTranscribeUrl).toHaveBeenCalledWith(
        { url: 'https://storage.example.com/audio.m4a' },
        expect.objectContaining({ model: 'nova-2' })
      );
      expect(result.transcript).toBe('What is your greatest strength?');
    });

    it('should throw on invalid url argument', async () => {
      await expect(sttService.transcribeUrl('')).rejects.toThrow('valid audio URL');
      await expect(sttService.transcribeUrl(null)).rejects.toThrow('valid audio URL');
    });

    it('should throw when Deepgram returns an error', async () => {
      mockTranscribeUrl.mockResolvedValue({ error: { message: 'Forbidden' } });

      await expect(
        sttService.transcribeUrl('https://example.com/audio.m4a')
      ).rejects.toThrow('Transcription failed: Forbidden');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TTS Service Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('TTS Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAvailableVoices', () => {
    it('should return all voices with required fields', () => {
      const voices = ttsService.getAvailableVoices();
      expect(voices.length).toBe(Object.keys(TTS_VOICES).length);
      voices.forEach(v => {
        expect(v).toHaveProperty('key');
        expect(v).toHaveProperty('model');
        expect(v).toHaveProperty('gender');
        expect(v).toHaveProperty('accent');
        expect(v).toHaveProperty('description');
      });
    });
  });

  describe('_resolveOptions', () => {
    it('should use the default voice when none is specified', () => {
      const opts = ttsService._resolveOptions('Hello', {});
      expect(opts.voiceKey).toBe('kore');
      expect(opts.deepgramVoice).toBe(TTS_VOICES.kore.deepgram);
      expect(opts.geminiVoice).toBe(TTS_VOICES.kore.gemini);
      expect(opts.style).toMatch(/interviewer/i);
    });

    it('should resolve a named voice to a model for each provider', () => {
      const opts = ttsService._resolveOptions('Hello', { voice: 'orus' });
      expect(opts.deepgramVoice).toBe(TTS_VOICES.orus.deepgram);
      expect(opts.geminiVoice).toBe(TTS_VOICES.orus.gemini);
    });

    /**
     * Both providers reject an unrecognised voice name outright, so passing one
     * through would turn a stale voice id from an older build into a question
     * the candidate never hears.
     */
    it('should fall back to the default for an unknown voice', () => {
      const opts = ttsService._resolveOptions('Hello', { voice: 'aura-asteria-en' });
      expect(opts.voiceKey).toBe('kore');
      expect(opts.deepgramVoice).toBe(TTS_VOICES.kore.deepgram);
    });

    it('should throw on empty text', () => {
      expect(() => ttsService._resolveOptions('', {})).toThrow('text is required');
      expect(() => ttsService._resolveOptions('   ', {})).toThrow('text is required');
    });

    it('should throw when text exceeds 4096 chars', () => {
      expect(() => ttsService._resolveOptions('x'.repeat(4097), {})).toThrow('4096-character limit');
    });
  });

  describe('synthesize', () => {
    /**
     * Deepgram leads because the gap before a question is spoken is the whole
     * feel of the conversation: ~0.6s and a few KB of MP3, against several
     * seconds and a 244KB WAV from Gemini for the same sentence.
     */
    it('should speak through Deepgram by default', async () => {
      mockSpeakGenerate.mockResolvedValue({ arrayBuffer: async () => Buffer.from('mp3-bytes') });

      const result = await ttsService.synthesize('Tell me about yourself', { voice: 'orus' });

      expect(mockSpeakGenerate).toHaveBeenCalledWith({
        text: 'Tell me about yourself',
        model: TTS_VOICES.orus.deepgram,
        encoding: 'mp3',
      });
      expect(result.content_type).toBe('audio/mpeg');
      expect(result.voice).toBe('orus');
      expect(result.character_count).toBe(22);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should fall back to Gemini when Deepgram will not answer', async () => {
      mockSpeakGenerate.mockRejectedValue(new Error('Deepgram is down'));
      mockPost.mockResolvedValue(buildAudioResponse());

      const result = await ttsService.synthesize('Why did you leave?', { voice: 'orus' });

      expect(lastRequestUrl()).toMatch(/-tts:generateContent$/);
      expect(lastRequestBody().generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName)
        .toBe(TTS_VOICES.orus.gemini);
      expect(result.content_type).toBe('audio/wav');
    });

    it('should speak the text with delivery direction, not the direction alone', async () => {
      mockSpeakGenerate.mockRejectedValue(new Error('down'));
      mockPost.mockResolvedValue(buildAudioResponse());

      await ttsService.synthesize('Why did you leave?', { style: 'Say this warmly' });

      expect(lastRequestBody().contents[0].parts[0].text).toBe('Say this warmly: Why did you leave?');
    });

    /**
     * Gemini returns headerless PCM, which no mobile player can open. The
     * service has to frame it before the bytes leave the server.
     */
    it('should wrap Gemini PCM in a playable WAV container', async () => {
      const pcm = Buffer.from('raw-pcm-samples');
      mockSpeakGenerate.mockRejectedValue(new Error('down'));
      mockPost.mockResolvedValue(buildAudioResponse(pcm));

      const { buffer } = await ttsService.synthesize('Hello');

      expect(buffer.length).toBe(44 + pcm.length);
      expect(buffer.subarray(0, 4).toString()).toBe('RIFF');
      expect(buffer.subarray(8, 12).toString()).toBe('WAVE');
      expect(buffer.readUInt16LE(22)).toBe(1);               // mono
      expect(buffer.readUInt32LE(24)).toBe(TTS_SAMPLE_RATE); // 24 kHz
      expect(buffer.readUInt16LE(34)).toBe(16);              // 16-bit samples
      expect(buffer.readUInt32LE(40)).toBe(pcm.length);      // data chunk length
      expect(buffer.subarray(44).equals(pcm)).toBe(true);
    });

    it('should report the original failure when both providers fail', async () => {
      mockSpeakGenerate.mockRejectedValue(new Error('Deepgram is down'));
      mockPost.mockRejectedValue({
        response: { status: 429, data: { error: { message: 'Quota exceeded' } } },
      });

      await expect(ttsService.synthesize('Hello')).rejects.toThrow('Deepgram is down');
    });

    it('should treat an empty payload as a failure worth falling back from', async () => {
      mockSpeakGenerate.mockResolvedValue({ arrayBuffer: async () => Buffer.alloc(0) });
      mockPost.mockResolvedValue(buildAudioResponse());

      const result = await ttsService.synthesize('Hello');

      expect(result.content_type).toBe('audio/wav');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audio Service Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Audio Service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('validateAudio', () => {
    it('should return true for valid buffer and mimetype', () => {
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/aac')).toBe(true);
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/mpeg')).toBe(true);
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/wav')).toBe(true);
    });

    it('should throw on empty buffer', () => {
      expect(() => audioService.validateAudio(Buffer.alloc(0), 'audio/wav'))
        .toThrow('empty');
    });

    it('should throw when file exceeds size limit', () => {
      const bigBuffer = Buffer.alloc(MAX_AUDIO_BYTES + 1);
      expect(() => audioService.validateAudio(bigBuffer, 'audio/wav'))
        .toThrow('exceeds');
    });

    it('should throw on unsupported mimetype', () => {
      expect(() => audioService.validateAudio(Buffer.from('data'), 'video/mp4'))
        .toThrow('Unsupported audio type');
    });
  });

  describe('getSupportedFormats', () => {
    it('should return all keys from SUPPORTED_AUDIO_TYPES', () => {
      const formats = audioService.getSupportedFormats();
      expect(formats).toEqual(Object.keys(SUPPORTED_AUDIO_TYPES));
      expect(formats.length).toBeGreaterThan(5);
    });
  });

  describe('uploadAudio', () => {
    it('should upload buffer and return path and signed URL', async () => {
      mockStorageUpload.mockResolvedValue({ data: { path: 'user-1/sess-1/q1_123_abc.wav' }, error: null });
      mockStorageCreateSigned.mockResolvedValue({ data: { signedUrl: 'https://storage.example.com/signed' }, error: null });

      const result = await audioService.uploadAudio(
        Buffer.from('audio'), 'audio/wav', 'user-1', { sessionId: 'sess-1', questionId: 'q1' }
      );

      expect(mockStorageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^user-1\/sess-1\/q1_/),
        Buffer.from('audio'),
        { contentType: 'audio/wav', upsert: false }
      );
      expect(result.path).toBe('user-1/sess-1/q1_123_abc.wav');
      expect(result.url).toBe('https://storage.example.com/signed');
    });

    it('should throw when storage upload fails', async () => {
      mockStorageUpload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });

      await expect(
        audioService.uploadAudio(Buffer.from('audio'), 'audio/wav', 'u', { sessionId: 's', questionId: 'q' })
      ).rejects.toThrow('Failed to upload audio: Bucket not found');
    });
  });

  describe('getSignedUrl', () => {
    it('should return a signed URL', async () => {
      mockStorageCreateSigned.mockResolvedValue({
        data: { signedUrl: 'https://signed-url' }, error: null,
      });

      const url = await audioService.getSignedUrl('some/path.wav');
      expect(url).toBe('https://signed-url');
      expect(mockStorageCreateSigned).toHaveBeenCalledWith('some/path.wav', 3600);
    });

    it('should use custom expiresIn', async () => {
      mockStorageCreateSigned.mockResolvedValue({
        data: { signedUrl: 'https://signed-url' }, error: null,
      });
      await audioService.getSignedUrl('some/path.wav', 7200);
      expect(mockStorageCreateSigned).toHaveBeenCalledWith('some/path.wav', 7200);
    });

    it('should throw on storage error', async () => {
      mockStorageCreateSigned.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      await expect(audioService.getSignedUrl('bad/path')).rejects.toThrow('Failed to generate audio URL');
    });
  });

  describe('deleteAudio', () => {
    it('should return true on successful deletion', async () => {
      mockStorageRemove.mockResolvedValue({ error: null });
      const result = await audioService.deleteAudio('path/to/audio.wav');
      expect(result).toBe(true);
      expect(mockStorageRemove).toHaveBeenCalledWith(['path/to/audio.wav']);
    });

    it('should return false (not throw) on deletion failure', async () => {
      mockStorageRemove.mockResolvedValue({ error: { message: 'File not found' } });
      const result = await audioService.deleteAudio('missing/audio.wav');
      expect(result).toBe(false); // warn, not throw
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Speech Controller Integration Tests (via supertest)
// ─────────────────────────────────────────────────────────────────────────────
describe('Speech Controller (HTTP)', () => {
  let app;
  let request;

  beforeAll(async () => {
    const { default: express, json } = await import('express');
    const { default: speechRoutes } = await import('../speech/speech.routes.js');

    app = express();
    app.use(json());
    app.use('/api/v1/speech', speechRoutes);

    // Minimal error handler matching the project pattern
    app.use((err, _req, res, _next) => {
      res.status(err.statusCode || 500).json({
        status:  'fail',
        message: err.message,
      });
    });

    const supertest = await import('supertest');
    request = supertest.default(app);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageUpload.mockResolvedValue({
      data: { path: 'user-uuid-123/transcribe/audio_123.wav' },
      error: null,
    });
    mockStorageCreateSigned.mockResolvedValue({
      data: { signedUrl: 'https://signed.supabase.co/audio.wav' },
      error: null,
    });
  });

  // ── GET /voices ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/speech/voices', () => {
    it('should return all voices', async () => {
      const res = await request.get('/api/v1/speech/voices');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(5);
      expect(res.body.data[0]).toHaveProperty('key');
      expect(res.body.data[0]).toHaveProperty('model');
      expect(res.body.data[0]).toHaveProperty('gender');
    });
  });

  // ── GET /formats ────────────────────────────────────────────────────────────
  describe('GET /api/v1/speech/formats', () => {
    it('should return supported audio formats', async () => {
      const res = await request.get('/api/v1/speech/formats');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toContain('audio/aac');
      expect(res.body.data).toContain('audio/wav');
    });
  });

  // ── GET /health ─────────────────────────────────────────────────────────────
  describe('GET /api/v1/speech/health', () => {
    it('should return healthy', async () => {
      const res = await request.get('/api/v1/speech/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });
  });

  // ── POST /transcribe ────────────────────────────────────────────────────────
  describe('POST /api/v1/speech/transcribe', () => {
    it('should return 400 when no file is attached', async () => {
      const res = await request.post('/api/v1/speech/transcribe');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/No audio file provided/i);
    });

    it('should return 400 for unsupported file type', async () => {
      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('data'), { filename: 'video.mp4', contentType: 'video/mp4' });
      expect(res.status).toBe(400);
    });

    it('should transcribe a valid audio file', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('I am a software engineer', 0.96));

      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('fake-m4a'), { filename: 'answer.m4a', contentType: 'audio/m4a' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.transcript).toBe('I am a software engineer');
      expect(res.body.data.confidence).toBe(0.96);
      expect(res.body.data.duration).toBe(1.2);
      expect(res.body.data.audio_url).toBe('https://signed.supabase.co/audio.wav');
      expect(res.body.data.storage_path).toBe('user-uuid-123/transcribe/audio_123.wav');
      expect(mockStorageUpload).toHaveBeenCalled();
    });

    /**
     * The provider measures duration from the audio itself, which is more
     * accurate than the client's stopwatch — the client value is only a
     * fallback for a provider that reports none.
     */
    it('should prefer the measured duration over the client-supplied one', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('A short answer', 0.9));

      const res = await request
        .post('/api/v1/speech/transcribe')
        .field('duration_seconds', '42')
        .attach('audio', Buffer.from('fake-m4a'), { filename: 'answer.m4a', contentType: 'audio/m4a' });

      expect(res.status).toBe(200);
      expect(res.body.data.duration).toBe(1.2);
    });

    it('should fall back to the client duration when none was measured', async () => {
      const noDuration = buildDgSTTResult('A short answer', 0.9);
      noDuration.metadata.duration = null;
      mockTranscribeFile.mockResolvedValue(noDuration);

      const res = await request
        .post('/api/v1/speech/transcribe')
        .field('duration_seconds', '42')
        .attach('audio', Buffer.from('fake-m4a'), { filename: 'answer.m4a', contentType: 'audio/m4a' });

      expect(res.body.data.duration).toBe(42);
    });

    /**
     * Silence is not an answer of nothing — it is a failure to hear one, and
     * the client needs to know so it can offer a typed answer.
     */
    it('should report an empty transcript as a partial result, not a success', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('   ', 0));

      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('silence'), { filename: 'answer.m4a', contentType: 'audio/m4a' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('partial');
      expect(res.body.data.transcript).toBeNull();
      expect(res.body.data.audio_url).toBe('https://signed.supabase.co/audio.wav');
    });

    it('should still transcribe when session_id is missing', async () => {
      mockTranscribeFile.mockResolvedValue(buildDgSTTResult('No session is fine', 0.91));

      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('audio'), { filename: 'a.m4a', contentType: 'audio/m4a' });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript).toBe('No session is fine');
      expect(res.body.data.storage_path).toBe('user-uuid-123/transcribe/audio_123.wav');
    });
  });

  // ── POST /transcribe-url ────────────────────────────────────────────────────
  describe('POST /api/v1/speech/transcribe-url', () => {
    it('should transcribe audio from a URL', async () => {
      mockTranscribeUrl.mockResolvedValue(buildDgSTTResult('Describe a challenge you overcame', 0.93));

      const res = await request
        .post('/api/v1/speech/transcribe-url')
        .send({ url: 'https://storage.supabase.co/audio.m4a' });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript).toBe('Describe a challenge you overcame');
    });

    it('should return 400 when url is missing', async () => {
      const res = await request.post('/api/v1/speech/transcribe-url').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/url is required/i);
    });

    it('should return 400 for invalid URL format', async () => {
      const res = await request
        .post('/api/v1/speech/transcribe-url')
        .send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /synthesize ────────────────────────────────────────────────────────
  describe('POST /api/v1/speech/synthesize', () => {
    it('should return WAV audio for valid text', async () => {
      mockPost.mockResolvedValue(buildAudioResponse());

      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Tell me about yourself.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/audio\/wav/);
      expect(res.headers['x-voice']).toBe('kore');
    });

    it('should map a roster voice id to its catalogue voice', async () => {
      mockPost.mockResolvedValue(buildAudioResponse());

      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Question for you.', voice: 'm_direct_02' });

      expect(res.status).toBe(200);
      expect(lastRequestBody().generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName)
        .toBe('Alnilam');
      expect(res.headers['x-voice']).toBe('alnilam');
    });

    it('should return 400 when text is missing', async () => {
      const res = await request.post('/api/v1/speech/synthesize').send({});
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/text is required/i);
    });

    it('should return 400 when text is empty string', async () => {
      const res = await request.post('/api/v1/speech/synthesize').send({ text: '   ' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when text exceeds 4096 chars', async () => {
      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'x'.repeat(4097) });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/4096/);
    });

    it('should return 400 for an encoding it cannot produce', async () => {
      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Hello', encoding: 'flac' });
      expect(res.status).toBe(400);
    });

    /**
     * The format depends on which provider answered, so the client reads the
     * Content-Type to name the cached file. Getting this wrong hands the player
     * an undecodable extension, which is silence with no error.
     */
    it('should state the real format when the fallback provider answers', async () => {
      mockPost.mockRejectedValue({
        response: { status: 429, data: { error: { message: 'Quota exceeded' } } },
      });
      mockSpeakGenerate.mockResolvedValue({ arrayBuffer: async () => Buffer.from('mp3-bytes') });

      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Tell me about yourself.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
    });
  });
});
