/**
 * Response Mapper
 *
 * Transforms raw `user_responses` rows (with optional joins) into
 * the API response shapes consumed by the client.
 *
 * Shape hierarchy:
 *   toResponse            – bare response columns only
 *   toResponseWithQuestion – + joined interview_questions context
 *   toResponseWithFeedback – + joined feedback context (best-effort)
 *   toResponseListItem     – alias for list contexts (includes both joins)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert any date-like value to ISO string; returns null for falsy input.
 * @param {string|Date|null|undefined} v
 * @returns {string|null}
 */
function toISO(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

/**
 * Bare response columns.
 * Used after PATCH /responses/:id where no join is performed.
 *
 * @param {object} row
 * @returns {object|null}
 */
function toResponse(row) {
  if (!row) return null;

  return {
    id: row.id,
    question_id: row.question_id,
    session_id: row.session_id,
    transcribed_text: row.transcribed_text ?? null,
    original_audio_url: row.original_audio_url ?? null,
    response_duration_seconds: row.response_duration_seconds ?? null,
    transcription_confidence: row.transcription_confidence ?? null,
    responded_at: toISO(row.response_created_at),
  };
}

/**
 * Response with nested question context.
 * Used after POST (submit) and GET /responses/:id.
 *
 * @param {object} row  – user_responses row joined with interview_questions
 * @returns {object|null}
 */
function toResponseWithQuestion(row) {
  if (!row) return null;

  const base = toResponse(row);
  const q = row.interview_questions ?? null;

  return {
    ...base,
    question: q
      ? {
          text: q.question_text ?? null,
          number: q.question_number ?? null,
          type: q.question_type ?? null,
          difficulty: q.difficulty_level ?? null,
          ideal_guidelines: q.ideal_answer_guidelines ?? null,
        }
      : null,
  };
}

/**
 * Build a safe feedback object from a raw feedback row (or null).
 * Handles both single-object and array joins (Supabase returns arrays
 * for one-to-many relationships even when only one row exists).
 *
 * @param {object|object[]|null} raw
 * @returns {object|null}
 */
function _buildFeedback(raw) {
  const fb = Array.isArray(raw) ? raw[0] : raw;
  if (!fb) return null;

  return {
    id: fb.id,
    overall_score: fb.overall_score ?? null,
    relevance_score: fb.relevance_score ?? null,
    clarity_score: fb.clarity_score ?? null,
    confidence_score: fb.confidence_score ?? null,
    detailed_feedback: fb.detailed_feedback ?? null,
    improvement_suggestions: fb.improvement_suggestions ?? null,
    evaluated_at: toISO(fb.created_at),
  };
}

/**
 * Full response — question context + feedback (if present).
 * Used for GET /responses/sessions/:sessionId/questions/:questionId
 * and GET /responses/:id?include_feedback=true.
 *
 * @param {object} row
 * @returns {object|null}
 */
function toResponseWithFeedback(row) {
  if (!row) return null;

  const withQuestion = toResponseWithQuestion(row);

  return {
    ...withQuestion,
    feedback: _buildFeedback(row.feedback ?? null),
  };
}

/**
 * List item shape — used in GET /responses/sessions/:sessionId.
 * Identical to toResponseWithFeedback; named separately for clarity.
 *
 * @param {object} row
 * @returns {object|null}
 */
function toResponseListItem(row) {
  return toResponseWithFeedback(row);
}

export { toResponse, toResponseWithQuestion, toResponseWithFeedback, toResponseListItem };

export default { toResponse, toResponseWithQuestion, toResponseWithFeedback, toResponseListItem };