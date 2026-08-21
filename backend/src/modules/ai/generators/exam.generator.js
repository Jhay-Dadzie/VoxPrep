import { callGemini, parseJsonResponse, examSchema } from '../ai.service.js';
import { buildExamPrompt, optionLabels } from '../prompts/exam.prompt.js';
import { warn } from '../../../core/errors/logger.js';

/**
 * Generate a multiple-choice paper from source material.
 *
 * Three things this does that the prompt cannot be trusted to do on its own:
 *
 *  - **Batching.** Thirty questions with four options and an explanation each is
 *    a long response, and a response that runs out of room comes back as
 *    unparseable JSON — losing the whole paper rather than its tail. So the
 *    paper is written in batches, each told what is already on it.
 *
 *  - **Validation.** A question whose correct_option names an option that does
 *    not exist is unmarkable, and a paper is not partially markable: it would
 *    mark a student wrong on a question with no right answer. Those questions
 *    are dropped, not repaired.
 *
 *  - **Shuffling.** Models place the correct answer under the same label far
 *    more often than chance, and a student who notices can pass without reading
 *    the questions. Options are shuffled and re-labelled here, so the position
 *    of the answer owes nothing to the model.
 */

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * Questions per model call.
 *
 * Small enough that the response is never truncated, large enough that a
 * thirty-question paper is two sequential calls rather than three — the student
 * is watching a spinner while this runs.
 */
const BATCH_SIZE = 15;

/** Extra calls allowed to top the paper up after duplicates are dropped. */
const MAX_TOP_UPS = 2;

/**
 * Below this the paper is not worth sitting, and the caller is better off
 * seeing an error at setup than a student discovering it mid-exam.
 *
 * Clamped to what was actually asked for: a deliberately short paper is not a
 * failed long one.
 */
const MIN_USABLE_QUESTIONS = 10;

const normalizeKey = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Fisher-Yates. Returns a new array. */
const shuffled = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/**
 * Turn one raw model question into a markable one, or null if it cannot be.
 *
 * Returning null rather than patching is deliberate: every repair available here
 * (picking the first option, inventing a fourth) changes what the question
 * tests, and a silently altered question is worse than a shorter paper.
 */
const normalizeQuestion = (raw, optionCount) => {
  const questionText = String(raw?.question_text || '').trim();
  if (!questionText) return null;

  const options = Array.isArray(raw?.options) ? raw.options : [];
  const cleaned = options
    .map((option) => ({
      label: String(option?.label || '').trim().toUpperCase(),
      text: String(option?.text || '').trim(),
    }))
    .filter((option) => option.text.length > 0);

  if (cleaned.length !== optionCount) return null;

  const correct = String(raw?.correct_option || '').trim().toUpperCase();
  const answer = cleaned.find((option) => option.label === correct);
  if (!answer) return null;

  // Distinct option texts, case-insensitively: two identical options mean two
  // correct answers or two wrong ones, and neither can be marked.
  const texts = new Set(cleaned.map((option) => normalizeKey(option.text)));
  if (texts.size !== cleaned.length) return null;

  const explanation = String(raw?.explanation || '').trim();
  if (!explanation) return null;

  // Re-label in a fresh random order, so the answer's position comes from here
  // rather than from the model's habits.
  const labels = optionLabels(optionCount);
  const relabelled = shuffled(cleaned).map((option, index) => ({
    label: labels[index],
    text: option.text,
  }));
  const correctLabel = relabelled.find((option) => option.text === answer.text).label;

  const difficulty = String(raw?.difficulty_level || '').toLowerCase().trim();

  return {
    question_text: questionText,
    options: relabelled,
    correct_option: correctLabel,
    explanation,
    topic: String(raw?.topic || '').trim() || null,
    difficulty_level: VALID_DIFFICULTIES.has(difficulty) ? difficulty : 'medium',
  };
};

/** One model call: raw questions in the requested shape, unvalidated. */
const requestBatch = async (jobData, options) => {
  const messages = buildExamPrompt(jobData, options);

  const result = await callGemini({
    messages,
    temperature: 0.8,
    responseSchema: examSchema,
  });

  const parsed = parseJsonResponse(result);
  const questions = Array.isArray(parsed) ? parsed : parsed?.questions;

  return Array.isArray(questions) ? questions : [];
};

/**
 * @param {object} jobData - title, industry, job_content, key_skills, ...
 * @param {object} [options]
 * @param {number} [options.questionCount=30]
 * @param {number} [options.optionCount=4]
 * @param {string} [options.mode] - practice mode id
 * @returns {Promise<Array<{question_text, options, correct_option, explanation, topic, difficulty_level}>>}
 */
export const generateExamQuestions = async (
  jobData,
  { questionCount = 30, optionCount = 4, mode } = {}
) => {
  const accepted = [];
  const seen = new Set();
  let topUps = 0;

  const take = (rawQuestions) => {
    for (const raw of rawQuestions) {
      if (accepted.length >= questionCount) return;

      const question = normalizeQuestion(raw, optionCount);
      if (!question) continue;

      const key = normalizeKey(question.question_text);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      accepted.push(question);
    }
  };

  while (accepted.length < questionCount) {
    const remaining = questionCount - accepted.length;
    const batchSize = Math.min(BATCH_SIZE, remaining);
    const before = accepted.length;

    take(
      await requestBatch(jobData, {
        mode,
        questionCount: batchSize,
        totalCount: questionCount,
        startNumber: accepted.length + 1,
        // Only the tail is sent: a full list of thirty questions would crowd the
        // source material out of the prompt, and near-duplicates cluster in
        // adjacent batches anyway.
        avoid: accepted.slice(-BATCH_SIZE * 2).map((question) => question.question_text),
      })
    );

    // A batch that added nothing usable will not do better on the next attempt
    // with the same prompt, so the top-up budget is what stops this looping.
    if (accepted.length === before) {
      topUps += 1;
      warn(
        `Exam generation: a batch of ${batchSize} produced no usable questions ` +
        `(${accepted.length}/${questionCount} so far)`
      );
      if (topUps > MAX_TOP_UPS) break;
    }
  }

  if (accepted.length < Math.min(MIN_USABLE_QUESTIONS, questionCount)) {
    throw new Error(
      'Could not write enough exam questions from that material. Try pasting more of it, or a section with more detail.'
    );
  }

  if (accepted.length < questionCount) {
    warn(`Exam generation: paper is ${accepted.length} questions, ${questionCount} were asked for`);
  }

  return accepted;
};

export default { generateExamQuestions };
