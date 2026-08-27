import axios from "axios";
import {
  GEMINI_API_KEY,
  GEMINI_ENDPOINT,
  GEMINI_MODEL,
  GEMINI_MODEL_FALLBACKS,
} from "../../config/gemini.js";
import { warn } from "../../core/errors/logger.js";

const stripCodeFences = (content) =>
  content
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

export const parseJsonResponse = (content) => {
  const cleaned = stripCodeFences(content);

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return JSON.parse(arrayMatch[0]);
    }

    throw new Error("AI response was not valid JSON");
  }
};

const toGeminiContents = (messages = []) =>
  messages
    .filter((message) => message?.content && message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

const toSystemInstruction = (messages = []) => {
  const systemMessage = messages.find((message) => message.role === "system");
  if (!systemMessage?.content) return undefined;

  return {
    parts: [{ text: systemMessage.content }],
  };
};

/**
 * Structured-output schema for question generation. Passing this to Gemini
 * constrains decoding to the shape we parse, which removes the "valid JSON but
 * wrong keys" failure mode that free-form prompting leaves open.
 */
export const questionSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_text: { type: "string" },
          question_type: {
            type: "string",
            enum: ["behavioral", "technical", "situational", "general"],
          },
          difficulty_level: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          ideal_answer_guidelines: { type: "string" },
        },
        required: [
          "question_text",
          "question_type",
          "difficulty_level",
          "ideal_answer_guidelines",
        ],
      },
    },
  },
  required: ["questions"],
};

/**
 * Structured-output schema for a multiple-choice exam paper.
 *
 * `correct_option` is a label rather than an index because an index invites the
 * two failure modes that are hardest to detect after the fact: an off-by-one
 * between the model's counting and ours, and a paper whose answer is silently
 * always the first option. A label has to match one of the options the model
 * itself emitted, which the generator can check.
 */
export const examSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_text: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
              },
              required: ["label", "text"],
            },
          },
          correct_option: { type: "string" },
          explanation: { type: "string" },
          topic: { type: "string" },
          difficulty_level: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
        },
        required: [
          "question_text",
          "options",
          "correct_option",
          "explanation",
          "difficulty_level",
        ],
      },
    },
  },
  required: ["questions"],
};

/**
 * Structured-output schema for one live interviewer turn.
 *
 * `action` is what the session loop branches on, so it is constrained rather
 * than parsed out of prose: a turn that cannot be read as ask-or-close would
 * leave the interview with no way to end itself.
 */
export const interviewTurnSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["ask", "close"] },
    question_text: { type: "string" },
    question_type: {
      type: "string",
      enum: ["behavioral", "technical", "situational", "general"],
    },
    difficulty_level: {
      type: "string",
      enum: ["easy", "medium", "hard"],
    },
    ideal_answer_guidelines: { type: "string" },
    closing_remark: { type: "string" },
  },
  required: ["action"],
};

/**
 * Structured-output schema for a tailored CV.
 *
 * Only the fields the renderer cannot do without are `required`. A CV with no
 * projects section is normal, and forcing the model to emit one is exactly the
 * pressure that makes it invent projects — the opposite of what the prompt
 * spends its length forbidding.
 */
export const tailoredCvSchema = {
  type: "object",
  properties: {
    full_name: { type: "string" },
    headline: { type: "string" },
    contact: {
      type: "object",
      properties: {
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        links: { type: "array", items: { type: "string" } },
      },
    },
    summary: { type: "string" },
    skills: { type: "array", items: { type: "string" } },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          role: { type: "string" },
          company: { type: "string" },
          location: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["role", "company", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          qualification: { type: "string" },
          institution: { type: "string" },
          location: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: "string" },
          details: { type: "string" },
        },
        required: ["qualification", "institution"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["name"],
      },
    },
    certifications: { type: "array", items: { type: "string" } },
    tailoring_notes: { type: "array", items: { type: "string" } },
    keywords_matched: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
  },
  required: ["full_name", "summary", "skills", "experience", "tailoring_notes"],
};

/**
 * Failures worth retrying on a different model rather than surfacing.
 *
 *   429 — the quota for THIS model is spent; another model has its own.
 *   503 — that model is temporarily overloaded.
 *   500 — transient server-side fault.
 *   404 — Google retires models from new keys without notice, and the id is
 *         only resolved at request time, so a dead model looks like this.
 *
 * Deliberately excluded: 400 (our request is malformed — every model will
 * reject it) and 401/403 (the key is wrong — switching models cannot help).
 */
const RETRYABLE_STATUS = new Set([429, 500, 503, 404]);

