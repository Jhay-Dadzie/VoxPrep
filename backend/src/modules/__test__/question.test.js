import { jest } from '@jest/globals';

// 1. Mocks
jest.mock('../../config/supabase.js', () => ({
  getSupabaseClientForToken: jest.fn(),
  getSupabaseAdminClient: jest.fn()
}));

jest.mock('../ai/generators/question.generator.js', () => ({
  generateQuestions: jest.fn()
}));

import { getSupabaseClientForToken } from '../../config/supabase.js';
import { getSupabaseAdminClient } from '../../config/supabase.js';
import { generateQuestions } from '../ai/generators/question.generator.js';
import * as service from '../questions/question.service.js';
import * as controller from '../questions/question.controller.js';

// Supabase Chain Mock Setup
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  then: jest.fn()
};

getSupabaseClientForToken.mockReturnValue(mockSupabase);
getSupabaseAdminClient.mockReturnValue(mockSupabase);

// Helper to resolve Supabase promises
const mockDbResponse = (data, error = null) => {
  mockSupabase.then.mockImplementationOnce((onFulfilled) => {
    return Promise.resolve(onFulfilled({ data, error }));
  });
};

describe('Questions Module', () => {
  const mockSessionId = '550e8400-e29b-41d4-a716-446655440000';
  const mockAccessToken = 'valid-token';
  const mockJobData = {
    title: 'Software Engineer',
    job_content: 'We need a developer who knows React and Node.js for building scalable apps.'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // Service Tests
  // ─────────────────────────────────────────────────────────────────
  describe('Question Service', () => {
    it('should successfully generate and store questions', async () => {
      // Mock 1: Session check
      mockDbResponse({ id: mockSessionId, total_questions: 0, status: 'in_progress' });
      
      // Mock 2: AI Generation
      const mockAiOutput = [
        {
          question_text: 'Explain React hooks',
          question_type: 'technical',
          difficulty_level: 'medium',
          ideal_answer_guidelines: 'Mention useState and useEffect'
        }
      ];
      generateQuestions.mockResolvedValue(mockAiOutput);

      // Mock 3: Insertion result
      const mockInsertedData = [{ id: 'q-1', ...mockAiOutput[0], session_id: mockSessionId }];
      mockDbResponse(mockInsertedData);
      // Mock 4: Session question count update
      mockDbResponse({});

      const result = await service.createSessionQuestions(mockSessionId, {
        accessToken: mockAccessToken,
        jobData: mockJobData,
      });

      expect(result).toEqual(mockInsertedData);
      expect(generateQuestions).toHaveBeenCalledWith(mockJobData, { questionCount: 10, mode: null });
      expect(mockSupabase.from).toHaveBeenCalledWith('interview_questions');
      expect(mockSupabase.insert).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ question_number: 1 })
      ]));
    });

    it('should throw error if session is not found or access is denied', async () => {
      // Mock: Session fetch returns error or null
      mockDbResponse(null, { message: 'Not found' });

      await expect(
        service.createSessionQuestions(mockSessionId, {
          accessToken: mockAccessToken,
          jobData: mockJobData,
        })
      ).rejects.toThrow('Interview session not found or access denied');

      expect(generateQuestions).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Controller Tests
  // ─────────────────────────────────────────────────────────────────
  describe('Question Controller', () => {
    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    const mockReq = (body) => ({
      body,
      token: mockAccessToken,
      user: { id: 'user-123' }
    });

    it('should return 200 and questions on successful generation', async () => {
      const req = mockReq({
        sessionId: mockSessionId,
        jobData: mockJobData
      });
      const res = mockRes();
      
      const mockServiceResponse = [{ id: 'q-1', question_text: 'Test?' }];
      // Mock the service call
      // We need to spy on the service since it's imported as a module
      const serviceSpy = jest.spyOn(service, 'createSessionQuestions').mockResolvedValue(mockServiceResponse);

      await controller.generateSessionQuestionsController(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'success',
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'q-1',
            questionText: 'Test?'
          })
        ]),
        message: 'Questions generated successfully'
      }));
      
      serviceSpy.mockRestore();
    });

    it('should return 400 if sessionId is not a valid UUID', async () => {
      const req = mockReq({
        sessionId: 'invalid-id',
        jobData: mockJobData
      });
      const res = mockRes();

      await controller.generateSessionQuestionsController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Validation failed',
        errors: expect.arrayContaining([expect.stringContaining('sessionId')])
      }));
    });

    it('should return 400 if job_content is too short', async () => {
      const req = mockReq({
        sessionId: mockSessionId,
        jobData: {
          title: 'Dev',
          job_content: 'Too short' // Less than 50 chars
        }
      });
      const res = mockRes();

      await controller.generateSessionQuestionsController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([expect.stringContaining('Job content is too short')])
      }));
    });

    it('should return 400 if required_experience_level is invalid', async () => {
      const req = mockReq({
        sessionId: mockSessionId,
        jobData: {
          ...mockJobData,
          required_experience_level: 'expert' // Not in entry|mid|senior|lead
        }
      });
      const res = mockRes();

      await controller.generateSessionQuestionsController(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([expect.stringContaining('must be one of')])
      }));
    });
  });
});
