/**
 * Gemini model configuration.
 *
 * A live interview touches three Gemini jobs, and each is pinned to its own
 * model on purpose: Gemini's free-tier quotas are counted per model, so
 * spreading the work means a long interview cannot exhaust the budget the
 * grading pass still needs. Keeping them distinct is a rate-limit decision, not
 * a quality one — every id here is overridable from the environment.
 *
 *   GEMINI_MODEL            the interviewer: writes the next question each turn
 *   GEMINI_TTS_MODEL        speaks each question (once per turn)
 *   GEMINI_ASSESSMENT_MODEL grades the finished session (once per session)
 *
 * Transcription is NOT here: it runs on Deepgram (see speech/stt.service.js).
 *
 * A warning about the ids below, learned the hard way. Google retires models
 * from new keys without warning — `gemini-2.5-flash-lite` and `gemini-2.5-pro`
 * both answer 404 "no longer available to new users" — and because the id is
 * only resolved when the request is made, a dead model fails silently at
 * runtime rather than at boot. The defaults here are ones verified against a
 * live key; change them only with the same verification.
 *
 * Two ids that look safe and are not, both found here by that verification:
 *
 *   `gemini-flash-latest` and the other `-latest` aliases point at whichever
 *   preview is newest, which is also whichever is most oversubscribed. It
 *   answered 503 "experiencing high demand" on every attempt across an hour.
 *   An alias is the worst thing to end a chain with: it is the error the user
 *   finally sees, and it hides whatever the real failure upstream of it was.
 *
 *   `-preview` suffixes are part of the id, not decoration. `gemini-3.1-flash-tts`
 *   does not exist; `gemini-3.1-flash-tts-preview` does.
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * Split a comma-separated env override into a model list.
 * Blank entries are dropped so a trailing comma cannot produce an empty id.
 */
const modelList = (value, fallback) =>
  (value ? value.split(",") : fallback).map((id) => id.trim()).filter(Boolean);

/**
 * Stand-ins to try when the primary model will not answer.
 *
 * Free-tier quota is per model, so the most likely failure in a live interview
 * is a 429 on the model doing the most work — and the interviewer's model is
 * asked once per turn. Rolling onto a different model costs a little
 * consistency in phrasing and saves the session, which is the right trade
 * mid-conversation.
 *
 * The chains point at each other deliberately: whichever model is busy, the
 * others are idle. Every id below is one of the three verified to answer on a
 * live key, ordered so no two chains lead with the same one.
 */
export const GEMINI_MODEL_FALLBACKS = modelList(
  process.env.GEMINI_MODEL_FALLBACKS,
  ["gemini-2.5-flash", "gemini-3.5-flash"]
);

export const GEMINI_ASSESSMENT_FALLBACKS = modelList(
  process.env.GEMINI_ASSESSMENT_FALLBACKS,
  ["gemini-3.5-flash", "gemini-3.6-flash"]
);

/** Speech generation. Only the *-tts models accept responseModalities: ["AUDIO"]. */
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";

/**
 * Grading. Deliberately a different model from the interviewer so that a
 * 15-question session does not spend the quota the assessment needs, and so a
 * rate-limited interviewer never blocks results the user is waiting on.
 */
export const GEMINI_ASSESSMENT_MODEL = process.env.GEMINI_ASSESSMENT_MODEL || "gemini-2.5-flash";

/**
 * CV tailoring. Runs once, after the interview is already over, on a much
 * longer input than any other job here — a whole CV plus the job description.
 * Given its own model for the same per-model-quota reason as the rest: a user
 * who tailors two CVs should not find their next interview rate-limited.
 */
export const GEMINI_CV_MODEL = process.env.GEMINI_CV_MODEL || "gemini-3.5-flash";

export const GEMINI_CV_FALLBACKS = modelList(
  process.env.GEMINI_CV_FALLBACKS,
  ["gemini-2.5-flash", "gemini-3.6-flash"]
);

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const GEMINI_ENDPOINT =
  process.env.GEMINI_ENDPOINT || "https://generativelanguage.googleapis.com/v1beta";

export const getGeminiConfig = () => {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  return {
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
    ttsModel: GEMINI_TTS_MODEL,
    assessmentModel: GEMINI_ASSESSMENT_MODEL,
    endpoint: GEMINI_ENDPOINT,
  };
};
