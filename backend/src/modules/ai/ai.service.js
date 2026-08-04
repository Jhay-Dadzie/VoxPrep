import axios from "axios";
import { GEMINI_API_KEY, GEMINI_MODEL } from "../../config/gemini.js";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

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

const questionSchema = {
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
 * Gemini chat completion wrapper
 */
export const callGemini = async ({
  messages,
  temperature = 0.7,
  responseSchema,
  responseMimeType = "application/json",
  model = GEMINI_MODEL,
}) => {
  const generationConfig = {
    temperature,
    responseMimeType,
  };

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("Missing Gemini API key");
    }

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
      throw new Error(`Gemini returned no text (${reason})`);
    }

    return text;
  } catch (error) {
    const apiError = error.response?.data?.error || error.response?.data || {};
    const message =
      apiError.message ||
      error.response?.statusText ||
      error.message ||
      "Gemini API request failed";
    const statusCode = error.response?.status || apiError.code || 500;

    console.error("Gemini Error:", error.response?.data || error.message || error);

    const surfacedError = new Error(message);
    surfacedError.statusCode = statusCode;
    surfacedError.details = error.response?.data || null;
    throw surfacedError;
  }
};

export const callOpenAI = callGemini;
