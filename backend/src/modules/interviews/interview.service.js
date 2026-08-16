import { getSupabaseAdminClient } from '../../config/supabase.js';
import { GEMINI_MODEL } from '../../config/gemini.js';
import { createSessionQuestions } from '../questions/question.service.js';
import { createJobDescription } from '../jobDescription/jobDescription.service.js';
import { generateNextTurn } from '../ai/generators/interviewer.generator.js';
import { hasRealAnswer } from '../../core/utils/helpers.js';
import audioService from '../speech/audio.service.js';

/**
 * Hard ceiling on questions in one session. The interviewer is told this number
 * so it can pace itself, and the loop enforces it independently so a model that
 * never chooses to stop still cannot run forever.
 */
export const MAX_SESSION_QUESTIONS = 15;

/**
 * Below this, the interviewer is not allowed to end the session. An interview
 * that closes after two questions has nothing to grade, and the most common
 * cause is the model taking a thin answer as a signal to wrap up rather than a
 * signal to probe.
 */
export const MIN_SESSION_QUESTIONS = 5;

let supabase;

const getSupabase = () => {
  if (!supabase) supabase = getSupabaseAdminClient();
  return supabase;
};

const resolveOriginalAudioUrl = async (answerData) => {
  if (answerData.original_audio_url) return answerData.original_audio_url;
  if (answerData.audio_url) return answerData.audio_url;
  if (answerData.storage_path) return audioService.getSignedUrl(answerData.storage_path);
  return null;
};

// ─────────────────────────────────────────────────────────────────
// Session Lifecycle
// ─────────────────────────────────────────────────────────────────

export const createInterviewSession = async (userId, jobDescriptionId, sessionTitle = null) => {
  const supabase = getSupabase();

  // Optionally fetch job title for default session title
  let jobTitle = 'Interview';
  let companyName = '';
  if (jobDescriptionId) {
    const { data: job, error: jobError } = await supabase
      .from('job_descriptions')
      .select('title, company_name')
      .eq('id', jobDescriptionId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();

    if (jobError || !job) throw new Error('Job description not found or access denied');
    jobTitle = job.title;
    companyName = job.company_name || '';
  }

  const title = sessionTitle || `${jobTitle}${companyName ? ` at ${companyName}` : ''} - Interview`;

  const { data, error } = await supabase
    .from('interview_sessions')
    .insert({
      user_id: userId,
      job_description_id: jobDescriptionId || null,
      session_title: title,
      status: 'in_progress',   // sessions are created in_progress but not yet started (started_at = null)
      total_questions: 0,
      questions_answered: 0,
      started_at: null,        // will be set when start() is called
      completed_at: null
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
};

export const startSession = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .in('status', ['in_progress', 'paused'])  // can start if not completed
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found or cannot be started');
  return true;
};

export const pauseSession = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({ status: 'paused' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found or not in progress');
  return true;
};

export const continueSession = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({ status: 'in_progress' })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'paused')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found or not in a paused state');
  return true;
};

export const completeSession = async (sessionId, userId) => {
  const supabase = getSupabase();

  // Calculate duration only if started_at exists
  const { data: session } = await supabase
    .from('interview_sessions')
    .select('started_at')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  let durationSeconds = null;
  if (session && session.started_at) {
    const start = new Date(session.started_at);
    const end = new Date();
    durationSeconds = Math.floor((end - start) / 1000);
  }

  // A semi-structured interview does not know its own length until it ends —
  // it may close early or the candidate may stop. Settle the counters against
  // what actually happened so results and history do not report a session as
  // "8 of 15" when fifteen were never coming.
  const [{ count: askedCount }, { count: answeredCount }] = await Promise.all([
    supabase
      .from('interview_questions')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId),
    supabase
      .from('user_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId),
  ]);

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      total_questions: askedCount ?? 0,
      questions_answered: answeredCount ?? 0
    })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Session not found or already completed');
  return true;
};

