import { callGemini, parseJsonResponse, interviewTurnSchema } from "../ai.service.js";
import { buildInterviewerPrompt } from "../prompts/interviewer.prompt.js";

/**
 * One turn of the live interviewer.
 *
 * Sits at the same boundary as question.generator.js — conversation in,
 * structured turn out — and touches neither the database nor HTTP, so the
 * session service can decide what to persist and the model never learns about
 * either.
 */

const VALID_TYPES = new Set(["behavioral", "technical", "situational", "general"]);
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

/** Longest question we will speak. Past this the model has written a paragraph, not a question. */
const MAX_QUESTION_CHARS = 500;

/**
 * The DB enforces question_type and difficulty_level via CHECK constraints, so
 * an off-menu value from the model would fail the insert. Coerce to the nearest
 * legal value instead of losing the question.
 */
const normalizeTurn = (turn) => {
  const type = String(turn.question_type || "").toLowerCase().trim();
  const difficulty = String(turn.difficulty_level || "").toLowerCase().trim();

  return {
    question_text: String(turn.question_text || "").trim().slice(0, MAX_QUESTION_CHARS),
    question_type: VALID_TYPES.has(type) ? type : "general",
    difficulty_level: VALID_DIFFICULTIES.has(difficulty) ? difficulty : "medium",
    ideal_answer_guidelines: turn.ideal_answer_guidelines?.trim() || null,
  };
};

/**
 * Normalised comparison key, matching the dedupe rule question.generator.js
 * uses. Cheap insurance against the model reopening a question it already
 * asked, which the prompt forbids but a long transcript makes tempting.
 */
const asKey = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Decide and compose the next question in a live interview.
 *
 * @param {object} jobData - title, company_name, job_content, key_skills, ...
 * @param {object} context
 * @param {Array<{question: string, question_type?: string, answer?: string}>} context.turns - the interview so far
 * @param {number} [context.maxQuestions=15]
 * @param {string} [context.mode] - practice mode id
 * @param {string} [context.candidateName]
 * @param {boolean} [context.forceAsk] - refuse the close branch; the caller has decided the interview is too short to end
 * @returns {Promise<{ action: 'ask'|'close', closingRemark?: string, question?: object }>}
 */
export const generateNextTurn = async (jobData, { turns = [], maxQuestions = 15, mode, candidateName, forceAsk = false } = {}) => {
  const messages = buildInterviewerPrompt(jobData, { turns, maxQuestions, mode, candidateName, forceAsk });

  const result = await callGemini({
    messages,
    // Lower than question generation: a live follow-up has to stay anchored to
    // what was actually said, and a wide sample drifts off the answer.
    temperature: 0.6,
    responseSchema: interviewTurnSchema,
  });

  const parsed = parseJsonResponse(result);
  const action = String(parsed?.action || "").toLowerCase().trim();

  if (action === "close" && !forceAsk) {
    return {
      action: "close",
      closingRemark: parsed.closing_remark?.trim() || null,
    };
  }

  const question = normalizeTurn(parsed || {});

  if (!question.question_text) {
    throw new Error("The interviewer returned no question to ask");
  }

  // A repeat is worse than a missing turn: the candidate hears the same thing
  // twice and the session burns one of its fifteen. Treat it as a failure the
  // caller can retry rather than storing it.
  const asked = new Set(turns.map((turn) => asKey(turn.question)));
  if (asked.has(asKey(question.question_text))) {
    throw new Error("The interviewer repeated a question that was already asked");
  }

  return { action: "ask", question };
};

export default { generateNextTurn };
