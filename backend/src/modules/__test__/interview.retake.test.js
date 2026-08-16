/**
 * Tests for retaking a finished interview.
 *
 * A completed session cannot be reopened — it holds answers and a grade — so a
 * retake has to be a NEW session pointed at the same job description. What
 * matters here is that the user never has to supply the source material again,
 * and that a session whose source material is gone fails with something the UI
 * can explain rather than a broken run.
 */

import { jest } from '@jest/globals';

jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
  getSupabaseClientForToken: jest.fn(),
  getSupabaseClient: jest.fn(),
}));

jest.mock('../ai/generators/interviewer.generator.js', () => ({
  generateNextTurn: jest.fn(),
}));

jest.mock('../questions/question.service.js', () => ({
  createSessionQuestions: jest.fn(),
}));

jest.mock('../jobDescription/jobDescription.service.js', () => ({
  createJobDescription: jest.fn(),
}));

jest.mock('../speech/audio.service.js', () => ({
  default: { getSignedUrl: jest.fn() },
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import { retakeSession, MAX_SESSION_QUESTIONS } from '../interviews/interview.service.js';

const JOB = {
  id: 'job-1',
  title: 'Backend Engineer',
  company_name: 'Acme',
  key_skills: ['node'],
  required_experience_level: 'senior',
  industry: 'software',
};

const ORIGINAL = {
  id: 'sess-1',
  session_title: 'Backend Engineer at Acme - Interview',
  job_description_id: JOB.id,
  job_descriptions: JOB,
};

const NEW_SESSION = { id: 'sess-2', session_title: ORIGINAL.session_title, status: 'in_progress' };

let originalRow;
let inserted;

/**
 * Two reads happen in order — the finished session, then the job description
 * that createInterviewSession looks up for the title — so single() is served
 * from a queue rather than one fixed value.
 */
let singleQueue;

const makeSupabase = () => ({
  from: jest.fn(() => ({
    select: () => {
      const chain = {
        eq: () => chain,
        single: () => Promise.resolve(singleQueue.shift() ?? { data: null, error: { message: 'unexpected read' } }),
      };
      return chain;
    },
    insert: (payload) => {
      inserted.push(payload);
      return {
        select: () => ({ single: () => Promise.resolve({ data: NEW_SESSION, error: null }) }),
      };
    },
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
  originalRow = ORIGINAL;
  inserted = [];
  singleQueue = [
    { data: originalRow, error: null },                                  // the finished session
    { data: { title: JOB.title, company_name: JOB.company_name }, error: null }, // job title lookup
  ];

  getSupabaseAdminClient.mockReturnValue(makeSupabase());
});

describe('retakeSession', () => {
  it('opens a new session against the same job description', async () => {
    const result = await retakeSession('sess-1', 'user-1');

    expect(result.session).toEqual(NEW_SESSION);
    expect(result.jobDescription).toEqual(JOB);
    expect(result.maxQuestions).toBe(MAX_SESSION_QUESTIONS);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        user_id: 'user-1',
        job_description_id: JOB.id,
        status: 'in_progress',
        total_questions: 0,
        questions_answered: 0,
      })
    );
  });

  it('does not touch the finished session', async () => {
    await retakeSession('sess-1', 'user-1');

    // Only the new session row is written; the original keeps its answers,
    // its grade and its place in history.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].id).toBeUndefined();
  });

  it('carries the original title over so the two runs read as the same interview', async () => {
    const result = await retakeSession('sess-1', 'user-1');

    expect(result.session.session_title).toBe(ORIGINAL.session_title);
  });

  it('refuses a session that is not the caller\'s', async () => {
    singleQueue = [{ data: null, error: { message: 'not found' } }];

    await expect(retakeSession('sess-1', 'user-1')).rejects.toThrow('not found or access denied');
    expect(inserted).toHaveLength(0);
  });

  it('explains itself when the source material is gone', async () => {
    // job_description_id is ON DELETE SET NULL, so a deleted job description
    // leaves a session with nothing to interview from.
    singleQueue = [{ data: { ...ORIGINAL, job_description_id: null, job_descriptions: null }, error: null }];

    await expect(retakeSession('sess-1', 'user-1')).rejects.toThrow(/no longer available/);
    expect(inserted).toHaveLength(0);
  });
});
