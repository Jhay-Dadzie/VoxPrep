import { callGemini, parseJsonResponse, questionSchema } from "../ai.service.js";
import { buildQuestionPrompt } from "../prompts/question.prompt.js";

const VALID_TYPES = new Set(["behavioral", "technical", "situational", "general"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

/**
 * The DB enforces question_type and difficulty_level via CHECK constraints, so
 * an off-menu value from the model would fail the whole insert rather than one
 * row. Coerce to the nearest legal value instead.
 */
const normalizeQuestion = (question) => {
  const type = String(question.question_type || "").toLowerCase().trim();
  const difficulty = String(question.difficulty_level || "").toLowerCase().trim();

  return {
    question_text: String(question.question_text || "").trim(),
    question_type: VALID_TYPES.has(type) ? type : "general",
    difficulty_level: VALID_DIFFICULTIES.has(difficulty) ? difficulty : "medium",
    ideal_answer_guidelines: question.ideal_answer_guidelines?.trim() || null,
  };
};

/**
 * Near-duplicate questions are the most common quality failure: the model
 * rephrases the same ask two or three times in a ten-question set. Comparing
 * normalized text catches the identical ones; the prompt handles the rest.
 */
const dedupe = (questions) => {
  const seen = new Set();

  return questions.filter((question) => {
    const key = question.question_text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Generate structured interview questions from the supplied source material.
 *
 * @param {object} jobData - title, company_name, job_content, key_skills, ...
 * @param {object} [options]
 * @param {number} [options.questionCount=10]
 * @param {string} [options.mode] - practice mode id; shapes the persona and rules
 */
export const generateQuestions = async (jobData, { questionCount = 10, mode } = {}) => {
  const messages = buildQuestionPrompt(jobData, { questionCount, mode });

  const result = await callGemini({
    messages,
    temperature: 0.8,
    responseSchema: questionSchema,
  });

  const parsed = parseJsonResponse(result);
  const questions = Array.isArray(parsed) ? parsed : parsed.questions;

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Failed to parse AI question output");
  }

  const cleaned = dedupe(
    questions
      .map(normalizeQuestion)
      .filter((question) => question.question_text.length > 0)
  ).slice(0, questionCount);

  if (cleaned.length === 0) {
    throw new Error("AI returned no usable questions");
  }

  return cleaned;
};

export default { generateQuestions };
