/**
 * Tests for the CV tailoring service.
 *
 * Three contracts, in rough order of how much damage breaking them does.
 *
 * The first is privacy. The text extracted from an uploaded CV is the most
 * sensitive thing this product touches — employment history, address, phone
 * number — and it is deliberately never written to the database. A future
 * refactor that "helpfully" stores it for debugging would be a silent
 * regression, so it is pinned here.
 *
 * The second is the scan guard. A photographed CV parses without error and
 * yields almost no text; handing that to the model produces a confident
 * fabrication with the candidate's name on it. It must be refused before the
 * model is called at all.
 *
 * The third is ownership: another user's session must not be tailorable.
 */

import { jest } from '@jest/globals';

jest.mock('../../config/supabase.js', () => ({
  getSupabaseAdminClient: jest.fn(),
  getSupabaseClientForToken: jest.fn(),
  getSupabaseClient: jest.fn(),
}));

jest.mock('../uploads/parser.service.js', () => ({
  parseDocument: jest.fn(),
}));

jest.mock('../ai/generators/cv.generator.js', () => ({
  tailorCv: jest.fn(),
}));

import { getSupabaseAdminClient } from '../../config/supabase.js';
import { parseDocument } from '../uploads/parser.service.js';
import { tailorCv } from '../ai/generators/cv.generator.js';
import { tailorCvForSession } from '../cv/cv.service.js';

const USER_ID = 'user-1';
const SESSION_ID = 'session-1';

const SESSION_ROW = {
  id: SESSION_ID,
  session_title: 'Backend Engineer - Interview',
  job_description_id: 'job-1',
  job_descriptions: {
    title: 'Backend Engineer',
    company_name: 'Globex',
    job_content: 'Node.js and Postgres, five years.',
    key_skills: ['node', 'postgres'],
    required_experience_level: 'senior',
    industry: 'fintech',
  },
};

const DOCUMENT = {
  full_name: 'Jane Doe',
  summary: 'Backend engineer.',
  experience: [{ role: 'Engineer', company: 'Acme', bullets: ['Shipped things.'] }],
  tailoring_notes: ['Led with Node.js.'],
  keywords_matched: ['Node.js'],
  gaps: [],
};

const FILE = { buffer: Buffer.from('irrelevant'), originalname: 'jane-doe-cv.pdf' };

/** A CV long enough to clear the minimum-length guard. */
const REAL_CV_TEXT = 'Jane Doe, backend engineer. '.repeat(20);

let sessionResult;
let insertedRow;

const makeSupabase = () => ({
  from: jest.fn(() => ({
    select: () => {
      const chain = {
        eq: () => chain,
        single: () => Promise.resolve(sessionResult),
      };
      return chain;
    },
    insert: (row) => {
      insertedRow = row;
      return {
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'cv-1', ...row }, error: null }),
        }),
      };
    },
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
  insertedRow = null;
  sessionResult = { data: SESSION_ROW, error: null };
  getSupabaseAdminClient.mockReturnValue(makeSupabase());
  parseDocument.mockResolvedValue(REAL_CV_TEXT);
  tailorCv.mockResolvedValue({ document: DOCUMENT, model: 'test-model' });
});

describe('tailorCvForSession', () => {
  it('never stores the text extracted from the uploaded CV', async () => {
    await tailorCvForSession(SESSION_ID, USER_ID, FILE);

    const stored = JSON.stringify(insertedRow);
    expect(stored).not.toContain('backend engineer');
    expect(insertedRow.source_text).toBeUndefined();
    // The length is kept for support; the content is not.
    expect(insertedRow.source_char_count).toBe(REAL_CV_TEXT.length);
    expect(insertedRow.source_file_name).toBe('jane-doe-cv.pdf');
  });

  it('tailors against the job description behind the session', async () => {
    await tailorCvForSession(SESSION_ID, USER_ID, FILE);

    expect(tailorCv).toHaveBeenCalledWith(
      expect.objectContaining({
        cvText: REAL_CV_TEXT,
        jobTitle: 'Backend Engineer',
        companyName: 'Globex',
        jobContent: SESSION_ROW.job_descriptions.job_content,
      })
    );
  });

  it('stores the tailored document against the user and session', async () => {
    const saved = await tailorCvForSession(SESSION_ID, USER_ID, FILE);

    expect(insertedRow).toMatchObject({
      user_id: USER_ID,
      session_id: SESSION_ID,
      job_description_id: 'job-1',
      tailored_document: DOCUMENT,
      ai_model_used: 'test-model',
    });
    expect(saved.id).toBe('cv-1');
  });

  it('refuses a file with too little text to be a CV, without calling the model', async () => {
    parseDocument.mockResolvedValue('Jane Doe');

    await expect(tailorCvForSession(SESSION_ID, USER_ID, FILE)).rejects.toThrow(
      /could not read any text/i
    );
    expect(tailorCv).not.toHaveBeenCalled();
  });

  it('reports an unreadable file as the user’s problem to fix, not a server error', async () => {
    parseDocument.mockRejectedValue(new Error('Unsupported file type'));

    await expect(tailorCvForSession(SESSION_ID, USER_ID, FILE)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(tailorCv).not.toHaveBeenCalled();
  });

  it('refuses a session belonging to someone else', async () => {
    sessionResult = { data: null, error: { message: 'No rows' } };

    await expect(tailorCvForSession(SESSION_ID, 'someone-else', FILE)).rejects.toThrow(
      /not found or access denied/i
    );
    expect(tailorCv).not.toHaveBeenCalled();
  });

  it('refuses a session with no job description to tailor against', async () => {
    sessionResult = { data: { ...SESSION_ROW, job_descriptions: null }, error: null };

    await expect(tailorCvForSession(SESSION_ID, USER_ID, FILE)).rejects.toThrow(
      /no job description/i
    );
    expect(tailorCv).not.toHaveBeenCalled();
  });
});
