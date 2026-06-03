import { callGemini } from "../modules/ai/ai.service.js";
import { GEMINI_MODEL } from "./gemini.js";

export const OPENAI_MODEL = GEMINI_MODEL;

export const getOpenAIClient = () => ({
  chat: {
    completions: {
      create: async ({ messages, temperature = 0.7, model = GEMINI_MODEL }) => {
        const content = await callGemini({
          messages,
          temperature,
          model,
        });

        return {
          choices: [
            {
              message: { content },
            },
          ],
        };
      },
    },
  },
});
