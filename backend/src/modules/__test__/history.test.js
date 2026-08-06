// src/modules/history/__tests__/history.test.js
import { jest } from '@jest/globals';

// Mock Supabase client factory
jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import * as service from '../history/history.service.js';
import * as controller from '../history/history.controller.js';
import { AppError } from '../../core/errors/appError.js';

// ─────────────────────────────────────────────────────────────────
// Mock setup (same chainable-thenable pattern as interview.test.js)
// ─────────────────────────────────────────────────────────────────
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockReturnThis(),
  then: jest.fn(),
};

Object.keys(mockSupabase).forEach((key) => {
  if (typeof mockSupabase[key] === 'function' && key !== 'then') {
    mockSupabase[key].mockReturnValue(mockSupabase);
  }
});

mockSupabase.then = jest.fn(function (onFulfilled) {
  const result = { data: null, error: null, count: 0 };
  return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
});

getSupabaseAdminClient.mockReturnValue(mockSupabase);

const mockResponse = (data, error = null, count = null) => {
  mockSupabase.then.mockImplementationOnce((onFulfilled) => {
    const result = { data, error, count };
    return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
  });
};

const mockReq = (params = {}, query = {}, body = {}, user = { id: 'user-123' }) => ({
  params,
  query,
  body,
  user,
});
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────
// Service Tests
// ─────────────────────────────────────────────────────────────────
describe('History Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHistorySessions', () => {
    it('should only query completed and paused sessions', async () => {
      mockResponse([{ id: 's-1' }], null, 1);

      await service.getHistorySessions('user-123', { page: 1, limit: 10 });

      expect(mockSupabase.from).toHaveBeenCalledWith('interview_sessions');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['completed', 'paused']);
    });

    it('should apply search filter on session_title', async () => {
      mockResponse([], null, 0);
      await service.getHistorySessions('user-123', { search: 'backend' });
      expect(mockSupabase.ilike).toHaveBeenCalledWith('session_title', expect.stringContaining('backend'));
    });

    it('should sort by overall_score when sort=score_desc', async () => {
      mockResponse([], null, 0);
      await service.getHistorySessions('user-123', { sort: 'score_desc' });
      expect(mockSupabase.order).toHaveBeenCalledWith('overall_score', { ascending: false, nullsFirst: false });
    });

    it('should default to sorting by started_at desc', async () => {
      mockResponse([], null, 0);
      await service.getHistorySessions('user-123', {});
      expect(mockSupabase.order).toHaveBeenCalledWith('started_at', { ascending: false, nullsFirst: false });
    });

    it('should compute pagination correctly', async () => {
      mockResponse([{ id: 's-1' }], null, 25);
      const result = await service.getHistorySessions('user-123', { page: 2, limit: 10 });
      expect(mockSupabase.range).toHaveBeenCalledWith(10, 19);
      expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    });

    it('should throw on Supabase error', async () => {
      mockResponse(null, { message: 'DB error' });
      await expect(service.getHistorySessions('user-123', {})).rejects.toThrow('DB error');
    });
  });

  describe('getHistorySessionById', () => {
    it('should return null if session not found or not reviewable', async () => {
      mockResponse(null, { message: 'Not found' });
      const result = await service.getHistorySessionById('sess-1', 'user-123');
      expect(result).toBeNull();
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['completed', 'paused']);
    });

    it('should return session with questions attached', async () => {
      const mockSession = { id: 'sess-1', status: 'completed', job_descriptions: {} };
      const mockQuestions = [
        {
          id: 'q1',
          question_text: 'Tell me about yourself',
          user_responses: { id: 'r1', transcribed_text: 'I am...', response_feedback: { overall_score: 80 } },
        },
      ];
      mockResponse(mockSession);
      mockResponse(mockQuestions);

      const result = await service.getHistorySessionById('sess-1', 'user-123');
      expect(result).toEqual({ ...mockSession, questions: mockQuestions });
      expect(mockSupabase.from).toHaveBeenCalledWith('interview_questions');
    });

    it('should throw if questions query errors', async () => {
      mockResponse({ id: 'sess-1' });
      mockResponse(null, { message: 'Questions query failed' });
      await expect(service.getHistorySessionById('sess-1', 'user-123')).rejects.toThrow(
        'Questions query failed',
      );
    });
  });

  describe('setArchiveStatus', () => {
    it('should update is_archived and scope to reviewable statuses', async () => {
      mockResponse({ id: 'sess-1', is_archived: true });
      const result = await service.setArchiveStatus('sess-1', 'user-123', true);
      expect(result).toEqual({ id: 'sess-1', is_archived: true });
      expect(mockSupabase.update).toHaveBeenCalledWith({ is_archived: true });
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['completed', 'paused']);
    });

    it('should throw "not found" if no row updated', async () => {
      mockResponse(null);
      await expect(service.setArchiveStatus('sess-1', 'user-123', true)).rejects.toThrow(
        'Session not found in history',
      );
    });
  });

  describe('updateNotes', () => {
    it('should update notes', async () => {
      mockResponse({ id: 'sess-1', notes: 'Went well' });
      const result = await service.updateNotes('sess-1', 'user-123', 'Went well');
      expect(result.notes).toBe('Went well');
      expect(mockSupabase.update).toHaveBeenCalledWith({ notes: 'Went well' });
    });

    it('should coerce empty string to null', async () => {
      mockResponse({ id: 'sess-1', notes: null });
      await service.updateNotes('sess-1', 'user-123', '');
      expect(mockSupabase.update).toHaveBeenCalledWith({ notes: null });
    });

    it('should throw "not found" if no row updated', async () => {
      mockResponse(null);
      await expect(service.updateNotes('sess-1', 'user-123', 'x')).rejects.toThrow(
        'Session not found in history',
      );
    });
  });

  describe('deleteHistorySession', () => {
    it('should delete a reviewable session', async () => {
      mockResponse({ id: 'sess-1' });
      const result = await service.deleteHistorySession('sess-1', 'user-123');
      expect(result).toBe(true);
      expect(mockSupabase.delete).toHaveBeenCalled();
      expect(mockSupabase.in).toHaveBeenCalledWith('status', ['completed', 'paused']);
    });

    it('should throw "not found" if session does not exist or is in_progress', async () => {
      mockResponse(null);
      await expect(service.deleteHistorySession('sess-1', 'user-123')).rejects.toThrow(
        'Session not found in history',
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Controller Tests (service mocked directly, matching interview.test.js style)
// ─────────────────────────────────────────────────────────────────
describe('History Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.getHistorySessions = jest.fn();
    service.getHistorySessionById = jest.fn();
    service.setArchiveStatus = jest.fn();
    service.updateNotes = jest.fn();
    service.deleteHistorySession = jest.fn();
  });

  describe('getHistory', () => {
    it('should return 200 with paginated list', async () => {
      const req = mockReq({}, { page: '1', limit: '10' });
      const res = mockRes();
      const next = jest.fn();
      service.getHistorySessions.mockResolvedValue({
        data: [{ id: 's-1', session_title: 'Test', job_descriptions: {} }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });

      await controller.getHistory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', data: expect.any(Array), pagination: expect.any(Object) }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 400 on invalid sort value', async () => {
      const req = mockReq({}, { sort: 'not-a-real-sort' });
      const res = mockRes();
      const next = jest.fn();

      await controller.getHistory(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe('getHistoryById', () => {
    it('should return 200 with detail', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.getHistorySessionById.mockResolvedValue({ id: 'sess-1', questions: [] });

      await controller.getHistoryById(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: expect.objectContaining({ id: 'sess-1' }),
      });
    });

    it('should return 404 if session not reviewable', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.getHistorySessionById.mockResolvedValue(null);

      await controller.getHistoryById(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  describe('archiveSession', () => {
    it('should return 200 on success', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, { is_archived: true });
      const res = mockRes();
      const next = jest.fn();
      service.setArchiveStatus.mockResolvedValue({ id: 'sess-1', is_archived: true });

      await controller.archiveSession(req, res, next);
      expect(service.setArchiveStatus).toHaveBeenCalledWith('sess-1', 'user-123', true);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 when is_archived is missing', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, {});
      const res = mockRes();
      const next = jest.fn();

      await controller.archiveSession(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it('should return 404 when session is not in history', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, { is_archived: true });
      const res = mockRes();
      const next = jest.fn();
      service.setArchiveStatus.mockRejectedValue(new Error('Session not found in history'));

      await controller.archiveSession(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });

  describe('updateNotes', () => {
    it('should return 200 on success', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, { notes: 'Solid answers on system design' });
      const res = mockRes();
      const next = jest.fn();
      service.updateNotes.mockResolvedValue({ id: 'sess-1', notes: 'Solid answers on system design' });

      await controller.updateNotes(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        message: 'Notes updated',
        data: { id: 'sess-1', notes: 'Solid answers on system design' },
      });
    });

    it('should return 400 when notes field is missing', async () => {
      const req = mockReq({ id: 'sess-1' }, {}, {});
      const res = mockRes();
      const next = jest.fn();

      await controller.updateNotes(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  describe('deleteHistorySession', () => {
    it('should return 204 on success', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.deleteHistorySession.mockResolvedValue(true);

      await controller.deleteHistorySession(req, res, next);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });

    it('should return 404 when session is not in history', async () => {
      const req = mockReq({ id: 'sess-1' });
      const res = mockRes();
      const next = jest.fn();
      service.deleteHistorySession.mockRejectedValue(new Error('Session not found in history'));

      await controller.deleteHistorySession(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].statusCode).toBe(404);
    });
  });
});