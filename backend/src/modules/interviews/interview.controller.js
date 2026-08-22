import {
  createSessionValidation,
  addQuestionValidation,
  nextTurnValidation,
  prepareSessionValidation,
  submitAnswerValidation,
  getSessionsQueryValidation
} from './interview.validation.js';
import { parseDocument } from '../uploads/parser.service.js';
import { deriveTitle } from '../../core/utils/helpers.js';
import { mapToResponse as mapJobDescription } from '../jobDescription/jobDescription.mapper.js';
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

/**
 * POST /interviews/:id/retake
 *
 * Opens a new session against the finished session's job description, so the
 * user can run the interview again without re-entering the source material.
 * Returns the same shape as /prepare.
 */
export const retakeSession = asyncHandler(async (req, res, next) => {
  const { id: sessionId } = req.params;

  let result;
  try {
    result = await service.retakeSession(sessionId, req.user.id);
  } catch (err) {
    if (/not found or access denied/i.test(err.message)) {
      return next(new AppError('Interview session not found', 404));
    }
    if (/no longer available/i.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    return next(err);
  }

  res.status(201).json({
    status: 'success',
    message: 'Session ready',
    data: {
      session: mapSessionToResponse(result.session),
      jobDescription: mapJobDescription(result.jobDescription),
      max_questions: result.maxQuestions,
    },
  });
});

/**
 * POST /interviews/:id/turn
 *
 * Advance a live interview by one turn. Returns the next question — already
 * stored — or `done: true` once the interviewer closes or the cap is reached.
 * The client speaks the question, records the answer, and calls again.
 */
export const nextTurn = asyncHandler(async (req, res, next) => {
  const { error, value } = nextTurnValidation.validate(req.body || {});
  if (error) return next(new AppError(error.details[0].message, 400));

  const { id: sessionId } = req.params;

  let turn;
  try {
    turn = await service.nextTurn(sessionId, req.user.id, {
      mode: value.mode || null,
      maxQuestions: value.max_questions,
      candidateName: value.candidate_name?.trim() || req.user.full_name || null,
    });
  } catch (err) {
    // The client shows these to the candidate mid-interview, so a session that
    // cannot be continued has to read as a refusal, not as a server fault.
    if (/not found or access denied/i.test(err.message)) {
      return next(new AppError('Interview session not found', 404));
    }
    if (/already been completed|no source material|written exam/i.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    return next(err);
  }

  res.status(200).json({
    status: 'success',
    data: {
      done: turn.done,
      reason: turn.reason ?? null,
      closing_remark: turn.closingRemark ?? null,
      // True when this question was already outstanding — the client is
      // retrying a turn rather than being given a new one.
      repeated: turn.repeated ?? false,
      question: turn.question ?? null,
      asked_count: turn.askedCount,
      max_questions: turn.maxQuestions,
    },
  });
});

/**
 * POST /interviews/prepare
 *
 * Accepts pasted text (JSON or form field) or an attached document, and returns
 * a session ready to be interviewed. No questions come back: they are written
 * one at a time during the interview — see nextTurn.
 */
export const prepareSession = asyncHandler(async (req, res, next) => {
  const { error, value } = prepareSessionValidation.validate(req.body, { abortEarly: false });
  if (error) return next(new AppError(error.details.map((d) => d.message).join(', '), 400));

  let jobContent = value.job_content?.trim() || '';

  if (req.file) {
    try {
      jobContent = (await parseDocument(req.file.buffer, req.file.originalname))?.trim() || '';
    } catch (parseError) {
      return next(new AppError(`Could not read that document: ${parseError.message}`, 400));
    }

    if (!jobContent) {
      return next(new AppError('That document appears to be empty or contains no readable text. If it is a scanned image, paste the text instead.', 400));
    }
  }

  // Matches the 50-char floor the job_descriptions insert path already enforces.
  if (jobContent.length < 50) {
    return next(new AppError('Add more detail before generating questions - paste the description or upload a document (at least 50 characters).', 400));
  }

  const result = await service.prepareSession(req.user.id, {
    jobContent,
    title: value.title?.trim() || deriveTitle(jobContent),
    companyName: value.company_name?.trim() || null,
    experienceLevel: value.required_experience_level || null,
    industry: value.industry?.trim() || null,
    mode: value.mode || null,
    sessionTitle: value.session_title?.trim() || null,
  });

  res.status(201).json({
    status: 'success',
    message: 'Session ready',
    data: {
      session: mapSessionToResponse(result.session),
      jobDescription: mapJobDescription(result.jobDescription),
      mode: result.mode,
      max_questions: result.maxQuestions,
    },
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
  nextTurn,
  prepareSession,
  retakeSession,
  submitAnswer
};
