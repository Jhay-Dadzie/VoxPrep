/**
 * Response Module Tests
 *
 * Tests both the service layer (with mocked Supabase) and the controller
 * layer (with mocked service). Follows the same patterns as interview.test.js.
 *
 * Run with: npm test -- responses
 */

import { jest } from '@jest/globals';

// ─── Mock Supabase before any imports that need it ────────────────────────────

jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import * as service from '../responses/response.service.js';
import * as controller from '../responses/response.controller.js';
import { AppError } from '../../core/errors/appError.js';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockSupabase = {
  from:        jest.fn().mockReturnThis(),
  select:      jest.fn().mockReturnThis(),
  insert:      jest.fn().mockReturnThis(),
  update:      jest.fn().mockReturnThis(),
  delete:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  order:       jest.fn().mockReturnThis(),
  range:       jest.fn().mockReturnThis(),
  single:      jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockReturnThis(),
  then: jest.fn(function (onFulfilled) {
    const result = { data: null, error: null, count: 0 };
    return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
  }),
};

// Keep the chain fluent
Object.keys(mockSupabase).forEach((key) => {
  if (typeof mockSupabase[key] === 'function' && key !== 'then') {
    mockSupabase[key].mockReturnValue(mockSupabase);
  }
});

getSupabaseAdminClient.mockReturnValue(mockSupabase);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Queue a single mock response for the next `.then()` call.
 */
function mockOnce(data, error = null, count = null) {
  mockSupabase.then.mockImplementationOnce((onFulfilled) => {
    const result = { data, error, count };
    return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
  });
}

