/**
 * What the document pickers may offer.
 *
 * Mirrors DOCUMENT_FORMATS in the backend's core/utils/documentFormats.js, and
 * has to stay in step with it: the picker greys out every type not listed here,
 * so a format the server can read but this list omits is one the user cannot
 * select and gets no explanation for. The two screens that upload — session
 * setup and CV tailoring — hit the same middleware, so they share one list
 * rather than keeping a copy each and drifting apart.
 *
 * The 97-2003 binary formats (.ppt, .xls) are absent on both sides. Nothing
 * maintained in Node reads them; the server names them in its rejection so the
 * fix — re-save as .pptx — reaches the user rather than a generic refusal.
 */
export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
]

/** The same set in the words a user uses, for the upload box. */
export const ACCEPTED_DOCUMENT_LABEL =
  'PDF, Word, PowerPoint, Excel, OpenDocument, RTF, Markdown, CSV or TXT'

/** The ceiling the upload middleware enforces, stated before the upload fails. */
export const MAX_UPLOAD_MB = 15
