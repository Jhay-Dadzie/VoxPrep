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
 */

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/** Speech generation. Only the *-tts models accept responseModalities: ["AUDIO"]. */
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

/**
 * Grading. Deliberately a different model from the interviewer so that a
 * 15-question session does not spend the quota the assessment needs, and so a
 * rate-limited interviewer never blocks results the user is waiting on.
 */
export const GEMINI_ASSESSMENT_MODEL = process.env.GEMINI_ASSESSMENT_MODEL || "gemini-2.5-flash";

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
