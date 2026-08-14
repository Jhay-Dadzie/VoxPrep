/**
 * History Service
 *
 * Owns all database interaction for reviewing past interview sessions.
 *
 * Scope boundary vs. the Interviews module:
 *   - Interviews owns the *active* lifecycle (create/start/pause/continue/
 *     complete/delete-in-flight, adding questions, submitting answers).
 *   - History owns *reviewable* sessions only — status IN ('completed',
 *     'paused') — and adds the read/organize actions that only make sense
 *     once a session isn't actively being taken: full feedback detail,
 *     archiving, notes, and permanent deletion.
 *   An `in_progress` session is intentionally invisible to every method
 *   here; it isn't ready for review yet.
 *
 * Design decisions (mirroring interview.service.js / jobDescription.service.js):
 *  - Uses the Supabase admin client with explicit `.eq('user_id', userId)`
 *    filters on every query, rather than a token-scoped RLS client. This
 *    keeps History consistent with the two modules it reads the same
 *    tables from.
 *  - Never returns raw rows past the controller boundary — mapping happens
 *    in history.mapper.js.
 *
 * NOTE ON feedback COLUMNS:
 *  These match the `feedback` table in supabase_schema.sql:
 *    relevance_score, clarity_score, confidence_score, completeness_score,
 *    overall_response_score (all 0-100), strengths, improvements,
 *    suggestions, follow_up_tip, generated_at.
 *  There is no technical_accuracy column. If the schema changes, update the
 *  select in getHistorySessionById and history.mapper.js#mapFeedback together.
 *
 * NOTE ON HARD DELETE:
 *  deleteHistorySession removes only the interview_sessions row, the same
 *  way interview.service.js#deleteSession does. This assumes ON DELETE
 *  CASCADE is configured on interview_questions.session_id,
 *  user_responses.session_id, and feedback.response_id. If cascade
 *  isn't set up at the DB level, this will leave orphaned child rows.
 */

import { getSupabaseAdminClient } from '../../config/supabase.js';

let supabase;

const getSupabase = () => {
  if (!supabase) supabase = getSupabaseAdminClient();
  return supabase;
};

/** Sessions in these statuses are "reviewable" and visible to History. */
const HISTORY_STATUSES = ['completed', 'paused'];

const SORT_MAP = {
  recent: { column: 'started_at', ascending: false },
  oldest: { column: 'started_at', ascending: true },
  score_desc: { column: 'overall_score', ascending: false },
  score_asc: { column: 'overall_score', ascending: true },
};

// ─────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────

/**
 * Paginated list of the user's reviewable sessions.
 *
 * @param {string} userId
 * @param {{ page?: number, limit?: number, search?: string, sort?: string }} options
 */
