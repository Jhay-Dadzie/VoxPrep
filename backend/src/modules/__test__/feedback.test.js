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

    it('ignores metrics the grader did not report rather than scoring them 0', () => {
      // technical_accuracy_score is optional in the assessment schema, so a
      // behavioural answer legitimately comes back without it. Averaging the
      // absent metrics in as zeros would report 20% for a perfect answer.
      const avg = averageSubScores({ relevance_score: 100 });
      expect(avg).toBe(100);
    });

    it('returns null when nothing was reported at all', () => {
      expect(averageSubScores({})).toBeNull();
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
        relevance_score: 'high', // unreadable -> null (unknown, not zero)
        completeness_score: 70,
        strengths: 'not an array', // invalid -> []
        improvements: null, // invalid -> []
        summary: 12345, // invalid -> ''
      });

      expect(result.relevance_score).toBeNull();
      expect(result.completeness_score).toBe(70);
      expect(result.strengths).toEqual([]);
      expect(result.improvements).toEqual([]);
      expect(result.summary).toBe('');
      // Only the one metric that came back readable feeds the overall.
      expect(result.overall_score).toBe(70);
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

    it('averages each metric over only the rows that reported it', () => {
      // A behavioural answer graded without a technical score must not drag the
      // session's technical average toward zero.
      const agg = computeSessionAggregate([
        {
          relevance_score: 90,
          completeness_score: 90,
          technical_accuracy_score: 80,
          clarity_score: 90,
          confidence_score: 90,
          overall_score: 90,
        },
        {
          relevance_score: 70,
          completeness_score: 70,
          technical_accuracy_score: null, // not a technical question
          clarity_score: 70,
          confidence_score: 70,
          overall_score: 70,
        },
      ]);

      expect(agg.technical_accuracy_score).toBe(80);
      expect(agg.overall_score).toBe(80);
      expect(agg.response_count).toBe(2);
    });

    it('reports a metric no row scored as null rather than 0', () => {
      const agg = computeSessionAggregate([
        { relevance_score: 80, technical_accuracy_score: null, overall_score: 80 },
      ]);

      expect(agg.technical_accuracy_score).toBeNull();
      expect(agg.relevance_score).toBe(80);
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

jest.mock('../feedback/session.assessor.js', () => ({
  __esModule: true,
  assessSession: jest.fn(),
}));

let getSupabaseAdminClient;
let generateFeedback;
let assessSession;
let feedbackService;

beforeAll(async () => {
  ({ getSupabaseAdminClient } = await import('../../config/supabase.js'));
  ({ generateFeedback } = await import('../feedback/feedback.generator.js'));
  ({ assessSession } = await import('../feedback/session.assessor.js'));
  ({ default: feedbackService } = await import('../feedback/feedback.service.js'));
});

/**
 * Chainable Supabase stand-in. Calls that end in single()/maybeSingle() are
 * stubbed directly; calls awaited on the chain itself (`await from().select()
 * .eq()`) take the next entry from `queued`.
 */
function buildMockSupabase() {
  const queued = [];

  const mock = {
    queue: (result) => queued.push(result),
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    then: (onFulfilled) => {
      const result = queued.shift() ?? { data: [], error: null };
      return Promise.resolve(onFulfilled ? onFulfilled(result) : result);
    },
  };

  mock.reset = () => {
    queued.length = 0;
  };

  return mock;
}

describe('feedback.service', () => {
  const mockSupabase = buildMockSupabase();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.reset();
    getSupabaseAdminClient.mockReturnValue(mockSupabase);
  });

  const response = (id, questionNumber, text) => ({
    id,
    question_id: `q-${id}`,
    session_id: 'sess-1',
    user_id: 'user-1',
    transcribed_text: text,
    interview_questions: {
      id: `q-${id}`,
      question_number: questionNumber,
      question_text: `Question ${questionNumber}?`,
      question_type: 'behavioral',
      difficulty_level: 'medium',
      ideal_answer_guidelines: null,
    },
  });

  const gradeFor = (index) => ({
    index,
    relevance_score: 80,
    completeness_score: 70,
    technical_accuracy_score: 75,
    clarity_score: 85,
    confidence_score: 60,
    overall_score: 74,
    strengths: ['Concrete example'],
    improvements: ['Quantify the impact'],
    summary: 'Solid answer.',
  });

  describe('generateSessionFeedback', () => {
    it('throws 400 when the session has no answers at all', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'sess-1', user_id: 'user-1', total_questions: 3, questions_answered: 0 },
        error: null,
      });

      await expect(
        feedbackService.generateSessionFeedback('sess-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(assessSession).not.toHaveBeenCalled();
    });

    it('throws 404 when the session does not belong to the user', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

      await expect(
        feedbackService.generateSessionFeedback('sess-1', 'user-1')
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    /**
     * A semi-structured interview routinely ends on an unanswered question —
     * the interviewer asks, the candidate stops. Refusing to grade for that
     * reason would cost them the results for everything they did answer.
     */
    it('grades a session where the last question went unanswered', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'sess-1',
          user_id: 'user-1',
          total_questions: 3,
          questions_answered: 2,
          job_description_id: null,
        },
        error: null,
      });

      // fetchGradableResponses: the responses, then their existing feedback
      mockSupabase.queue({ data: [response('r2', 2, 'Second answer.'), response('r1', 1, 'First answer.')], error: null });
      mockSupabase.queue({ data: [], error: null });

      assessSession.mockResolvedValue({
        raw: [gradeFor(0), gradeFor(1)],
        sessionSummary: 'A steady interview.',
        model: 'assessment-model',
        processingTimeMs: 10,
      });

      // upsertFeedbackRow: no existing row, then the insert result
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.single.mockResolvedValue({ data: { id: 'fb-1', overall_response_score: 74 }, error: null });

      const result = await feedbackService.generateSessionFeedback('sess-1', 'user-1');

      expect(result.generated).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.session_summary).toBe('A steady interview.');
    });

    it('grades the whole session in a single call, in interview order', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'sess-1',
          user_id: 'user-1',
          total_questions: 2,
          questions_answered: 2,
          job_description_id: null,
        },
        error: null,
      });

      // Deliberately out of order — the service sorts by question number so the
      // grader reads follow-ups after what they follow up on.
      mockSupabase.queue({ data: [response('r2', 2, 'Second answer.'), response('r1', 1, 'First answer.')], error: null });
      mockSupabase.queue({ data: [], error: null });

      assessSession.mockResolvedValue({
        raw: [gradeFor(0), gradeFor(1)],
        sessionSummary: null,
        model: 'assessment-model',
        processingTimeMs: 10,
      });

      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.single.mockResolvedValue({ data: { id: 'fb-1' }, error: null });

      await feedbackService.generateSessionFeedback('sess-1', 'user-1');

      expect(assessSession).toHaveBeenCalledTimes(1);
      expect(assessSession).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: [
            expect.objectContaining({ answerText: 'First answer.' }),
            expect.objectContaining({ answerText: 'Second answer.' }),
          ],
        })
      );
      // The per-response generator is the regrade path, not this one.
      expect(generateFeedback).not.toHaveBeenCalled();
    });

    it('marks every response failed when the assessment call itself fails', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'sess-1',
          user_id: 'user-1',
          total_questions: 2,
          questions_answered: 2,
          job_description_id: null,
        },
        error: null,
      });

      mockSupabase.queue({ data: [response('r1', 1, 'First answer.')], error: null });
      mockSupabase.queue({ data: [], error: null });

      assessSession.mockRejectedValue(new Error('rate limited'));

      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabase.single.mockResolvedValue({
        data: { id: 'fb-1', suggestions: JSON.stringify({ error_message: 'rate limited' }) },
        error: null,
      });

      const result = await feedbackService.generateSessionFeedback('sess-1', 'user-1');

      expect(result.generated).toBe(0);
      expect(result.failed).toBe(1);
    });
  });
});
