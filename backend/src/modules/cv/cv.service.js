import { getSupabaseAdminClient } from '../../config/supabase.js';
import { parseDocument } from '../uploads/parser.service.js';
import { tailorCv } from '../ai/generators/cv.generator.js';

/**
 * CV tailoring.
 *
 * Offered once an interview is over: the candidate has just been questioned
 * against a job description we already hold, so tailoring their CV to that same
 * description costs them one upload and nothing else.
 *
 * What is stored, and what is not: the tailored document is kept so the
 * candidate can download it again later, but the text extracted from their
 * uploaded CV is not. That text is the most sensitive thing this feature
 * touches — full employment history, address, phone number — and nothing in the
 * product needs it after the model has read it, so it stays in memory for the
 * length of one request and is never written down.
 */

/** Below this, the upload parsed to something that cannot be a real CV. */
const MIN_CV_CHARS = 200;

let supabase;

const getSupabase = () => {
  if (!supabase) supabase = getSupabaseAdminClient();
  return supabase;
};

/**
 * Load the session's job description, checking ownership on the way.
 *
 * Throws rather than returning null for a session belonging to someone else —
 * the same shape loadSessionContext uses, so a caller cannot forget the check.
 */
const loadJobForSession = async (sessionId, userId) => {
  const { data: session, error } = await getSupabase()
    .from('interview_sessions')
    .select(`
      id, session_title, job_description_id,
      job_descriptions (
        title, company_name, job_content, key_skills,
        required_experience_level, industry
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !session) throw new Error('Interview session not found or access denied');

  if (!session.job_descriptions) {
    throw new Error('This session has no job description to tailor against');
  }

  return session;
};

/**
 * Tailor an uploaded CV to the job description behind a finished session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {object} file - multer memory-storage file: { buffer, originalname }
 * @param {object} [options]
 * @param {string} [options.candidateName] - fallback name, used only if the CV has none
 * @returns {Promise<object>} the stored tailored_cvs row
 */
export const tailorCvForSession = async (sessionId, userId, file, { candidateName = null } = {}) => {
  const session = await loadJobForSession(sessionId, userId);
  const job = session.job_descriptions;

  let cvText;
  try {
    cvText = await parseDocument(file.buffer, file.originalname);
  } catch (parseError) {
    const failed = new Error(`Could not read that CV: ${parseError.message}`);
    failed.statusCode = 400;
    throw failed;
  }

  // A scanned CV is a PDF of images: it parses without error and yields almost
  // no text, which the model would then "tailor" into a fabrication. Catching
  // it here turns a silently wrong CV into a fixable message.
  if (!cvText || cvText.trim().length < MIN_CV_CHARS) {
    const empty = new Error(
      'We could not read any text from that file. If it is a scan or an image, upload a text-based PDF, DOCX or TXT instead.'
    );
    empty.statusCode = 400;
    throw empty;
  }

  const { document, model } = await tailorCv({
    cvText,
    jobTitle: job.title,
    companyName: job.company_name,
    industry: job.industry,
    experienceLevel: job.required_experience_level,
    keySkills: job.key_skills,
    jobContent: job.job_content,
    candidateName,
  });

  const { data, error } = await getSupabase()
    .from('tailored_cvs')
    .insert({
      user_id: userId,
      session_id: sessionId,
      job_description_id: session.job_description_id,
      source_file_name: file.originalname,
      source_char_count: cvText.length,
      tailored_document: document,
      tailoring_notes: document.tailoring_notes,
      keywords_matched: document.keywords_matched,
      gaps: document.gaps,
      ai_model_used: model,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  return data;
};

/**
 * The most recent tailored CV for a session, or null.
 *
 * Most recent rather than the only one: re-running the tailoring on a different
 * CV file is allowed, and the candidate should see what they produced last.
 */
export const getLatestForSession = async (sessionId, userId) => {
  const { data, error } = await getSupabase()
    .from('tailored_cvs')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

/** One tailored CV by id. Null when it does not exist or is not this user's. */
export const getTailoredCvById = async (id, userId) => {
  const { data, error } = await getSupabase()
    .from('tailored_cvs')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
};

export default {
  tailorCvForSession,
  getLatestForSession,
  getTailoredCvById,
};
