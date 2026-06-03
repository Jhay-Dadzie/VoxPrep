import { callGemini, parseJsonResponse } from "../ai.service.js";
import { buildQuestionPrompt } from "../prompts/question.prompt.js";

const normalizeQuestion = (question) => ({
  question_text: String(question.question_text || "").trim(),
  question_type: question.question_type || "general",
  difficulty_level: question.difficulty_level || "medium",
  ideal_answer_guidelines: question.ideal_answer_guidelines?.trim() || null,
});

/**
 * Generate structured interview questions from job description
 */
export const generateQuestions = async (jobData, { questionCount = 10 } = {}) => {
  const messages = buildQuestionPrompt(jobData, { questionCount });

  const result = await callGemini({
    messages,
    temperature: 0.8,
  });

  const parsed = parseJsonResponse(result);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Failed to parse AI question output");
  }

  return questions
    .map(normalizeQuestion)
    .filter((question) => question.question_text.length > 0)
    .slice(0, questionCount);
};