export const getHistorySessions = async (
  userId,
  { page = 1, limit = 10, search = '', sort = 'recent' } = {},
) => {
  const supabase = getSupabase();
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { column, ascending } = SORT_MAP[sort] || SORT_MAP.recent;

  let query = supabase
    .from('interview_sessions')
    .select(
      `
      *,
      job_descriptions (
        title,
        company_name
      )
    `,
      { count: 'exact' },
    )
    .eq('user_id', userId)
    .in('status', HISTORY_STATUSES)
    .order(column, { ascending, nullsFirst: false });

  if (search) {
    query = query.ilike('session_title', `%${search}%`);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) throw new Error(error.message);

  return {
    data: data || [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  };
};

// ─────────────────────────────────────────────────────────────────
// Detail
// ─────────────────────────────────────────────────────────────────

/**
 * Full review detail for one session: job description context, every
 * question, its response, and that response's AI feedback breakdown.
 * Returns null if the session doesn't exist, isn't the user's, or hasn't
 * reached a reviewable status yet.
 *
 * @param {string} sessionId
 * @param {string} userId
 */
export const getHistorySessionById = async (sessionId, userId) => {
  const supabase = getSupabase();

  // 1. Fetch session + job description
  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select(
      `
      *,
      job_descriptions (
        id,
        title,
        company_name,
        required_experience_level,
        industry,
        key_skills
      )
    `
    )
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', HISTORY_STATUSES)
    .single();

  if (sessionError || !session) return null;

  // 2. Fetch questions + user_responses (without feedback)
  const { data: questions, error: qError } = await supabase
    .from('interview_questions')
    .select(
      `
      *,
      user_responses (
        id,
        transcribed_text,
        original_audio_url,
        response_duration_seconds,
        transcription_confidence,
        response_created_at
      )
    `
    )
    .eq('session_id', sessionId)
    .order('question_number', { ascending: true });

  if (qError) throw new Error(qError.message);

  // 3. Collect all response IDs
  const responseIds = questions
    .flatMap(q => q.user_responses)
    .filter(r => r && r.id)
    .map(r => r.id);

  // 4. Fetch feedback for those responses (if any)
  let feedbackMap = {};
  if (responseIds.length > 0) {
    const { data: feedbacks, error: fbError } = await supabase
      .from('feedback')
      .select(
        `
        id,
        response_id,
        relevance_score,
        clarity_score,
        confidence_score,
        completeness_score,
        overall_response_score,
        strengths,
        improvements,
        suggestions,
        follow_up_tip,
        generated_at
      `
      )
      .in('response_id', responseIds);

    if (fbError) throw new Error(fbError.message);

    // Build a map: response_id -> feedback object (or null)
    feedbackMap = Array.isArray(feedbacks)
      ? feedbacks.reduce((acc, fb) => {
          acc[fb.response_id] = fb;
          return acc;
        }, {})
      : {};
  }

  // 5. Attach feedback to each response (as a nested property)
  questions.forEach(q => {
    if (q.user_responses && Array.isArray(q.user_responses)) {
      q.user_responses = q.user_responses.map(r => {
        if (r && r.id) {
          r.feedback = feedbackMap[r.id] || null;
        }
        return r;
      });
    }
    // If the relationship returns a single object (not an array), handle it
    else if (q.user_responses && typeof q.user_responses === 'object' && q.user_responses.id) {
      const r = q.user_responses;
      r.feedback = feedbackMap[r.id] || null;
    }
  });

  return { ...session, questions: questions || [] };
};

// ─────────────────────────────────────────────────────────────────
// Archive / Notes
// ─────────────────────────────────────────────────────────────────

/**
 * Toggle is_archived on a reviewable session.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {boolean} isArchived
 */
export const setArchiveStatus = async (sessionId, userId, isArchived) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({ is_archived: isArchived })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', HISTORY_STATUSES)
    .select('id, is_archived')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found in history');

  return data;
};

/**
 * Replace the free-text notes on a reviewable session. Pass '' or null to
 * clear.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {string|null} notes
 */
export const updateNotes = async (sessionId, userId, notes) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({ notes: notes || null })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', HISTORY_STATUSES)
    .select('id, notes')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found in history');

  return data;
};

// ─────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────

/**
 * Permanently delete a reviewable session and (via DB cascade) its
 * questions, responses, and feedback. See the HARD DELETE note above.
 *
 * @param {string} sessionId
 * @param {string} userId
 */
export const deleteHistorySession = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', HISTORY_STATUSES)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found in history');

  return true;
};

// ─────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────

/** PostgREST caps a single response; page through to cover every session. */
const STATS_PAGE_SIZE = 1000;
const STATS_MAX_PAGES = 100;

/**
 * Aggregate scores across *all* of the user's reviewable sessions.
 *
 * Only the overall_score column is selected, so this stays cheap even for a
 * user with a long history. Sessions with no score yet are counted in
 * total_sessions but excluded from the average.
 *
 * @param {string} userId
 */
export const getHistoryStats = async (userId) => {
  const supabase = getSupabase();

  const scores = [];
  let total = 0;

  for (let page = 0; page < STATS_MAX_PAGES; page += 1) {
    const from = page * STATS_PAGE_SIZE;

    const { data, error, count } = await supabase
      .from('interview_sessions')
      .select('overall_score', { count: 'exact' })
      .eq('user_id', userId)
      .in('status', HISTORY_STATUSES)
      .range(from, from + STATS_PAGE_SIZE - 1);

    if (error) throw new Error(error.message);

    const rows = data || [];
    if (count != null) total = count;

    for (const row of rows) {
      const score = Number(row.overall_score);
      if (row.overall_score !== null && row.overall_score !== undefined && !Number.isNaN(score)) {
        scores.push(score);
      }
    }

    if (rows.length < STATS_PAGE_SIZE) break;
  }

  const average =
    scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;

  return {
    total_sessions: total,
    scored_sessions: scores.length,
    // Rounded to the 2dp the score columns themselves use.
    average_score: average === null ? null : Math.round(average * 100) / 100,
  };
};

export default {
  getHistorySessions,
  getHistorySessionById,
  getHistoryStats,
  setArchiveStatus,
  updateNotes,
  deleteHistorySession,
};