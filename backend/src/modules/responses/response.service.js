/**
 * Response Service
 *
 * Canonical owner of the `user_responses` table.
 *
 * Design decisions:
 *  - Uses getSupabaseAdminClient (admin bypass) + explicit user_id filter —
 *    consistent with interview.service.js and jobDescription.service.js.
 *    RLS acts as a safety net; we enforce ownership in application code too.
 *  - One response per (question_id, user_id) pair — enforced via check-then-
 *    write. An upsert on a unique constraint is cleaner but requires the DB
 *    constraint to exist; the explicit path is more portable.
 *  - _syncAnsweredCount is fire-and-forget — a failed counter update should
 *    never surface a 500 to the client.
 *  - Feedback is fetched as a best-effort LEFT JOIN so the module works even
 *    before the feedback module is fully built out. Errors in that join are
 *    caught and logged; the response is still returned without feedback.
 *  - All public methods are async and throw descriptive errors so the
 *    controller's asyncHandler / AppError layer gives clean 4xx/5xx splits.
 */

import { getSupabaseAdminClient } from '../../config/supabase.js';
import audioService from '../speech/audio.service.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

// ─── Table names ──────────────────────────────────────────────────────────────

const T_RESPONSES = 'user_responses';
const T_SESSIONS  = 'interview_sessions';
const T_QUESTIONS = 'interview_questions';
const T_FEEDBACK  = 'feedback';

// ─── Column allow-lists ───────────────────────────────────────────────────────

/**
 * Columns safe to return from user_responses.
 * Never select * — keeps the query plan tight and avoids leaking internals.
 */
const RESPONSE_COLS =
  'id, question_id, session_id, user_id, transcribed_text, original_audio_url, ' +
  'response_duration_seconds, transcription_confidence, response_created_at';

/**
 * Question columns needed for the "with question" shape.
 */
const QUESTION_CONTEXT_COLS =
  'question_text, question_number, question_type, difficulty_level, ideal_answer_guidelines';

/**
 * Feedback columns needed when include_feedback = true.
 * Wrapped in a try/catch at query time — table may not exist yet.
 */
const FEEDBACK_COLS =
  'id, overall_score, relevance_score, clarity_score, confidence_score, ' +
  'detailed_feedback, improvement_suggestions, created_at';

// ─── Singleton admin client ───────────────────────────────────────────────────

let _supabase = null;

