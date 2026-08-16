/**
 * Tests for the one-shot setup path: source material in, ready session out.
 *
 * Focus is the rollback contract — prepareSession spans two writes with no
 * transaction across them, so a failure part-way must leave nothing behind.
 *
 * Note what is NOT here any more: question generation. A semi-structured
 * interview writes its questions during the session, one per turn, so setup
 * creates a job description and a session and nothing else.
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

jest.mock('../questions/question.service.js', () => ({
  createSessionQuestions: jest.fn(),
}));

jest.mock('../ai/generators/interviewer.generator.js', () => ({
  generateNextTurn: jest.fn(),
}));

jest.mock('../speech/audio.service.js', () => ({
  default: { getSignedUrl: jest.fn() },
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import { createJobDescription } from '../jobDescription/jobDescription.service.js';
import { createSessionQuestions } from '../questions/question.service.js';
import { prepareSession, MAX_SESSION_QUESTIONS } from '../interviews/interview.service.js';

const JOB = { id: 'job-1', title: 'Backend Engineer' };
const SESSION = { id: 'session-1', session_title: 'Backend Engineer - Interview' };

/** Records which tables .delete() was called on, which is what rollback means here. */
let deletedFrom;
let sessionInsertResult;

const makeSupabase = () => ({
  from: jest.fn((table) => ({
    // createInterviewSession looks the job title up before inserting.
    select: () => {
      const chain = {
        eq: () => chain,
        single: () => Promise.resolve({ data: { title: JOB.title, company_name: null }, error: null }),
      };
      return chain;
    },
    insert: () => ({
      select: () => ({ single: () => Promise.resolve(sessionInsertResult) }),
    }),
    delete: () => {
      deletedFrom.push(table);
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    },
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
  deletedFrom = [];
  sessionInsertResult = { data: SESSION, error: null };

  getSupabaseAdminClient.mockReturnValue(makeSupabase());
  createJobDescription.mockResolvedValue(JOB);
});

const input = (overrides = {}) => ({
  jobContent: 'x'.repeat(200),
  title: 'Backend Engineer',
  ...overrides,
});

describe('prepareSession', () => {
  it('creates the job description and session in one call', async () => {
    const result = await prepareSession('user-1', input({ mode: 'job_interview' }));

    expect(result).toEqual({
      jobDescription: JOB,
      session: SESSION,
      mode: 'job_interview',
      maxQuestions: MAX_SESSION_QUESTIONS,
    });

    expect(createJobDescription).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', title: 'Backend Engineer' })
    );
    expect(deletedFrom).toEqual([]);
  });

  it('does not generate any questions up front', async () => {
    await prepareSession('user-1', input());

    expect(createSessionQuestions).not.toHaveBeenCalled();
  });

  it('reports the question ceiling the interview will run to', async () => {
    const result = await prepareSession('user-1', input());

    expect(result.maxQuestions).toBe(15);
  });

  it('deletes the job description when session creation fails', async () => {
    sessionInsertResult = { data: null, error: { message: 'insert failed' } };

    await expect(prepareSession('user-1', input())).rejects.toThrow('insert failed');

    expect(deletedFrom).toEqual(['job_descriptions']);
  });
});
