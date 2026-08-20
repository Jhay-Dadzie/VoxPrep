import * as cvService from './cv.service.js';
import { sessionIdParamValidation, cvIdParamValidation } from './cv.validation.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import { mapToResponse } from './cv.mapper.js';

/**
 * POST /cv/sessions/:sessionId/tailor
 * Multipart, field `cv`. Rewrites the uploaded CV against the job description
 * behind this session and stores the result.
 */
export const tailorSessionCv = asyncHandler(async (req, res, next) => {
  const { error, value } = sessionIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  if (!req.file) {
    return next(new AppError('Upload a CV file (PDF, DOCX or TXT) to tailor', 400));
  }

  // Only a fallback for a CV with no name on it; the model is told as much.
  const candidateName = req.authUser?.user_metadata?.full_name || null;

  try {
    const tailored = await cvService.tailorCvForSession(
      value.sessionId,
      req.user.id,
      req.file,
      { candidateName }
    );

    res.status(201).json({
      status: 'success',
      data: mapToResponse(tailored),
    });
  } catch (err) {
    // The service marks the failures the user can act on — an unreadable file,
    // a scan with no text — so they arrive as advice rather than a 500.
    return next(new AppError(err.message, err.statusCode || 500));
  }
});

/**
 * GET /cv/sessions/:sessionId
 * The most recent tailored CV for a session, or null if none was made.
 */
export const getSessionCv = asyncHandler(async (req, res, next) => {
  const { error, value } = sessionIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const tailored = await cvService.getLatestForSession(value.sessionId, req.user.id);

  res.status(200).json({
    status: 'success',
    data: mapToResponse(tailored),
  });
});

/** GET /cv/:id — one tailored CV. */
export const getCvById = asyncHandler(async (req, res, next) => {
  const { error, value } = cvIdParamValidation.validate(req.params);
  if (error) return next(new AppError(error.details[0].message, 400));

  const tailored = await cvService.getTailoredCvById(value.id, req.user.id);
  if (!tailored) return next(new AppError('Tailored CV not found', 404));

  res.status(200).json({
    status: 'success',
    data: mapToResponse(tailored),
  });
});

export default {
  tailorSessionCv,
  getSessionCv,
  getCvById,
};
