import { getSupabaseAdminClient, getSupabaseClientForToken } from "../../config/supabase.js";
import { OPENAI_MODEL } from "../../config/openai.js";
import { generateQuestions } from "../ai/generators/question.generator.js";

const getReadSupabase = ({ supabaseClient, accessToken }) => {
  if (supabaseClient) return supabaseClient;
  if (accessToken) return getSupabaseClientForToken(accessToken);
  return getSupabaseAdminClient();
};

const fetchJobData = async (supabase, sessionId, userId = null) => {
  let sessionQuery = supabase
    .from("interview_sessions")
    .select("id, job_description_id, total_questions, status, user_id")
    .eq("id", sessionId);

  if (userId) {
    sessionQuery = sessionQuery.eq("user_id", userId);
  }

  const { data: session, error: sessionError } = await sessionQuery.single();

  if (sessionError || !session) {
    throw new Error("Interview session not found or access denied");
  }

  if (!session.job_description_id) {
    return { session, jobData: null };
  }

  let jobQuery = supabase
    .from("job_descriptions")
    .select("title, company_name, job_content, key_skills, required_experience_level, industry")
    .eq("id", session.job_description_id);

  if (userId) {
    jobQuery = jobQuery.eq("user_id", userId);
  }

  const { data: jobData, error: jobError } = await jobQuery.single();

  if (jobError || !jobData) {
    throw new Error("Job description not found or access denied");
  }

  return { session, jobData };
};

/**
 * Generate and store questions for a session
 */
export const createSessionQuestions = async (sessionId, options = {}) => {
  const {
    accessToken = null,
    supabaseClient = null,
    userId = null,
    jobData = null,
    questionCount = 10,
    mode = null,
  } = options;

  const readSupabase = getReadSupabase({ supabaseClient, accessToken });
  const writeSupabase = getSupabaseAdminClient();

  const sessionPayload = jobData
    ? await (async () => {
        let sessionQuery = readSupabase
          .from("interview_sessions")
          .select("id, total_questions, status, job_description_id, user_id")
          .eq("id", sessionId);

        if (userId) {
          sessionQuery = sessionQuery.eq("user_id", userId);
        }

        const { data: session, error: sessionError } = await sessionQuery.single();

        if (sessionError || !session) {
          throw new Error("Interview session not found or access denied");
        }

        return { session, jobData };
      })()
    : await fetchJobData(readSupabase, sessionId, userId);

  const { session, jobData: resolvedJobData } = sessionPayload;

  if (session.status === "completed") {
    throw new Error("Cannot generate questions for a completed session");
  }

  if (!resolvedJobData) {
    throw new Error("Job data is required to generate AI interview questions");
  }

  const questions = await generateQuestions(resolvedJobData, { questionCount, mode });

  if (!Array.isArray(questions)) {
    throw new Error("AI service failed to return a valid question list");
  }

  const startNumber = session.total_questions || 0;
  const formatted = questions.map((question, index) => ({
    session_id: sessionId,
    question_number: startNumber + index + 1,
    question_text: question.question_text,
    question_type: question.question_type,
    difficulty_level: question.difficulty_level,
    ideal_answer_guidelines: question.ideal_answer_guidelines,
    ai_model_used: OPENAI_MODEL,
  }));

  if (formatted.length === 0) {
    throw new Error("AI did not return any valid questions");
  }

  const { data, error } = await writeSupabase
    .from("interview_questions")
    .insert(formatted)
    .select();

  if (error) {
    throw error;
  }

  await writeSupabase
    .from("interview_sessions")
    .update({ total_questions: startNumber + data.length })
    .eq("id", sessionId);

  return data;
};