/**
 * Of those, the ones a short pause can actually clear.
 *
 * A 503 is a capacity spike on Google's side and is usually over in seconds, so
 * a chain that declined all the way through is worth walking a second time. A
 * 429 is this key's quota for that model, which will not come back inside a
 * request someone is waiting on, and a 404 is a model that no longer exists —
 * pausing for either only makes the same failure slower.
 */
const TRANSIENT_STATUS = new Set([500, 503]);

/** How many times the whole candidate chain is walked. */
const MAX_PASSES = 2;

/**
 * Long enough for a capacity spike to pass, short enough that it disappears
 * against a call that already takes ten seconds. Read per call rather than at
 * import so a test can turn it down without racing module initialisation.
 */
const retryPauseMs = () => {
  const configured = Number.parseInt(process.env.GEMINI_RETRY_PAUSE_MS || "", 10);
  return Number.isFinite(configured) && configured >= 0 ? configured : 1500;
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A request that is reset before Gemini sends an HTTP response has no status
// for callGemini() to inspect. Treat the common transport failures as a
// temporary upstream outage so the caller can try the next configured model.
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
]);

/**
 * The default per-call budget, which suits a conversational turn: one question,
 * a few hundred tokens, back inside a couple of seconds.
 *
 * It does not suit every caller. A batch of fifteen exam questions with their
 * options and explanations was measured at 29–57 seconds against this ceiling —
 * close enough that an ordinary slow run aborts, and an aborted run looks like
 * a transport failure, walks the whole fallback chain and reports whatever the
 * last model in it said. Callers doing that much work pass their own timeoutMs.
 */
export const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || "60000", 10);

const timeoutFor = (timeoutMs) => {
  const requested = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : GEMINI_TIMEOUT_MS;
  return Number.isFinite(requested) && requested > 0 ? requested : 60000;
};

/** One generateContent call against one model. */
const requestGemini = async ({ model, messages, generationConfig, timeoutMs }) => {
  try {
    const response = await axios.post(
      `${GEMINI_ENDPOINT}/models/${model}:generateContent`,
      {
        contents: toGeminiContents(messages),
        systemInstruction: toSystemInstruction(messages),
        generationConfig,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        timeout: timeoutFor(timeoutMs),
      }
    );

    const candidate = response.data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();

    if (!text) {
      const reason = response.data?.promptFeedback?.blockReason || "empty response";
      const emptyError = new Error(`Gemini returned no text (${reason})`);
      // An empty answer is not a model-capacity problem, so it is not retried
      // across models — the same prompt would come back empty again.
      emptyError.statusCode = 502;
      throw emptyError;
    }

    return text;
  } catch (error) {
    // Axios errors caused by a dropped connection do not have a response, so
    // preserve the useful code while giving the fallback loop a retryable
    // status. Do not classify local parsing/empty-response errors as transport
    // failures — those are deliberately created inside this try block too.
    const isTransportError =
      axios.isAxiosError(error) || RETRYABLE_NETWORK_CODES.has(error?.code);

    if (!error.response) {
      if (!isTransportError) throw error;

      // Named for the transport, not for the job. This function serves every
      // caller — interviewer, grader, exam, CV — so a message naming one of
      // them is wrong in the logs of the other three, and a timed-out exam
      // batch reporting that a CV could not be tailored is how a slow call
      // gets mistaken for a broken feature.
      const transport = new Error(
        error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
          ? `Gemini did not answer within ${timeoutFor(timeoutMs) / 1000}s`
          : error.code === "ECONNRESET"
            ? "The Gemini connection was reset before it answered"
            : "The Gemini service could not be reached"
      );
      transport.statusCode = 503;
      transport.code = error.code;
      transport.details = { code: error.code, message: error.message };
      throw transport;
    }

    const apiError = error.response.data?.error || error.response.data || {};
    const surfaced = new Error(
      apiError.message || error.response.statusText || "Gemini API request failed"
    );
    surfaced.statusCode = error.response.status || apiError.code || 500;
    surfaced.details = error.response.data || null;

    // Google says when to come back on some 429s and 503s. Honouring it beats
    // guessing, and it is the only signal that distinguishes "try in a second"
    // from "this quota is gone for the day".
    const retryAfter = Number.parseInt(error.response.headers?.["retry-after"], 10);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      surfaced.retryAfterMs = retryAfter * 1000;
    }

    throw surfaced;
  }
};

/**
 * Pick the failure worth reporting once every candidate has declined.
 *
 * Throwing whichever model happened to be last in the chain is how a dead
 * fallback comes to speak for the whole request: the primary would answer 429
 * "quota exceeded", and the user would be told about high demand on a model
 * nobody chose. So a 429 wins — it is the one an operator can act on — and
 * failing that the primary's answer stands, because it is the model the
 * configuration actually meant to use.
 *
 * The full chain rides along on `.attempts` for the log; it is not put on
 * `.details`, which carries Google's own error body.
 */
