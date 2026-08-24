import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient } from '../../config/supabase.js';
import { GEMINI_MODEL } from '../../config/gemini.js';
import { runQuery } from '../../core/utils/supabaseQuery.js';
import { createJobDescription } from '../jobDescription/jobDescription.service.js';
import { generateExamQuestions } from '../ai/generators/exam.generator.js';
import { isWrittenMode, resolvePaper } from '../interviews/modes.js';

/** The written mode a paper is set with, whatever the client asked for. */
const EXAM_MODE = 'exam';

/**
 * Written exams.
 *
 * The interview modules run a conversation: a question is composed from what was
 * just said, spoken, answered, and only judged at the end by a model. An exam is
 * the opposite in every one of those respects — the whole paper is written
 * before the student sees question one, the answers are choices rather than
 * speech, and the marking is arithmetic that owes nothing to a model.
 *
 * That is why this is its own module rather than a branch inside
 * interview.service.js. What the two share is the session: an exam is an
 * `interview_sessions` row with `session_kind = 'exam'`, so it lands in history,
 * counts towards the dashboard totals, and carries a score out of 100 like
 * anything else.
 *
 * ── The one invariant worth naming ──────────────────────────────────────────
 *
 * The correct option and its explanation must not leave the server until the
 * paper has been marked. Every read path here goes through one of two shapes:
 * `toSittingQuestion`, which cannot carry them, and `toMarkedQuestion`, which is
 * only ever reached for a completed session. There is no third path, and
 * nothing selects `*` from exam_questions.
 */

let supabase;

const getSupabase = () => {
  if (!supabase) supabase = getSupabaseAdminClient();
  return supabase;
};

/** Columns safe to send to a student who is still sitting the paper. */
const SITTING_COLUMNS = 'id, question_number, question_text, options, topic, difficulty_level';

/** Everything, including the marking scheme. Only for a marked paper. */
const MARKED_COLUMNS = `${SITTING_COLUMNS}, correct_option, explanation`;

const toSittingQuestion = (row, answer) => ({
  id: row.id,
  question_number: row.question_number,
  question_text: row.question_text,
  options: row.options,
  topic: row.topic,
  difficulty_level: row.difficulty_level,
  selected_option: answer?.selected_option ?? null,
});

const toMarkedQuestion = (row, answer) => ({
  ...toSittingQuestion(row, answer),
  correct_option: row.correct_option,
  explanation: row.explanation,
  is_correct: answer?.is_correct ?? false,
});

/** The user's own session, or null. Every read path starts here. */
const loadSession = async (sessionId, userId) => {
  const { data, error } = await getSupabase()
    .from('interview_sessions')
    .select(`
      id, status, session_kind, session_title, total_questions, questions_answered,
      overall_score, started_at, completed_at, duration_seconds,
      job_descriptions ( id, title, company_name, industry, key_skills )
    `)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.session_kind !== 'exam') return null;

  return data;
};

const loadAnswerMap = async (sessionId) => {
  const { data, error } = await getSupabase()
    .from('exam_answers')
    .select('question_id, selected_option, is_correct')
    .eq('session_id', sessionId);

  if (error) throw new Error(error.message);

  return new Map((data || []).map((answer) => [answer.question_id, answer]));
};

// ─────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────

/**
 * Source material in, a paper ready to sit out.
 *
 * Three writes with no transaction between them, so failure compensates by hand
 * the way prepareSession does: a paper that could not be written leaves neither
 * a session nor a job description behind for the user to find later and wonder
 * about.
 *
 * The model call is the slow part — two sequential batches for a thirty-question
 * paper — and it happens here rather than at first question, because a student
 * who has started an exam should not be waiting on generation mid-paper.
 */
