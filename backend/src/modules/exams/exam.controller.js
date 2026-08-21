import { prepareExamValidation, saveAnswerValidation } from './exam.validation.js';
import { parseDocument } from '../uploads/parser.service.js';
import { deriveTitle } from '../../core/utils/helpers.js';
import * as service from './exam.service.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import {
  mapExamToResponse,
  mapExamResultToResponse,
  mapPreparedExamToResponse,
} from './exam.mapper.js';

/**
 * POST /exams/prepare
 *
 * Pasted text or an attached document in, a paper ready to sit out. Unlike
 * /interviews/prepare this really does generate the questions — an exam is
 * written in full before the student sees the first one — so it is the slowest
 * request in the app and the client budgets for it.
 */
export const prepareExam = asyncHandler(async (req, res, next) => {
  const { error, value } = prepareExamValidation.validate(req.body, { abortEarly: false });
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

  // A thirty-question paper needs more to work from than a job description does,
  // but the floor stays where the job_descriptions insert path enforces it —
  // thin material produces a short paper, which the generator reports honestly,
  // rather than no paper at all.
  if (jobContent.length < 50) {
    return next(new AppError('Add more of your material before setting the exam — paste it or upload a document (at least 50 characters).', 400));
  }

  let result;
  try {
    result = await service.prepareExam(req.user.id, {
      jobContent,
      title: value.title?.trim() || deriveTitle(jobContent),
      companyName: value.company_name?.trim() || null,
      experienceLevel: value.required_experience_level || null,
      industry: value.industry?.trim() || null,
      mode: value.mode || 'exam',
      sessionTitle: value.session_title?.trim() || null,
    });
  } catch (err) {
    if (/Could not write enough exam questions/i.test(err.message)) {
      return next(new AppError(err.message, 422));
    }
    return next(err);
  }

  res.status(201).json({
    status: 'success',
    message: 'Exam ready',
    data: mapPreparedExamToResponse(result),
  });
});

/**
 * GET /exams/:sessionId
 *
 * The paper as the student sees it, including any answers already given, so a
 * closed app or a dropped connection resumes exactly where it left off.
 */
export const getExam = asyncHandler(async (req, res, next) => {
  const exam = await service.getExam(req.params.sessionId, req.user.id);
  if (!exam) return next(new AppError('Exam not found', 404));

  res.status(200).json({ status: 'success', data: mapExamToResponse(exam) });
});

/** PUT /exams/:sessionId/answers/:questionId — record or change one selection. */
export const saveAnswer = asyncHandler(async (req, res, next) => {
  const { error, value } = saveAnswerValidation.validate(req.body || {});
  if (error) return next(new AppError(error.details[0].message, 400));

  const { sessionId, questionId } = req.params;

  let result;
  try {
    result = await service.saveAnswer(sessionId, questionId, req.user.id, value.selected_option);
  } catch (err) {
    if (/not found or access denied|Question not found/i.test(err.message)) {
      return next(new AppError(err.message, 404));
    }
    if (/already been submitted|not on this question/i.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    return next(err);
  }

  res.status(200).json({
    status: 'success',
    data: {
      answered_count: result.answeredCount,
      total_questions: result.totalQuestions,
    },
  });
});

/**
 * POST /exams/:sessionId/submit
 *
 * Marks the paper and returns the result in the same response — the student
 * pressed "Complete Exam" and the next thing they should see is their score,
 * not a spinner waiting on a second request.
 */
export const submitExam = asyncHandler(async (req, res, next) => {
  let result;
  try {
    result = await service.submitExam(req.params.sessionId, req.user.id);
  } catch (err) {
    if (/not found or access denied/i.test(err.message)) {
      return next(new AppError('Exam not found', 404));
    }
    if (/no questions to mark/i.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    return next(err);
  }

  res.status(200).json({ status: 'success', data: mapExamResultToResponse(result) });
});

/** GET /exams/:sessionId/result — the marked paper, once it has been marked. */
export const getExamResult = asyncHandler(async (req, res, next) => {
  const result = await service.getExamResult(req.params.sessionId, req.user.id);
  if (!result) return next(new AppError('No marked exam found for this session', 404));

  res.status(200).json({ status: 'success', data: mapExamResultToResponse(result) });
});

/** POST /exams/:sessionId/retake — a fresh paper on the same material. */
export const retakeExam = asyncHandler(async (req, res, next) => {
  let result;
  try {
    result = await service.retakeExam(req.params.sessionId, req.user.id);
  } catch (err) {
    if (/not found or access denied/i.test(err.message)) {
      return next(new AppError('Exam not found', 404));
    }
    if (/no longer available/i.test(err.message)) {
      return next(new AppError(err.message, 400));
    }
    if (/Could not write enough exam questions/i.test(err.message)) {
      return next(new AppError(err.message, 422));
    }
    return next(err);
  }

  res.status(201).json({
    status: 'success',
    message: 'Exam ready',
    data: mapPreparedExamToResponse(result),
  });
});

export default { prepareExam, getExam, saveAnswer, submitExam, getExamResult, retakeExam };
