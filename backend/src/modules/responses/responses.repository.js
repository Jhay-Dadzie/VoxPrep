import { getSupabaseAdmin } from '../../config/supabase.js';
import AppError from '../../core/errors/appError.js';
import NotFoundError from '../../core/errors/notFoundError.js';

function fail(action, error) {
  console.error(`[responses] ${action} failed`, error);
  throw new AppError(`Could not ${action}.`, 500);
}

/**
 * Load a question with the session and source document it belongs to.
 *
 * Scoring needs the original job description or syllabus for context, and the
 * session gives us the user_id that user_responses requires.
 */
export async function getQuestionContext(questionId) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('interview_questions')
    .select(
      `id, question_number, question_text, question_type, difficulty_level,
       ideal_answer_guidelines, session_id,
       interview_sessions!inner ( id, user_id, total_questions, job_descriptions ( job_content ) )`,
    )
    .eq('id', questionId)
    .maybeSingle();

  if (error) fail('load the question', error);
  if (!data) throw new NotFoundError('That question does not exist.');

  const session = data.interview_sessions;

  return {
    question: {
      id: data.id,
      question_number: data.question_number,
      question_text: data.question_text,
      question_type: data.question_type,
      difficulty_level: data.difficulty_level,
      ideal_answer_guidelines: data.ideal_answer_guidelines,
    },
    sessionId: data.session_id,
    userId: session.user_id,
    source: session.job_descriptions?.job_content ?? '',
    /**
     * Follow-ups are appended past the planned question count, so a number
     * above it identifies one without needing an extra column. Used to stop a
     * follow-up earning another follow-up, which would chain without end.
     */
    isFollowUp: data.question_number > (session.total_questions ?? 0),
  };
}

export async function saveResponse({
  questionId,
  sessionId,
  userId,
  transcribedText,
  durationSeconds,
  confidence,
}) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('user_responses')
    .insert({
      question_id: questionId,
      session_id: sessionId,
      user_id: userId,
      transcribed_text: transcribedText,
      response_duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
      transcription_confidence: confidence,
    })
    .select('id')
    .single();

  if (error) fail('save the answer', error);

  // Nothing else maintains this counter — no trigger covers user_responses —
  // so the dashboard read 0 answered for every session until now.
  await refreshAnsweredCount(sessionId);

  return data.id;
}

/**
 * Recount answered questions for a session.
 *
 * Counts distinct questions rather than incrementing, so re-recording an answer
 * does not inflate the total.
 */
async function refreshAnsweredCount(sessionId) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('user_responses')
    .select('question_id')
    .eq('session_id', sessionId);

  if (error) {
    // Not worth failing the save over a counter.
    console.error('[responses] could not recount answered questions', error);
    return;
  }

  const answered = new Set((data ?? []).map((r) => r.question_id)).size;

  const { error: updateError } = await db
    .from('interview_sessions')
    .update({ questions_answered: answered })
    .eq('id', sessionId);

  if (updateError) console.error('[responses] could not update answered count', updateError);
}

/**
 * Store the scored feedback.
 *
 * feedback has UNIQUE(response_id), so a retry upserts rather than colliding.
 */
export async function saveFeedback({ responseId, sessionId, questionId, scores }) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('feedback')
    .upsert(
      { response_id: responseId, session_id: sessionId, question_id: questionId, ...scores },
      { onConflict: 'response_id' },
    )
    .select('id')
    .single();

  if (error) fail('save the feedback', error);
  return data.id;
}

/**
 * Persist an adaptive follow-up as a real question.
 *
 * Without this the follow-up exists only in client memory, has no id, and the
 * answer to it cannot be attached to anything — which surfaced as "this
 * session was not saved" the moment a follow-up was answered.
 *
 * It takes the next question_number in the session so ordering stays sane;
 * the index is not unique, so appending is safe.
 */
export async function insertFollowUpQuestion({ sessionId, followUp }) {
  const db = getSupabaseAdmin()

  const { data: last, error: lastError } = await db
    .from('interview_questions')
    .select('question_number')
    .eq('session_id', sessionId)
    .order('question_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastError) fail('position the follow-up question', lastError)

  const { data, error } = await db
    .from('interview_questions')
    .insert({
      session_id: sessionId,
      question_number: (last?.question_number ?? 0) + 1,
      question_text: followUp.question_text,
      question_type: followUp.question_type,
      difficulty_level: followUp.difficulty_level,
      ai_model_used: followUp.ai_model_used ?? null,
    })
    .select('id, question_number, question_text, question_type, difficulty_level')
    .single()

  if (error) fail('save the follow-up question', error)
  return data
}

/** Mark the session finished. A trigger recomputes the overall score. */
export async function completeSession({ sessionId, durationSeconds }) {
  const db = getSupabaseAdmin();

  const { error } = await db
    .from('interview_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
    })
    .eq('id', sessionId);

  if (error) fail('complete the session', error);
}

/** Everything the results screen needs for one finished session. */
export async function getSessionResults(sessionId) {
  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from('interview_sessions')
    .select(
      `id, status, total_questions, questions_answered, overall_score,
       started_at, completed_at, duration_seconds,
       interview_questions ( id, question_number, question_text, question_type ),
       user_responses ( id, question_id, transcribed_text, response_duration_seconds ),
       feedback ( question_id, relevance_score, clarity_score, confidence_score,
                  completeness_score, overall_response_score,
                  strengths, improvements, suggestions, follow_up_tip )`,
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) fail('load the session results', error);
  if (!data) throw new NotFoundError('That session does not exist.');

  return data;
}