export const prepareExam = async (
  userId,
  { jobContent, title, companyName, experienceLevel, industry, mode = EXAM_MODE, sessionTitle = null }
) => {
  const supabase = getSupabase();
  // A spoken mode id arriving here would set the paper with an interviewer's
  // persona and no paper shape at all, so it is corrected rather than honoured.
  const paperMode = isWrittenMode(mode) ? mode : EXAM_MODE;
  const paper = resolvePaper(paperMode);

  const jobDescription = await createJobDescription({
    user_id: userId,
    title,
    company_name: companyName,
    job_content: jobContent,
    required_experience_level: experienceLevel,
    industry,
  });

  let session;

  try {
    const questions = await generateExamQuestions(jobDescription, {
      questionCount: paper.questionCount,
      optionCount: paper.optionCount,
      mode: paperMode,
    });

    // Both writes below are retried if the connection drops, and both are made
    // safe to retry first. It matters here more than anywhere else in the app:
    // by this line the paper has already cost two minutes of generation, and
    // the socket to Supabase has been sitting idle for all of it — long past
    // the seconds a keep-alive connection is normally held open — so the first
    // request after generation is the one most likely to meet a dead socket.
    //
    // The id is ours rather than the database's so that a replay is an insert
    // of the same row rather than a second one; the delete before each replay
    // clears whatever a half-finished attempt left behind.
    const sessionId = randomUUID();

    session = await runQuery(
      'create the exam session',
      () =>
        supabase
          .from('interview_sessions')
          .insert({
            id: sessionId,
            user_id: userId,
            job_description_id: jobDescription.id,
            session_title: sessionTitle || `${jobDescription.title} - Exam`,
            session_kind: 'exam',
            status: 'in_progress',
            // The paper exists in full from this moment, so unlike an interview
            // the count is known up front rather than settled at the end.
            total_questions: questions.length,
            questions_answered: 0,
            started_at: new Date().toISOString(),
          })
          .select()
          .single(),
      {
        replaySafe: true,
        before: () => supabase.from('interview_sessions').delete().eq('id', sessionId),
      }
    );

    await runQuery(
      'save the exam questions',
      () =>
        supabase.from('exam_questions').insert(
          questions.map((question, index) => ({
            session_id: session.id,
            question_number: index + 1,
            question_text: question.question_text,
            options: question.options,
            correct_option: question.correct_option,
            explanation: question.explanation,
            topic: question.topic,
            difficulty_level: question.difficulty_level,
            ai_model_used: GEMINI_MODEL,
          }))
        ),
      {
        replaySafe: true,
        before: () => supabase.from('exam_questions').delete().eq('session_id', session.id),
      }
    );

    return {
      session,
      jobDescription,
      questionCount: questions.length,
      optionCount: paper.optionCount,
    };
  } catch (error) {
    // Order matters: the session cascades to any questions already written.
    if (session) await supabase.from('interview_sessions').delete().eq('id', session.id);
    await supabase.from('job_descriptions').delete().eq('id', jobDescription.id);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────
// Sitting the paper
// ─────────────────────────────────────────────────────────────────

/**
 * The paper as the student sees it: every question, their selections so far, and
 * no marking scheme.
 *
 * Also what a resumed exam reads — the selections live server-side rather than
 * in the client's memory, so closing the app mid-paper costs nothing.
 */
export const getExam = async (sessionId, userId) => {
  const session = await loadSession(sessionId, userId);
  if (!session) return null;

  const { data: questions, error } = await getSupabase()
    .from('exam_questions')
    .select(SITTING_COLUMNS)
    .eq('session_id', sessionId)
    .order('question_number', { ascending: true });

  if (error) throw new Error(error.message);

  const answers = await loadAnswerMap(sessionId);

  return {
    session,
    submitted: session.status === 'completed',
    questions: (questions || []).map((question) =>
      toSittingQuestion(question, answers.get(question.id))
    ),
  };
};

/**
 * Record — or change — the student's selection for one question.
 *
 * Upserted on question_id rather than appended: a student who changes their mind
 * on question 12 has one answer to question 12, not two.
 *
 * is_correct is deliberately left null. Marking happens once, at submission,
 * so nothing on the answer row can be read back as a hint mid-paper.
 */
export const saveAnswer = async (sessionId, questionId, userId, selectedOption) => {
  const supabase = getSupabase();

  const session = await loadSession(sessionId, userId);
  if (!session) throw new Error('Exam not found or access denied');
  if (session.status === 'completed') throw new Error('This exam has already been submitted');

  const { data: question, error: questionError } = await supabase
    .from('exam_questions')
    .select('id, options')
    .eq('id', questionId)
    .eq('session_id', sessionId)
    .maybeSingle();

  if (questionError) throw new Error(questionError.message);
  if (!question) throw new Error('Question not found on this exam');

  const option = String(selectedOption || '').trim().toUpperCase();
  const exists = (question.options || []).some((choice) => choice?.label === option);
  if (!exists) throw new Error('That option is not on this question');

  const { error: upsertError } = await supabase
    .from('exam_answers')
    .upsert(
      {
        question_id: questionId,
        session_id: sessionId,
        user_id: userId,
        selected_option: option,
        is_correct: null,
        answered_at: new Date().toISOString(),
      },
      { onConflict: 'question_id' }
    );

  if (upsertError) throw new Error(upsertError.message);

  const { count } = await supabase
    .from('exam_answers')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  await supabase
    .from('interview_sessions')
    .update({ questions_answered: count ?? 0 })
    .eq('id', sessionId);

  return { answeredCount: count ?? 0, totalQuestions: session.total_questions };
};

// ─────────────────────────────────────────────────────────────────
// Marking
// ─────────────────────────────────────────────────────────────────

/**
 * Mark the paper and close the session.
 *
 * Scored as a percentage of the whole paper, not of what was attempted: an
 * unanswered question is a mark not earned, which is how an exam works and the
 * one place this must not behave like the interview grader.
 *
 * Idempotent by way of the status check — a double-tapped submit button marks
 * once, and the second call reads the result back.
 */
export const submitExam = async (sessionId, userId) => {
  const supabase = getSupabase();

  const session = await loadSession(sessionId, userId);
  if (!session) throw new Error('Exam not found or access denied');
  if (session.status === 'completed') return getExamResult(sessionId, userId);

  const { data: questions, error } = await supabase
    .from('exam_questions')
    .select('id, correct_option')
    .eq('session_id', sessionId);

  if (error) throw new Error(error.message);
  if (!questions?.length) throw new Error('This exam has no questions to mark');

  const answers = await loadAnswerMap(sessionId);

  const marked = questions.map((question) => ({
    questionId: question.id,
    selected: answers.get(question.id)?.selected_option ?? null,
    isCorrect: answers.get(question.id)?.selected_option === question.correct_option,
  }));

  const attempted = marked.filter((row) => row.selected !== null);

  await Promise.all(
    attempted.map((row) =>
      supabase
        .from('exam_answers')
        .update({ is_correct: row.isCorrect })
        .eq('question_id', row.questionId)
    )
  );

  const correctCount = marked.filter((row) => row.isCorrect).length;
  const score = Math.round((correctCount / questions.length) * 10000) / 100;

  const durationSeconds = session.started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000))
    : null;

  const { error: closeError } = await supabase
    .from('interview_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      total_questions: questions.length,
      questions_answered: attempted.length,
      overall_score: score,
    })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (closeError) throw new Error(closeError.message);

  return getExamResult(sessionId, userId);
};