function mockReq(params = {}, body = {}, query = {}, user = { id: 'user-abc' }) {
  return { params, body, query, user };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  res.send   = jest.fn().mockReturnValue(res);
  return res;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const SESSION_ID  = 'sess-111';
const QUESTION_ID = 'q-222';
const RESPONSE_ID = 'resp-333';
const USER_ID     = 'user-abc';

const mockQuestion = {
  id: QUESTION_ID,
  interview_sessions: { id: SESSION_ID, user_id: USER_ID, status: 'in_progress' },
};

const mockResponseRow = {
  id: RESPONSE_ID,
  question_id:              QUESTION_ID,
  session_id:               SESSION_ID,
  user_id:                  USER_ID,
  transcribed_text:         'I am a software engineer with 5 years of experience.',
  original_audio_url:       'https://storage.example.com/audio/resp-333.mp3',
  storage_path:             'user-abc/sess-111/q222_123456_abc123.mp3',
  response_duration_seconds: 45,
  transcription_confidence: 0.97,
  detected_language:        'en',
  request_id:               'deepgram-req-abc123',
  response_created_at:      '2024-01-01T10:00:00.000Z',
};

const mockResponseWithQuestion = {
  ...mockResponseRow,
  interview_questions: {
    question_text:          'Tell me about yourself.',
    question_number:        1,
    question_type:          'behavioral',
    difficulty_level:       'medium',
    ideal_answer_guidelines: 'Cover background, key skills, and motivation.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Response Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── submitResponse ──────────────────────────────────────────────────────────

  describe('submitResponse', () => {
    it('creates a new response when none exists', async () => {
      mockOnce({ id: SESSION_ID, user_id: USER_ID, status: 'in_progress' }); // session fetch
      mockOnce({ id: QUESTION_ID });   // question fetch
      mockOnce(null);                  // no existing response (maybeSingle)
      mockOnce(mockResponseRow);       // insert returns row
      mockOnce(null, null, 1);         // _syncAnsweredCount count
      mockOnce({});                    // _syncAnsweredCount update

      const result = await service.submitResponse(
        SESSION_ID, QUESTION_ID, USER_ID,
        { transcribed_text: 'I am a software engineer with 5 years of experience.' }
      );

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          question_id: QUESTION_ID,
          session_id:  SESSION_ID,
          user_id:     USER_ID,
          transcribed_text: 'I am a software engineer with 5 years of experience.',
        })
      );
      expect(result.id).toBe(RESPONSE_ID);
    });

    it('updates an existing response (idempotent)', async () => {
      mockOnce({ id: SESSION_ID, user_id: USER_ID, status: 'in_progress' }); // session fetch
      mockOnce({ id: QUESTION_ID });   // question fetch
      mockOnce({ id: RESPONSE_ID });   // existing response found
      mockOnce(mockResponseRow);       // update returns updated row

      const result = await service.submitResponse(
        SESSION_ID, QUESTION_ID, USER_ID,
        { transcribed_text: 'Updated answer text.' }
      );

      expect(mockSupabase.update).toHaveBeenCalled();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
      expect(result.transcribed_text).toBe(mockResponseRow.transcribed_text);
    });

    it('throws when question not found or user has no access', async () => {
      mockOnce({ id: SESSION_ID, user_id: USER_ID, status: 'in_progress' }); // session fetch
      mockOnce(null, { message: 'Not found' });                              // question fetch fails

      await expect(
        service.submitResponse(SESSION_ID, 'bad-q', USER_ID, { transcribed_text: 'x' })
      ).rejects.toThrow('Question not found or access denied');
    });

    it('throws when session is already completed', async () => {
      mockOnce({ id: SESSION_ID, user_id: USER_ID, status: 'completed' }); // session fetch — completed

      await expect(
        service.submitResponse(SESSION_ID, QUESTION_ID, USER_ID, { transcribed_text: 'x' })
      ).rejects.toThrow('Cannot submit a response to a completed session');
    });

    it('stores optional STT metadata when provided', async () => {
      mockOnce({ id: SESSION_ID, user_id: USER_ID, status: 'in_progress' }); // session fetch
      mockOnce({ id: QUESTION_ID });   // question fetch
      mockOnce(null);                  // no existing response
      mockOnce(mockResponseRow);       // insert returns row
      mockOnce(null, null, 1);         // _syncAnsweredCount count
      mockOnce({});                    // _syncAnsweredCount update

      await service.submitResponse(SESSION_ID, QUESTION_ID, USER_ID, {
        transcribed_text:          'Answer',
        storage_path:              'user-1/sess-1/q1_123_abc.webm',
        original_audio_url:        'https://s3.example.com/audio.mp3',
        response_duration_seconds: 30,
        transcription_confidence:  0.95,
        detected_language:         'en',
        request_id:                'req-abc123',
      });

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          storage_path:              'user-1/sess-1/q1_123_abc.webm',
          original_audio_url:        'https://s3.example.com/audio.mp3',
          response_duration_seconds: 30,
          transcription_confidence:  0.95,
          detected_language:         'en',
          request_id:                'req-abc123',
        })
      );
    });
  });

  // ── updateResponse ──────────────────────────────────────────────────────────

  describe('updateResponse', () => {
    it('updates transcribed text successfully', async () => {
      mockOnce({ id: RESPONSE_ID, session_id: SESSION_ID, original_audio_url: 'https://example.com/audio.mp3', storage_path: 'user/session/audio.mp3', interview_sessions: { status: 'in_progress' } });
      mockOnce({ ...mockResponseRow, transcribed_text: 'Corrected answer.' });

      const result = await service.updateResponse(RESPONSE_ID, USER_ID, {
        transcribed_text: 'Corrected answer.',
      });

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ transcribed_text: 'Corrected answer.' })
      );
      expect(result.transcribed_text).toBe('Corrected answer.');
    });

    it('preserves original_audio_url and storage_path during transcript update', async () => {
      const audioUrl = 'https://storage.example.com/audio/resp-333.mp3';
      const storagePath = 'user-abc/sess-111/q222_123456_abc123.mp3';
      
      mockOnce({ 
        id: RESPONSE_ID, 
        session_id: SESSION_ID, 
        original_audio_url: audioUrl,
        storage_path: storagePath,
        interview_sessions: { status: 'in_progress' } 
      });
      mockOnce({ 
        ...mockResponseRow, 
        original_audio_url: audioUrl, 
        storage_path: storagePath,
        transcribed_text: 'Enriched with transcript' 
      });

      const result = await service.updateResponse(RESPONSE_ID, USER_ID, {
        transcribed_text: 'Enriched with transcript',
      });

      // Verify that original_audio_url was preserved (not reset to null)
      expect(result.original_audio_url).toBe(audioUrl);
      expect(result.storage_path).toBe(storagePath);
      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({ 
          transcribed_text: 'Enriched with transcript',
          original_audio_url: audioUrl,
        })
      );
    });

    it('throws when response not found', async () => {
      mockOnce(null, { message: 'Not found' });

      await expect(
        service.updateResponse('bad-id', USER_ID, { transcribed_text: 'x' })
      ).rejects.toThrow('Response not found or access denied');
    });

    it('throws when session is completed', async () => {
      mockOnce({ id: RESPONSE_ID, session_id: SESSION_ID, interview_sessions: { status: 'completed' } });

      await expect(
        service.updateResponse(RESPONSE_ID, USER_ID, { transcribed_text: 'Edit attempt' })
      ).rejects.toThrow('Cannot edit a response that belongs to a completed session');
    });
  });

  // ── deleteResponse ──────────────────────────────────────────────────────────

  describe('deleteResponse', () => {
    it('deletes response and syncs count', async () => {
      mockOnce({ id: RESPONSE_ID, session_id: SESSION_ID, interview_sessions: { status: 'in_progress' } });
      mockOnce(null);                // delete
      mockOnce(null, null, 0);       // _syncAnsweredCount count
      mockOnce({});                  // _syncAnsweredCount update

      const result = await service.deleteResponse(RESPONSE_ID, USER_ID);

      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('throws when response does not exist', async () => {
      mockOnce(null, { message: 'Not found' });

      await expect(
        service.deleteResponse('bad-id', USER_ID)
      ).rejects.toThrow('Response not found or access denied');
    });

    it('throws when session is completed', async () => {
      mockOnce({ id: RESPONSE_ID, session_id: SESSION_ID, interview_sessions: { status: 'completed' } });

      await expect(
        service.deleteResponse(RESPONSE_ID, USER_ID)
      ).rejects.toThrow('Cannot delete a response from a completed session');
    });
  });

  // ── getSessionResponses ─────────────────────────────────────────────────────

  describe('getSessionResponses', () => {
    it('returns paginated response list', async () => {
      mockOnce({ id: SESSION_ID });  // session auth check
      mockOnce([mockResponseRow], null, 3);  // paginated query

      const result = await service.getSessionResponses(SESSION_ID, USER_ID, {
        page: 1, limit: 10, include_feedback: false,
      });

      expect(result.data).toHaveLength(1);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.totalPages).toBe(1);
      expect(mockSupabase.range).toHaveBeenCalledWith(0, 9);
    });

    it('returns second page correctly', async () => {
      mockOnce({ id: SESSION_ID });
      mockOnce([], null, 5);

      const result = await service.getSessionResponses(SESSION_ID, USER_ID, {
        page: 2, limit: 3, include_feedback: false,
      });

      expect(mockSupabase.range).toHaveBeenCalledWith(3, 5);
      expect(result.pagination.page).toBe(2);
      expect(result.pagination.totalPages).toBe(2);
    });

    it('throws when session not found or not owned by user', async () => {
      mockOnce(null, { message: 'Not found' });

      await expect(
        service.getSessionResponses('bad-session', USER_ID, {})
      ).rejects.toThrow('Session not found or access denied');
    });
  });

  // ── getResponseById ─────────────────────────────────────────────────────────

  describe('getResponseById', () => {
    it('returns response with question context', async () => {
      mockOnce(mockResponseWithQuestion);

      const result = await service.getResponseById(RESPONSE_ID, USER_ID, false);

      expect(result.id).toBe(RESPONSE_ID);
      expect(result.interview_questions.question_text).toBe('Tell me about yourself.');
    });

    it('returns null when not found', async () => {
      mockOnce(null, { message: 'Not found' });

      const result = await service.getResponseById('bad-id', USER_ID, false);
      expect(result).toBeNull();
    });
  });

  // ── getQuestionResponse ─────────────────────────────────────────────────────

  describe('getQuestionResponse', () => {
    it('returns response for a specific question', async () => {
      mockOnce({ id: SESSION_ID });           // session check
      mockOnce(mockResponseWithQuestion);     // response fetch

      const result = await service.getQuestionResponse(SESSION_ID, QUESTION_ID, USER_ID);

      expect(result.question_id).toBe(QUESTION_ID);
    });

    it('returns null when question has not been answered', async () => {
      mockOnce({ id: SESSION_ID });
      mockOnce(null, null);   // maybeSingle → null

      const result = await service.getQuestionResponse(SESSION_ID, QUESTION_ID, USER_ID);
      expect(result).toBeNull();
    });

    it('throws when session not accessible', async () => {
      mockOnce(null, { message: 'Not found' });

      await expect(
        service.getQuestionResponse('bad-session', QUESTION_ID, USER_ID)
      ).rejects.toThrow('Session not found or access denied');
    });
  });

  // ── getSessionStats ─────────────────────────────────────────────────────────

  describe('getSessionStats', () => {
    it('calculates correct completion percentage', async () => {
      mockOnce({ id: SESSION_ID, total_questions: 10, questions_answered: 4 });
      mockOnce(null, null, 4);   // live count

      const result = await service.getSessionStats(SESSION_ID, USER_ID);

      expect(result.total_questions).toBe(10);
      expect(result.questions_answered).toBe(4);
      expect(result.questions_pending).toBe(6);
      expect(result.completion_percentage).toBe(40);
    });

    it('returns 0% when no questions defined', async () => {
      mockOnce({ id: SESSION_ID, total_questions: 0, questions_answered: 0 });
      mockOnce(null, null, 0);

      const result = await service.getSessionStats(SESSION_ID, USER_ID);
      expect(result.completion_percentage).toBe(0);
    });

    it('caps pending at 0 when answered > total (data inconsistency guard)', async () => {
      mockOnce({ id: SESSION_ID, total_questions: 3, questions_answered: 5 });
      mockOnce(null, null, 5);

      const result = await service.getSessionStats(SESSION_ID, USER_ID);
      expect(result.questions_pending).toBe(0);
    });

    it('throws when session not found', async () => {
      mockOnce(null, { message: 'Not found' });

      await expect(
        service.getSessionStats('bad-session', USER_ID)
      ).rejects.toThrow('Session not found or access denied');
    });
  });

  // ── patchConfidence ────────────────────────────────────────────────────────

  describe('patchConfidence (internal)', () => {
    it('patches transcription_confidence via admin path', async () => {
      mockOnce(null); // update succeeds silently

      await service.patchConfidence(RESPONSE_ID, 0.95);

      expect(mockSupabase.update).toHaveBeenCalledWith({
        transcription_confidence: 0.95,
      });
    });

    it('logs warning on update failure', async () => {
      mockOnce(null, { message: 'Database error' });

      // Should not throw — non-fatal
      await service.patchConfidence(RESPONSE_ID, 0.95);

      // Verify warning was logged (via spy on logger.warn)
    });
  });

  // ── patchSttMetadata ────────────────────────────────────────────────────────

  describe('patchSttMetadata (internal)', () => {
    it('patches detected_language and request_id', async () => {
      mockOnce(null); // update succeeds

      await service.patchSttMetadata(RESPONSE_ID, {
        detected_language: 'en',
        request_id: 'deepgram-xyz',
      });

      expect(mockSupabase.update).toHaveBeenCalledWith({
        detected_language: 'en',
        request_id: 'deepgram-xyz',
      });
    });

    it('patches only detected_language if request_id is undefined', async () => {
      mockOnce(null);

      await service.patchSttMetadata(RESPONSE_ID, {
        detected_language: 'fr',
      });

      expect(mockSupabase.update).toHaveBeenCalledWith({
        detected_language: 'fr',
      });
    });

    it('patches only request_id if detected_language is undefined', async () => {
      mockOnce(null);

      await service.patchSttMetadata(RESPONSE_ID, {
        request_id: 'deepgram-abc',
      });

      expect(mockSupabase.update).toHaveBeenCalledWith({
        request_id: 'deepgram-abc',
      });
    });

    it('does nothing if both fields are undefined', async () => {
      await service.patchSttMetadata(RESPONSE_ID, {});

      expect(mockSupabase.update).not.toHaveBeenCalled();
    });

    it('logs warning on update failure', async () => {
      mockOnce(null, { message: 'Database error' });

      // Should not throw — non-fatal
      await service.patchSttMetadata(RESPONSE_ID, {
        detected_language: 'en',
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLLER TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Response Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-bind service methods so each test can override them
    service.submitResponse          = jest.fn();
    service.getSessionResponses     = jest.fn();
    service.getQuestionResponse     = jest.fn();
    service.getSessionStats         = jest.fn();
    service.getResponseById         = jest.fn();
    service.updateResponse          = jest.fn();
    service.deleteResponse          = jest.fn();
  });

  // ── submitResponse ──────────────────────────────────────────────────────────

  describe('submitResponse', () => {
    it('returns 201 with mapped response on success', async () => {
      const req  = mockReq(
        { sessionId: SESSION_ID, questionId: QUESTION_ID },
        { transcribed_text: 'My answer to the question.' }
      );
      const res  = mockRes();
      const next = jest.fn();

      service.submitResponse.mockResolvedValue(mockResponseWithQuestion);

      await controller.submitResponse(req, res, next);

      expect(service.submitResponse).toHaveBeenCalledWith(
        SESSION_ID, QUESTION_ID, USER_ID,
        expect.objectContaining({ transcribed_text: 'My answer to the question.' })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', message: 'Response submitted successfully' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when transcribed_text is missing', async () => {
      const req  = mockReq({ sessionId: SESSION_ID, questionId: QUESTION_ID }, {});
      const res  = mockRes();
      const next = jest.fn();

      await controller.submitResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('returns 400 when transcribed_text is empty string', async () => {
      const req  = mockReq(
        { sessionId: SESSION_ID, questionId: QUESTION_ID },
        { transcribed_text: '   ' }
      );
      const res  = mockRes();
      const next = jest.fn();

      await controller.submitResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });

    it('passes through service errors', async () => {
      const req  = mockReq(
        { sessionId: SESSION_ID, questionId: QUESTION_ID },
        { transcribed_text: 'Valid text.' }
      );
      const res  = mockRes();
      const next = jest.fn();

      service.submitResponse.mockRejectedValue(new Error('Question not found or access denied'));

      await controller.submitResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // ── getSessionResponses ─────────────────────────────────────────────────────

  describe('getSessionResponses', () => {
    it('returns 200 with paginated list', async () => {
      const req = mockReq(
        { sessionId: SESSION_ID },
        {},
        { page: '1', limit: '10', include_feedback: 'false' }
      );
      const res  = mockRes();
      const next = jest.fn();

      service.getSessionResponses.mockResolvedValue({
        data:       [mockResponseWithQuestion],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });

      await controller.getSessionResponses(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          data: expect.any(Array),
          pagination: expect.objectContaining({ total: 1 }),
        })
      );
    });

    it('passes include_feedback flag to service', async () => {
      const req = mockReq({ sessionId: SESSION_ID }, {}, { include_feedback: 'true' });
      const res  = mockRes();
      const next = jest.fn();

      service.getSessionResponses.mockResolvedValue({ data: [], pagination: {} });

      await controller.getSessionResponses(req, res, next);

      expect(service.getSessionResponses).toHaveBeenCalledWith(
        SESSION_ID,
        USER_ID,
        expect.objectContaining({ include_feedback: true })
      );
    });
  });

  // ── getQuestionResponse ─────────────────────────────────────────────────────

  describe('getQuestionResponse', () => {
    it('returns 200 with response when found', async () => {
      const req  = mockReq({ sessionId: SESSION_ID, questionId: QUESTION_ID });
      const res  = mockRes();
      const next = jest.fn();

      service.getQuestionResponse.mockResolvedValue(mockResponseWithQuestion);

      await controller.getQuestionResponse(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when question has no response', async () => {
      const req  = mockReq({ sessionId: SESSION_ID, questionId: QUESTION_ID });
      const res  = mockRes();
      const next = jest.fn();

      service.getQuestionResponse.mockResolvedValue(null);

      await controller.getQuestionResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  // ── getSessionStats ─────────────────────────────────────────────────────────

  describe('getSessionStats', () => {
    it('returns 200 with completion stats', async () => {
      const req = mockReq({ sessionId: SESSION_ID });
      const res  = mockRes();
      const next = jest.fn();

      service.getSessionStats.mockResolvedValue({
        session_id: SESSION_ID, total_questions: 5,
        questions_answered: 3, questions_pending: 2, completion_percentage: 60,
      });

      await controller.getSessionStats(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ completion_percentage: 60 }),
      });
    });
  });

  // ── getResponseById ─────────────────────────────────────────────────────────

  describe('getResponseById', () => {
    it('returns 200 for a valid response ID', async () => {
      const req  = mockReq({ id: RESPONSE_ID }, {}, {});
      const res  = mockRes();
      const next = jest.fn();

      service.getResponseById.mockResolvedValue(mockResponseWithQuestion);

      await controller.getResponseById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 404 when response not found', async () => {
      const req  = mockReq({ id: 'bad-id' }, {}, {});
      const res  = mockRes();
      const next = jest.fn();

      service.getResponseById.mockResolvedValue(null);

      await controller.getResponseById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });

    it('passes include_feedback=true to service when requested', async () => {
      const req  = mockReq({ id: RESPONSE_ID }, {}, { include_feedback: 'true' });
      const res  = mockRes();
      const next = jest.fn();

      service.getResponseById.mockResolvedValue(mockResponseWithQuestion);

      await controller.getResponseById(req, res, next);

      expect(service.getResponseById).toHaveBeenCalledWith(RESPONSE_ID, USER_ID, true);
    });
  });

  // ── updateResponse ──────────────────────────────────────────────────────────

  describe('updateResponse', () => {
    it('returns 200 with updated response', async () => {
      const req = mockReq({ id: RESPONSE_ID }, { transcribed_text: 'Edited answer.' });
      const res  = mockRes();
      const next = jest.fn();

      service.updateResponse.mockResolvedValue({
        ...mockResponseRow,
        transcribed_text: 'Edited answer.',
      });

      await controller.updateResponse(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Response updated successfully' })
      );
    });

    it('returns 400 when update body is empty', async () => {
      const req  = mockReq({ id: RESPONSE_ID }, {});
      const res  = mockRes();
      const next = jest.fn();

      await controller.updateResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('returns 400 when transcribed_text is set to empty string', async () => {
      const req  = mockReq({ id: RESPONSE_ID }, { transcribed_text: '' });
      const res  = mockRes();
      const next = jest.fn();

      await controller.updateResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  // ── deleteResponse ──────────────────────────────────────────────────────────

  describe('deleteResponse', () => {
    it('returns 204 on successful deletion', async () => {
      const req  = mockReq({ id: RESPONSE_ID });
      const res  = mockRes();
      const next = jest.fn();

      service.deleteResponse.mockResolvedValue({ deleted: true });

      await controller.deleteResponse(req, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('forwards service errors to next', async () => {
      const req  = mockReq({ id: RESPONSE_ID });
      const res  = mockRes();
      const next = jest.fn();

      service.deleteResponse.mockRejectedValue(
        new Error('Cannot delete a response from a completed session')
      );

      await controller.deleteResponse(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MAPPER TESTS
// ─────────────────────────────────────────────────────────────────────────────

import {
  toResponse,
  toResponseWithQuestion,
  toResponseWithFeedback,
  toResponseListItem,
} from '../responses/response.mapper.js';

describe('Response Mapper', () => {
  const rawRow = {
    id:                       RESPONSE_ID,
    question_id:              QUESTION_ID,
    session_id:               SESSION_ID,
    user_id:                  USER_ID,
    transcribed_text:         'Sample answer.',
    original_audio_url:       'https://s3.example.com/audio.mp3',
    storage_path:             'user-abc/sess-111/q222_123456_abc123.mp3',
    response_duration_seconds: 30,
    transcription_confidence: 0.92,
    detected_language:        'en',
    request_id:               'deepgram-req-xyz789',
    response_created_at:      '2024-01-01T10:00:00.000Z',
  };

  describe('toResponse', () => {
    it('maps bare columns and never exposes user_id', () => {
      const result = toResponse(rawRow);
      expect(result.id).toBe(RESPONSE_ID);
      expect(result.transcribed_text).toBe('Sample answer.');
      expect(result.responded_at).toBe('2024-01-01T10:00:00.000Z');
      expect(result).not.toHaveProperty('user_id');
    });

    it('exposes audio metadata fields', () => {
      const result = toResponse(rawRow);
      expect(result.storage_path).toBe('user-abc/sess-111/q222_123456_abc123.mp3');
      expect(result.detected_language).toBe('en');
      expect(result.request_id).toBe('deepgram-req-xyz789');
    });

    it('returns null for a null row', () => {
      expect(toResponse(null)).toBeNull();
    });

    it('sets null on missing optional fields', () => {
      const sparse = { id: 'x', question_id: 'q', session_id: 's', response_created_at: null };
      const result = toResponse(sparse);
      expect(result.original_audio_url).toBeNull();
      expect(result.transcription_confidence).toBeNull();
      expect(result.storage_path).toBeNull();
      expect(result.detected_language).toBeNull();
      expect(result.request_id).toBeNull();
    });
  });

  describe('toResponseWithQuestion', () => {
    it('includes nested question context', () => {
      const row = {
        ...rawRow,
        interview_questions: {
          question_text:           'Tell me about yourself.',
          question_number:         1,
          question_type:           'behavioral',
          difficulty_level:        'medium',
          ideal_answer_guidelines: 'Focus on background.',
        },
      };
      const result = toResponseWithQuestion(row);
      expect(result.question.text).toBe('Tell me about yourself.');
      expect(result.question.number).toBe(1);
      expect(result.question.type).toBe('behavioral');
    });

    it('sets question to null when join is absent', () => {
      const result = toResponseWithQuestion({ ...rawRow, interview_questions: null });
      expect(result.question).toBeNull();
    });
  });

  describe('toResponseWithFeedback', () => {
    it('maps feedback when present as a single object', () => {
      const row = {
        ...rawRow,
        interview_questions: null,
        feedback: {
          id: 'fb-1',
          overall_score: 82,
          relevance_score: 85,
          clarity_score: 80,
          confidence_score: 81,
          detailed_feedback: 'Good structure.',
          improvement_suggestions: 'Be more specific.',
          created_at: '2024-01-01T11:00:00.000Z',
        },
      };
      const result = toResponseWithFeedback(row);
      expect(result.feedback.overall_score).toBe(82);
      expect(result.feedback.evaluated_at).toBe('2024-01-01T11:00:00.000Z');
    });

    it('handles feedback as an array (PostgREST one-to-many shape)', () => {
      const row = {
        ...rawRow,
        interview_questions: null,
        feedback: [{ id: 'fb-1', overall_score: 75, created_at: '2024-01-01T11:00:00.000Z' }],
      };
      const result = toResponseWithFeedback(row);
      expect(result.feedback.overall_score).toBe(75);
    });

    it('sets feedback to null when not yet generated', () => {
      const result = toResponseWithFeedback({ ...rawRow, interview_questions: null, feedback: null });
      expect(result.feedback).toBeNull();
    });

    it('sets feedback to null when feedback is an empty array', () => {
      const result = toResponseWithFeedback({ ...rawRow, interview_questions: null, feedback: [] });
      expect(result.feedback).toBeNull();
    });
  });

  describe('toResponseListItem', () => {
    it('is identical to toResponseWithFeedback', () => {
      const row = { ...rawRow, interview_questions: null, feedback: null };
      expect(toResponseListItem(row)).toEqual(toResponseWithFeedback(row));
    });
  });
});