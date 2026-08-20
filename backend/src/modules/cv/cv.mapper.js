/**
 * Wire shapes for tailored CVs.
 *
 * `document` is passed through as stored: it is the CV itself, and the client
 * renders every field of it into the PDF the candidate downloads. The columns
 * beside it (notes, keywords, gaps) are denormalised copies kept for querying,
 * so they are read back off the document when present to avoid two answers to
 * the same question.
 */

export const mapToResponse = (cv) => {
  if (!cv) return null;

  const document = cv.tailored_document || {};

  return {
    id: cv.id,
    session_id: cv.session_id,
    job_description_id: cv.job_description_id,
    source_file_name: cv.source_file_name,
    document,
    tailoring_notes: document.tailoring_notes ?? cv.tailoring_notes ?? [],
    keywords_matched: document.keywords_matched ?? cv.keywords_matched ?? [],
    gaps: document.gaps ?? cv.gaps ?? [],
    created_at: cv.created_at,
  };
};

export default { mapToResponse };
