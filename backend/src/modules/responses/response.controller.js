/**
 * Response Controller
 *
 * Thin HTTP layer — does three things only:
 *  1. Validates the incoming request
 *  2. Delegates to response.service.js
 *  3. Shapes the result through response.mapper.js and sends a response
 *
 * No business logic lives here.
 * All handlers are wrapped by asyncHandler so errors propagate to
 * the global error middleware via next(AppError).
 */

import * as responseService from './response.service.js';
import responseMapper from './response.mapper.js';
import {
  submitResponseSchema,
  updateResponseSchema,
  sessionResponsesQuerySchema,
  validateInput,
} from './response.validation.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import { info } from '../../core/errors/logger.js';

// ─── Helper: turn a validation errors map into a single readable string ───────
const errMsg = (errors) => Object.values(errors).join('; ');

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/v1/responses/sessions/:sessionId/questions/:questionId
 *
 * Creates or replaces the authenticated user's response to a question.
 * Body: { transcribed_text, original_audio_url?, response_duration_seconds?,
 *         transcription_confidence? }
 *
 * Returns 201 with the saved response + question context.
 */
export const submitResponse = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, submitResponseSchema);
  if (!valid) return next(new AppError(errMsg(errors), 400));

  const { sessionId, questionId } = req.params;
  const userId = req.user.id;

  const row = await responseService.submitResponse(sessionId, questionId, userId, value);

  info(`Response submitted [question=${questionId}, user=${userId}]`);

  return res.status(201).json({
    status: 'success',
    message: 'Response submitted successfully',
    data: responseMapper.toResponseWithQuestion(row),
  });
});

/**
 * GET /api/v1/responses/sessions/:sessionId
 *
 * Paginated list of all responses the user has submitted in a session,
 * ordered chronologically. Each item includes the question context and,
 * when include_feedback=true, any available AI feedback.
 *
 * Query: { page?, limit?, include_feedback? }
 */
export const getSessionResponses = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.query, sessionResponsesQuerySchema);
  if (!valid) return next(new AppError(errMsg(errors), 400));

  const { sessionId } = req.params;
  const userId = req.user.id;

  const result = await responseService.getSessionResponses(sessionId, userId, value);

  return res.status(200).json({
    status: 'success',
    data: result.data.map(responseMapper.toResponseListItem),
    pagination: result.pagination,
  });
});

/**
 * GET /api/v1/responses/sessions/:sessionId/questions/:questionId
 *
 * Returns the user's response for a specific question, including question
 * context and any AI feedback that has been generated. Returns 404 if the
 * question has not been answered yet.
 */
export const getQuestionResponse = asyncHandler(async (req, res, next) => {
  const { sessionId, questionId } = req.params;
  const userId = req.user.id;

  const row = await responseService.getQuestionResponse(sessionId, questionId, userId);

  if (!row) {
    return next(new AppError('No response found for this question', 404));
  }

  return res.status(200).json({
    status: 'success',
    data: responseMapper.toResponseWithFeedback(row),
  });
});

/**
 * GET /api/v1/responses/sessions/:sessionId/stats
 *
 * Returns completion statistics for a session:
 * total questions, questions answered, questions pending, completion %.
 */
export const getSessionStats = asyncHandler(async (req, res, next) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  const stats = await responseService.getSessionStats(sessionId, userId);

  return res.status(200).json({
    status: 'success',
    data: stats,
  });
});

/**
 * GET /api/v1/responses/:id
 *
 * Returns a single response by primary key.
 * Accepts ?include_feedback=true to add AI feedback if available.
 */
export const getResponseById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  const include_feedback = req.query.include_feedback === 'true';

  const row = await responseService.getResponseById(id, userId, include_feedback);

  if (!row) {
    return next(new AppError('Response not found', 404));
  }

  return res.status(200).json({
    status: 'success',
    data: include_feedback
      ? responseMapper.toResponseWithFeedback(row)
      : responseMapper.toResponseWithQuestion(row),
  });
});

/**
 * PATCH /api/v1/responses/:id
 *
 * Updates mutable fields on a response — primarily used to allow users to
 * edit their transcribed text before AI evaluation is triggered.
 * Not permitted on responses that belong to completed sessions.
 *
 * Body: { transcribed_text?, original_audio_url?, response_duration_seconds? }
 * At least one field is required (enforced by updateResponseSchema.min(1)).
 */
export const updateResponse = asyncHandler(async (req, res, next) => {
  const { valid, errors, value } = validateInput(req.body, updateResponseSchema);
  if (!valid) return next(new AppError(errMsg(errors), 400));

  const { id } = req.params;
  const userId = req.user.id;

  const row = await responseService.updateResponse(id, userId, value);

  return res.status(200).json({
    status: 'success',
    message: 'Response updated successfully',
    data: responseMapper.toResponse(row),
  });
});

/**
 * DELETE /api/v1/responses/:id
 *
 * Permanently removes a response and decrements the session's
 * questions_answered counter. Not permitted on completed sessions.
 *
 * Responds 204 No Content on success.
 */
export const deleteResponse = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;

  await responseService.deleteResponse(id, userId);

  return res.status(204).send();
});

// ─── Default export (for consumers that prefer object destructuring) ──────────

export default {
  submitResponse,
  getSessionResponses,
  getQuestionResponse,
  getSessionStats,
  getResponseById,
  updateResponse,
  deleteResponse,
};