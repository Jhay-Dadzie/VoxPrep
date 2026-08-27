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
 *
 *  - **De-sourcing.** A model handed a document writes about the document —
 *    "according to the text", "the described system". The student sits the
 *    paper with nothing in front of them, so such a question is unanswerable as
 *    well as a tell. The prompt forbids it; this is the net under that.
 */

const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/**
 * Lead-ins that can be lifted off the front of a sentence without changing what
 * it asks. "According to the text, what does entropy measure?" is a fine
 * question wearing a prefix, so it is repaired rather than discarded.
 */
const SOURCE_LEAD_IN =
  /^\s*(?:according to|based (?:on|upon)|as per|as (?:stated|mentioned|described|defined|discussed|outlined|noted|explained|shown|presented|covered)(?:\s+(?:in|by))?|referring to|with reference to|drawing on|from|in|within)\s+(?:the|this|these|that|your|our)?\s*(?:above|given|provided|supplied|attached|uploaded|following|preceding|original)?\s*(?:source|course|study|lecture|reading)?\s*(?:materials?|documents?|texts?|passages?|excerpts?|extracts?|contents?|notes?|slides?|lectures?|readings?|articles?|handouts?|syllabus|chapters?|sections?|paragraphs?|books?|authors?|writers?)\b[^,.:;?!]{0,30}\s*[,:]\s*/i;

/**
 * References that cannot be lifted off, because they are load-bearing: strip
 * "the mentioned" from "Which property does the mentioned protocol guarantee?"
 * and nothing identifies the protocol. Those questions are dropped.
 *
 * Deliberately narrow. "the document" is a DOM object, "the given values" is
 * how a worked problem is phrased, and "the extract" is chemistry — so bare
 * nouns only make the list where no course would use them innocently, and
 * everything else has to appear in a referential construction to count.
 */
const SOURCE_REFERENCES = [
  /\b(?:according to|based (?:on|upon)|as per)\s+(?:the|this|these|that|your|our)?\s*(?:above|given|provided|supplied|attached|uploaded|original)?\s*(?:source\s+)?(?:materials?|documents?|texts?|passages?|excerpts?|extracts?|notes?|slides?|lectures?|readings?|articles?|handouts?|chapters?|sections?|authors?|books?)\b/i,
  /\bsource material\b/i,
  /\bthe (?:passage|excerpt|handout|syllabus|reading|transcript)\b/i,
  /\bthe (?:text|material|content|notes|slides|lecture|article|author|book|chapter|section|paragraph|document|passage)\s+(?:above|below|states?|said|says?|writes?|wrote|argues?|notes?|mentions?|describes?|defines?|explains?|suggests?|indicates?|claims?|outlines?|lists?|presents?|discusses?|covers?|refers?)\b/i,
  /\bas (?:stated|mentioned|described|defined|discussed|outlined|noted|explained|shown|presented|listed|covered|detailed|written)\s+(?:above|below|earlier|previously|before|in the|by the)\b/i,
  /\bthe (?:aforementioned|above[- ]mentioned|aforesaid)\b/i,
  /\bthe (?:mentioned|described|discussed|stated|outlined|referenced|uploaded|attached)\s+[a-z]/i,
  /\b(?:in|from)\s+(?:the|this)\s+(?:document|passage|text|excerpt|extract|material|reading|article|lecture|notes|slides|handout)\b/i,
  /\bas we (?:saw|discussed|covered|noted|learned)\b/i,
];

const referencesSource = (text) => SOURCE_REFERENCES.some((pattern) => pattern.test(text));

/**
 * Drop a removable source lead-in and re-capitalise what is left.
 *
 * Returns the input untouched when there is nothing to strip, or when stripping
 * would leave a fragment too short to be a question on its own.
 */
export const stripSourceLeadIn = (text) => {
  const trimmed = String(text || '').trim();
  const stripped = trimmed.replace(SOURCE_LEAD_IN, '').trim();

  if (stripped === trimmed || stripped.length < 12) return trimmed;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

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
 * How long one batch may take, and how long the whole paper may.
 *
 * Measured rather than guessed: a batch of fifteen questions with four options
 * and an explanation each runs 29–57 seconds on the models in the chain. The
 * default 60s ceiling sat inside that spread, so an ordinary slow batch aborted
 * mid-answer, was read as a transport failure, and sent the request down the
 * fallback chain to be reported as whatever the last model there had to say.
 * 120s clears the measured worst case with room for a bad day.
 *
 * The paper budget is what stops that generosity compounding. Two batches, each
 * free to walk three models twice at 120s a go, is twenty minutes of work for a
 * client that stopped listening after five. When the budget runs out the paper
 * is returned short rather than abandoned — a student would rather sit twenty
 * questions than see an error after four minutes of waiting.
 */
const BATCH_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_EXAM_TIMEOUT_MS || "120000", 10);
const PAPER_BUDGET_MS = Number.parseInt(process.env.GEMINI_EXAM_BUDGET_MS || "240000", 10);

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
  const questionText = stripSourceLeadIn(raw?.question_text);
  if (!questionText) return null;

  // A question the student cannot answer without the document in front of them
  // is not a question. Dropped rather than rewritten: removing the reference
  // would leave nothing identifying what is being asked about.
  if (referencesSource(questionText)) return null;

  const options = Array.isArray(raw?.options) ? raw.options : [];
  const cleaned = options
    .map((option) => ({
      label: String(option?.label || '').trim().toUpperCase(),
      text: String(option?.text || '').trim(),
    }))
    .filter((option) => option.text.length > 0);

  if (cleaned.length !== optionCount) return null;
  if (cleaned.some((option) => referencesSource(option.text))) return null;

  const correct = String(raw?.correct_option || '').trim().toUpperCase();
  const answer = cleaned.find((option) => option.label === correct);
  if (!answer) return null;

  // Distinct option texts, case-insensitively: two identical options mean two
  // correct answers or two wrong ones, and neither can be marked.
  const texts = new Set(cleaned.map((option) => normalizeKey(option.text)));
  if (texts.size !== cleaned.length) return null;

  // The explanation is only shown after marking, so a leak here costs less than
  // one in the question — enough to strip a lead-in for, not enough to throw an
  // otherwise sound question away over.
  const explanation = stripSourceLeadIn(raw?.explanation);
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
const requestBatch = async (jobData, options, deadline) => {
  const messages = buildExamPrompt(jobData, options);

  const result = await callGemini({
    messages,
    temperature: 0.8,
    responseSchema: examSchema,
    timeoutMs: BATCH_TIMEOUT_MS,
    deadline,
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
  const deadline = Date.now() + PAPER_BUDGET_MS;

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
      await requestBatch(
        jobData,
        {
          mode,
          questionCount: batchSize,
          totalCount: questionCount,
          startNumber: accepted.length + 1,
          // Only the tail is sent: a full list of thirty questions would crowd
          // the source material out of the prompt, and near-duplicates cluster
          // in adjacent batches anyway.
          avoid: accepted.slice(-BATCH_SIZE * 2).map((question) => question.question_text),
        },
        deadline
      )
    );

    // Whatever is on the paper by now is what the student gets. Asking for
    // another batch would only spend a budget that has already run out.
    if (Date.now() >= deadline) {
      warn(
        `Exam generation: out of time with ${accepted.length}/${questionCount} questions written`
      );
      break;
    }

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

export default { generateExamQuestions, stripSourceLeadIn };
