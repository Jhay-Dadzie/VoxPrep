import * as feedbackService from './feedback.service.js';
import {
  sessionIdParamValidation,
  responseIdParamValidation,
  generateSessionFeedbackQueryValidation,
} from './feedback.validation.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import {
  toFeedbackResponse,
  toFeedbackListResponse,
  toSessionSummaryResponse,
  toGenerateSummaryResponse,
} from './feedback.mapper.js';

/**
 * POST /feedback/sessions/:sessionId/generate?force=false
 * Batch-grades every ungraded/failed response in the session. Requires all
 * questions to already be answered (enforced in the service layer).
 */
export const generateSessionFeedback = asyncHandler(async (req, res, next) => {
  const { error: paramError, value: params } = sessionIdParamValidation.validate(req.params);
  if (paramError) return next(new AppError(paramError.details[0].message, 400));

  const { error: queryError, value: query } = generateSessionFeedbackQueryValidation.validate(req.query);
  if (queryError) return next(new AppError(queryError.details[0].message, 400));

  const userId = req.user.id;
  const result = await feedbackService.generateSessionFeedback(params.sessionId, userId, {
    force: query.force,
  });

  res.status(200).json({
    status: 'success',
    data: toGenerateSummaryResponse(result),
  });
});

/**
 * GET /feedback/sessions/:sessionId
 * Full per-question feedback list for a session.
 */
export const getSessionFeedback = asyncHandler(async (req, res, next) => {
  const { error, value } = sessionIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const feedback = await feedbackService.getSessionFeedback(value.sessionId, req.user.id);

  res.status(200).json({
    status: 'success',
    data: toFeedbackListResponse(feedback),
  });
});

/**
 * GET /feedback/sessions/:sessionId/summary
 * Aggregated per-metric averages for the session (dashboard/history view).
 */
export const getSessionFeedbackSummary = asyncHandler(async (req, res, next) => {
  const { error, value } = sessionIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const summary = await feedbackService.getSessionFeedbackSummary(value.sessionId, req.user.id);

  res.status(200).json({
    status: 'success',
    data: toSessionSummaryResponse(summary),
  });
});

/**
 * GET /feedback/responses/:responseId
 * Single-response feedback (e.g. per-question review screen).
 */
export const getResponseFeedback = asyncHandler(async (req, res, next) => {
  const { error, value } = responseIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const feedback = await feedbackService.getFeedbackByResponseId(value.responseId, req.user.id);

  res.status(200).json({
    status: 'success',
    data: toFeedbackResponse(feedback),
  });
});

/**
 * POST /feedback/responses/:responseId/regenerate
 * Force-regrades a single response, regardless of its current status.
 */
export const regenerateResponseFeedback = asyncHandler(async (req, res, next) => {
  const { error, value } = responseIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const feedback = await feedbackService.regenerateFeedback(value.responseId, req.user.id);

  res.status(200).json({
    status: 'success',
    data: toFeedbackResponse(feedback),
  });
});

export default {
  generateSessionFeedback,
  getSessionFeedback,
  getSessionFeedbackSummary,
  getResponseFeedback,
  regenerateResponseFeedback,
};