function getSupabase() {
  if (!_supabase) _supabase = getSupabaseAdminClient();
  return _supabase;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class ResponseService {
  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Submit (create) or re-submit (update) a user's response to a question.
   *
   * Guards:
   *  1. Question must belong to the given session.
   *  2. Session must belong to the authenticated user.
   *  3. Session must not be in 'completed' status.
   *
   * Idempotent — calling twice for the same question replaces the first
   * response rather than creating a duplicate (one response per question).
   *
   * @param {string} sessionId
   * @param {string} questionId
   * @param {string} userId
   * @param {{ transcribed_text: string, original_audio_url?: string|null,
   *           response_duration_seconds?: number|null,
   *           transcription_confidence?: number|null }} responseData
   * @returns {Promise<object>} Raw DB row from user_responses
   */
  async submitResponse(sessionId, questionId, userId, responseData) {
    const supabase = getSupabase();

    // ── 1. Verify access & session state ──────────────────────────────────
    const { data: question, error: qError } = await supabase
      .from(T_QUESTIONS)
      .select(`
        id,
        ${T_SESSIONS}!inner (
          id,
          user_id,
          status
        )
      `)
      .eq('id', questionId)
      .eq('session_id', sessionId)
      .eq(`${T_SESSIONS}.user_id`, userId)
      .single();

    if (qError || !question) {
      throw new Error('Question not found or access denied');
    }

    const session = Array.isArray(question[T_SESSIONS])
      ? question[T_SESSIONS][0]
      : question[T_SESSIONS];

    if (session?.status === 'completed') {
      throw new Error('Cannot submit a response to a completed session');
    }

    // ── 2. Check for existing response ────────────────────────────────────
    const { data: existing } = await supabase
      .from(T_RESPONSES)
      .select('id')
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .maybeSingle();

    const now = new Date().toISOString();
    const originalAudioUrl = await this._resolveOriginalAudioUrl(responseData);

    const payload = {
      transcribed_text: responseData.transcribed_text,
      original_audio_url: originalAudioUrl,
      response_duration_seconds: responseData.response_duration_seconds ?? null,
      transcription_confidence: responseData.transcription_confidence ?? null,
      response_created_at: now,
    };

    let row;

    if (existing) {
      // ── Update ───────────────────────────────────────────────────────────
      const { data, error } = await supabase
        .from(T_RESPONSES)
        .update(payload)
        .eq('id', existing.id)
        .select(RESPONSE_COLS)
        .single();

      if (error) {
        _error(`submitResponse update failed [question=${questionId}]:`, error);
        throw new Error('Failed to update response');
      }

      row = data;
    } else {
      // ── Insert ───────────────────────────────────────────────────────────
      const { data, error } = await supabase
        .from(T_RESPONSES)
        .insert({
          question_id: questionId,
          session_id: sessionId,
          user_id: userId,
          ...payload,
        })
        .select(RESPONSE_COLS)
        .single();

      if (error) {
        _error(`submitResponse insert failed [question=${questionId}]:`, error);
        throw new Error('Failed to submit response');
      }

      row = data;

      // Only sync when a NEW response is created; updates don't change the count.
      await this._syncAnsweredCount(sessionId);
    }

    info(`Response ${existing ? 'updated' : 'submitted'} [question=${questionId}, user=${userId}]`);
    return row;
  }

  /**
   * Update mutable fields on an existing response (transcribed text or audio URL).
   *
   * Rejects updates on responses that belong to completed sessions to preserve
   * the integrity of historical records.
   *
   * @param {string} responseId
   * @param {string} userId
   * @param {{ transcribed_text?: string, original_audio_url?: string|null,
   *           response_duration_seconds?: number|null }} fields
   * @returns {Promise<object>} Updated row
   */
  async updateResponse(responseId, userId, fields) {
    const supabase = getSupabase();

    // Fetch existing with session state check
    const { data: existing, error: fetchError } = await supabase
      .from(T_RESPONSES)
      .select(`id, session_id, ${T_SESSIONS} ( status )`)
      .eq('id', responseId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      throw new Error('Response not found or access denied');
    }

    const sessionStatus = Array.isArray(existing[T_SESSIONS])
      ? existing[T_SESSIONS][0]?.status
      : existing[T_SESSIONS]?.status;

    if (sessionStatus === 'completed') {
      throw new Error('Cannot edit a response that belongs to a completed session');
    }

    const originalAudioUrl = await this._resolveOriginalAudioUrl(fields);
    const {
      audio_url: _audioUrl,
      storage_path: _storagePath,
      original_audio_url: _originalAudioUrl,
      ...updatableFields
    } = fields;

    const { data, error } = await supabase
      .from(T_RESPONSES)
      .update({
        ...updatableFields,
        original_audio_url: originalAudioUrl,
        response_created_at: new Date().toISOString(), // refresh edit timestamp
      })
      .eq('id', responseId)
      .eq('user_id', userId)
      .select(RESPONSE_COLS)
      .single();

    if (error) {
      _error(`updateResponse failed [id=${responseId}]:`, error);
      throw new Error('Failed to update response');
    }

    info(`Response updated [id=${responseId}, user=${userId}]`);
    return data;
  }

  /**
   * Hard-delete a response.
   * Not permitted on completed sessions — those form part of the historical record.
   * Decrements the session's questions_answered counter after deletion.
   *
   * @param {string} responseId
   * @param {string} userId
   * @returns {Promise<{ deleted: true }>}
   */
  async deleteResponse(responseId, userId) {
    const supabase = getSupabase();

    const { data: existing, error: fetchError } = await supabase
      .from(T_RESPONSES)
      .select(`id, session_id, ${T_SESSIONS} ( status )`)
      .eq('id', responseId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existing) {
      throw new Error('Response not found or access denied');
    }

    const sessionStatus = Array.isArray(existing[T_SESSIONS])
      ? existing[T_SESSIONS][0]?.status
      : existing[T_SESSIONS]?.status;

    if (sessionStatus === 'completed') {
      throw new Error('Cannot delete a response from a completed session');
    }

    const { error } = await supabase
      .from(T_RESPONSES)
      .delete()
      .eq('id', responseId)
      .eq('user_id', userId);

    if (error) {
      _error(`deleteResponse failed [id=${responseId}]:`, error);
      throw new Error('Failed to delete response');
    }

    await this._syncAnsweredCount(existing.session_id);

    info(`Response deleted [id=${responseId}, user=${userId}]`);
    return { deleted: true };
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Paginated list of all responses for a session.
   * Ordered by question_number ascending so the client gets them in order.
   * Optionally includes a best-effort feedback join.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @param {{ page?: number, limit?: number, include_feedback?: boolean }} opts
   * @returns {Promise<{ data: object[], pagination: object }>}
   */
  async getSessionResponses(sessionId, userId, opts = {}) {
    const { page = 1, limit = 20, include_feedback = false } = opts;
    const supabase = getSupabase();

    // Guard: session must belong to the requesting user
    const { data: session, error: sessError } = await supabase
      .from(T_SESSIONS)
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessError || !session) {
      throw new Error('Session not found or access denied');
    }

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    // Build select — feedback is optional
    const feedbackJoin = include_feedback
      ? `, ${T_FEEDBACK} ( ${FEEDBACK_COLS} )`
      : '';

    const selectStr = `
      ${RESPONSE_COLS},
      ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} )
      ${feedbackJoin}
    `;

    // Supabase doesn't allow ORDER on a joined table column directly,
    // so we order by response_created_at on the main table.
    // Clients that need question_number ordering should sort client-side
    // or we can fetch in a second pass — using response_created_at is fine
    // because answers are typically submitted in question order.
    let query = supabase
      .from(T_RESPONSES)
      .select(selectStr, { count: 'exact' })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('response_created_at', { ascending: true });

    // Best-effort: if the feedback table doesn't exist yet, the query
    // will fail. Retry without the feedback join.
    let data, count, error;

    ({ data, error, count } = await query.range(from, to));

    if (error && include_feedback) {
      warn(`getSessionResponses: feedback join failed, retrying without [session=${sessionId}]:`, error);

      const fallbackSelect = `
        ${RESPONSE_COLS},
        ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} )
      `;

      ({ data, error, count } = await supabase
        .from(T_RESPONSES)
        .select(fallbackSelect, { count: 'exact' })
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .order('response_created_at', { ascending: true })
        .range(from, to));
    }

    if (error) {
      _error(`getSessionResponses failed [session=${sessionId}]:`, error);
      throw new Error('Failed to retrieve session responses');
    }

    return {
      data: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Single response by primary key.
   * Joins question context and optionally feedback.
   * Returns null when not found (controller converts to 404).
   *
   * @param {string} responseId
   * @param {string} userId
   * @param {boolean} include_feedback
   * @returns {Promise<object|null>}
   */
  async getResponseById(responseId, userId, include_feedback = false) {
    const supabase = getSupabase();

    const feedbackJoin = include_feedback
      ? `, ${T_FEEDBACK} ( ${FEEDBACK_COLS} )`
      : '';

    const selectStr = `
      ${RESPONSE_COLS},
      ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} )
      ${feedbackJoin}
    `;

    const { data, error } = await supabase
      .from(T_RESPONSES)
      .select(selectStr)
      .eq('id', responseId)
      .eq('user_id', userId)
      .single();

    if (error) {
      // If the feedback join caused the failure, retry without it
      if (include_feedback) {
        warn(`getResponseById: feedback join failed, retrying without [id=${responseId}]:`, error);

        const { data: fallback, error: fbError } = await supabase
          .from(T_RESPONSES)
          .select(`${RESPONSE_COLS}, ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} )`)
          .eq('id', responseId)
          .eq('user_id', userId)
          .single();

        if (fbError) return null;
        return fallback;
      }

      return null;
    }

    return data;
  }

  /**
   * Retrieve the response (and any available feedback) for a specific question
   * within a session. Returns null when no response has been submitted yet.
   *
   * @param {string} sessionId
   * @param {string} questionId
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  async getQuestionResponse(sessionId, questionId, userId) {
    const supabase = getSupabase();

    // Verify access in one shot by joining through the session
    const { data: session } = await supabase
      .from(T_SESSIONS)
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (!session) throw new Error('Session not found or access denied');

    const selectStr = `
      ${RESPONSE_COLS},
      ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} ),
      ${T_FEEDBACK} ( ${FEEDBACK_COLS} )
    `;

    let { data, error } = await supabase
      .from(T_RESPONSES)
      .select(selectStr)
      .eq('session_id', sessionId)
      .eq('question_id', questionId)
      .eq('user_id', userId)
      .maybeSingle();

    // Best-effort feedback fallback
    if (error) {
      warn(`getQuestionResponse: feedback join failed, retrying without [question=${questionId}]:`, error);

      ({ data, error } = await supabase
        .from(T_RESPONSES)
        .select(`${RESPONSE_COLS}, ${T_QUESTIONS} ( ${QUESTION_CONTEXT_COLS} )`)
        .eq('session_id', sessionId)
        .eq('question_id', questionId)
        .eq('user_id', userId)
        .maybeSingle());
    }

    if (error) {
      _error(`getQuestionResponse failed [question=${questionId}]:`, error);
      throw new Error('Failed to retrieve response');
    }

    return data ?? null; // null = not yet answered
  }

  /**
   * Completion statistics for a session — total questions, answered, pending,
   * and a percentage.
   *
   * @param {string} sessionId
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getSessionStats(sessionId, userId) {
    const supabase = getSupabase();

    const { data: session, error: sessError } = await supabase
      .from(T_SESSIONS)
      .select('id, total_questions, questions_answered')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessError || !session) {
      throw new Error('Session not found or access denied');
    }

    // Live count from the responses table — source of truth
    const { count: liveCount, error: countError } = await supabase
      .from(T_RESPONSES)
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (countError) {
      _error(`getSessionStats count failed [session=${sessionId}]:`, countError);
      throw new Error('Failed to compute session statistics');
    }

    const answered     = liveCount ?? 0;
    const total        = session.total_questions ?? 0;
    const pending      = Math.max(0, total - answered);
    const pct          = total > 0 ? Math.round((answered / total) * 100) : 0;

    return {
      session_id:            sessionId,
      total_questions:       total,
      questions_answered:    answered,
      questions_pending:     pending,
      completion_percentage: pct,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Recalculate and persist the `questions_answered` counter on a session.
   * Fire-and-forget — logs a warning on failure, never throws.
   *
   * @param {string} sessionId
   */
  async _syncAnsweredCount(sessionId) {
    const supabase = getSupabase();

    try {
      const { count, error: countError } = await supabase
        .from(T_RESPONSES)
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId);

      if (countError) throw countError;

      const { error: updateError } = await supabase
        .from(T_SESSIONS)
        .update({ questions_answered: count ?? 0 })
        .eq('id', sessionId);

      if (updateError) throw updateError;
    } catch (err) {
      warn(`_syncAnsweredCount failed [session=${sessionId}]:`, err);
    }
  }

  /**
   * Normalize audio-related fields into the canonical original_audio_url column.
   *
   * Accepts:
   *  - original_audio_url directly
   *  - audio_url from the speech endpoint
   *  - storage_path from the speech endpoint (converted to a signed URL)
   *
   * @param {{ original_audio_url?: string|null, audio_url?: string|null, storage_path?: string|null }} fields
   * @returns {Promise<string|null>}
   */
  async _resolveOriginalAudioUrl(fields = {}) {
    const directUrl = fields.original_audio_url ?? fields.audio_url ?? null;
    if (directUrl) {
      return directUrl;
    }

    if (fields.storage_path) {
      return audioService.getSignedUrl(fields.storage_path);
    }

    return null;
  }
}

const responseService = new ResponseService();

export const submitResponse = responseService.submitResponse.bind(responseService);
export const updateResponse = responseService.updateResponse.bind(responseService);
export const deleteResponse = responseService.deleteResponse.bind(responseService);
export const getSessionResponses = responseService.getSessionResponses.bind(responseService);
export const getResponseById = responseService.getResponseById.bind(responseService);
export const getQuestionResponse = responseService.getQuestionResponse.bind(responseService);
export const getSessionStats = responseService.getSessionStats.bind(responseService);

export default responseService;
