// src/modules/interviews/interviewSession.mapper.js
export const mapSessionToResponse = (session) => ({
  id: session.id,
  session_title: session.session_title,
  status: session.status,
  job_description_id: session.job_description_id,
  total_questions: session.total_questions,
  questions_answered: session.questions_answered,
  overall_score: session.overall_score,
  started_at: session.started_at,
  completed_at: session.completed_at,
  duration_seconds: session.duration_seconds,
  is_archived: session.is_archived,
  notes: session.notes
});

export const mapQuestionWithResponse = (question) => {
  const response = question.user_responses?.[0] || null;
  return {
    id: question.id,
    question_text: question.question_text,
    question_number: question.question_number,
    question_type: question.question_type,
    difficulty_level: question.difficulty_level,
    ideal_answer_guidelines: question.ideal_answer_guidelines,
    generated_at: question.generated_at,
    ai_model_used: question.ai_model_used,
    response: response ? {
      id: response.id,
      transcribed_text: response.transcribed_text,
      audio_url: response.original_audio_url,
      response_duration_seconds: response.response_duration_seconds,
      transcription_confidence: response.transcription_confidence,
      responded_at: response.response_created_at
    } : null
  };
};

export const mapSessionDetailToResponse = (session) => ({
  id: session.id,
  session_title: session.session_title,
  status: session.status,
  started_at: session.started_at,
  completed_at: session.completed_at,
  duration_seconds: session.duration_seconds,
  total_questions: session.total_questions,
  questions_answered: session.questions_answered,
  overall_score: session.overall_score,
  is_archived: session.is_archived,
  notes: session.notes,
  job_description: session.job_descriptions ? {
    id: session.job_descriptions.id,
    title: session.job_descriptions.title,
    company_name: session.job_descriptions.company_name,
    required_experience_level: session.job_descriptions.required_experience_level,
    industry: session.job_descriptions.industry,
    key_skills: session.job_descriptions.key_skills
  } : null,
  questions: (session.questions || []).map(mapQuestionWithResponse)
});

export const mapSessionListToResponse = (sessions, pagination) => ({
  data: sessions.map(s => ({
    id: s.id,
    session_title: s.session_title,
    status: s.status,
    job_title: s.job_descriptions?.title,
    company_name: s.job_descriptions?.company_name,
    total_questions: s.total_questions,
    questions_answered: s.questions_answered,
    overall_score: s.overall_score,
    started_at: s.started_at,
    completed_at: s.completed_at,
    duration_seconds: s.duration_seconds
  })),
  pagination
});

export default {
  mapSessionToResponse,
  mapSessionDetailToResponse,
  mapSessionListToResponse,
  mapQuestionWithResponse
};
