/**
 * Deepgram Voice Agent configuration.
 *
 * The Voice Agent API bundles transcription, reasoning and speech behind one
 * duplex WebSocket. That is the whole reason for using it: the previous design
 * paid a separate network round trip for each of those three, in sequence, and
 * the candidate heard the sum. Measured against this account, the bundled path
 * reports ~0.02s to transcribe, ~0.7s to the model's first token and ~0.07s to
 * begin speaking — and because the reply streams, the first audio arrives well
 * before the turn is complete.
 *
 * Everything here is overridable by environment so a model can be swapped
 * without a deploy, which matters more than usual: providers retire model ids
 * on their own schedule and the id is only validated when a session opens.
 */

export const AGENT_ENDPOINT =
  process.env.DEEPGRAM_AGENT_ENDPOINT || 'wss://agent.deepgram.com/v1/agent/converse';

/** Transcription half of the agent. */
export const AGENT_LISTEN_MODEL = process.env.DEEPGRAM_AGENT_LISTEN_MODEL || 'nova-3';

/**
 * Reasoning half. Google here means the interview itself is run by Gemini,
 * while a *separate* Gemini call grades the finished session — the two never
 * contend for the same quota inside one interview.
 *
 * ── Do not raise this to a Gemini 3.x id ────────────────────────────────────
 *
 * Deepgram keeps its own allowlist of `think` models, and it is far behind
 * Google's catalogue. Probed against this account:
 *
 *   gemini-2.5-flash        ✓ accepted
 *   gemini-2.5-flash-lite   ✓ accepted
 *   gemini-3.7-flash        ✗ "model not available"
 *   gemini-3.6-flash        ✗ "model not available"
 *   gemini-3-flash          ✗ "model not available"
 *   gemini-2.0-flash        ✗ "model not available"
 *   gemini-flash-latest     ✗ "model not available"
 *
 * An id off that list is rejected when Settings is applied, which surfaces as
 * an interviewer that simply never speaks — there is no partial failure to
 * notice. This constrains the *agent* only: the grader calls Google directly
 * and is free to use a newer model. Re-probe before changing this, and use the
 * env override to try a new id without a deploy.
 */
export const AGENT_THINK_PROVIDER = process.env.DEEPGRAM_AGENT_THINK_PROVIDER || 'google';
export const AGENT_THINK_MODEL = process.env.DEEPGRAM_AGENT_THINK_MODEL || 'gemini-2.5-flash';

/** Speech half. Voice is chosen per interviewer; this is the fallback. */
export const AGENT_SPEAK_MODEL = process.env.DEEPGRAM_AGENT_SPEAK_MODEL || 'aura-2-thalia-en';

/**
 * Audio formats.
 *
 * Input is 16kHz because that is what speech models want and what a phone mic
 * gives cheaply; output is 24kHz because Aura synthesises at 24kHz and
 * resampling it down would cost quality for no benefit. `container: 'none'`
 * means raw frames with no header, which is what a streaming player needs —
 * a WAV header mid-stream would be decoded as noise.
 */
export const AGENT_INPUT_SAMPLE_RATE = 16000;
export const AGENT_OUTPUT_SAMPLE_RATE = 24000;
export const AGENT_AUDIO_ENCODING = 'linear16';

/**
 * How long a session may sit with no audio from the candidate before it is
 * closed. Long enough to survive someone thinking hard, short enough that a
 * phone left face-down does not bill for an hour.
 */
export const AGENT_IDLE_TIMEOUT_MS = Number(process.env.DEEPGRAM_AGENT_IDLE_MS || 120_000);

/** Absolute ceiling on one interview, as a backstop on the question cap. */
export const AGENT_MAX_SESSION_MS = Number(process.env.DEEPGRAM_AGENT_MAX_MS || 30 * 60 * 1000);

export const hasAgentCredentials = () => Boolean(process.env.DEEPGRAM_API_KEY);

export default {
  AGENT_ENDPOINT,
  AGENT_LISTEN_MODEL,
  AGENT_THINK_PROVIDER,
  AGENT_THINK_MODEL,
  AGENT_SPEAK_MODEL,
  AGENT_INPUT_SAMPLE_RATE,
  AGENT_OUTPUT_SAMPLE_RATE,
  AGENT_AUDIO_ENCODING,
  AGENT_IDLE_TIMEOUT_MS,
  AGENT_MAX_SESSION_MS,
  hasAgentCredentials,
};
