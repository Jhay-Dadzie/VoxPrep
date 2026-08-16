/**
 * Tests for the live interview loop.
 *
 * What matters here is not that a question comes back — it is that the loop
 * cannot lose a turn, repeat one, or run past its ceiling:
 *
 *  - a question is stored at the moment it is asked, never before
 *  - an outstanding question is handed back rather than replaced, so a retry
 *    after a dropped response costs the candidate nothing
 *  - the cap is enforced by the server, not by the model's willingness to stop
 *  - the interviewer cannot close an interview that is too short to grade
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
import { generateNextTurn } from '../ai/generators/interviewer.generator.js';
import { nextTurn, MAX_SESSION_QUESTIONS, MIN_SESSION_QUESTIONS } from '../interviews/interview.service.js';
import { PENDING_TRANSCRIPT } from '../../core/utils/helpers.js';

const JOB = {
  title: 'Backend Engineer',
  company_name: 'Acme',
  job_content: 'Build Node.js services at scale.',
  key_skills: ['node'],
  required_experience_level: 'senior',
  industry: 'software',
};

/** State the fake Supabase serves and records. */
let sessionRow;
let questionRows;
let inserted;
let sessionUpdates;

/**
 * Minimal Supabase stand-in covering exactly the three shapes nextTurn uses:
 * a single() session read, an order() question list, and an insert().
 */
const makeSupabase = () => ({
  from: jest.fn((table) => {
    if (table === 'interview_sessions') {
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            single: () => Promise.resolve({ data: sessionRow, error: sessionRow ? null : { message: 'not found' } }),
          };
          return chain;
        },
        update: (payload) => {
          sessionUpdates.push(payload);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    }

    if (table === 'interview_questions') {
      return {
        select: () => {
          const chain = {
            eq: () => chain,
            order: () => Promise.resolve({ data: questionRows, error: null }),
          };
          return chain;
        },
        insert: (payload) => {
          inserted.push(payload);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'stored-q', ...payload }, error: null }),
            }),
          };
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  }),
});

const askedQuestion = (number, answer = 'An answer.') => ({
  id: `q${number}`,
  question_number: number,
  question_text: `Question ${number}?`,
  question_type: 'behavioral',
  difficulty_level: 'medium',
  ideal_answer_guidelines: null,
  user_responses: answer ? [{ transcribed_text: answer }] : [],
});

