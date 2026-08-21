/**
 * Tests for how a written exam is marked.
 *
 * The marking rules are short, and every one of them is a promise to the
 * student:
 *
 *  - the score is a percentage of the whole paper, so a blank costs a mark
 *    rather than being quietly excluded from the denominator
 *  - a blank is recorded as unanswered, not as wrong — the same marks, a
 *    different lesson
 *  - marking happens once; a double-tapped submit reads the result back rather
 *    than re-marking a closed paper
 *  - nothing carrying a correct answer comes back before the paper is submitted
 */

import { jest } from '@jest/globals';

jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
  getSupabaseClientForToken: jest.fn(),
  getSupabaseClient: jest.fn(),
}));

jest.mock('../jobDescription/jobDescription.service.js', () => ({
  createJobDescription: jest.fn(),
}));

jest.mock('../ai/generators/exam.generator.js', () => ({
  generateExamQuestions: jest.fn(),
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import { getExam, submitExam } from '../exams/exam.service.js';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

/** State the fake Supabase serves and records. */
let sessionRow;
let questionRows;
let answerRows;
let sessionUpdates;
let answerUpdates;

const question = (number, correct) => ({
  id: `q${number}`,
  session_id: SESSION_ID,
  question_number: number,
  question_text: `Question ${number}`,
  options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: `Option ${label}` })),
  correct_option: correct,
  explanation: `Because ${correct} follows from the material.`,
  topic: 'Topic',
  difficulty_level: 'medium',
});

/**
 * A select chain that can be awaited directly (`.eq(...)`) or ordered first
 * (`.eq(...).order(...)`), which is how the service reads each table.
 */
const selectChain = (rows) => {
  const result = { data: rows, error: null };
  const chain = {
    eq: () => chain,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

const makeSupabase = () => ({
  from: jest.fn((table) => {
    if (table === 'interview_sessions') {
      return {
        select: () => ({
          eq: function eq() {
            return {
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({ data: sessionRow, error: null }),
              }),
            };
          },
        }),
        update: (payload) => {
          sessionUpdates.push(payload);
          const chain = { eq: () => chain, then: (r) => Promise.resolve({ error: null }).then(r) };
          return chain;
        },
      };
    }

    if (table === 'exam_questions') {
      return { select: () => selectChain(questionRows) };
    }

    if (table === 'exam_answers') {
      return {
        select: () => selectChain(answerRows),
        update: (payload) => ({
          eq: (_column, value) => {
            answerUpdates.push({ questionId: value, ...payload });
            // Applied to the stored row, because the service re-reads the
            // answers to build the result: a fake that forgot the write would
            // report every marked answer as wrong.
            const row = answerRows.find((answer) => answer.question_id === value);
            if (row) Object.assign(row, payload);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  }),
});

beforeEach(() => {
  jest.clearAllMocks();

  // A four-question paper: two right, one wrong, one left blank.
  questionRows = [question(1, 'A'), question(2, 'B'), question(3, 'C'), question(4, 'D')];
  answerRows = [
    { question_id: 'q1', selected_option: 'A', is_correct: null },
    { question_id: 'q2', selected_option: 'B', is_correct: null },
    { question_id: 'q3', selected_option: 'D', is_correct: null },
  ];
  sessionRow = {
    id: SESSION_ID,
    status: 'in_progress',
    session_kind: 'exam',
    session_title: 'Thermodynamics - Exam',
    total_questions: 4,
    questions_answered: 3,
    overall_score: null,
    started_at: new Date(Date.now() - 60_000).toISOString(),
    completed_at: null,
    duration_seconds: null,
    job_descriptions: { id: 'job-1', title: 'Thermodynamics' },
  };
  sessionUpdates = [];
  answerUpdates = [];

  const supabase = makeSupabase();
  getSupabaseAdminClient.mockReturnValue(supabase);

  // The service closes the session and then reads the result back, so the row
  // it re-reads has to reflect what was written.
  sessionUpdates.push = function push(payload) {
    Array.prototype.push.call(this, payload);
    sessionRow = { ...sessionRow, ...payload };
    return this.length;
  };
});

describe('submitExam', () => {
  it('scores as a percentage of the whole paper, so a blank costs a mark', async () => {
    const result = await submitExam(SESSION_ID, USER_ID);

    // Two of four, not two of the three attempted.
    expect(result.totals).toMatchObject({ total: 4, correct: 2, incorrect: 1, unanswered: 1 });
    expect(result.totals.score).toBe(50);
  });

  it('records the mark against each answer that was given', async () => {
    await submitExam(SESSION_ID, USER_ID);

    expect(answerUpdates).toEqual(
      expect.arrayContaining([
        { questionId: 'q1', is_correct: true },
        { questionId: 'q2', is_correct: true },
        { questionId: 'q3', is_correct: false },
      ])
    );
    // Nothing is written for the question that was never answered.
    expect(answerUpdates).toHaveLength(3);
  });

  it('closes the session with the score and the counts that were marked', async () => {
    await submitExam(SESSION_ID, USER_ID);

    expect(sessionUpdates[0]).toMatchObject({
      status: 'completed',
      overall_score: 50,
      total_questions: 4,
      questions_answered: 3,
    });
    expect(sessionUpdates[0].duration_seconds).toBeGreaterThan(0);
  });

  it('returns every question with its correct answer and explanation', async () => {
    const result = await submitExam(SESSION_ID, USER_ID);

    expect(result.questions).toHaveLength(4);
    expect(result.questions[2]).toMatchObject({
      selected_option: 'D',
      correct_option: 'C',
      is_correct: false,
    });
    expect(result.questions[2].explanation).toMatch(/follows from the material/);
    // The unanswered one is returned too, marked as neither chosen nor correct.
    expect(result.questions[3]).toMatchObject({ selected_option: null, is_correct: false });
  });

  it('does not re-mark a paper that has already been submitted', async () => {
    sessionRow = { ...sessionRow, status: 'completed', overall_score: 50 };

    const result = await submitExam(SESSION_ID, USER_ID);

    expect(sessionUpdates).toHaveLength(0);
    expect(result.totals.score).toBe(50);
  });

  it('refuses a session that is not the user\'s exam', async () => {
    sessionRow = null;

    await expect(submitExam(SESSION_ID, USER_ID)).rejects.toThrow(/not found or access denied/i);
  });

  it('refuses a session that belongs to the interview flow', async () => {
    sessionRow = { ...sessionRow, session_kind: 'interview' };

    await expect(submitExam(SESSION_ID, USER_ID)).rejects.toThrow(/not found or access denied/i);
  });
});

describe('getExam', () => {
  it('hands back the paper with the answers so far and no marking scheme', async () => {
    const exam = await getExam(SESSION_ID, USER_ID);

    expect(exam.submitted).toBe(false);
    expect(exam.questions).toHaveLength(4);
    expect(exam.questions[0]).toMatchObject({ selected_option: 'A' });

    for (const item of exam.questions) {
      expect(item).not.toHaveProperty('correct_option');
      expect(item).not.toHaveProperty('explanation');
      expect(item).not.toHaveProperty('is_correct');
    }
  });

  it('reports a submitted paper as submitted', async () => {
    sessionRow = { ...sessionRow, status: 'completed' };

    const exam = await getExam(SESSION_ID, USER_ID);

    expect(exam.submitted).toBe(true);
  });
});
