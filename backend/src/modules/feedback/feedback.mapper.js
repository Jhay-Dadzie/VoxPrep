/**
 * Feedback Mapper
 * Transforms raw feedback rows (and derived summaries) into the
 * API response shapes. Nothing from the DB should reach the client unless
 * it passes through here.
 */

function parseMaybeJson(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function parseTextList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }

  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }

  return String(value)
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFeedbackResponse(row) {
  if (!row) return null;

  const meta = parseMaybeJson(row.suggestions);
  const strengths = parseTextList(row.strengths);
  const improvements = parseTextList(row.improvements);
  const errorMessage = meta?.error_message ?? null;
  return {
    id: row.id,
    response_id: row.response_id,
    question_id: row.question_id,
    session_id: row.session_id,
    scores: {
      relevance: row.relevance_score,
      completeness: row.completeness_score,
      technical_accuracy: row.technical_accuracy_score ?? meta?.technical_accuracy_score ?? null,
      clarity: row.clarity_score,
      confidence: row.confidence_score,
      overall: row.overall_score ?? row.overall_response_score ?? null,
    },
    strengths,
    improvements,
    summary: meta?.summary ?? row.summary ?? '',
    status: row.generation_status ?? (errorMessage ? 'failed' : 'completed'),
    error_message: errorMessage,
    question: row.interview_questions
      ? {
          text: row.interview_questions.question_text,
          number: row.interview_questions.question_number,
          type: row.interview_questions.question_type,
        }
      : undefined,
    generated_at: row.generated_at ?? row.created_at,
    updated_at: row.updated_at ?? null,
  };
}

function toFeedbackListResponse(rows) {
  return (rows || []).map(toFeedbackResponse);
}

function toSessionSummaryResponse(summary) {
  return {
    session_id: summary.session_id,
    progress: {
      total_questions: summary.total_questions,
      questions_answered: summary.questions_answered,
      feedback_generated: summary.feedback_generated,
      feedback_failed: summary.feedback_failed,
    },
    scores:
      summary.aggregate.response_count === 0
        ? null
        : {
            relevance: summary.aggregate.relevance_score,
            completeness: summary.aggregate.completeness_score,
            technical_accuracy: summary.aggregate.technical_accuracy_score,
            clarity: summary.aggregate.clarity_score,
            confidence: summary.aggregate.confidence_score,
            overall: summary.aggregate.overall_score,
          },
  };
}

function toGenerateSummaryResponse(result) {
  return {
    generated: result.generated,
    failed: result.failed,
    skipped: result.skipped,
    // Written by the session-wide grader: how the interview went as a whole,
    // which no single response's feedback can say. Null on a skipped run.
    session_summary: result.session_summary ?? null,
    feedback: toFeedbackListResponse(result.feedback),
  };
}

export { toFeedbackResponse, toFeedbackListResponse, toSessionSummaryResponse, toGenerateSummaryResponse };

export default {
  toFeedbackResponse,
  toFeedbackListResponse,
  toSessionSummaryResponse,
  toGenerateSummaryResponse,
};
