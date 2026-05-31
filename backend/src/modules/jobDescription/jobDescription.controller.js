import { createJobDescriptionValidation, updateJobDescriptionValidation } from './jobDescription.validation.js';
import { createJobDescription as _createJobDescription, getJobDescriptions as _getJobDescriptions, getJobDescriptionById as _getJobDescriptionById, updateJobDescription as _updateJobDescription, deleteJobDescription as _deleteJobDescription } from './jobDescription.service.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import { mapToResponse, mapToListResponse } from './jobDescription.mapper.js';

export const createJobDescription = asyncHandler(async (req, res, next) => {
  // Validate input
  const { error, value } = createJobDescriptionValidation.validate(req.body, { abortEarly: false });
  if (error) {
    return next(new AppError(error.details.map(d => d.message).join(', '), 400));
  }

  const userId = req.user.id;
  let jobContent = value.job_content;

  // Handle document upload if present
  if (req.file) {
    try {
      const { parseDocument } = await import('../uploads/parser.service.js');
      jobContent = await parseDocument(req.file.buffer, req.file.originalname);
      value.job_content = jobContent; // Update with parsed content
    } catch (parseError) {
      return next(new AppError(`Document parsing failed: ${parseError.message}`, 400));
    }
  }

  // If no content from file or body, reject
  if (!jobContent || jobContent.trim().length < 50) {
    return next(new AppError('Job content is required (either paste text or upload document)', 400));
  }

  const result = await _createJobDescription({
    ...value,
    user_id: userId,
    job_content: jobContent
  });

  res.status(201).json({
    status: 'success',
    data: mapToResponse(result)
  });
});

export const getJobDescriptions = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { page = 1, limit = 10, search } = req.query;

  const result = await _getJobDescriptions(userId, {
    page: parseInt(page),
    limit: parseInt(limit),
    search
  });

  res.status(200).json({
    status: 'success',
    ...mapToListResponse(result.data, result.pagination)
  });
});

export const getJobDescriptionById = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const job = await _getJobDescriptionById(id, userId);
  if (!job) {
    return next(new AppError('Job description not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: mapToResponse(job)
  });
});

export const updateJobDescription = asyncHandler(async (req, res, next) => {
  const { error, value } = updateJobDescriptionValidation.validate(req.body, { abortEarly: false });
  if (error) {
    return next(new AppError(error.details.map(d => d.message).join(', '), 400));
  }

  const userId = req.user.id;
  const { id } = req.params;

  const updatedJob = await _updateJobDescription(id, userId, value);
  if (!updatedJob) {
    return next(new AppError('Job description not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: mapToResponse(updatedJob)
  });
});

export const deleteJobDescription = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const success = await _deleteJobDescription(id, userId);
  if (!success) {
    return next(new AppError('Job description not found', 404));
  }

  res.status(204).send();
});

export default {
  createJobDescription,
  getJobDescriptions,
  getJobDescriptionById,
  updateJobDescription,
  deleteJobDescription,
};
