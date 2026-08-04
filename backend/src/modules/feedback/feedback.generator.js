/**
 * Feedback Generator
 *
 * Pure orchestration: build prompt -> call the chat client wrapper -> parse JSON.
 * Does NOT touch the DB and does NOT clamp/validate scores — that's the
 * feedback module's job (modules/feedback/scoring.engine.js) so this stays a
 * reusable "question+answer in, structured object out" boundary, matching the
 * question-generation generator's design.
 *
 * This module uses the repo's compatibility client wrapper in config/openai.js,
 * which forwards chat completions through the configured Gemini backend.
 */

import { getOpenAIClient } from '../../config/openai.js';
import { buildFeedbackSystemPrompt, buildFeedbackUserPrompt } from '../ai/prompts/feedback.prompt.js';
import { parseFeedbackCompletion } from '../ai/parsers/feedback.parser.js';

const FEEDBACK_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

/**
 * Generate raw (unclamped) feedback for a single question/answer pair.
 *
 * @param {object} input - see buildFeedbackUserPrompt for shape
 * @returns {Promise<{ raw: object, model: string, processingTimeMs: number }>}
 */
async function generateFeedback(input) {
  const startedAt = Date.now();
  const client = getOpenAIClient();

  console.log('SYSTEM PROMPT:', buildFeedbackSystemPrompt());
  console.log('USER PROMPT:', buildFeedbackUserPrompt(input));

  const completion = await client.chat.completions.create({
    model: FEEDBACK_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: buildFeedbackSystemPrompt() },
      { role: 'user', content: buildFeedbackUserPrompt(input) },
    ],
  });

  const content = completion?.choices?.[0]?.message?.content;
  const raw = parseFeedbackCompletion(content);

  return {
    raw,
    model: completion?.model || FEEDBACK_MODEL,
    processingTimeMs: Date.now() - startedAt,
  };
}

export { generateFeedback, FEEDBACK_MODEL };
export default { generateFeedback, FEEDBACK_MODEL };
