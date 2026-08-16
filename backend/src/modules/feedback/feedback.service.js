/**
 * Feedback Service
 *
 * Owns all database interaction for the `response_feedback` table and
 * orchestrates AI grading.
 *
 * Design decisions (matching established codebase conventions):
 *  - Uses getSupabaseAdminClient() + explicit user_id filtering, same as
 *    interview.service.js and jobDescription.service.js.
 *  - Check-then-write upsert instead of Supabase's native .upsert(), same
 *    rationale as user.service.js / responses module: portability over
 *    convenience.
 *  - Feedback is graded per SESSION, not per response, once the interview is
 *    over (product decision) — this lets the model see a complete, stable
 *    conversation rather than grading answers one at a time. In a
 *    semi-structured interview that is not a nicety: most questions are
 *    follow-ups, so an answer read in isolation is missing its own context.
 *  - The whole session is one model call, on a model reserved for grading.
 *    See session.assessor.js for the rate-limit reasoning.
 *  - A response the model failed to grade is isolated (stored as a 'failed'
 *    row) so it can never take down the rest of the session's results.
 */

import { getSupabaseAdminClient } from '../../config/supabase.js';
import { generateFeedback } from './feedback.generator.js';
import { assessSession } from './session.assessor.js';
import { normalizeFeedback, computeSessionAggregate } from './scoring.engine.js';
import { hasRealAnswer } from '../../core/utils/helpers.js';
import { AppError } from '../../core/errors/appError.js';
import { error as _error, info } from '../../core/errors/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FEEDBACK_TABLE = 'feedback';

let supabase;
const getSupabase = () => {
  if (!supabase) supabase = getSupabaseAdminClient();
  return supabase;
};

