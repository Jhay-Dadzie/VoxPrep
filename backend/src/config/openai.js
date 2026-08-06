import OpenAI from 'openai';

/**
 * Chat completions, with an optional second provider behind the first.
 *
 * Named for the SDK, not the vendor: several providers expose an
 * OpenAI-compatible endpoint, so pointing a base URL at one of them swaps the
 * model provider without touching calling code. Known-good bases:
 *
 *   Google Gemini  https://generativelanguage.googleapis.com/v1beta/openai/
 *   Groq           https://api.groq.com/openai/v1
 *   OpenAI         (leave the base URL unset)
 *
 * The fallback exists because free tiers run out. A daily quota that expires
 * mid-demo is not a hypothetical — it has already happened on this project —
 * and a second provider turns a dead session into a slower one.
 */

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable');
}

/** Model used for question generation and scoring. Must exist on the provider. */
export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** Model on the fallback provider, which is usually a different family. */
export const FALLBACK_MODEL = process.env.FALLBACK_MODEL || null;

const primary = new OpenAI({
  apiKey,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  timeout: 45_000,
  maxRetries: 2,
});

const fallback = process.env.FALLBACK_API_KEY
  ? new OpenAI({
      apiKey: process.env.FALLBACK_API_KEY,
      baseURL: process.env.FALLBACK_BASE_URL || undefined,
      timeout: 45_000,
      maxRetries: 2,
    })
  : null;

export function hasFallback() {
  return Boolean(fallback && FALLBACK_MODEL);
}

/**
 * Worth trying elsewhere: the provider is rate limited, overloaded, or down.
 *
 * A 400 or 404 means the request itself is wrong, so the fallback would fail
 * the same way and retrying only wastes the second quota too.
 */
function isProviderExhausted(err) {
  const status = err?.status;
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Run a chat completion, falling back to the second provider when the first is
 * exhausted. Callers pass messages and options; the model is filled in per
 * provider, since the two rarely share model names.
 */
export async function chatCompletion({ messages, temperature, responseFormat }, options = {}) {
  const body = {
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  try {
    return await primary.chat.completions.create({ ...body, model: MODEL }, options);
  } catch (err) {
    if (!hasFallback() || !isProviderExhausted(err)) throw err;

    console.warn(
      `[ai] primary provider unavailable (${err.status}); retrying on fallback ${FALLBACK_MODEL}`,
    );
    return fallback.chat.completions.create({ ...body, model: FALLBACK_MODEL }, options);
  }
}

export default primary;
