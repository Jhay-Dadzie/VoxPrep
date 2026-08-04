import { jest } from '@jest/globals';
import {
  clampScore,
  averageSubScores,
  deriveOverallScore,
  normalizeFeedback,
  computeSessionAggregate,
} from '../feedback/scoring.engine.js';

// ─────────────────────────────────────────────────────────────────
// Scoring Engine — pure functions, no mocking required
// ─────────────────────────────────────────────────────────────────
describe('scoring.engine', () => {
  describe('clampScore', () => {
    it('rounds and clamps values into 0-100', () => {
      expect(clampScore(87.6)).toBe(88);
      expect(clampScore(-15)).toBe(0);
      expect(clampScore(150)).toBe(100);
      expect(clampScore(0)).toBe(0);
      expect(clampScore(100)).toBe(100);
    });

    it('falls back on non-numeric or missing input', () => {
      expect(clampScore(undefined)).toBe(0);
      expect(clampScore(null)).toBe(0);
      expect(clampScore('not a number')).toBe(0);
      expect(clampScore(NaN, 42)).toBe(42);
    });
  });

  describe('averageSubScores', () => {
    it('averages the five metrics and rounds', () => {
      const avg = averageSubScores({
        relevance_score: 80,
        completeness_score: 70,
        technical_accuracy_score: 90,
        clarity_score: 60,
        confidence_score: 100,
      });
      // (80+70+90+60+100)/5 = 80
      expect(avg).toBe(80);
    });

    it('treats missing metrics as 0', () => {
      const avg = averageSubScores({ relevance_score: 100 });
      expect(avg).toBe(20); // (100+0+0+0+0)/5
    });
  });

  describe('deriveOverallScore', () => {
    const scores = {
      relevance_score: 80,
      completeness_score: 80,
      technical_accuracy_score: 80,
      clarity_score: 80,
      confidence_score: 80,
    };

    it('trusts a valid AI-provided overall score, even if it diverges from the average', () => {
      expect(deriveOverallScore(scores, 55)).toBe(55);
    });

    it('clamps an out-of-range AI-provided overall score', () => {
      expect(deriveOverallScore(scores, 140)).toBe(100);
    });

    it('falls back to the sub-score average when overall is missing or invalid', () => {
      expect(deriveOverallScore(scores, undefined)).toBe(80);
      expect(deriveOverallScore(scores, 'n/a')).toBe(80);
    });
  });

  describe('normalizeFeedback', () => {
    it('normalizes a well-formed AI payload', () => {
      const result = normalizeFeedback({
        relevance_score: 90,
        completeness_score: 85,
        technical_accuracy_score: 75,
        clarity_score: 88,
        confidence_score: 92,
        overall_score: 86,
        strengths: ['Clear structure', 'Good use of a concrete example'],
        improvements: ['Quantify the impact'],
        summary: 'Strong answer overall.',
      });

      expect(result).toEqual({
        relevance_score: 90,
        completeness_score: 85,
        technical_accuracy_score: 75,
        clarity_score: 88,
        confidence_score: 92,
        overall_score: 86,
        strengths: ['Clear structure', 'Good use of a concrete example'],
        improvements: ['Quantify the impact'],
        summary: 'Strong answer overall.',
      });
    });

    it('repairs a partially malformed payload instead of throwing', () => {
      const result = normalizeFeedback({
        relevance_score: 'high', // invalid -> 0
        completeness_score: 70,
        strengths: 'not an array', // invalid -> []
        improvements: null, // invalid -> []
        summary: 12345, // invalid -> ''
      });

      expect(result.relevance_score).toBe(0);
      expect(result.completeness_score).toBe(70);
      expect(result.strengths).toEqual([]);
      expect(result.improvements).toEqual([]);
      expect(result.summary).toBe('');
      expect(result.overall_score).toBe(Math.round((0 + 70 + 0 + 0 + 0) / 5));
    });

    it('throws on a structurally unusable payload', () => {
      expect(() => normalizeFeedback(null)).toThrow();
      expect(() => normalizeFeedback('a string')).toThrow();
      expect(() => normalizeFeedback([1, 2, 3])).toThrow();
    });

    it('caps strengths/improvements lists and truncates an overlong summary', () => {
      const manyItems = Array.from({ length: 10 }, (_, i) => `item ${i}`);
      const result = normalizeFeedback({
        strengths: manyItems,
        improvements: manyItems,
        summary: 'x'.repeat(3000),
      });
      expect(result.strengths.length).toBeLessThanOrEqual(6);
      expect(result.improvements.length).toBeLessThanOrEqual(6);
      expect(result.summary.length).toBeLessThanOrEqual(2000);
    });
  });

  describe('computeSessionAggregate', () => {
    it('returns nulls and zero count for an empty session', () => {
      const agg = computeSessionAggregate([]);
      expect(agg.response_count).toBe(0);
      expect(agg.overall_score).toBeNull();
    });

    it('averages across multiple feedback rows', () => {
      const agg = computeSessionAggregate([
        {
          relevance_score: 100,
          completeness_score: 100,
          technical_accuracy_score: 100,
          clarity_score: 100,
          confidence_score: 100,
          overall_score: 100,
        },
        {
          relevance_score: 0,
          completeness_score: 0,
          technical_accuracy_score: 0,
          clarity_score: 0,
          confidence_score: 0,
          overall_score: 0,
        },
      ]);

      expect(agg.response_count).toBe(2);
      expect(agg.overall_score).toBe(50);
      expect(agg.relevance_score).toBe(50);
    });
  });
});

// ─────────────────────────────────────────────────────────────────
// Feedback Service — mocked Supabase admin client + AI layer
// ─────────────────────────────────────────────────────────────────
jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
}));

jest.mock('../feedback/feedback.generator.js', () => ({
  __esModule: true,
  generateFeedback: jest.fn(),
}));

let getSupabaseAdminClient;
let generateFeedback;
let feedbackService;

beforeAll(async () => {
  ({ getSupabaseAdminClient } = await import('../../config/supabase.js'));
  ({ generateFeedback } = await import('../feedback/feedback.generator.js'));
  ({ default: feedbackService } = await import('../feedback/feedback.service.js'));
});

function buildMockSupabase() {
  const mock = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
  };
  return mock;
}

describe('feedback.service', () => {
  const mockSupabase = buildMockSupabase();

  beforeEach(() => {
    jest.clearAllMocks();
    getSupabaseAdminClient.mockReturnValue(mockSupabase);
  });

  describe('generateSessionFeedback', () => {
    it('throws 400 when not all questions are answered yet', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'sess-1', user_id: 'user-1', total_questions: 3, questions_answered: 1 },
        error: null,
      });

      await expect(
        feedbackService.generateSessionFeedback('sess-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(generateFeedback).not.toHaveBeenCalled();
    });

    it('throws 404 when the session does not belong to the user', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

      await expect(
        feedbackService.generateSessionFeedback('sess-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
