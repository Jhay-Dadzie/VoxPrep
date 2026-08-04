/**
 * Feedback Parser
 *
 * Parses the raw OpenAI JSON-mode completion string for feedback generation
 * into a plain object. Score clamping/normalization is intentionally NOT done
 * here — that lives in modules/feedback/scoring.engine.js so this AI-layer
 * boundary stays a dumb, reusable "text in, object out" step with no opinion
 * on score policy.
 *
 * @param {string} rawContent
 * @returns {object}
 */
function parseFeedbackCompletion(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Empty completion returned from AI feedback generation');
  }

  let cleaned = rawContent.trim();
  // Defensive: strip markdown fences in case JSON mode is ever bypassed
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse AI feedback response as JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI feedback response was not a JSON object');
  }

  return parsed;
}

export { parseFeedbackCompletion };
export default { parseFeedbackCompletion };