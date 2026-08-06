// src/modules/history/history.routes.js
/**
 * History Routes
 * Pattern: /api/v1/history/*
 *
 * Covers only reviewable sessions (status: completed | paused).
 * Active-session lifecycle endpoints live in the interviews module.
 *
 * Endpoints:
 *   GET    /history              — Paginated list of reviewable sessions
 *   GET    /history/:id          — Full detail: questions, responses, feedback
 *   PATCH  /history/:id/archive  — Toggle is_archived
 *   PATCH  /history/:id/notes    — Update free-text notes
 *   DELETE /history/:id          — Permanently delete
 */

import { Router } from 'express';
const router = Router();
import {
  getHistory,
  getHistoryById,
  archiveSession,
  updateNotes,
  deleteHistorySession,
} from './history.controller.js';
import { protect } from '../auth/auth.middleware.js';

router.use(protect);

router.get('/', getHistory);
router.get('/:id', getHistoryById);
router.patch('/:id/archive', archiveSession);
router.patch('/:id/notes', updateNotes);
router.delete('/:id', deleteHistorySession);

export default router;