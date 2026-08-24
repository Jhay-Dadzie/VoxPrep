import { jest } from '@jest/globals';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }));
jest.mock('officeparser', () => ({ parseOffice: jest.fn() }));
jest.mock('word-extractor', () => ({ __esModule: true, default: jest.fn() }));

import { parseOffice } from 'officeparser';
import WordExtractor from 'word-extractor';
import {
  describeRejection,
  formatOf,
  isSupportedDocument,
} from '../../core/utils/documentFormats.js';
import { parseDocument } from '../uploads/parser.service.js';

/**
 * Exams are set from an uploaded file and nothing else — there is no longer a
 * textarea to fall back on — so "the picker let me choose it and the server
 * would not read it" is now a dead end rather than an inconvenience. These
 * guard the two halves that have to agree: what the middleware accepts, and
 * what the parser knows how to open.
 */

describe('resolving an upload to a format', () => {
  it('reads the extension, not the MIME type a phone happens to send', () => {
    // React Native fills in octet-stream whenever the Android provider reports
    // no type. Trusting it would reject every upload from those devices.
    expect(formatOf('lecture.pptx', 'application/octet-stream')).toBe('pptx');
    expect(formatOf('SYLLABUS.PDF', 'application/octet-stream')).toBe('pdf');
  });

  it('falls back to the MIME type when the filename has no extension', () => {
    expect(formatOf('scan', 'application/pdf')).toBe('pdf');
    expect(formatOf('', 'text/plain')).toBe('txt');
  });

  it('ignores the charset a text upload may carry on its type', () => {
    expect(formatOf('notes', 'text/plain; charset=utf-8')).toBe('txt');
  });

  it('treats a leading dot as a hidden file, not an extension', () => {
    expect(formatOf('.pdf', '')).toBe('');
  });

  it('accepts the document formats a student actually has', () => {
    for (const name of [
      'notes.pdf', 'essay.doc', 'essay.docx', 'summary.odt', 'paper.rtf',
      'deck.pptx', 'deck.odp', 'marks.xlsx', 'marks.ods',
      'plain.txt', 'notes.md', 'topics.csv',
    ]) {
      expect(isSupportedDocument(name, 'application/octet-stream')).toBe(true);
    }
  });

  it('refuses what it cannot read, whatever the type claims', () => {
    expect(isSupportedDocument('photo.jpg', 'image/jpeg')).toBe(false);
    expect(isSupportedDocument('archive.zip', 'application/zip')).toBe(false);
    // A .zip MIME on a .pptx is what some providers send; the name decides.
    expect(isSupportedDocument('deck.pptx', 'application/zip')).toBe(true);
  });
});

describe('explaining a refusal', () => {
  it('tells a 97-2003 PowerPoint user the fix rather than the rule', () => {
    const message = describeRejection('deck.ppt', 'application/vnd.ms-powerpoint');

    expect(message).toMatch(/Save As/);
    expect(message).toMatch(/PPTX/);
  });

  it('names the extension that was refused, so the list is not a puzzle', () => {
    expect(describeRejection('photo.jpg', 'image/jpeg')).toMatch(/"\.jpg"/);
  });
});

describe('parseDocument routes each format to its extractor', () => {
  const asText = (text) => ({ to: jest.fn().mockResolvedValue({ value: text }) });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads a slide deck through officeparser, told which format it is', async () => {
    parseOffice.mockResolvedValue(asText('Photosynthesis overview\nCalvin cycle'));

    const text = await parseDocument(Buffer.from(''), 'lecture.pptx', 'application/octet-stream');

    expect(text).toBe('Photosynthesis overview\nCalvin cycle');
    // The hint matters: auto-detection from a buffer is unreliable for the
    // ZIP-backed formats, which are all the same handful of bytes up front.
    expect(parseOffice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileType: 'pptx' }));
  });

  it('reads OpenDocument and RTF the same way', async () => {
    parseOffice.mockResolvedValue(asText('Thermodynamics'));

    await parseDocument(Buffer.from(''), 'summary.odt', '');
    expect(parseOffice).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ fileType: 'odt' }));

    await parseDocument(Buffer.from(''), 'paper.rtf', '');
    expect(parseOffice).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ fileType: 'rtf' }));
  });

  it('keeps the headers of a legacy .doc, where the course code usually lives', async () => {
    WordExtractor.mockImplementation(() => ({
      extract: jest.fn().mockResolvedValue({
        getBody: () => 'Body text',
        getHeaders: () => 'CHEM 204',
        getFootnotes: () => '',
      }),
    }));

    expect(await parseDocument(Buffer.from(''), 'notes.doc', '')).toBe('Body text\nCHEM 204');
  });

  it('refuses an unreadable file before opening it, with the reason', async () => {
    await expect(parseDocument(Buffer.from(''), 'photo.jpg', 'image/jpeg')).rejects.toThrow(
      /not supported/
    );
    expect(parseOffice).not.toHaveBeenCalled();
  });
});
