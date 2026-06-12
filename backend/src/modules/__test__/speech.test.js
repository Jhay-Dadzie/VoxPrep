/**
 * Speech Module Tests
 *
 * Coverage:
 *  - STT Service       — transcribeBuffer, transcribeUrl, _formatResult
 *  - TTS Service       — synthesize, synthesizeToStream, getAvailableVoices, _resolveOptions
 *  - Audio Service     — validateAudio, uploadAudio, getSignedUrl, deleteAudio
 *  - Speech Controller — all 5 endpoints via supertest (mocked services)
 *
 * Mocking strategy:
 *  - Deepgram SDK is mocked at the config level (jest.mock config/deepgram.js)
 *  - Supabase is mocked at the config level (jest.mock config/supabase.js)
 *  - Auth middleware is bypassed (req.user injected directly)
 *  - Each test resets mocks in beforeEach to avoid test pollution
 */

import { jest } from '@jest/globals';

// ─── Mock Deepgram ────────────────────────────────────────────────────────────
const mockTranscribeFile = jest.fn();
const mockTranscribeUrl  = jest.fn();
const mockSpeakRequest   = jest.fn();

jest.mock('../../config/deepgram.js', () => ({
  getDeepgramClient: jest.fn(() => ({
    listen: {
      prerecorded: {
        transcribeFile: mockTranscribeFile,
        transcribeUrl:  mockTranscribeUrl,
      },
    },
    speak: {
      request: mockSpeakRequest,
    },
  })),
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
import ttsService, { DEEPGRAM_VOICES } from '../speech/tts.service.js';
import audioService, { SUPPORTED_AUDIO_TYPES, MAX_AUDIO_BYTES } from '../speech/audio.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Deepgram pre-recorded response */
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

/** Build a minimal Web ReadableStream from a Buffer */
const bufferToWebStream = (buf) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buf));
      controller.close();
    },
  });

