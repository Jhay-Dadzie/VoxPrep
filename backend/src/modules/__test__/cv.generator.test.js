/**
 * Tests for the CV generator's post-processing.
 *
 * Two things are being protected here, and they are not the same thing.
 *
 * The first is the renderer: the tailored document is drawn field by field into
 * a PDF, so a missing `skills` key or a null bullet has to become an empty list
 * at this boundary rather than a crash on the candidate's phone.
 *
 * The second is the candidate. A "tailored" CV with no work history and no
 * summary is a parse that went wrong, and handing it over as a download is
 * worse than telling them to try again — so that case must throw, not ship.
 */

import { jest } from '@jest/globals';

jest.mock('../ai/ai.service.js', () => ({
  callGemini: jest.fn(),
  parseJsonResponse: jest.fn(),
  tailoredCvSchema: { type: 'object' },
}));

import { callGemini, parseJsonResponse, tailoredCvSchema } from '../ai/ai.service.js';
import { tailorCv } from '../ai/generators/cv.generator.js';

const INPUT = {
  cvText: 'Jane Doe. Backend engineer at Acme since 2021. Node.js, Postgres.',
  jobTitle: 'Senior Backend Engineer',
  companyName: 'Globex',
  jobContent: 'We need Node.js and Postgres experience.',
};

const cv = (overrides = {}) => ({
  full_name: 'Jane Doe',
  headline: 'Backend Engineer',
  summary: 'Backend engineer with four years on Node.js services.',
  skills: ['Node.js', 'Postgres'],
  experience: [
    {
      role: 'Backend Engineer',
      company: 'Acme',
      start_date: '2021',
      end_date: 'Present',
      bullets: ['Built the billing service.'],
    },
  ],
  tailoring_notes: ['Led with your Node.js work, which this job names first.'],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  callGemini.mockResolvedValue('{}');
});

describe('tailorCv', () => {
  it('constrains decoding with the structured-output schema', async () => {
    parseJsonResponse.mockReturnValue(cv());

    await tailorCv(INPUT);

    expect(callGemini).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: tailoredCvSchema })
    );
  });

  it('samples conservatively — invention here is a fabricated CV', async () => {
    parseJsonResponse.mockReturnValue(cv());

    await tailorCv(INPUT);

    expect(callGemini.mock.calls[0][0].temperature).toBeLessThanOrEqual(0.4);
  });

  it('sends the CV text and the job description to the model', async () => {
    parseJsonResponse.mockReturnValue(cv());

    await tailorCv(INPUT);

    const prompt = callGemini.mock.calls[0][0].messages
      .map((message) => message.content)
      .join('\n');

    expect(prompt).toContain(INPUT.cvText);
    expect(prompt).toContain(INPUT.jobContent);
    expect(prompt).toContain('Senior Backend Engineer');
  });

  it('fills every optional section the model left out', async () => {
    parseJsonResponse.mockReturnValue(cv());

    const { document } = await tailorCv(INPUT);

    expect(document.education).toEqual([]);
    expect(document.projects).toEqual([]);
    expect(document.certifications).toEqual([]);
    expect(document.keywords_matched).toEqual([]);
    expect(document.gaps).toEqual([]);
    expect(document.contact).toEqual({ email: null, phone: null, location: null, links: [] });
  });

  it('drops blank and duplicate list entries', async () => {
    parseJsonResponse.mockReturnValue(
      cv({ skills: ['Node.js', '  ', 'node.js', null, 'Postgres'] })
    );

    const { document } = await tailorCv(INPUT);

    expect(document.skills).toEqual(['Node.js', 'Postgres']);
  });

  it('drops roles with neither a title nor an employer', async () => {
    parseJsonResponse.mockReturnValue(
      cv({
        experience: [
          { role: '', company: '', bullets: ['Orphaned bullet'] },
          { role: 'Backend Engineer', company: 'Acme', bullets: [] },
        ],
      })
    );

    const { document } = await tailorCv(INPUT);

    expect(document.experience).toHaveLength(1);
    expect(document.experience[0].company).toBe('Acme');
  });

  it('rejects a document with no summary and no experience', async () => {
    parseJsonResponse.mockReturnValue(cv({ summary: '', experience: [] }));

    await expect(tailorCv(INPUT)).rejects.toThrow(/no usable CV content/i);
  });

  it('keeps a summary-only CV — some candidates have no listed roles yet', async () => {
    parseJsonResponse.mockReturnValue(cv({ experience: [] }));

    const { document } = await tailorCv(INPUT);

    expect(document.summary).toBeTruthy();
    expect(document.experience).toEqual([]);
  });
});
