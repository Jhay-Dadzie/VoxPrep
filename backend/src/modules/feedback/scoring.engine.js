/**
 * Scoring Engine
 *
 * Pure, side-effect-free functions for validating and normalizing AI-generated
 * feedback scores. No DB, no Express, no AI SDK — deliberately dependency-free
 * so it can be unit tested in isolation and reused wherever a score needs
 * clamping (feedback module today; session/analytics rollups tomorrow).
 *
 * Score contract: every metric is an integer 0-100.
 */

const METRICS = [
  'relevance_score',
  'completeness_score',
  'technical_accuracy_score',
  'clarity_score',
  'confidence_score',
];

const MIN_SCORE = 0;
const MAX_SCORE = 100;

/**
 * Clamp any numeric-ish value into a safe 0-100 integer.
 * Non-numeric / NaN / missing values fall back to `fallback` (default 0).
 *
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
function clampScore(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.round(Math.min(MAX_SCORE, Math.max(MIN_SCORE, num)));
}

/**
 * Arithmetic mean of the 5 sub-scores, rounded to nearest int.
 * Used only as a safety-net fallback — see deriveOverallScore.
 *
 * @param {object} scores - object containing the 5 METRICS keys
 * @returns {number}
 */
function averageSubScores(scores) {
  const values = METRICS.map((key) => clampScore(scores[key]));
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Math.round(sum / METRICS.length);
}

/**
 * Decide the overall_score for a single response.
 *
 * Product decision: trust the AI's own holistic judgment for overall_score —
 * it can weigh context (e.g. a technically thin but highly relevant
 * behavioral answer) better than a fixed formula. We only clamp it into
 * range. If the AI omits overall_score or returns something unusable, fall
 * back to the average of the 5 sub-scores rather than failing the response.
 *
 * @param {object} scores
 * @param {*} aiProvidedOverall
 * @returns {number}
 */
function deriveOverallScore(scores, aiProvidedOverall) {
  const num = Number(aiProvidedOverall);
  if (Number.isFinite(num)) {
    return clampScore(num);
  }
  return averageSubScores(scores);
}

/**
 * Normalize + validate the raw parsed AI JSON into the shape we persist.
 * Throws only if the payload is structurally unusable (not an object) —
 * anything partially usable is repaired via clampScore's fallback instead of
 * being thrown away, since a hard failure here would fail an entire
 * session's feedback run over one malformed field.
 *
 * @param {object} raw - parsed JSON from the AI feedback generator
 * @returns {object} normalized { ...5 scores, overall_score, strengths, improvements, summary }
 */
function normalizeFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AI feedback payload was not a valid object');
  }

  const scores = {
    relevance_score: clampScore(raw.relevance_score),
    completeness_score: clampScore(raw.completeness_score),
    technical_accuracy_score: clampScore(raw.technical_accuracy_score),
    clarity_score: clampScore(raw.clarity_score),
    confidence_score: clampScore(raw.confidence_score),
  };

  const overall_score = deriveOverallScore(scores, raw.overall_score);

  const strengths = Array.isArray(raw.strengths)
    ? raw.strengths.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 6)
    : [];

  const improvements = Array.isArray(raw.improvements)
    ? raw.improvements.filter((s) => typeof s === 'string' && s.trim().length > 0).slice(0, 6)
    : [];

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 2000) : '';

  return { ...scores, overall_score, strengths, improvements, summary };
}

/**
 * Roll up a list of persisted feedback rows into per-metric session averages.
 * Used for GET /feedback/sessions/:sessionId/summary and to update
 * interview_sessions.overall_score once a session finishes grading.
 *
 * @param {Array<object>} feedbackRows - rows with the 5 metric columns + overall_score
 * @returns {object}
 */
function computeSessionAggregate(feedbackRows) {
  if (!feedbackRows || feedbackRows.length === 0) {
    return {
      relevance_score: null,
      completeness_score: null,
      technical_accuracy_score: null,
      clarity_score: null,
      confidence_score: null,
      overall_score: null,
      response_count: 0,
    };
  }

  const totals = { ...Object.fromEntries(METRICS.map((k) => [k, 0])), overall_score: 0 };

  for (const row of feedbackRows) {
    for (const key of METRICS) totals[key] += clampScore(row[key]);
    totals.overall_score += clampScore(row.overall_score);
  }

  const count = feedbackRows.length;
  const avg = (sum) => Math.round(sum / count);

  return {
    relevance_score: avg(totals.relevance_score),
    completeness_score: avg(totals.completeness_score),
    technical_accuracy_score: avg(totals.technical_accuracy_score),
    clarity_score: avg(totals.clarity_score),
    confidence_score: avg(totals.confidence_score),
    overall_score: avg(totals.overall_score),
    response_count: count,
  };
}

export {
  METRICS,
  MIN_SCORE,
  MAX_SCORE,
  clampScore,
  averageSubScores,
  deriveOverallScore,
  normalizeFeedback,
  computeSessionAggregate,
};

export default {
  METRICS,
  MIN_SCORE,
  MAX_SCORE,
  clampScore,
  averageSubScores,
  deriveOverallScore,
  normalizeFeedback,
  computeSessionAggregate,
};