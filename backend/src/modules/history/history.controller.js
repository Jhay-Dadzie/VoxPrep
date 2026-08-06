/**
 * History Controller
 *
 * Thin HTTP layer, matching the interviews/jobDescription convention:
 *  1. Validate (history.validation.js)
 *  2. Delegate to history.service.js
 *  3. Map the result through history.mapper.js and respond
 *
 * "not found" service errors are translated to 404s here rather than in
 * the service, so the service layer stays free of HTTP concerns.
 */

import {
  historyQueryValidation,
  archiveValidation,
  notesValidation,
} from './history.validation.js';
import * as service from './history.service.js';
import { asyncHandler } from '../../core/utils/asyncHandler.js';
import { AppError } from '../../core/errors/appError.js';
import {
  toHistoryListResponse,
  toHistoryDetail,
  toArchiveView,
  toNotesView,
} from './history.mapper.js';

// ─── GET /history ───────────────────────────────────────────────────────────

export const getHistory = asyncHandler(async (req, res, next) => {
  const { error, value } = historyQueryValidation.validate(req.query);
  if (error) return next(new AppError(error.details[0].message, 400));

  const userId = req.user.id;
  const result = await service.getHistorySessions(userId, value);

  res.status(200).json({
    status: 'success',
    ...toHistoryListResponse(result.data, result.pagination),
  });
});

// ─── GET /history/:id ───────────────────────────────────────────────────────

export const getHistoryById = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  const session = await service.getHistorySessionById(id, userId);
  if (!session) return next(new AppError('Session not found in history', 404));

  res.status(200).json({
    status: 'success',
    data: toHistoryDetail(session),
  });
});

// ─── PATCH /history/:id/archive ─────────────────────────────────────────────

export const archiveSession = asyncHandler(async (req, res, next) => {
  const { error, value } = archiveValidation.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const userId = req.user.id;
  const { id } = req.params;

  try {
    const row = await service.setArchiveStatus(id, userId, value.is_archived);
    res.status(200).json({
      status: 'success',
      message: value.is_archived ? 'Session archived' : 'Session unarchived',
      data: toArchiveView(row),
    });
  } catch (err) {
    if (err.message.includes('not found')) return next(new AppError(err.message, 404));
    throw err;
  }
});

// ─── PATCH /history/:id/notes ───────────────────────────────────────────────

export const updateNotes = asyncHandler(async (req, res, next) => {
  const { error, value } = notesValidation.validate(req.body);
  if (error) return next(new AppError(error.details[0].message, 400));

  const userId = req.user.id;
  const { id } = req.params;

  try {
    const row = await service.updateNotes(id, userId, value.notes);
    res.status(200).json({
      status: 'success',
      message: 'Notes updated',
      data: toNotesView(row),
    });
  } catch (err) {
    if (err.message.includes('not found')) return next(new AppError(err.message, 404));
    throw err;
  }
});

// ─── DELETE /history/:id ─────────────────────────────────────────────────────

export const deleteHistorySession = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    await service.deleteHistorySession(id, userId);
    res.status(204).send();
  } catch (err) {
    if (err.message.includes('not found')) return next(new AppError(err.message, 404));
    throw err;
  }
});

export default {
  getHistory,
  getHistoryById,
  archiveSession,
  updateNotes,
  deleteHistorySession,
};