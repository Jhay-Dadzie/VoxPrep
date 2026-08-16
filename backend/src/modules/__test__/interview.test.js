// src/modules/interviews/__tests__/interviewSession.test.js
import { jest } from '@jest/globals';

// Mock Supabase client factory
jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn()
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import * as service from '../interviews/interview.service.js';
import * as controller from '../interviews/interview.controller.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';

// ─────────────────────────────────────────────────────────────────
// Mock setup
// ─────────────────────────────────────────────────────────────────
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  then: jest.fn().mockImplementation(cb => cb({ data: null, error: null, count: 0 })),
  // For select with count exact
  withCount: jest.fn().mockReturnThis(),
  // For .select('*', { count: 'exact' }) pattern
  _countParam: null,
};

// Make the mock chain return itself
Object.keys(mockSupabase).forEach(key => {
  if (typeof mockSupabase[key] === 'function' && key !== 'then') {
    mockSupabase[key].mockReturnValue(mockSupabase);
  }
});

// Override .then to resolve promises
mockSupabase.then = jest.fn(function (onFulfilled) {
  const result = { data: null, error: null, count: 0 };
  return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
});

getSupabaseAdminClient.mockReturnValue(mockSupabase);

// Helper to set mock response
const mockResponse = (data, error = null, count = null) => {
  mockSupabase.then.mockImplementationOnce((onFulfilled) => {
    const result = { data, error, count };
    return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
  });
};

// Mock Express request/response/next
const mockReq = (params = {}, query = {}, body = {}, user = { id: 'user-123' }) => ({
  params,
  query,
  body,
  user
});
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};
const mockNext = jest.fn();

