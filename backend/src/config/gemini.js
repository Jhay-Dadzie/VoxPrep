export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const getGeminiConfig = () => {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  return {
    apiKey: GEMINI_API_KEY,
    model: GEMINI_MODEL,
  };
};
