/**
 * History Mapper Tests
 *
 * history.test.js covers the service only - it passes fixtures straight
 * through without ever calling the mapper, which is how a feedback key
 * mismatch (`response_feedback` vs `feedback`) went unnoticed and silently
 * dropped every AI feedback block from the detail response.
 *
 * These lock the mapper to the real `feedback` table columns in
 * supabase_schema.sql, where all scores are 0-100.
 */

import { toHistoryDetail, toHistorySummary } from '../history/history.mapper.js';

const feedbackRow = {
  id: 'fb-1',
  relevance_score: 82.5,
  clarity_score: 74,
  confidence_score: 68,
  completeness_score: 91,
  overall_response_score: 78.88,
  strengths: 'Clear narrative arc.',
  improvements: 'Quantify the outcome.',
  suggestions: 'Use the STAR method.',
  follow_up_tip: 'Prepare a metrics-led example.',
  generated_at: '2026-01-02T10:00:00.000Z',
};

const buildSession = (overrides = {}) => ({
  id: 'sess-1',
  session_title: 'Backend Interview',
  status: 'completed',
  started_at: '2026-01-02T09:00:00.000Z',
  completed_at: '2026-01-02T09:30:00.000Z',
  duration_seconds: 1800,
  total_questions: 1,
  questions_answered: 1,
  overall_score: 78.88,
  is_archived: false,
  notes: null,
  job_descriptions: null,
  questions: [
    {
      id: 'q1',
      question_text: 'Tell me about yourself',
      question_number: 1,
      question_type: 'behavioral',
      difficulty_level: 'medium',
      ideal_answer_guidelines: 'Cover background and impact.',
      user_responses: {
        id: 'r1',
        transcribed_text: 'I am a backend engineer...',
        original_audio_url: 'https://example.com/a.m4a',
        response_duration_seconds: 135,
        transcription_confidence: 0.94,
        response_created_at: '2026-01-02T09:05:00.000Z',
        feedback: feedbackRow,
      },
    },
  ],
  ...overrides,
});

describe('toHistoryDetail - feedback mapping', () => {
  it('reads feedback from the `feedback` key the service attaches', () => {
    const result = toHistoryDetail(buildSession());
    expect(result.questions[0].response.feedback).not.toBeNull();
    expect(result.questions[0].response.feedback.id).toBe('fb-1');
  });

  it('maps overall_response_score onto overall_score', () => {
    const result = toHistoryDetail(buildSession());
    expect(result.questions[0].response.feedback.overall_score).toBe(78.88);
  });

  it('preserves the four 0-100 sub-scores without rescaling', () => {
    const result = toHistoryDetail(buildSession());
    expect(result.questions[0].response.feedback.scores).toEqual({
      relevance: 82.5,
      clarity: 74,
      confidence: 68,
      completeness: 91,
    });
  });

  it('passes through every feedback text field', () => {
    const feedback = toHistoryDetail(buildSession()).questions[0].response.feedback;
    expect(feedback.strengths).toBe('Clear narrative arc.');
    expect(feedback.improvements).toBe('Quantify the outcome.');
    expect(feedback.suggestions).toBe('Use the STAR method.');
    expect(feedback.follow_up_tip).toBe('Prepare a metrics-led example.');
    expect(feedback.generated_at).toBe('2026-01-02T10:00:00.000Z');
  });

  it('returns null feedback when the response has none', () => {
    const session = buildSession();
    session.questions[0].user_responses.feedback = null;
    const result = toHistoryDetail(session);
    expect(result.questions[0].response.feedback).toBeNull();
  });

  it('returns null response when the question was never answered', () => {
    const session = buildSession();
    session.questions[0].user_responses = null;
    const result = toHistoryDetail(session);
    expect(result.questions[0].response).toBeNull();
  });

  it('normalizes a single-element array relationship to one object', () => {
    const session = buildSession();
    session.questions[0].user_responses = [{ ...session.questions[0].user_responses }];
    const result = toHistoryDetail(session);
    expect(result.questions[0].response.feedback.id).toBe('fb-1');
  });

  it('keeps question detail alongside the response', () => {
    const result = toHistoryDetail(buildSession());
    expect(result.questions[0]).toMatchObject({
      question_number: 1,
      question_type: 'behavioral',
      difficulty_level: 'medium',
      ideal_answer_guidelines: 'Cover background and impact.',
    });
  });
});

describe('toHistorySummary', () => {
  it('exposes the session score unscaled for the list row', () => {
    const summary = toHistorySummary({
      ...buildSession(),
      job_descriptions: { title: 'Backend Engineer', company_name: 'Acme' },
    });

    expect(summary.overall_score).toBe(78.88);
    expect(summary.job_title).toBe('Backend Engineer');
    expect(summary.company_name).toBe('Acme');
    expect(summary.duration_seconds).toBe(1800);
  });

  it('returns null for a missing session', () => {
    expect(toHistorySummary(null)).toBeNull();
  });
});
