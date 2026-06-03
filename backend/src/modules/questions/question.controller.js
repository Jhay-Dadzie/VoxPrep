import { asyncHandler } from "../../core/utils/asyncHandler.js";
import { successResponse } from "../../core/utils/response.js";
import { createSessionQuestions } from "./question.service.js";
import { validateInput, generateQuestionsSchema } from "./question.validation.js";
import { mapQuestion } from "./question.mapper.js";

/**
 * POST /questions/generate
 */
export const generateSessionQuestionsController = asyncHandler(
  async (req, res) => {
    const { valid, errors, value } = validateInput(req.body, generateQuestionsSchema);

    if (!valid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    const { sessionId, jobData, questionCount } = value;
    const accessToken = req.token;
    const userId = req.user.id;

    const questions = await createSessionQuestions(sessionId, {
      accessToken,
      userId,
      jobData,
      questionCount,
    });

    return successResponse(res, questions.map(mapQuestion), "Questions generated successfully");
  }
);
