import { PDFParse } from 'pdf-parse';
import { extractRawText } from 'mammoth';
import { parseOffice } from 'officeparser';
import WordExtractor from 'word-extractor';
import { sanitizeText } from '../../core/utils/helpers.js';
import { describeRejection, formatOf } from '../../core/utils/documentFormats.js';

/**
 * Parse uploaded document and extract text
 *
 * Everything leaves here through sanitizeText: extracted text carries control
 * codes no reader ever sees, and the first thing that notices is the database
 * rejecting the insert. Cleaning it at the source means every caller — exams,
 * interviews, job descriptions, CVs — gets storable text without knowing why.
 *
 * Three extractors rather than one, because no single library is best at all
 * of it: pdf-parse and mammoth were already here and are the strongest at the
 * two formats that dominate uploads, word-extractor reads the 97-2003 .doc
 * nothing else touches, and officeparser covers everything built on a ZIP of
 * XML (PPTX, XLSX, the OpenDocument family) plus RTF. Which one runs is decided
 * by the shared format registry, so the set the middleware lets through and the
 * set that can actually be read here are the same set.
 */

/** Text formats that are already text — decoding is the whole job. */
const PLAIN_TEXT_FORMATS = new Set(['txt', 'text', 'md', 'markdown', 'csv']);

/** ZIP-of-XML formats and RTF, all handled by officeparser's AST. */
const OFFICE_FORMATS = new Set(['pptx', 'odp', 'odt', 'xlsx', 'ods', 'rtf']);

/**
 * A deck or a spreadsheet is text in boxes, not prose, and the extracted
 * result runs together without a delimiter — the last word of one slide's
 * bullet joined to the first word of the next. Splitting on newlines keeps the
 * separation the model needs to tell one point from another.
 */
const OFFICE_PARSER_CONFIG = { newlineDelimiter: '\n', ignoreNotes: false };

const parsePdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const data = await parser.getText();
    return data.text;
  } finally {
    await parser.destroy();
  }
};

const parseOfficeDocument = async (buffer, fileType) => {
  const ast = await parseOffice(buffer, { ...OFFICE_PARSER_CONFIG, fileType });
  const { value } = await ast.to('text');
  return typeof value === 'string' ? value : String(value ?? '');
};

export const parseDocument = async (buffer, originalname, mimetype) => {
  const format = formatOf(originalname, mimetype);

  if (!format) {
    throw new Error(describeRejection(originalname, mimetype));
  }

  try {
    if (format === 'pdf') {
      return sanitizeText(await parsePdf(buffer));
    }

    if (format === 'docx') {
      const result = await extractRawText({ buffer });
      return sanitizeText(result.value);
    }

    if (format === 'doc') {
      const document = await new WordExtractor().extract(buffer);
      // Headers and footnotes on a .doc regularly hold the course code and the
      // topic list, so the body alone loses the material's own labelling.
      return sanitizeText([document.getBody(), document.getHeaders(), document.getFootnotes()]
        .filter(Boolean)
        .join('\n')
      );
    }

    if (PLAIN_TEXT_FORMATS.has(format)) {
      return sanitizeText(buffer.toString('utf8'));
    }

    if (OFFICE_FORMATS.has(format)) {
      return sanitizeText(await parseOfficeDocument(buffer, format));
    }

    // Unreachable while the registry and the branches above agree; a format
    // added to one and not the other lands here rather than returning ''.
    throw new Error(describeRejection(originalname, mimetype));
  } catch (error) {
    console.error('Document parsing error:', error);
    throw new Error(`Failed to parse document: ${error.message}`);
  }
};

export default {
  parseDocument,
};