function parseStoredMetadata(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildFeedbackMetadata({ summary, technical_accuracy_score, error_message = null }) {
  return JSON.stringify({
    summary: summary ?? '',
    technical_accuracy_score: technical_accuracy_score ?? null,
    error_message,
  });
}

function hydrateStoredFeedbackRow(row) {
  const meta = parseStoredMetadata(row?.suggestions);
  const errorMessage = row?.error_message ?? meta?.error_message ?? null;

  return {
    ...row,
    overall_score: row?.overall_score ?? row?.overall_response_score ?? null,
    technical_accuracy_score: row?.technical_accuracy_score ?? meta?.technical_accuracy_score ?? null,
    summary: meta?.summary ?? '',
    generation_status: errorMessage ? 'failed' : 'completed',
    error_message: errorMessage,
  };
}

function toAggregateRow(row) {
  const hydrated = hydrateStoredFeedbackRow(row);
  return {
    relevance_score: hydrated.relevance_score ?? null,
    completeness_score: hydrated.completeness_score ?? null,
    technical_accuracy_score: hydrated.technical_accuracy_score ?? null,
    clarity_score: hydrated.clarity_score ?? null,
    confidence_score: hydrated.confidence_score ?? null,
    overall_score: hydrated.overall_score ?? null,
  };
}

function buildPersistedPayload(basePayload, normalized, model, errorMessage = null) {
  const now = new Date().toISOString();

  return {
    ...basePayload,
    relevance_score: normalized.relevance_score,
    completeness_score: normalized.completeness_score,
    clarity_score: normalized.clarity_score,
    confidence_score: normalized.confidence_score,
    overall_response_score: normalized.overall_score,
    strengths: JSON.stringify(normalized.strengths || []),
    improvements: JSON.stringify(normalized.improvements || []),
    suggestions: buildFeedbackMetadata({
      summary: normalized.summary,
      technical_accuracy_score: normalized.technical_accuracy_score,
      error_message: errorMessage,
    }),
    follow_up_tip: normalized.improvements?.[0] ?? null,
    ai_model_used: model,
    generated_at: now,
  };
}

async function fetchSessionForUser(sessionId, userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('id, user_id, status, total_questions, questions_answered, job_description_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    throw new AppError('Interview session not found', 404);
  }
  return data;
}

async function fetchJobContext(jobDescriptionId, userId) {
  if (!jobDescriptionId) return null;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('job_descriptions')
    .select('title, company_name, industry, required_experience_level, job_content')
    .eq('id', jobDescriptionId)
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
}

/**
 * Responses for a session that are worth (re)grading: has an answer, and
 * either has no feedback row yet or its existing row is 'failed'.
 * `force=true` also re-includes rows already 'completed'.
 */
async function fetchGradableResponses(sessionId, force) {
  const supabase = getSupabase();

  const { data: responses, error } = await supabase
    .from('user_responses')
    .select(
      `id, question_id, session_id, user_id, transcribed_text, response_created_at,
       interview_questions ( id, question_number, question_text, question_type, difficulty_level, ideal_answer_guidelines )`
    )
    .eq('session_id', sessionId);

  if (error) throw new AppError('Failed to load responses for feedback generation', 500);

  const responseIds = (responses || []).map((r) => r.id);
  if (responseIds.length === 0) return [];

  const { data: existingFeedback } = await supabase
    .from(FEEDBACK_TABLE)
    .select('response_id, suggestions')
    .in('response_id', responseIds);

  const feedbackByResponse = new Map(
    (existingFeedback || []).map((f) => [f.response_id, hydrateStoredFeedbackRow(f)])
  );

  return (responses || [])
    .filter((r) => {
      // Nothing to grade — including a row still holding the pre-transcription
      // placeholder, which would otherwise be graded as if it were an answer.
      if (!hasRealAnswer(r.transcribed_text)) return false;
      const existing = feedbackByResponse.get(r.id);
      if (!existing) return true;
      if (force) return true;
      return existing.generation_status === 'failed';
    })
    // Interview order, so the grader reads the conversation as it happened and
    // a follow-up lands after the answer it follows up on.
    .sort((a, b) => (a.interview_questions?.question_number ?? 0) - (b.interview_questions?.question_number ?? 0));
}

/**
 * Check-then-write upsert on response_id — mirrors the pattern already
 * established in the responses module rather than relying on Supabase's
 * native .upsert() (portability over convenience).
 */
async function upsertFeedbackRow(payload) {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from(FEEDBACK_TABLE)
    .select('id')
    .eq('response_id', payload.response_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from(FEEDBACK_TABLE)
      .update({ ...payload, generated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase.from(FEEDBACK_TABLE).insert(payload).select().single();
  if (error) throw error;
  return data;
}

/** Zero-scored payload used when a response could not be graded at all. */
const EMPTY_NORMALIZED = {
  relevance_score: 0,
  completeness_score: 0,
  technical_accuracy_score: 0,
  clarity_score: 0,
  confidence_score: 0,
  overall_score: 0,
  strengths: [],
  improvements: [],
  summary: '',
};

const basePayloadFor = (response) => ({
  response_id: response.id,
  session_id: response.session_id,
  question_id: response.question_id,
});

/**
 * Persist one graded answer from a session-wide assessment.
 *
 * A null entry means the model returned nothing for this answer while grading
 * the others successfully. That is stored as a failed row rather than dropped,
 * so the results screen shows an ungraded answer instead of silently omitting
 * one the candidate gave.
 */
async function storeAssessedResponse(response, entry, model) {
  let payload;

  try {
    if (!entry) throw new Error('The assessment did not cover this answer');
    payload = buildPersistedPayload(basePayloadFor(response), normalizeFeedback(entry), model);
  } catch (err) {
    payload = buildPersistedPayload(
      basePayloadFor(response),
      EMPTY_NORMALIZED,
      model,
      (err.message || 'Unusable assessment entry').slice(0, 500)
    );
  }

  const persisted = await upsertFeedbackRow(payload);
  return hydrateStoredFeedbackRow(persisted);
}

/**
 * Generate + persist feedback for exactly one response. Never throws on
 * AI/parsing failure — instead persists a 'failed' row with an error_message
 * so one bad response can't take down a whole session's batch run.
 */
async function generateAndStoreFeedbackForResponse(response, jobContext) {
  const question = response.interview_questions;
  
  const basePayload = {
    response_id: response.id,
    session_id: response.session_id,
    question_id: response.question_id,
  };

  try {
    const { raw, model, processingTimeMs } = await generateFeedback({
      questionText: question?.question_text,
      questionType: question?.question_type,
      difficultyLevel: question?.difficulty_level,
      idealAnswerGuidelines: question?.ideal_answer_guidelines,
      answerText: response.transcribed_text,
      jobTitle: jobContext?.title,
      companyName: jobContext?.company_name,
      industry: jobContext?.industry,
      experienceLevel: jobContext?.required_experience_level,
      jobContent: jobContext?.job_content,
    });

    const normalized = normalizeFeedback(raw);
    const persisted = await upsertFeedbackRow(buildPersistedPayload(basePayload, normalized, model));

    return {
      ...hydrateStoredFeedbackRow(persisted),
      processing_time_ms: processingTimeMs,
      generation_status: 'completed',
      error_message: null,
    };
  } catch (err) {
    _error(`Feedback generation failed for response ${response.id}:`, err);
    const errorMessage = (err.message || 'Unknown error').slice(0, 500);
    const persisted = await upsertFeedbackRow(
      buildPersistedPayload(
        basePayload,
        {
          relevance_score: 0,
          completeness_score: 0,
          technical_accuracy_score: 0,
          clarity_score: 0,
          confidence_score: 0,
          overall_score: 0,
          strengths: [],
          improvements: [],
          summary: '',
        },
        null,
        errorMessage
      )
    );

    return {
      ...hydrateStoredFeedbackRow(persisted),
      processing_time_ms: null,
      generation_status: 'failed',
      error_message: errorMessage,
    };
  }
}

async function updateSessionOverallScore(sessionId) {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from(FEEDBACK_TABLE)
    .select(
      'overall_response_score, relevance_score, completeness_score, technical_accuracy_score, clarity_score, confidence_score, suggestions'
    )
    .eq('session_id', sessionId);

  const aggregate = computeSessionAggregate((rows || []).map(toAggregateRow));
  if (aggregate.response_count === 0) return;

  await supabase.from('interview_sessions').update({ overall_score: aggregate.overall_score }).eq('id', sessionId);
}

// ─── Public service API ────────────────────────────────────────────────────────

/**
 * Grade every answered question in a session.
 *
 * Guard: at least one answer must exist. It deliberately does NOT require every
 * question to be answered — a semi-structured interview ends when the
 * interviewer closes or the candidate stops, so the last question is routinely
 * asked and never answered, and refusing to grade a session for that reason
 * would cost the candidate the results for everything they did answer.
 *
 * The whole session is graded in one model call. If that call fails, every
 * response is marked failed rather than left ungraded, so `force` can retry
 * them all later.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {{ force?: boolean }} [options]
 */
async function generateSessionFeedback(sessionId, userId, { force = false } = {}) {
  const session = await fetchSessionForUser(sessionId, userId);

  if (session.total_questions === 0) {
    throw new AppError('Session has no questions to grade', 400);
  }

  if (session.questions_answered === 0) {
    throw new AppError('This session has no answers to grade', 400);
  }

  const gradable = await fetchGradableResponses(sessionId, force);

  if (gradable.length === 0) {
    const existing = await getSessionFeedback(sessionId, userId);
    return { generated: 0, failed: 0, skipped: true, feedback: existing };
  }

  const jobContext = await fetchJobContext(session.job_description_id, userId);

  let assessment = null;
  let assessmentError = null;

  try {
    assessment = await assessSession({
      answers: gradable.map((response) => ({
        questionText: response.interview_questions?.question_text,
        questionType: response.interview_questions?.question_type,
        difficultyLevel: response.interview_questions?.difficulty_level,
        idealAnswerGuidelines: response.interview_questions?.ideal_answer_guidelines,
        answerText: response.transcribed_text,
      })),
      jobTitle: jobContext?.title,
      companyName: jobContext?.company_name,
      industry: jobContext?.industry,
      experienceLevel: jobContext?.required_experience_level,
      jobContent: jobContext?.job_content,
    });
  } catch (err) {
    _error(`Session assessment failed for session ${sessionId}:`, err);
    assessmentError = (err.message || 'Unknown error').slice(0, 500);
  }

  const settled = await Promise.allSettled(
    gradable.map((response, index) =>
      assessment
        ? storeAssessedResponse(response, assessment.raw[index], assessment.model)
        : upsertFeedbackRow(
            buildPersistedPayload(basePayloadFor(response), EMPTY_NORMALIZED, null, assessmentError)
          ).then(hydrateStoredFeedbackRow)
    )
  );

  const feedback = settled.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const failed = feedback.filter((f) => f.generation_status === 'failed').length;
  const generated = feedback.length - failed;

  await updateSessionOverallScore(sessionId);

  info(
    `Session ${sessionId}: graded ${generated} responses, ${failed} failed ` +
    `(1 call to ${assessment?.model ?? 'assessment model'})`
  );

  return {
    generated,
    failed,
    skipped: false,
    feedback,
    session_summary: assessment?.sessionSummary ?? null,
  };
}

async function getFeedbackByResponseId(responseId, userId) {
  const supabase = getSupabase();
  const { data: response, error: responseError } = await supabase
    .from('user_responses')
    .select('id, session_id, interview_sessions!inner ( user_id )')
    .eq('id', responseId)
    .eq('interview_sessions.user_id', userId)
    .single();

  if (responseError || !response) {
    throw new AppError('Feedback not found for this response', 404);
  }

  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select('*')
    .eq('response_id', responseId)
    .maybeSingle();

  if (error) throw new AppError('Failed to retrieve feedback', 500);
  if (!data) throw new AppError('Feedback not found for this response', 404);
  return hydrateStoredFeedbackRow(data);
}

async function getSessionFeedback(sessionId, userId) {
  // Ownership check first (throws 404 if session isn't the caller's).
  await fetchSessionForUser(sessionId, userId);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(FEEDBACK_TABLE)
    .select(`*, interview_questions ( question_text, question_number, question_type )`)
    .eq('session_id', sessionId)
    .order('generated_at', { ascending: true });

  if (error) throw new AppError('Failed to retrieve session feedback', 500);
  return (data || []).map(hydrateStoredFeedbackRow);
}

async function getSessionFeedbackSummary(sessionId, userId) {
  const session = await fetchSessionForUser(sessionId, userId);
  const feedback = await getSessionFeedback(sessionId, userId);
  const completed = feedback.filter((f) => f.generation_status === 'completed');
  const aggregate = computeSessionAggregate(completed);

  return {
    session_id: session.id,
    total_questions: session.total_questions,
    questions_answered: session.questions_answered,
    feedback_generated: completed.length,
    feedback_failed: feedback.filter((f) => f.generation_status === 'failed').length,
    aggregate,
  };
}

async function regenerateFeedback(responseId, userId) {
  const supabase = getSupabase();
  const { data: response, error } = await supabase
    .from('user_responses')
    .select(
      `id, question_id, session_id, user_id, transcribed_text,
       interview_questions ( id, question_text, question_type, difficulty_level, ideal_answer_guidelines ),
       interview_sessions!inner ( job_description_id, user_id )`
    )
    .eq('id', responseId)
    .eq('user_id', userId)
    .single();

  if (error || !response) throw new AppError('Response not found', 404);
  if (!response.transcribed_text || !response.transcribed_text.trim()) {
    throw new AppError('Response has no transcribed answer to grade', 400);
  }

  const jobContext = await fetchJobContext(response.interview_sessions?.job_description_id, userId);
  const feedback = await generateAndStoreFeedbackForResponse(response, jobContext);

  await updateSessionOverallScore(response.session_id);

  return feedback;
}

export {
  generateSessionFeedback,
  getFeedbackByResponseId,
  getSessionFeedback,
  getSessionFeedbackSummary,
  regenerateFeedback,
};

export default {
  generateSessionFeedback,
  getFeedbackByResponseId,
  getSessionFeedback,
  getSessionFeedbackSummary,
  regenerateFeedback,
};
