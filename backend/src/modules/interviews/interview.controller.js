import {
  createSessionValidation,
  addQuestionValidation,
  submitAnswerValidation,
  getSessionsQueryValidation
} from './interview.validation.js';
import * as service from './interview.service.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import {
  mapSessionToResponse,
  mapSessionListToResponse,
  mapSessionDetailToResponse
} from './interview.mapper.js';
import { mapQuestion } from '../questions/question.mapper.js';

export const createInterviewSession = asyncHandler(async (req, res, next) => {
  const { error, value } = createSessionValidation.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const userId = req.user.id;
  const session = await service.createInterviewSession(userId, value.job_description_id, value.session_title);
  res.status(201).json({
    status: 'success',
    data: mapSessionToResponse(session)
  });
});

export const getInterviewSessions = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { error, value } = getSessionsQueryValidation.validate(req.query);
  if (error) return next(new AppError(error.details[0].message, 400));

  const result = await service.getInterviewSessions(userId, value);
  res.status(200).json({
    status: 'success',
    ...mapSessionListToResponse(result.data, result.pagination)
  });
});

export const getInterviewSessionById = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const session = await service.getInterviewSessionById(id, userId);
  if (!session) return next(new AppError('Interview session not found', 404));

  res.status(200).json({
    status: 'success',
    data: mapSessionDetailToResponse(session)
  });
});

// ─────────────────────────────────────────────────────────────────
// Session Lifecycle Actions
// ─────────────────────────────────────────────────────────────────

export const startSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  await service.startSession(id, userId);
  res.status(200).json({ status: 'success', message: 'Session started' });
});

export const pauseSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  await service.pauseSession(id, userId);
  res.status(200).json({ status: 'success', message: 'Session paused' });
});

export const continueSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  await service.continueSession(id, userId);
  res.status(200).json({ status: 'success', message: 'Session continued successfully' });
});

export const completeSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  await service.completeSession(id, userId);
  res.status(200).json({ status: 'success', message: 'Session completed' });
});

export const deleteSession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;
  await service.deleteSession(id, userId);
  res.status(204).send();
});

// ─────────────────────────────────────────────────────────────────
// AI Question Generation
// ─────────────────────────────────────────────────────────────────

export const addQuestion = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id: sessionId } = req.params;
  const { error, value } = addQuestionValidation.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const questions = await service.generateSessionQuestions(sessionId, userId, value);
  res.status(201).json({
    status: 'success',
    message: 'Questions generated successfully',
    data: questions.map(mapQuestion)
  });
});

export const submitAnswer = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { sessionId, questionId } = req.params;
  const { error, value } = submitAnswerValidation.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const result = await service.submitAnswer(sessionId, questionId, userId, value);
  res.status(200).json({
    status: 'success',
    data: { response_id: result.responseId }
  });
});

export default {
  createInterviewSession,
  getInterviewSessions,
  getInterviewSessionById,
  startSession,
  pauseSession,
  continueSession,
  completeSession,
  deleteSession,
  addQuestion,
  submitAnswer
};
