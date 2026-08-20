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

/** One generateContent call against one model. */
const requestGemini = async ({ model, messages, generationConfig }) => {
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
    if (!error.response) throw error;

    const apiError = error.response.data?.error || error.response.data || {};
    const surfaced = new Error(
      apiError.message || error.response.statusText || "Gemini API request failed"
    );
    surfaced.statusCode = error.response.status || apiError.code || 500;
    surfaced.details = error.response.data || null;
    throw surfaced;
  }
};

/**
 * Gemini chat completion wrapper.
 *
 * Accepts either one model or a list. On a rate limit, an outage or a retired
 * model it moves to the next candidate rather than failing — mid-interview, a
 * question answered by a different model is a far better outcome than no
 * question at all.
 *
 * @param {object}          params
 * @param {string|string[]} [params.model] - model, or ordered candidates to try
 */
export const callGemini = async ({
  messages,
  temperature = 0.7,
  responseSchema,
  responseMimeType = "application/json",
  model = [GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS],
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

  let lastError;

  for (const [index, candidate] of candidates.entries()) {
    try {
      const text = await requestGemini({ model: candidate, messages, generationConfig });

      if (index > 0) {
        warn(`Gemini: "${candidate}" answered after ${index} model(s) declined`);
      }

      return text;
    } catch (error) {
      lastError = error;

      const isLast = index === candidates.length - 1;
      if (isLast || !RETRYABLE_STATUS.has(error.statusCode)) {
        console.error("Gemini Error:", error.details || error.message || error);
        throw error;
      }

      warn(
        `Gemini model "${candidate}" unavailable (${error.statusCode}: ${error.message}); ` +
        `trying "${candidates[index + 1]}"`
      );
    }
  }

  throw lastError;
};

export const callOpenAI = callGemini;