/**
 * The marked paper: score, counts, and every question with the student's choice,
 * the right one, and why it is right.
 *
 * Only reachable once the session is completed. An unmarked paper returns null
 * rather than a result with the answers in it.
 */
export const getExamResult = async (sessionId, userId) => {
  const session = await loadSession(sessionId, userId);
  if (!session || session.status !== 'completed') return null;

  const { data: questions, error } = await getSupabase()
    .from('exam_questions')
    .select(MARKED_COLUMNS)
    .eq('session_id', sessionId)
    .order('question_number', { ascending: true });

  if (error) throw new Error(error.message);

  const answers = await loadAnswerMap(sessionId);
  const marked = (questions || []).map((question) =>
    toMarkedQuestion(question, answers.get(question.id))
  );

  const correctCount = marked.filter((question) => question.is_correct).length;
  const answeredCount = marked.filter((question) => question.selected_option !== null).length;

  return {
    session,
    questions: marked,
    totals: {
      total: marked.length,
      correct: correctCount,
      // Wrong and unanswered are counted apart: they earn the same nothing, but
      // "you left six blank" and "you got six wrong" are different lessons.
      incorrect: answeredCount - correctCount,
      unanswered: marked.length - answeredCount,
      score: session.overall_score,
    },
  };
};

/**
 * Sit the same paper again.
 *
 * A fresh paper on the same material rather than a reset of this one: a marked
 * exam is a record, and clearing its answers would rewrite a result the student
 * has already seen. New questions also mean the retake tests the material rather
 * than the student's memory of which option was blue.
 */
export const retakeExam = async (sessionId, userId) => {
  const session = await loadSession(sessionId, userId);
  if (!session) throw new Error('Exam not found or access denied');

  const job = session.job_descriptions;
  if (!job?.id) {
    throw new Error('The source material for this exam is no longer available, so it cannot be retaken');
  }

  const { data: source, error } = await getSupabase()
    .from('job_descriptions')
    .select('title, company_name, job_content, required_experience_level, industry')
    .eq('id', job.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!source?.job_content) {
    throw new Error('The source material for this exam is no longer available, so it cannot be retaken');
  }

  return prepareExam(userId, {
    jobContent: source.job_content,
    title: source.title,
    companyName: source.company_name,
    experienceLevel: source.required_experience_level,
    industry: source.industry,
    sessionTitle: session.session_title,
  });
};

export default {
  prepareExam,
  getExam,
  saveAnswer,
  submitExam,
  getExamResult,
  retakeExam,
};
