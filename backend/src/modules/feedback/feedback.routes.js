/**
 * Feedback Routes
 * Pattern: /api/v1/feedback/*
 *
 * All endpoints require a valid JWT (protect middleware). Ownership is
 * additionally enforced in feedback.service.js via explicit user_id filters.
 *
 * Endpoints:
 *   POST /feedback/sessions/:sessionId/generate  — batch-grade a finished session
 *   GET  /feedback/sessions/:sessionId/summary   — aggregated session scores
 *   GET  /feedback/sessions/:sessionId           — full per-question feedback list
 *   POST /feedback/responses/:responseId/regenerate — force-regrade one response
 *   GET  /feedback/responses/:responseId          — single-response feedback
 *
 * Route ordering: /sessions/:sessionId/summary is registered before the bare
 * /sessions/:sessionId route. They wouldn't actually shadow each other here
 * (different path depths), but keeping the more specific path first matches
 * the convention already established elsewhere in this codebase and avoids
 * surprises if either route is ever generalized later.
 */

import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import {
  generateSessionFeedback,
  getSessionFeedback,
  getSessionFeedbackSummary,
  getResponseFeedback,
  regenerateResponseFeedback,
} from './feedback.controller.js';

const router = Router();

router.use(protect);

// ─── Session-level ──────────────────────────────────────────────────────────
router.post('/sessions/:sessionId/generate', generateSessionFeedback);
router.get('/sessions/:sessionId/summary', getSessionFeedbackSummary);
router.get('/sessions/:sessionId', getSessionFeedback);

// ─── Response-level ─────────────────────────────────────────────────────────
router.post('/responses/:responseId/regenerate', regenerateResponseFeedback);
router.get('/responses/:responseId', getResponseFeedback);

// ─── Health ─────────────────────────────────────────────────────────────────
router.get('/health', (_req, res) =>
  res.status(200).json({ success: true, message: 'Feedback service is healthy' })
);

export default router;