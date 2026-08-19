/**
 * Scoring Engine
 *
 * Pure, side-effect-free functions for validating and normalizing AI-generated
 * feedback scores. No DB, no Express, no AI SDK — deliberately dependency-free
 * so it can be unit tested in isolation and reused wherever a score needs
 * clamping (feedback module today; session/analytics rollups tomorrow).
 *
 * Score contract: every metric is an integer 0-100, or null when the grader did
 * not report it.
 *
 * Null is not zero, and the difference is the whole point. `technical_accuracy_score`
 * is optional in the assessment schema, so a grader reading a behavioural answer
 * routinely leaves it out. Recording that as 0 asserts the candidate scored
 * nothing on it, and drags a five-metric average down by a fifth over a question
 * that was never technical to begin with. An unreported metric is unknown, and
 * unknown metrics are left out of averages rather than counted as failures.
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
 * Read a reported score, or null if the grader did not report a usable one.
 *
 * Unlike clampScore this never invents a number: `null`, `undefined`, `''` and
 * unparseable text all mean "not reported". Number() would turn the first three
 * into 0, which is exactly the confusion this function exists to prevent.
 *
 * @param {*} value
 * @returns {number|null}
 */
function readScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(Math.min(MAX_SCORE, Math.max(MIN_SCORE, num)));
}

/** Mean of the reported values, or null when none were reported. */
function meanOfReported(values) {
  const reported = values.filter((value) => value !== null);
  if (reported.length === 0) return null;
  return Math.round(reported.reduce((acc, value) => acc + value, 0) / reported.length);
}

/**
 * Arithmetic mean of the sub-scores the grader actually reported, rounded to
 * nearest int. Metrics it left out are skipped, not counted as 0.
 * Used only as a safety-net fallback — see deriveOverallScore.
 *
 * @param {object} scores - object containing the 5 METRICS keys
 * @returns {number|null}
 */
function averageSubScores(scores) {
  return meanOfReported(METRICS.map((key) => readScore(scores[key])));
}

/**
 * Decide the overall_score for a single response.
 *
 * Product decision: trust the AI's own holistic judgment for overall_score —
 * it can weigh context (e.g. a technically thin but highly relevant
 * behavioral answer) better than a fixed formula. We only clamp it into
 * range. If the AI omits overall_score or returns something unusable, fall
 * back to the average of the sub-scores it did report rather than failing the
 * response.
 *
 * @param {object} scores
 * @param {*} aiProvidedOverall
 * @returns {number|null} null only when the grader reported nothing at all
 */
function deriveOverallScore(scores, aiProvidedOverall) {
  const provided = readScore(aiProvidedOverall);
  if (provided !== null) return provided;
  return averageSubScores(scores);
}

/**
 * Normalize + validate the raw parsed AI JSON into the shape we persist.
 * Throws only if the payload is structurally unusable (not an object) — a
 * metric that is missing or unreadable becomes null instead of failing the
 * response, since a hard failure here would cost an entire session's feedback
 * over one malformed field.
 *
 * @param {object} raw - parsed JSON from the AI feedback generator
 * @returns {object} normalized { ...5 scores, overall_score, strengths, improvements, summary },
 *   where any score may be null if the grader did not report a usable one
 */
function normalizeFeedback(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AI feedback payload was not a valid object');
  }

  const scores = {
    relevance_score: readScore(raw.relevance_score),
    completeness_score: readScore(raw.completeness_score),
    technical_accuracy_score: readScore(raw.technical_accuracy_score),
    clarity_score: readScore(raw.clarity_score),
    confidence_score: readScore(raw.confidence_score),
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
 * Each metric averages only the rows that reported it, so one answer graded
 * without a technical score does not pull the session's technical average
 * toward zero. A metric no row reported comes back null.
 *
 * Callers are expected to pass only successfully graded rows — an answer the
 * grader could not score at all belongs nowhere in this average.
 *
 * @param {Array<object>} feedbackRows - rows with the 5 metric columns + overall_score
 * @returns {object}
 */
function computeSessionAggregate(feedbackRows) {
  const rows = feedbackRows || [];

  const meanOfColumn = (key) => meanOfReported(rows.map((row) => readScore(row[key])));

  return {
    relevance_score: meanOfColumn('relevance_score'),
    completeness_score: meanOfColumn('completeness_score'),
    technical_accuracy_score: meanOfColumn('technical_accuracy_score'),
    clarity_score: meanOfColumn('clarity_score'),
    confidence_score: meanOfColumn('confidence_score'),
    overall_score: meanOfColumn('overall_score'),
    response_count: rows.length,
  };
}

export {
  METRICS,
  MIN_SCORE,
  MAX_SCORE,
  clampScore,
  readScore,
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
  readScore,
  averageSubScores,
  deriveOverallScore,
  normalizeFeedback,
  computeSessionAggregate,
};