import { jest } from '@jest/globals';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));

import { PDFParse } from 'pdf-parse';
import { extractRawText } from 'mammoth';
import { sanitizeText } from '../../core/utils/helpers.js';
import { parseDocument } from '../uploads/parser.service.js';

const mockGetText = jest.fn();

/**
 * The bug this guards: a PDF whose extracted text carried a NUL byte took down
 * POST /exams/prepare with a 500. Nothing in the app minded the character —
 * Postgres did, at the insert, with "unsupported Unicode escape sequence", by
 * which point the request was already three seconds deep and the user had a
 * document that "just doesn't work".
 */

const NUL = '\u0000';

describe('sanitizeText', () => {
  it('removes the NUL byte that Postgres rejects', () => {
    expect(sanitizeText(`Chapter${NUL} One`)).toBe('Chapter One');
  });

  it('removes stray control codes left by document extraction', () => {
    expect(sanitizeText('a\u0001b\u0008c\u001Fde')).toBe('abcde');
  });

  it('keeps the whitespace that carries document layout', () => {
    expect(sanitizeText('Title\n\nBody\twith a tab\r\nand a line')).toBe(
      'Title\n\nBody\twith a tab\r\nand a line'
    );
  });

  it('leaves ordinary text, punctuation and accents alone', () => {
    const text = 'Résumé — “quoted”, 50% of ₤100 · naïve café';
    expect(sanitizeText(text)).toBe(text);
  });

  it('keeps emoji and other well-formed surrogate pairs intact', () => {
    expect(sanitizeText('done 🎓 and ✅')).toBe('done 🎓 and ✅');
  });

  it('removes lone surrogates, which Postgres rejects for the same reason', () => {
    expect(sanitizeText('bad \uD800 half')).toBe('bad  half');
    expect(sanitizeText('bad \uDC00 half')).toBe('bad  half');
  });

  it('passes non-strings straight through, so optional fields stay absent', () => {
    expect(sanitizeText(undefined)).toBeUndefined();
    expect(sanitizeText(null)).toBeNull();
  });
});

describe('parsed documents reach the database clean', () => {
  const dirty = `Introduction${NUL}\n\nThe course covers ${NUL}three topics.`;
  const clean = 'Introduction\n\nThe course covers three topics.';

  beforeEach(() => {
    jest.clearAllMocks();
    PDFParse.mockImplementation(() => ({ getText: mockGetText, destroy: jest.fn() }));
  });

  it('strips control codes out of extracted PDF text', async () => {
    mockGetText.mockResolvedValue({ text: dirty });

    expect(await parseDocument(Buffer.from(''), 'notes.pdf')).toBe(clean);
  });

  it('strips control codes out of extracted DOCX text', async () => {
    extractRawText.mockResolvedValue({ value: dirty });

    expect(await parseDocument(Buffer.from(''), 'notes.docx')).toBe(clean);
  });

  it('strips control codes out of a plain text upload', async () => {
    expect(await parseDocument(Buffer.from(dirty, 'utf8'), 'notes.txt')).toBe(clean);
  });
});