// ─────────────────────────────────────────────────────────────────
// Service Tests
// ─────────────────────────────────────────────────────────────────
describe('InterviewSession Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createInterviewSession', () => {
    it('should create a session without job description', async () => {
      const mockSession = { id: 'sess-1', user_id: 'user-123', session_title: 'Interview', status: 'in_progress', started_at: null };
      mockResponse(mockSession);

      const result = await service.createInterviewSession('user-123', null, 'My Interview');
      expect(result).toEqual(mockSession);
      expect(mockSupabase.from).toHaveBeenCalledWith('interview_sessions');
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        user_id: 'user-123',
        session_title: 'My Interview',
        status: 'in_progress'
      }));
    });

    it('should fetch job description when job_description_id provided', async () => {
      const mockJob = { id: 'job-1', title: 'Software Engineer', company_name: 'TechCorp' };
      // First call: job fetch
      mockResponse(mockJob);
      // Second call: session insert
      mockResponse({ id: 'sess-2', user_id: 'user-123', session_title: 'Software Engineer at TechCorp - Interview' });

      const result = await service.createInterviewSession('user-123', 'job-1');
      expect(result.session_title).toContain('Software Engineer');
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'job-1');
    });

    it('should throw error if job not found', async () => {
      mockResponse(null, { message: 'Not found' });
      await expect(service.createInterviewSession('user-123', 'invalid-id')).rejects.toThrow('Job description not found or access denied');
    });
  });

  describe('startSession', () => {
    it('should set status to in_progress and set started_at', async () => {
      mockResponse({ id: 'sess-1' }); // update returns data
      const result = await service.startSession('sess-1', 'user-123');
      expect(result).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'in_progress',
        started_at: expect.any(String)
      });
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['in_progress', 'paused']);
    });

    it('should throw if session not found or not startable', async () => {
      mockResponse(null, null); // maybeSingle returns null
      await expect(service.startSession('sess-1', 'user-123')).rejects.toThrow('Session not found or cannot be started');
    });
  });

  describe('pauseSession', () => {
    it('should set status to paused', async () => {
      mockResponse({ id: 'sess-1' });
      const result = await service.pauseSession('sess-1', 'user-123');
      expect(result).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith({ status: 'paused' });
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'in_progress');
    });

    it('should throw if session not found or not in_progress', async () => {
      mockResponse(null);
      await expect(service.pauseSession('sess-1', 'user-123')).rejects.toThrow('Session not found or not in progress');
    });
  });

  describe('continueSession', () => {
    it('should set status to in_progress if session is paused', async () => {
      mockResponse({ id: 'sess-1' }); // update returns data
      const result = await service.continueSession('sess-1', 'user-123');
      expect(result).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'in_progress',
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'sess-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase.eq).toHaveBeenCalledWith('status', 'paused');
    });

    it('should throw if session not found or not paused', async () => {
      mockResponse(null, null); // maybeSingle returns null
      await expect(service.continueSession('sess-1', 'user-123')).rejects.toThrow(
        'Session not found or not in a paused state'
      );
    });
  });



  describe('completeSession', () => {
    it('should set status to completed and calculate duration', async () => {
      // First get session to read started_at
      mockResponse({ started_at: new Date(Date.now() - 120000).toISOString() }); // 2 minutes ago
      // Then the two counters, then the update
      mockResponse(null, null, 6);   // questions asked
      mockResponse(null, null, 5);   // answers given
      mockResponse({ id: 'sess-1' });

      const result = await service.completeSession('sess-1', 'user-123');
      expect(result).toBe(true);
      expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed',
        completed_at: expect.any(String),
        duration_seconds: expect.any(Number)
      }));
    });

    it('should set duration to null if started_at is null', async () => {
      mockResponse({ started_at: null });
      mockResponse(null, null, 0);
      mockResponse(null, null, 0);
      mockResponse({ id: 'sess-1' });
      await service.completeSession('sess-1', 'user-123');
      expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
        duration_seconds: null
      }));
    });

    /**
     * A semi-structured interview stops when the interviewer closes or the
     * candidate ends it, so the counters written during the session can be
     * ahead of what actually happened. Completing settles them.
     */
    it('should settle the question counters against what was really asked', async () => {
      mockResponse({ started_at: new Date().toISOString() });
      mockResponse(null, null, 8);   // 8 questions asked
      mockResponse(null, null, 7);   // 7 of them answered
      mockResponse({ id: 'sess-1' });

      await service.completeSession('sess-1', 'user-123');

      expect(mockSupabase.update).toHaveBeenCalledWith(expect.objectContaining({
        total_questions: 8,
        questions_answered: 7
      }));
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      mockResponse(null); // delete returns no data
      await service.deleteSession('sess-1', 'user-123');
      expect(mockSupabase.from).toHaveBeenCalledWith('interview_sessions');
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'sess-1');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
    });
  });

  describe('getInterviewSessions', () => {
    it('should return paginated sessions with job info', async () => {
      const mockData = [
        { id: 's-1', session_title: 'Interview 1', job_descriptions: { title: 'Dev', company_name: 'Co' } }
      ];
      mockResponse(mockData, null, 5);

      const result = await service.getInterviewSessions('user-123', { page: 2, limit: 5 });
      expect(result.data).toEqual(mockData);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.page).toBe(2);
      expect(mockSupabase.range).toHaveBeenCalledWith(5, 9);
    });

    it('should apply search filter', async () => {
      mockResponse([], null, 0);
      await service.getInterviewSessions('user-123', { search: 'frontend' });
      expect(mockSupabase.ilike).toHaveBeenCalledWith('session_title', expect.stringContaining('frontend'));
    });
  });

  describe('getInterviewSessionById', () => {
    it('should return session with questions and answers', async () => {
      const mockSession = { id: 'sess-1', user_id: 'user-123', job_descriptions: {} };
      const mockQuestions = [
        { id: 'q1', question_text: 'Tell me about yourself', user_responses: [{ id: 'r1', transcribed_text: 'I am...' }] }
      ];
      // First call for session
      mockResponse(mockSession);
      // Second call for questions
      mockResponse(mockQuestions);

      const result = await service.getInterviewSessionById('sess-1', 'user-123');
      expect(result).toEqual({ ...mockSession, questions: mockQuestions });
      expect(mockSupabase.from).toHaveBeenCalledWith('interview_questions');
    });

    it('should return null if session not found', async () => {
      mockResponse(null, { message: 'Not found' });
      const result = await service.getInterviewSessionById('sess-1', 'user-123');
      expect(result).toBeNull();
    });
  });

  describe('addQuestionToSession', () => {
    it('should add question and increment total_questions', async () => {
      // Get session
      mockResponse({ status: 'in_progress', total_questions: 2 });
      // Insert question
      const mockQuestion = { id: 'q-new', question_number: 3 };
      mockResponse(mockQuestion);
      // Update session total_questions (no need to mock response)
      mockResponse({});

      const result = await service.addQuestionToSession('sess-1', 'user-123', {
        question_text: 'What is your weakness?',
        question_type: 'behavioral'
      });
      expect(result.question_number).toBe(3);
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        session_id: 'sess-1',
        question_text: 'What is your weakness?',
        question_number: 3
      }));
    });

    it('should throw if session completed', async () => {
      mockResponse({ status: 'completed' });
      await expect(service.addQuestionToSession('sess-1', 'user-123', { question_text: 'test' }))
        .rejects.toThrow('Cannot add questions to a completed session');
    });
  });

  describe('submitAnswer', () => {
    it('should insert new answer and update answered count', async () => {
      // Verify question and session
      mockResponse({ id: 'q1', interview_sessions: { user_id: 'user-123', status: 'in_progress' } });
      // No existing response
      mockResponse(null); // maybeSingle returns null
      // Insert response
      mockResponse({ id: 'resp-new' });
      // Count answers
      mockResponse([], null, 3); // count = 3
      // Update session
      mockResponse({});

      const result = await service.submitAnswer('sess-1', 'q1', 'user-123', {
        answer_text: 'My answer',
        audio_url: 'http://example.com/audio.mp3'
      });
      expect(result.responseId).toBe('resp-new');
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
        question_id: 'q1',
        transcribed_text: 'My answer'
      }));
      expect(mockSupabase.update).toHaveBeenCalledWith({ questions_answered: 3 });
    });

    it('should update existing answer if already present', async () => {
      mockResponse({ id: 'q1', interview_sessions: { user_id: 'user-123', status: 'in_progress' } });
      // Existing response
      mockResponse({ id: 'resp-existing' });
      // Update response
      mockResponse({ id: 'resp-existing' });
      // Count
      mockResponse([], null, 3);
      mockResponse({});

      const result = await service.submitAnswer('sess-1', 'q1', 'user-123', { answer_text: 'Updated answer' });
      expect(result.responseId).toBe('resp-existing');
      expect(mockSupabase.update).toHaveBeenCalled();
      expect(mockSupabase.insert).not.toHaveBeenCalled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Controller Tests (with mocked service)
// ─────────────────────────────────────────────────────────────────
jest.unstable_mockModule('../interviews/interview.service.js', () => ({
  createInterviewSession: jest.fn(),
  startSession: jest.fn(),
  pauseSession: jest.fn(),
  completeSession: jest.fn(),
  continueSession: jest.fn(), // Add this
  deleteSession: jest.fn(),
  getInterviewSessions: jest.fn(),
  getInterviewSessionById: jest.fn(),
  addQuestionToSession: jest.fn(),
  generateSessionQuestions: jest.fn(),
  submitAnswer: jest.fn()
}));

// Re-import after mocking (using dynamic import to avoid hoisting issues)
describe('InterviewSession Controller', () => {
  let serviceMock;

  beforeAll(async () => {
    // Since we used jest.unstable_mockModule, we need to import dynamically
    // But for simplicity, we can re-require if needed. For this test file, we'll just
    // reference the mocked functions that were already imported at top? Actually they are not mocked.
    // Better: use jest.spyOn on the actual service module after importing.
    // Given time, I'll use jest.spyOn on the service methods after importing the real service.
    // But the service already has mocks from previous tests? We'll isolate.
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-mock service functions for controller tests
    service.createInterviewSession = jest.fn();
    service.startSession = jest.fn();
    service.pauseSession = jest.fn();
    service.completeSession = jest.fn();
    service.continueSession = jest.fn(); // Add this
    service.deleteSession = jest.fn();
    service.getInterviewSessions = jest.fn();
    service.getInterviewSessionById = jest.fn();
    service.addQuestionToSession = jest.fn();
    service.generateSessionQuestions = jest.fn();
    service.submitAnswer = jest.fn();
  });

  describe('createInterviewSession controller', () => {
    it('should return 201 with session data', async () => {
      const validJobId = '550e8400-e29b-41d4-a716-446655440000';
      const req = mockReq({}, {}, { job_description_id: validJobId, session_title: 'Test Session' });
      const res = mockRes();
      const next = jest.fn();
      const mockSession = { id: 'sess-1', session_title: 'Test Session' };
      service.createInterviewSession.mockResolvedValue(mockSession);

      await controller.createInterviewSession(req, res, next);

      expect(service.createInterviewSession).toHaveBeenCalledWith('user-123', validJobId, 'Test Session');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 'sess-1' })
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 on validation error', async () => {
      const req = mockReq({}, {}, { job_description_id: 'invalid-uuid' });
      const res = mockRes();
      const next = jest.fn();

      await controller.createInterviewSession(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe('startSession controller', () => {
    it('should return 200 on success', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.startSession.mockResolvedValue(true);

      await controller.startSession(req, res, next);
      expect(service.startSession).toHaveBeenCalledWith('sess-1', 'user-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', message: 'Session started' });
    });
  });

  describe('pauseSession controller', () => {
    it('should return 200', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.pauseSession.mockResolvedValue(true);
      await controller.pauseSession(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('continueSession controller', () => {
    it('should return 200 on success', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.continueSession.mockResolvedValue(true);

      await controller.continueSession(req, res, next);
      expect(service.continueSession).toHaveBeenCalledWith('sess-1', 'user-123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ status: 'success', message: 'Session continued successfully' });
    });
  });



  describe('completeSession controller', () => {
    it('should return 200', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.completeSession.mockResolvedValue(true);
      await controller.completeSession(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteSession controller', () => {
    it('should return 204', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.deleteSession.mockResolvedValue(true);
      await controller.deleteSession(req, res, next);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('getInterviewSessions controller', () => {
    it('should return paginated list', async () => {
      const req = mockReq({}, { page: 1, limit: 10 });
      const res = mockRes();
      const next = jest.fn();
      const mockResult = {
        data: [{ id: 's-1', session_title: 'Test' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
      };
      service.getInterviewSessions.mockResolvedValue(mockResult);
      await controller.getInterviewSessions(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        data: expect.any(Array),
        pagination: expect.any(Object)
      }));
    });
  });

  describe('getInterviewSessionById controller', () => {
    it('should return session details', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      const mockSession = { id: 'sess-1', session_title: 'Test', questions: [] };
      service.getInterviewSessionById.mockResolvedValue(mockSession);
      await controller.getInterviewSessionById(req, res, next);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 'sess-1' })
      });
    });

    it('should return 404 if not found', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.getInterviewSessionById.mockResolvedValue(null);
      await controller.getInterviewSessionById(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  describe('addQuestion controller', () => {
    it('should return 201 with generated question data', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, { questionCount: 2 });
      const res = mockRes();
      const next = jest.fn();
      const mockQuestions = [
        { id: 'q1', question_text: 'New question?', question_number: 1, question_type: 'technical', difficulty_level: 'medium' }
      ];
      service.generateSessionQuestions.mockResolvedValue(mockQuestions);
      await controller.addQuestion(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Questions generated successfully',
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'q1', questionText: 'New question?' })
        ])
      });
    });
  });

  describe('submitAnswer controller', () => {
    it('should return 200 with response id', async () => {
      const req = mockReq({ sessionId: 'sess-1', questionId: 'q1' }, {}, { answer_text: 'My answer' });
      const res = mockRes();
      const next = jest.fn();
      service.submitAnswer.mockResolvedValue({ responseId: 'resp-123' });
      await controller.submitAnswer(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { response_id: 'resp-123' }
      });
    });
  });
});
