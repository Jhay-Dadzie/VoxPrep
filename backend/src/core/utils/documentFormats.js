/**
 * Which document formats an upload may arrive in.
 *
 * One registry, read by both ends of the same journey: the multer fileFilter
 * decides here whether to take the bytes at all, and the parser decides here
 * which extractor to run on them. Split across the two files they drifted —
 * the filter accepted three types while the picker on the phone offered a
 * different three — and a file the server would happily parse could not be
 * chosen, or one it could not read was uploaded and failed a minute later.
 *
 * Extension is the primary key rather than MIME type because a React Native
 * upload frequently carries `application/octet-stream`: some Android document
 * providers report no type at all, and the client fills in a placeholder so the
 * multipart body is well-formed. The filename survives that trip intact, so it
 * is what we trust, with the MIME type as the fallback for the rare upload
 * whose name has no extension.
 */

/** ext → the MIME types clients are known to send for it. */
export const DOCUMENT_FORMATS = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  odt: ['application/vnd.oasis.opendocument.text'],
  rtf: ['application/rtf', 'text/rtf'],
  txt: ['text/plain'],
  text: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown'],
  markdown: ['text/markdown', 'text/x-markdown'],
  csv: ['text/csv'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  odp: ['application/vnd.oasis.opendocument.presentation'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ods: ['application/vnd.oasis.opendocument.spreadsheet'],
};

/**
 * The 97-2003 binary Office formats, minus .doc.
 *
 * Word's old format is readable (word-extractor walks the OLE streams), but
 * nothing maintained in Node can pull text out of a binary .ppt or .xls. They
 * are named here so a student who picks one is told to re-save it rather than
 * being shown the generic list and left to work out which entry their file was
 * supposed to match.
 */
const LEGACY_BINARY_FORMATS = {
  ppt: { mimes: ['application/vnd.ms-powerpoint'], saveAs: 'PPTX' },
  xls: { mimes: ['application/vnd.ms-excel'], saveAs: 'XLSX' },
};

/** Every MIME type a document upload may declare. Mirrored by the client picker. */
export const ACCEPTED_MIME_TYPES = [
  ...new Set(Object.values(DOCUMENT_FORMATS).flat()),
];

/** How the accepted formats are named to users, in errors and on the upload box. */
export const SUPPORTED_FORMATS_LABEL = 'PDF, Word, PowerPoint, Excel, OpenDocument, RTF, Markdown, CSV and TXT';

/** The lowercased extension of a filename, or '' when it has none. */
export const extensionOf = (filename) => {
  const name = typeof filename === 'string' ? filename : '';
  const dot = name.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension.
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

/**
 * Resolve an upload to the format we will parse it as.
 *
 * Returns '' when nothing matches, which the caller turns into a rejection —
 * this deliberately does not guess, because guessing wrong means a parse error
 * a minute into a request instead of an immediate, accurate refusal.
 */
export const formatOf = (filename, mimetype) => {
  const ext = extensionOf(filename);
  if (DOCUMENT_FORMATS[ext]) return ext;
  if (LEGACY_BINARY_FORMATS[ext]) return '';

  const declared = typeof mimetype === 'string' ? mimetype.toLowerCase().split(';')[0].trim() : '';
  if (!declared) return '';

  return Object.keys(DOCUMENT_FORMATS).find((key) => DOCUMENT_FORMATS[key].includes(declared)) ?? '';
};

/** True when this upload is one we can read. */
export const isSupportedDocument = (filename, mimetype) => formatOf(filename, mimetype) !== '';

/**
 * Why an upload was refused, in words the user can act on.
 *
 * The legacy branch matters more than it looks: "save it as .pptx" is a
 * fifteen-second fix in PowerPoint, and it is not something a list of accepted
 * formats communicates on its own.
 */
export const describeRejection = (filename, mimetype) => {
  const ext = extensionOf(filename);
  const legacy = LEGACY_BINARY_FORMATS[ext]
    ?? Object.values(LEGACY_BINARY_FORMATS).find((entry) => entry.mimes.includes(mimetype));

  if (legacy) {
    return `The old .${ext || 'ppt'} format cannot be read. Open the file and use "Save As" to save it as ${legacy.saveAs}, then upload that.`;
  }

  const named = ext ? `".${ext}" files are not supported` : 'That file type is not supported';
  return `${named}. Upload ${SUPPORTED_FORMATS_LABEL}.`;
};

export default {
  DOCUMENT_FORMATS,
  ACCEPTED_MIME_TYPES,
  SUPPORTED_FORMATS_LABEL,
  extensionOf,
  formatOf,
  isSupportedDocument,
  describeRejection,
};