export const deleteSession = async (sessionId, userId) => {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('interview_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return true;
};

// ─────────────────────────────────────────────────────────────────
// Session Retrieval
// ─────────────────────────────────────────────────────────────────

export const getInterviewSessions = async (userId, { page = 1, limit = 10, search = '' }) => {
  const supabase = getSupabase();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('interview_sessions')
    .select(`
      *,
      job_descriptions (
        title,
        company_name
      )
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('started_at', { ascending: false, nullsFirst: false });

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
      total: count,
      totalPages: Math.ceil(count / limit)
    }
  };
};

export const getInterviewSessionById = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select(`
      *,
      job_descriptions (
        id,
        title,
        company_name,
        job_content,
        key_skills,
        required_experience_level,
        industry
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError) return null;

  // Fetch questions with their responses (no feedback yet)
  const { data: questions, error: qError } = await supabase
    .from('interview_questions')
    .select(`
      *,
      user_responses (
        id,
        transcribed_text,
        original_audio_url,
        response_duration_seconds,
        transcription_confidence,
        response_created_at
      )
    `)
    .eq('session_id', sessionId)
    .order('question_number', { ascending: true });

  if (qError) throw new Error(qError.message);

  return { ...session, questions: questions || [] };
};

// ─────────────────────────────────────────────────────────────────
// Question & Answer Management (Manual, no AI)
// ─────────────────────────────────────────────────────────────────

export const addQuestionToSession = async (sessionId, userId, questionData) => {
  const supabase = getSupabase();

  // Verify session belongs to user and is not completed
  const { data: session, error: sessError } = await supabase
    .from('interview_sessions')
    .select('status, total_questions')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessError || !session) throw new Error('Session not found');
  if (session.status === 'completed') throw new Error('Cannot add questions to a completed session');

  const nextNumber = session.total_questions + 1;

  const { data, error } = await supabase
    .from('interview_questions')
    .insert({
      session_id: sessionId,
      question_text: questionData.question_text,
      question_number: nextNumber,
      question_type: questionData.question_type || 'general',
      difficulty_level: questionData.difficulty_level || 'medium',
      ideal_answer_guidelines: questionData.ideal_answer_guidelines || null
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update session total_questions counter
  await supabase
    .from('interview_sessions')
    .update({ total_questions: nextNumber })
    .eq('id', sessionId);

  return data;
};

export const generateSessionQuestions = async (sessionId, userId, options = {}) => {
  const supabase = getSupabase();

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError || !session) throw new Error('Session not found or access denied');

  return createSessionQuestions(sessionId, {
    supabaseClient: supabase,
    userId,
    jobData: options.jobData || null,
    questionCount: options.questionCount || 10
  });
};

/**
 * One-shot setup: source material in, ready-to-run session out.
 *
 * The client used to need two sequential calls (create job description → create
 * session) behind a single setup button, each with its own way of failing
 * half-way. That left orphans on a flaky mobile connection: a job description
 * with no session, which the user could see but not use.
 *
 * Postgres gives us no transaction across these writes through PostgREST, so
 * this compensates instead: anything created here is rolled back by hand if a
 * later step fails, and the caller sees one error with nothing left behind.
 *
 * No questions are written here. In a semi-structured interview the questions
 * do not exist until the interviewer asks them — see nextTurn().
 */
export const prepareSession = async (userId, { jobContent, title, companyName, experienceLevel, industry, mode = null, sessionTitle = null }) => {
  const supabase = getSupabase();
  const jobDescription = await createJobDescription({
    user_id: userId,
    title,
    company_name: companyName,
    job_content: jobContent,
    required_experience_level: experienceLevel,
    industry,
  });

  try {
    const session = await createInterviewSession(userId, jobDescription.id, sessionTitle);
    return { jobDescription, session, mode, maxQuestions: MAX_SESSION_QUESTIONS };
  } catch (error) {
    await supabase.from('job_descriptions').delete().eq('id', jobDescription.id);
    throw error;
  }
};

/**
 * Start a fresh run of an interview the user has already finished.
 *
 * A completed session cannot be reopened — it holds answers, a grade and a
 * place in history, and the API rejects further submissions to it. So a retake
 * is a new session pointed at the same job description, which is also what
 * makes the two comparable afterwards.
 *
 * Doing this server-side rather than sending the user back to the setup screen
 * is the whole point: they already supplied the source material once, and
 * asking for it again is what made "Retake" unusable.
 */
export const retakeSession = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data: original, error } = await supabase
    .from('interview_sessions')
    .select(`
      id, session_title, job_description_id,
      job_descriptions (
        id, title, company_name, key_skills,
        required_experience_level, industry
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (error || !original) throw new Error('Interview session not found or access denied');

  if (!original.job_description_id || !original.job_descriptions) {
    throw new Error('The source material for this session is no longer available, so it cannot be retaken');
  }

  const session = await createInterviewSession(
    userId,
    original.job_description_id,
    original.session_title
  );

  return {
    session,
    jobDescription: original.job_descriptions,
    maxQuestions: MAX_SESSION_QUESTIONS,
  };
};

// ─────────────────────────────────────────────────────────────────
// Live Interview Loop (semi-structured)
// ─────────────────────────────────────────────────────────────────

/**
 * Load everything one interviewer turn needs: the session, its source material,
 * and the conversation so far in order.
 */
const loadTurnContext = async (sessionId, userId) => {
  const supabase = getSupabase();

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select(`
      id, status, total_questions, questions_answered,
      job_descriptions (
        title, company_name, job_content, key_skills,
        required_experience_level, industry
      )
    `)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();

  if (sessionError || !session) throw new Error('Interview session not found or access denied');

  const { data: questions, error: questionsError } = await supabase
    .from('interview_questions')
    .select('id, question_number, question_text, question_type, difficulty_level, ideal_answer_guidelines, user_responses (transcribed_text)')
    .eq('session_id', sessionId)
    .order('question_number', { ascending: true });

  if (questionsError) throw new Error(questionsError.message);

  return { session, questions: questions || [] };
};

const toApiQuestion = (question) => ({
  id: question.id,
  question_number: question.question_number,
  question_text: question.question_text,
  question_type: question.question_type,
  difficulty_level: question.difficulty_level,
  ideal_answer_guidelines: question.ideal_answer_guidelines,
});

/**
 * Advance a live interview by one turn: decide what to ask next, store it, and
 * hand it back to be spoken.
 *
 * The questions of a semi-structured interview cannot be generated up front,
 * because each one depends on what the candidate just said. So a question is
 * written, persisted and returned in the same request — the row in
 * interview_questions is created at the moment the interviewer commits to
 * asking it, not before.
 *
 * Two properties this relies on:
 *
 *  - The transcript is the only state. Nothing about the interview's plan is
 *    cached between turns, so a resumed session, a retried request and a fresh
 *    one all produce the same behaviour from the same history.
 *
 *  - The call is idempotent while a question is outstanding. If the last stored
 *    question has no answer, it is returned again rather than a new one being
 *    generated. A client that retries after a dropped response gets the
 *    question it already has, instead of silently burning a turn.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {object} [options]
 * @param {string} [options.mode] - practice mode id; shapes the interviewer's persona
 * @param {number} [options.maxQuestions] - per-session cap, clamped to MAX_SESSION_QUESTIONS
 * @param {string} [options.candidateName]
 * @returns {Promise<{ done: boolean, question?: object, askedCount: number, maxQuestions: number, reason?: string, closingRemark?: string|null }>}
 */
export const nextTurn = async (sessionId, userId, { mode = null, maxQuestions, candidateName = null } = {}) => {
  const supabase = getSupabase();
  const cap = Math.min(Number(maxQuestions) || MAX_SESSION_QUESTIONS, MAX_SESSION_QUESTIONS);

  const { session, questions } = await loadTurnContext(sessionId, userId);

  if (session.status === 'completed') {
    throw new Error('This interview has already been completed');
  }

  const jobData = session.job_descriptions;
  if (!jobData?.job_content) {
    throw new Error('This session has no source material to interview from');
  }

  // A stored question with no usable answer means the last turn never
  // completed — either nothing was submitted, or the audio landed but
  // transcription did not.
  const outstanding = questions.find(
    (question) => !hasRealAnswer(question.user_responses?.[0]?.transcribed_text)
  );
  if (outstanding) {
    return {
      done: false,
      repeated: true,
      question: toApiQuestion(outstanding),
      askedCount: questions.length,
      maxQuestions: cap,
    };
  }

  const askedCount = questions.length;

  if (askedCount >= cap) {
    return { done: true, reason: 'limit', closingRemark: null, askedCount, maxQuestions: cap };
  }

  const turns = questions.map((question) => {
    const answer = question.user_responses?.[0]?.transcribed_text;
    return {
      question: question.question_text,
      question_type: question.question_type,
      answer: hasRealAnswer(answer) ? answer : null,
    };
  });

  const result = await generateNextTurn(jobData, {
    turns,
    maxQuestions: cap,
    mode,
    candidateName,
    // The model closing early is the one failure the transcript cannot recover
    // from, so a short interview refuses the close branch and asks again.
    forceAsk: askedCount < Math.min(MIN_SESSION_QUESTIONS, cap),
  });

  if (result.action === 'close') {
    return {
      done: true,
      reason: 'interviewer_closed',
      closingRemark: result.closingRemark,
      askedCount,
      maxQuestions: cap,
    };
  }

  const questionNumber = askedCount + 1;

  const { data: stored, error } = await supabase
    .from('interview_questions')
    .insert({
      session_id: sessionId,
      question_number: questionNumber,
      question_text: result.question.question_text,
      question_type: result.question.question_type,
      difficulty_level: result.question.difficulty_level,
      ideal_answer_guidelines: result.question.ideal_answer_guidelines,
      ai_model_used: GEMINI_MODEL,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from('interview_sessions')
    .update({ total_questions: questionNumber })
    .eq('id', sessionId);

  return {
    done: false,
    repeated: false,
    question: toApiQuestion(stored),
    askedCount: questionNumber,
    maxQuestions: cap,
  };
};

export const submitAnswer = async (sessionId, questionId, userId, answerData) => {
  const supabase = getSupabase();
  const originalAudioUrl = await resolveOriginalAudioUrl(answerData);

  // Verify question belongs to session and session belongs to user, session not completed
  const { data: question, error: qError } = await supabase
    .from('interview_questions')
    .select('*, interview_sessions!inner(user_id, status)')
    .eq('id', questionId)
    .eq('session_id', sessionId)
    .eq('interview_sessions.user_id', userId)
    .single();

  if (qError || !question) throw new Error('Question not found or access denied');
  if (question.interview_sessions.status === 'completed') throw new Error('Session already completed');

  // Check if answer already exists
  const { data: existingResponse } = await supabase
    .from('user_responses')
    .select('id')
    .eq('question_id', questionId)
    .maybeSingle();

  let responseId;
  if (existingResponse) {
    const { data: updated, error: updateError } = await supabase
      .from('user_responses')
      .update({
        transcribed_text: answerData.answer_text,
        original_audio_url: originalAudioUrl,
        response_duration_seconds: answerData.response_duration_seconds || null,
        transcription_confidence: answerData.transcription_confidence || null,
        response_created_at: new Date().toISOString()
      })
      .eq('id', existingResponse.id)
      .select('id')
      .single();
    if (updateError) throw new Error(updateError.message);
    responseId = existingResponse.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from('user_responses')
      .insert({
        question_id: questionId,
        session_id: sessionId,
        user_id: userId,
        transcribed_text: answerData.answer_text,
        original_audio_url: originalAudioUrl,
        response_duration_seconds: answerData.response_duration_seconds || null,
        transcription_confidence: answerData.transcription_confidence || null
      })
      .select('id')
      .single();
    if (insertError) throw new Error(insertError.message);
    responseId = inserted.id;
  }

  // Count answered questions for this session
  const { count: answeredCount } = await supabase
    .from('user_responses')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  await supabase
    .from('interview_sessions')
    .update({ questions_answered: answeredCount })
    .eq('id', sessionId);

  return { responseId };
};

export default {
  createInterviewSession,
  startSession,
  pauseSession,
  continueSession,
  completeSession,
  deleteSession,
  getInterviewSessions,
  getInterviewSessionById,
  addQuestionToSession,
  generateSessionQuestions,
  prepareSession,
  retakeSession,
  nextTurn,
  submitAnswer,
  MAX_SESSION_QUESTIONS,
  MIN_SESSION_QUESTIONS
};
