import mammoth from 'mammoth';
import BadRequestError from '../../core/errors/badRequestError.js';
import AppError from '../../core/errors/appError.js';

/**
 * Document text extraction.
 *
 * Runs server-side because parsing PDF and DOCX on-device in React Native is
 * unreliable and would ship two large parsers into the bundle. The client sends
 * base64 and gets plain text back.
 */

/** Roughly the largest useful job description or syllabus, before base64 inflation. */
const MAX_BYTES = 8 * 1024 * 1024;

/** What the model can actually use — the source field is capped at 20k chars. */
const MAX_CHARS = 20000;

export async function extractText({ filename, mimeType, base64 }) {
  const buffer = Buffer.from(base64, 'base64');

  if (buffer.length === 0) {
    throw new BadRequestError('That file appears to be empty.');
  }
  if (buffer.length > MAX_BYTES) {
    throw new BadRequestError('That file is too large. The limit is 8MB.');
  }

  const kind = detectKind(filename, mimeType);
  let text;

  try {
    text = await extractByKind(kind, buffer);
  } catch (err) {
    console.error(`[documents] ${kind} extraction failed`, err);
    throw new AppError(
      'Could not read that file. It may be corrupted or password protected.',
      422,
    );
  }

  const cleaned = tidy(text);

  // A scanned PDF parses successfully and yields almost nothing, which would
  // otherwise look like a silent failure further down the pipeline.
  if (cleaned.length < 50) {
    throw new BadRequestError(
      'Almost no text was found. If this is a scanned document, paste the text instead.',
    );
  }

  return {
    text: cleaned.slice(0, MAX_CHARS),
    truncated: cleaned.length > MAX_CHARS,
    characters: Math.min(cleaned.length, MAX_CHARS),
  };
}

async function extractByKind(kind, buffer) {
  if (kind === 'pdf') {
    // pdf-parse v2 exports a class, not the v1 default function. Loaded lazily
    // so the parser is only initialised when a PDF actually arrives.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      return text;
    } finally {
      // Releases the worker; without it the process keeps a handle open.
      await parser.destroy?.();
    }
  }

  if (kind === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  return buffer.toString('utf8');
}

/** Trust the extension first — mobile pickers report inconsistent mime types. */
function detectKind(filename, mimeType) {
  const ext = (filename ?? '').toLowerCase().split('.').pop();

  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md' || ext === 'rtf') return 'text';

  if (mimeType?.includes('pdf')) return 'pdf';
  if (mimeType?.includes('wordprocessingml')) return 'docx';
  if (mimeType?.startsWith('text/')) return 'text';

  if (ext === 'doc') {
    throw new BadRequestError('Old .doc files are not supported. Save it as .docx or PDF.');
  }

  throw new BadRequestError('Unsupported file type. Use PDF, DOCX, or a plain text file.');
}

/** Collapse the ragged whitespace PDF extraction leaves behind. */
function tidy(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    // pdf-parse marks page boundaries with "-- 1 of 3 --"; not part of the document.
    .replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
