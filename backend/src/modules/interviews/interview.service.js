import { getSupabaseAdminClient } from '../../config/supabase.js';
import { createSessionQuestions } from '../questions/question.service.js';
import audioService from '../speech/audio.service.js';

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

  const { data, error } = await supabase
    .from('interview_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: durationSeconds
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
  submitAnswer
};