// ─────────────────────────────────────────────────────────────────────────────
// STT Service Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('STT Service', () => {
  beforeEach(() => jest.clearAllMocks());
  beforeEach(() => {
    mockStorageUpload.mockResolvedValue({
      data: { path: 'user-uuid-123/transcribe/audio_123.webm' },
      error: null,
    });
    mockStorageCreateSigned.mockResolvedValue({
      data: { signedUrl: 'https://signed.supabase.co/audio.webm' },
      error: null,
    });
  });

  describe('transcribeBuffer', () => {
    it('should return a shaped transcript on success', async () => {
      const dgResult = buildDgSTTResult('Tell me about yourself', 0.95);
      mockTranscribeFile.mockResolvedValue({ data: dgResult, rawResponse: {} });

      const buf = Buffer.from('fake-audio');
      const result = await sttService.transcribeBuffer(buf, 'audio/webm');

      expect(mockTranscribeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: buf,
          contentType: 'audio/webm',
          filename: 'audio.webm',
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

    it('should merge caller options with defaults', async () => {
      mockTranscribeFile.mockResolvedValue({ data: buildDgSTTResult(), rawResponse: {} });

      await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/mp3', {
        language: 'es',
        diarize: true,
        utterances: true,
      });

      expect(mockTranscribeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(Buffer),
          contentType: 'audio/mp3',
          filename: 'audio.mp3',
        }),
        expect.objectContaining({ language: 'es', diarize: true, utterances: true, model: 'nova-2' })
      );
    });

    it('should throw when Deepgram returns an error', async () => {
      mockTranscribeFile.mockResolvedValue({ result: null, error: { message: 'Bad audio' } });

      await expect(
        sttService.transcribeBuffer(Buffer.from('audio'), 'audio/webm')
      ).rejects.toThrow('Transcription failed: Bad audio');
    });

    it('should throw on empty buffer', async () => {
      await expect(
        sttService.transcribeBuffer(Buffer.alloc(0), 'audio/webm')
      ).rejects.toThrow('non-empty audio buffer');
    });

    it('should handle missing result fields gracefully', async () => {
      mockTranscribeFile.mockResolvedValue({ data: {}, rawResponse: {} });
      const result = await sttService.transcribeBuffer(Buffer.from('audio'), 'audio/webm');
      expect(result.transcript).toBe('');
      expect(result.confidence).toBe(0);
      expect(result.words).toEqual([]);
      expect(result.duration).toBeNull();
    });
  });

  describe('transcribeUrl', () => {
    it('should pass the URL to Deepgram and return transcript', async () => {
      const dgResult = buildDgSTTResult('What is your greatest strength?', 0.97);
      mockTranscribeUrl.mockResolvedValue({ data: dgResult, rawResponse: {} });

      const result = await sttService.transcribeUrl(
        'https://storage.example.com/audio.mp3'
      );

      expect(mockTranscribeUrl).toHaveBeenCalledWith(
        { url: 'https://storage.example.com/audio.mp3' },
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
        sttService.transcribeUrl('https://example.com/audio.mp3')
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
      expect(voices.length).toBe(Object.keys(DEEPGRAM_VOICES).length);
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
    it('should use default voice and encoding when not specified', () => {
      const opts = ttsService._resolveOptions('Hello', {});
      expect(opts.voice).toBe('asteria');
      expect(opts.encoding).toBe('mp3');
      expect(opts.sample_rate).toBe(24000);
      expect(opts.model).toBe('aura-asteria-en');
    });

    it('should resolve named voice to its model', () => {
      const opts = ttsService._resolveOptions('Hello', { voice: 'orion' });
      expect(opts.model).toBe('aura-orion-en');
    });

    it('should allow raw model string as fallback', () => {
      const opts = ttsService._resolveOptions('Hello', { voice: 'aura-zeus-en' });
      expect(opts.model).toBe('aura-zeus-en');
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
    it('should return a buffer and metadata on success', async () => {
      const audioData = Buffer.from('fake-mp3-bytes');
      mockSpeakRequest.mockResolvedValue({
        getStream: () => Promise.resolve(bufferToWebStream(audioData)),
      });

      const result = await ttsService.synthesize('Tell me about yourself', { voice: 'asteria' });

      expect(mockSpeakRequest).toHaveBeenCalledWith(
        { text: 'Tell me about yourself' },
        { model: 'aura-asteria-en', encoding: 'mp3', sample_rate: 24000 }
      );
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.content_type).toBe('audio/mpeg');
      expect(result.character_count).toBe(22);
      expect(result.voice).toBe('asteria');
    });

    it('should use orion voice and wav encoding when specified', async () => {
      mockSpeakRequest.mockResolvedValue({
        getStream: () => Promise.resolve(bufferToWebStream(Buffer.from('wav-bytes'))),
      });

      const result = await ttsService.synthesize('Hello', { voice: 'orion', encoding: 'wav' });

      expect(mockSpeakRequest).toHaveBeenCalledWith(
        { text: 'Hello' },
        expect.objectContaining({ model: 'aura-orion-en', encoding: 'wav' })
      );
      expect(result.content_type).toBe('audio/wav');
    });

    it('should throw when getStream returns null', async () => {
      mockSpeakRequest.mockResolvedValue({ getStream: () => Promise.resolve(null) });
      await expect(ttsService.synthesize('Hello')).rejects.toThrow('no audio stream');
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
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/webm')).toBe(true);
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/mpeg')).toBe(true);
      expect(audioService.validateAudio(Buffer.from('data'), 'audio/wav')).toBe(true);
    });

    it('should throw on empty buffer', () => {
      expect(() => audioService.validateAudio(Buffer.alloc(0), 'audio/webm'))
        .toThrow('empty');
    });

    it('should throw when file exceeds size limit', () => {
      const bigBuffer = Buffer.alloc(MAX_AUDIO_BYTES + 1);
      expect(() => audioService.validateAudio(bigBuffer, 'audio/webm'))
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
      mockStorageUpload.mockResolvedValue({ data: { path: 'user-1/sess-1/q1_123_abc.webm' }, error: null });
      mockStorageCreateSigned.mockResolvedValue({ data: { signedUrl: 'https://storage.example.com/signed' }, error: null });

      const result = await audioService.uploadAudio(
        Buffer.from('audio'), 'audio/webm', 'user-1', { sessionId: 'sess-1', questionId: 'q1' }
      );

      expect(mockStorageUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^user-1\/sess-1\/q1_/),
        Buffer.from('audio'),
        { contentType: 'audio/webm', upsert: false }
      );
      expect(result.path).toBe('user-1/sess-1/q1_123_abc.webm');
      expect(result.url).toBe('https://storage.example.com/signed');
    });

    it('should throw when storage upload fails', async () => {
      mockStorageUpload.mockResolvedValue({ data: null, error: { message: 'Bucket not found' } });

      await expect(
        audioService.uploadAudio(Buffer.from('audio'), 'audio/webm', 'u', { sessionId: 's', questionId: 'q' })
      ).rejects.toThrow('Failed to upload audio: Bucket not found');
    });
  });

  describe('getSignedUrl', () => {
    it('should return a signed URL', async () => {
      mockStorageCreateSigned.mockResolvedValue({
        data: { signedUrl: 'https://signed-url' }, error: null,
      });

      const url = await audioService.getSignedUrl('some/path.webm');
      expect(url).toBe('https://signed-url');
      expect(mockStorageCreateSigned).toHaveBeenCalledWith('some/path.webm', 3600);
    });

    it('should use custom expiresIn', async () => {
      mockStorageCreateSigned.mockResolvedValue({
        data: { signedUrl: 'https://signed-url' }, error: null,
      });
      await audioService.getSignedUrl('some/path.webm', 7200);
      expect(mockStorageCreateSigned).toHaveBeenCalledWith('some/path.webm', 7200);
    });

    it('should throw on storage error', async () => {
      mockStorageCreateSigned.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      await expect(audioService.getSignedUrl('bad/path')).rejects.toThrow('Failed to generate audio URL');
    });
  });

  describe('deleteAudio', () => {
    it('should return true on successful deletion', async () => {
      mockStorageRemove.mockResolvedValue({ error: null });
      const result = await audioService.deleteAudio('path/to/audio.webm');
      expect(result).toBe(true);
      expect(mockStorageRemove).toHaveBeenCalledWith(['path/to/audio.webm']);
    });

    it('should return false (not throw) on deletion failure', async () => {
      mockStorageRemove.mockResolvedValue({ error: { message: 'File not found' } });
      const result = await audioService.deleteAudio('missing/audio.webm');
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
      data: { path: 'user-uuid-123/transcribe/audio_123.webm' },
      error: null,
    });
    mockStorageCreateSigned.mockResolvedValue({
      data: { signedUrl: 'https://signed.supabase.co/audio.webm' },
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
      expect(res.body.data).toContain('audio/webm');
      expect(res.body.data).toContain('audio/mpeg');
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
      const dgResult = buildDgSTTResult('I am a software engineer', 0.96);
      mockTranscribeFile.mockResolvedValue({ data: dgResult, rawResponse: {} });

      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('fake-webm'), { filename: 'answer.webm', contentType: 'audio/webm' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.transcript).toBe('I am a software engineer');
      expect(res.body.data.confidence).toBe(0.96);
      expect(res.body.data.duration).toBe(1.2);
      expect(res.body.data.audio_url).toBe('https://signed.supabase.co/audio.webm');
      expect(res.body.data.storage_path).toBe('user-uuid-123/transcribe/audio_123.webm');
      expect(mockStorageUpload).toHaveBeenCalled();
    });

    it('should upload audio with session/question context when provided', async () => {
      const dgResult = buildDgSTTResult('My weakness is perfectionism', 0.94);
      mockTranscribeFile.mockResolvedValue({ data: dgResult, rawResponse: {} });
      mockStorageUpload.mockResolvedValue({
        data: { path: 'user-uuid-123/sess-1/q1_ts_abc.webm' }, error: null,
      });
      mockStorageCreateSigned.mockResolvedValue({
        data: { signedUrl: 'https://signed.supabase.co/audio.webm' }, error: null,
      });

      const res = await request
        .post('/api/v1/speech/transcribe')
        .field('session_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('question_id', '550e8400-e29b-41d4-a716-446655440001')
        .attach('audio', Buffer.from('fake-webm'), { filename: 'answer.webm', contentType: 'audio/webm' });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript).toBe('My weakness is perfectionism');
      expect(res.body.data.audio_url).toBe('https://signed.supabase.co/audio.webm');
      expect(res.body.data.storage_path).toBe('user-uuid-123/sess-1/q1_ts_abc.webm');
    });

    it('should still transcribe when session_id is missing', async () => {
      const dgResult = buildDgSTTResult('No session is fine', 0.91);
      mockTranscribeFile.mockResolvedValue({ data: dgResult, rawResponse: {} });

      const res = await request
        .post('/api/v1/speech/transcribe')
        .attach('audio', Buffer.from('audio'), { filename: 'a.webm', contentType: 'audio/webm' });

      expect(res.status).toBe(200);
      expect(res.body.data.transcript).toBe('No session is fine');
      expect(res.body.data.audio_url).toBe('https://signed.supabase.co/audio.webm');
      expect(res.body.data.storage_path).toBe('user-uuid-123/transcribe/audio_123.webm');
    });
  });

  // ── POST /transcribe-url ────────────────────────────────────────────────────
  describe('POST /api/v1/speech/transcribe-url', () => {
    it('should transcribe audio from a URL', async () => {
      const dgResult = buildDgSTTResult('Describe a challenge you overcame', 0.93);
      mockTranscribeUrl.mockResolvedValue({ data: dgResult, rawResponse: {} });

      const res = await request
        .post('/api/v1/speech/transcribe-url')
        .send({ url: 'https://storage.supabase.co/audio.mp3' });

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
    it('should return audio stream for valid text', async () => {
      const fakeAudio = Buffer.from('MP3-audio-bytes');
      mockSpeakRequest.mockResolvedValue({
        getStream: () => Promise.resolve(bufferToWebStream(fakeAudio)),
      });

      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Tell me about yourself.' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/audio\/mpeg/);
      expect(res.headers['x-voice']).toBe('asteria');
    });

    it('should use specified voice and encoding', async () => {
      mockSpeakRequest.mockResolvedValue({
        getStream: () => Promise.resolve(bufferToWebStream(Buffer.from('wav'))),
      });

      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Question for you.', voice: 'orion', encoding: 'wav' });

      expect(mockSpeakRequest).toHaveBeenCalledWith(
        { text: 'Question for you.' },
        expect.objectContaining({ model: 'aura-orion-en', encoding: 'wav' })
      );
      expect(res.status).toBe(200);
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

    it('should return 400 for invalid encoding', async () => {
      const res = await request
        .post('/api/v1/speech/synthesize')
        .send({ text: 'Hello', encoding: 'mp5' });
      expect(res.status).toBe(400);
    });
  });
});
