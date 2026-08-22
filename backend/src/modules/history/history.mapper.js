/**
 * History Mapper
 *
 * Transforms raw Supabase rows (interview_sessions joined with
 * job_descriptions / interview_questions / user_responses / response_feedback)
 * into the API response shapes for the History module.
 *
 * Nothing from the DB should reach the client unless it passes through here.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/**
 * Supabase returns nested to-one relationships as either an object or a
 * single-element array depending on how the FK relationship is declared.
 * Normalize to a single object (or null) so mapper logic doesn't have to
 * special-case both shapes everywhere.
 */
function firstOrSelf(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Column names here follow the `feedback` table in supabase_schema.sql.
 * All scores are stored 0-100.
 */
function mapFeedback(rawFeedback) {
  const row = firstOrSelf(rawFeedback);
  if (!row) return null;

  return {
    id: row.id,
    scores: {
      relevance: row.relevance_score ?? null,
      completeness: row.completeness_score ?? null,
      clarity: row.clarity_score ?? null,
      confidence: row.confidence_score ?? null,
    },
    overall_score: row.overall_response_score ?? null,
    strengths: row.strengths ?? null,
    improvements: row.improvements ?? null,
    suggestions: row.suggestions ?? null,
    follow_up_tip: row.follow_up_tip ?? null,
    generated_at: toISO(row.generated_at),
  };
}

// ─── Response + Question (detail view) ────────────────────────────────────────

function mapResponse(rawResponse) {
  const row = firstOrSelf(rawResponse);
  if (!row) return null;

  return {
    id: row.id,
    transcribed_text: row.transcribed_text,
    audio_url: row.original_audio_url,
    response_duration_seconds: row.response_duration_seconds,
    transcription_confidence: row.transcription_confidence,
    responded_at: toISO(row.response_created_at),
    // history.service.js attaches the row from the `feedback` table under
    // `feedback`; reading any other key here silently drops all AI feedback.
    feedback: mapFeedback(row.feedback),
  };
}

function mapQuestion(question) {
  return {
    id: question.id,
    question_text: question.question_text,
    question_number: question.question_number,
    question_type: question.question_type,
    difficulty_level: question.difficulty_level,
    ideal_answer_guidelines: question.ideal_answer_guidelines,
    response: mapResponse(question.user_responses),
  };
}

// ─── Public shapes ────────────────────────────────────────────────────────────

/**
 * List-row shape — returned from GET /history.
 * Lightweight: no per-question detail, just enough to render a history card.
 */
function toHistorySummary(session) {
  if (!session) return null;
  return {
    id: session.id,
    session_title: session.session_title,
    status: session.status,
    // Which review screen this row opens: a marked paper, or a graded interview.
    session_kind: session.session_kind ?? 'interview',
    job_title: session.job_descriptions?.title ?? null,
    company_name: session.job_descriptions?.company_name ?? null,
    total_questions: session.total_questions,
    questions_answered: session.questions_answered,
    overall_score: session.overall_score,
    is_archived: session.is_archived,
    started_at: toISO(session.started_at),
    completed_at: toISO(session.completed_at),
    duration_seconds: session.duration_seconds,
  };
}

function toHistoryListResponse(sessions, pagination) {
  return {
    data: (sessions || []).map(toHistorySummary),
    pagination,
  };
}

/**
 * Full detail shape — returned from GET /history/:id.
 * Includes job description context and every question with its response
 * and AI feedback breakdown, in question order.
 */
function toHistoryDetail(session) {
  if (!session) return null;
  return {
    id: session.id,
    session_title: session.session_title,
    status: session.status,
    session_kind: session.session_kind ?? 'interview',
    started_at: toISO(session.started_at),
    completed_at: toISO(session.completed_at),
    duration_seconds: session.duration_seconds,
    total_questions: session.total_questions,
    questions_answered: session.questions_answered,
    overall_score: session.overall_score,
    is_archived: session.is_archived,
    notes: session.notes ?? null,
    job_description: session.job_descriptions
      ? {
          id: session.job_descriptions.id,
          title: session.job_descriptions.title,
          company_name: session.job_descriptions.company_name,
          required_experience_level: session.job_descriptions.required_experience_level,
          industry: session.job_descriptions.industry,
          key_skills: session.job_descriptions.key_skills,
        }
      : null,
    questions: (session.questions || []).map(mapQuestion),
  };
}

/**
 * GET /history/stats response shape.
 */
function toHistoryStats(stats) {
  if (!stats) return null;
  return {
    total_sessions: stats.total_sessions ?? 0,
    scored_sessions: stats.scored_sessions ?? 0,
    average_score: stats.average_score ?? null,
  };
}

/**
 * PATCH /history/:id/archive response shape.
 */
function toArchiveView(row) {
  if (!row) return null;
  return {
    id: row.id,
    is_archived: row.is_archived,
  };
}

/**
 * PATCH /history/:id/notes response shape.
 */
function toNotesView(row) {
  if (!row) return null;
  return {
    id: row.id,
    notes: row.notes ?? null,
  };
}

export {
  toHistorySummary,
  toHistoryListResponse,
  toHistoryDetail,
  toHistoryStats,
  toArchiveView,
  toNotesView,
};

export default {
  toHistorySummary,
  toHistoryListResponse,
  toHistoryDetail,
  toHistoryStats,
  toArchiveView,
  toNotesView,
};