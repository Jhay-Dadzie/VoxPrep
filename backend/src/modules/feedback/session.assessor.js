/**
 * Session Assessor
 *
 * Grades a finished interview in a single model call, on a model of its own.
 *
 * ── Why its own model ────────────────────────────────────────────────────────
 *
 * Gemini counts free-tier quota per model. A live interview already spends the
 * interviewer model once per turn and the transcription model once per answer;
 * putting grading on GEMINI_ASSESSMENT_MODEL means the results the user is
 * actually waiting for cannot be rate-limited by the interview that produced
 * them. It is the same reason the call is batched rather than per-answer.
 *
 * Pure orchestration: build prompt → call the model → parse JSON. Does not
 * touch the DB and does not clamp scores — that is scoring.engine.js's job, so
 * this stays a reusable "transcript in, structured grades out" boundary,
 * matching the generators in modules/ai/.
 */

import { callGemini, parseJsonResponse } from '../ai/ai.service.js';
import { GEMINI_ASSESSMENT_MODEL, GEMINI_ASSESSMENT_FALLBACKS } from '../../config/gemini.js';
import {
  buildAssessmentSystemPrompt,
  buildAssessmentUserPrompt,
} from '../ai/prompts/assessment.prompt.js';

/**
 * Structured-output schema. Constrained decoding is what makes the index-based
 * mapping safe: without it, a model that renames or omits `index` would have
 * its grades silently attached to the wrong answers.
 */
const assessmentSchema = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          relevance_score: { type: 'number' },
          completeness_score: { type: 'number' },
          technical_accuracy_score: { type: 'number' },
          clarity_score: { type: 'number' },
          confidence_score: { type: 'number' },
          overall_score: { type: 'number' },
          strengths: { type: 'array', items: { type: 'string' } },
          improvements: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['index', 'relevance_score', 'completeness_score', 'clarity_score', 'confidence_score', 'summary'],
      },
    },
    session_summary: { type: 'string' },
  },
  required: ['answers'],
};

/**
 * Grade every answer in one session.
 *
 * @param {object} input
 * @param {Array<{questionText: string, questionType?: string, difficultyLevel?: string, idealAnswerGuidelines?: string, answerText: string}>} input.answers - in interview order
 * @param {string} [input.jobTitle]
 * @param {string} [input.companyName]
 * @param {string} [input.industry]
 * @param {string} [input.experienceLevel]
 * @param {string} [input.jobContent]
 * @returns {Promise<{ raw: object[], sessionSummary: string|null, model: string, processingTimeMs: number }>}
 *          `raw` is index-aligned with `input.answers`; entries the model failed
 *          to return are null so the caller can mark exactly those as failed.
 */
async function assessSession(input) {
  const startedAt = Date.now();
  const { answers = [] } = input;

  if (answers.length === 0) {
    throw new Error('No answers to assess');
  }

  const completion = await callGemini({
    // Grading happens once, at the end, with the user watching a spinner — so a
    // rate-limited primary rolls onto the next model rather than costing them
    // the results for an interview they have already sat through.
    model: [GEMINI_ASSESSMENT_MODEL, ...GEMINI_ASSESSMENT_FALLBACKS],
    // Grading should be reproducible; sampling only adds variance between
    // regrades of the same unchanged answers.
    temperature: 0.2,
    responseSchema: assessmentSchema,
    messages: [
      { role: 'system', content: buildAssessmentSystemPrompt() },
      { role: 'user', content: buildAssessmentUserPrompt(input) },
    ],
  });

  const parsed = parseJsonResponse(completion);
  const entries = Array.isArray(parsed) ? parsed : parsed?.answers;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('The assessment model returned no gradable answers');
  }

  // Map by the index the model echoed back rather than by array position: a
  // model that drops or reorders one entry would otherwise shift every grade
  // after it onto the wrong answer, which is worse than a missing grade.
  const byIndex = new Map();
  entries.forEach((entry, position) => {
    const index = Number.isInteger(entry?.index) ? entry.index : position;
    if (index >= 0 && index < answers.length && !byIndex.has(index)) {
      byIndex.set(index, entry);
    }
  });

  return {
    raw: answers.map((_, index) => byIndex.get(index) ?? null),
    sessionSummary: typeof parsed?.session_summary === 'string' ? parsed.session_summary.trim() : null,
    model: GEMINI_ASSESSMENT_MODEL,
    processingTimeMs: Date.now() - startedAt,
  };
}

export { assessSession, assessmentSchema, GEMINI_ASSESSMENT_MODEL as ASSESSMENT_MODEL };
export default { assessSession, ASSESSMENT_MODEL: GEMINI_ASSESSMENT_MODEL };