const declinedError = (attempts) => {
  // The budget can run out before a single candidate is tried, when an earlier
  // call in the same job spent all of it.
  if (attempts.length === 0) {
    const expired = new Error("Ran out of time before any model could be asked");
    expired.statusCode = 503;
    expired.attempts = [];
    return expired;
  }

  const chosen = attempts.find((attempt) => attempt.status === 429) || attempts[0];

  chosen.error.attempts = attempts.map(({ model, status, message }) => ({
    model,
    status,
    message,
  }));

  return chosen.error;
};

/**
 * Gemini chat completion wrapper.
 *
 * Accepts either one model or a list. On a rate limit, an outage or a retired
 * model it moves to the next candidate rather than failing — mid-interview, a
 * question answered by a different model is a far better outcome than no
 * question at all.
 *
 * When every candidate declines and at least one did so with a capacity error,
 * the chain is walked once more after a pause. Without that, a spike lasting a
 * couple of seconds takes the request down, because the first pass spends all
 * three candidates inside a few hundred milliseconds — they are tried in the
 * time it takes one of them to become available again.
 *
 * @param {object}          params
 * @param {string|string[]} [params.model]     - model, or ordered candidates to try
 * @param {number}          [params.timeoutMs] - per-call ceiling; defaults to GEMINI_TIMEOUT_MS
 * @param {number}          [params.deadline]  - Date.now() past which no further
 *   candidate is tried. Without one, walking three models twice can spend six
 *   times the per-call timeout on a single call — long after the client that
 *   asked for it has given up and stopped listening.
 */
export const callGemini = async ({
  messages,
  temperature = 0.7,
  responseSchema,
  responseMimeType = "application/json",
  model = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS],
  timeoutMs,
  deadline,
}) => {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  const generationConfig = { temperature, responseMimeType };
  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  // De-duplicated so an env override that repeats the primary does not spend
  // two attempts on the same exhausted quota.
  const candidates = [...new Set((Array.isArray(model) ? model : [model]).filter(Boolean))];

  if (candidates.length === 0) {
    throw new Error("No Gemini model configured");
  }

  const attempts = [];
  let pauseMs = retryPauseMs();

  /** Time left to spend, or null when the caller set no deadline. */
  const remaining = () => (deadline ? deadline - Date.now() : null);

  // A tenth of a second is not enough for a model to answer in; asking anyway
  // just converts the deadline into a timeout error with a worse message.
  const outOfTime = () => remaining() !== null && remaining() < 1000;

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    for (const candidate of candidates) {
      if (outOfTime()) {
        warn(`Gemini: out of time before "${candidate}" could be tried`);
        break;
      }

      try {
        const left = remaining();
        const text = await requestGemini({
          model: candidate,
          messages,
          generationConfig,
          // Never let one candidate overrun the budget meant for the chain.
          timeoutMs: left === null ? timeoutMs : Math.min(timeoutFor(timeoutMs), left),
        });

        if (attempts.length > 0) {
          warn(`Gemini: "${candidate}" answered after ${attempts.length} declined attempt(s)`);
        }

        return text;
      } catch (error) {
        // Not a capacity problem: every model would answer this identically, so
        // spending the rest of the chain on it only fails slower.
        if (!RETRYABLE_STATUS.has(error.statusCode)) {
          console.error("Gemini Error:", error.details || error.message || error);
          throw error;
        }

        attempts.push({
          model: candidate,
          status: error.statusCode,
          message: error.message,
          error,
        });

        if (error.retryAfterMs) pauseMs = Math.max(pauseMs, error.retryAfterMs);

        warn(`Gemini model "${candidate}" unavailable (${error.statusCode}: ${error.message})`);
      }
    }

    // Only what a pause can clear is worth pausing for, and only if there is a
    // pass and enough of the budget left to spend on it.
    const thisPass = attempts.slice(-candidates.length);
    const spikey = thisPass.some((attempt) => TRANSIENT_STATUS.has(attempt.status));
    if (pass === MAX_PASSES - 1 || !spikey) break;
    if (remaining() !== null && remaining() < pauseMs + 1000) {
      warn("Gemini: not enough of the budget left to walk the chain again");
      break;
    }

    warn(`Gemini: every model declined; walking the chain again in ${pauseMs}ms`);
    await pause(pauseMs);
  }

  const failure = declinedError(attempts);
  console.error(
    "Gemini Error: every model declined —",
    failure.attempts.map(({ model, status }) => `${model}:${status}`).join(", ")
  );

  throw failure;
};

export const callOpenAI = callGemini;