const aQuestion = (overrides = {}) => ({
  action: 'ask',
  question: {
    question_text: 'What broke in production, and what did you change?',
    question_type: 'behavioral',
    difficulty_level: 'medium',
    ideal_answer_guidelines: 'A specific incident with a specific fix.',
    ...overrides,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  sessionRow = { id: 'sess-1', status: 'in_progress', total_questions: 0, questions_answered: 0, job_descriptions: JOB };
  questionRows = [];
  inserted = [];
  sessionUpdates = [];

  getSupabaseAdminClient.mockReturnValue(makeSupabase());
  generateNextTurn.mockResolvedValue(aQuestion());
});

describe('nextTurn', () => {
  it('stores the question it is about to ask, numbered in sequence', async () => {
    questionRows = [askedQuestion(1), askedQuestion(2)];

    const turn = await nextTurn('sess-1', 'user-1');

    expect(turn.done).toBe(false);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        session_id: 'sess-1',
        question_number: 3,
        question_text: 'What broke in production, and what did you change?',
      })
    );
    expect(turn.question.question_text).toBe('What broke in production, and what did you change?');
    expect(turn.askedCount).toBe(3);
  });

  it('keeps the session question counter in step', async () => {
    questionRows = [askedQuestion(1)];

    await nextTurn('sess-1', 'user-1');

    expect(sessionUpdates).toContainEqual({ total_questions: 2 });
  });

  it('passes the conversation so far to the interviewer', async () => {
    questionRows = [askedQuestion(1, 'I scaled the ingest pipeline.')];

    await nextTurn('sess-1', 'user-1', { mode: 'viva_defense' });

    expect(generateNextTurn).toHaveBeenCalledWith(
      JOB,
      expect.objectContaining({
        mode: 'viva_defense',
        turns: [
          expect.objectContaining({ question: 'Question 1?', answer: 'I scaled the ingest pipeline.' }),
        ],
      })
    );
  });

  describe('when a question is already outstanding', () => {
    it('hands back the same question instead of composing another', async () => {
      questionRows = [askedQuestion(1), askedQuestion(2, null)];

      const turn = await nextTurn('sess-1', 'user-1');

      expect(turn.repeated).toBe(true);
      expect(turn.question.id).toBe('q2');
      expect(generateNextTurn).not.toHaveBeenCalled();
      expect(inserted).toHaveLength(0);
    });

    /**
     * The response row is written with a placeholder before transcription runs,
     * so the audio survives a transcription failure. Until it is replaced, the
     * question has not actually been answered.
     */
    it('treats a row still holding the transcription placeholder as unanswered', async () => {
      questionRows = [askedQuestion(1), askedQuestion(2, PENDING_TRANSCRIPT)];

      const turn = await nextTurn('sess-1', 'user-1');

      expect(turn.repeated).toBe(true);
      expect(turn.question.id).toBe('q2');
      expect(generateNextTurn).not.toHaveBeenCalled();
    });

  });

  describe('the question ceiling', () => {
    it('ends the interview at the maximum without asking the model', async () => {
      questionRows = Array.from({ length: MAX_SESSION_QUESTIONS }, (_, i) => askedQuestion(i + 1));

      const turn = await nextTurn('sess-1', 'user-1');

      expect(turn).toEqual(
        expect.objectContaining({ done: true, reason: 'limit', maxQuestions: MAX_SESSION_QUESTIONS })
      );
      expect(generateNextTurn).not.toHaveBeenCalled();
    });

    it('clamps a client asking for more than the server allows', async () => {
      const turn = await nextTurn('sess-1', 'user-1', { maxQuestions: 40 });

      expect(turn.maxQuestions).toBe(MAX_SESSION_QUESTIONS);
    });

    it('honours a client asking for a shorter interview', async () => {
      questionRows = Array.from({ length: 5 }, (_, i) => askedQuestion(i + 1));

      const turn = await nextTurn('sess-1', 'user-1', { maxQuestions: 5 });

      expect(turn).toEqual(expect.objectContaining({ done: true, reason: 'limit', maxQuestions: 5 }));
    });
  });

  describe('when the interviewer wants to close', () => {
    it('ends the interview and passes the sign-off back', async () => {
      questionRows = Array.from({ length: 9 }, (_, i) => askedQuestion(i + 1));
      generateNextTurn.mockResolvedValue({ action: 'close', closingRemark: 'Thanks, that is everything.' });

      const turn = await nextTurn('sess-1', 'user-1');

      expect(turn).toEqual(
        expect.objectContaining({
          done: true,
          reason: 'interviewer_closed',
          closingRemark: 'Thanks, that is everything.',
        })
      );
      expect(inserted).toHaveLength(0);
    });

    it('refuses the close branch while the interview is too short to grade', async () => {
      questionRows = [askedQuestion(1), askedQuestion(2)];

      await nextTurn('sess-1', 'user-1');

      expect(generateNextTurn).toHaveBeenCalledWith(JOB, expect.objectContaining({ forceAsk: true }));
    });

    it('allows it once the interview is long enough', async () => {
      questionRows = Array.from({ length: MIN_SESSION_QUESTIONS }, (_, i) => askedQuestion(i + 1));

      await nextTurn('sess-1', 'user-1');

      expect(generateNextTurn).toHaveBeenCalledWith(JOB, expect.objectContaining({ forceAsk: false }));
    });
  });

  describe('guards', () => {
    it('refuses to continue a completed session', async () => {
      sessionRow = { ...sessionRow, status: 'completed' };

      await expect(nextTurn('sess-1', 'user-1')).rejects.toThrow('already been completed');
    });

    it('refuses a session with no source material to interview from', async () => {
      sessionRow = { ...sessionRow, job_descriptions: null };

      await expect(nextTurn('sess-1', 'user-1')).rejects.toThrow('no source material');
    });

    it('refuses a session that is not the caller\'s', async () => {
      sessionRow = null;

      await expect(nextTurn('sess-1', 'user-1')).rejects.toThrow('not found or access denied');
    });
  });
});
