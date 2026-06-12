/**
 * Response Routes
 * Mount point: /api/v1/responses
 *
 * All routes require a valid JWT (protect middleware).
 *
 * ─── Route Map ────────────────────────────────────────────────────────────────
 *
 *  POST   /responses/sessions/:sessionId/questions/:questionId
 *    → Submit (or re-submit) a response to a question
 *
 *  GET    /responses/sessions/:sessionId
 *    → List all responses for a session (paginated)
 *    → Query: page, limit, include_feedback
 *
 *  GET    /responses/sessions/:sessionId/stats
 *    → Completion statistics (total / answered / pending / %)
 *
 *  GET    /responses/sessions/:sessionId/questions/:questionId
 *    → The response (+ feedback) for a specific question; 404 if unanswered
 *
 *  GET    /responses/:id
 *    → Single response by primary key
 *    → Query: include_feedback (boolean)
 *
 *  PATCH  /responses/:id
 *    → Edit transcribed_text / audio URL (not allowed on completed sessions)
 *
 *  DELETE /responses/:id
 *    → Remove a response (not allowed on completed sessions)
 *
 * ─── Route ordering notes ────────────────────────────────────────────────────
 *
 *  Express matches routes in registration order. Rules applied here:
 *
 *  1. Static literal segments before parametric ones at the SAME depth:
 *       /sessions/:id/stats  must be registered before  /sessions/:id/questions/:qid
 *       so that "stats" is not captured as a questionId.
 *
 *  2. /health must come before  /:id  so it is not swallowed as a UUID param.
 *
 *  3. All /sessions/… routes are registered before /…/:id routes because they
 *     start with a literal "/sessions" segment and cannot be matched by /:id
 *     (which only matches single-segment paths). No conflict, but grouped
 *     logically for clarity.
 */

import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import {
  submitResponse,
  getSessionResponses,
  getSessionStats,
  getQuestionResponse,
  getResponseById,
  updateResponse,
  deleteResponse,
} from './response.controller.js';

const router = Router();

// ─── All response routes require authentication ───────────────────────────────
router.use(protect);

// ─── Health check — MUST be before /:id ──────────────────────────────────────

/**
 * GET /api/v1/responses/health
 */
router.get('/health', (_req, res) =>
  res.status(200).json({ status: 'success', message: 'Response service is healthy' })
);

// ─── Session-scoped routes ────────────────────────────────────────────────────

/**
 * POST /api/v1/responses/sessions/:sessionId/questions/:questionId
 *
 * Submit or update the authenticated user's response to a question.
 * One response per (question, user) pair — re-submitting replaces the previous.
 *
 * Body: {
 *   transcribed_text: string,          // required
 *   original_audio_url?: string|null,  // Supabase Storage URL from speech module
 *   response_duration_seconds?: number|null,
 *   transcription_confidence?: number|null  // 0–1, provided by STT pipeline
 * }
 */
router.post(
  '/sessions/:sessionId/questions/:questionId',
  submitResponse
);

/**
 * GET /api/v1/responses/sessions/:sessionId/stats
 *
 * Returns completion metrics for a session.
 * Response: { session_id, total_questions, questions_answered,
 *             questions_pending, completion_percentage }
 *
 * NOTE: Registered before /sessions/:sessionId to prevent "stats" being
 *       captured as `:sessionId` by a deeper route match.
 */
router.get('/sessions/:sessionId/stats', getSessionStats);

/**
 * GET /api/v1/responses/sessions/:sessionId/questions/:questionId
 *
 * Retrieve the response (and any AI feedback) for a specific question.
 * Returns 404 when the user has not yet answered this question.
 */
router.get(
  '/sessions/:sessionId/questions/:questionId',
  getQuestionResponse
);

/**
 * GET /api/v1/responses/sessions/:sessionId
 *
 * Paginated list of the user's responses in a session, ordered by submission
 * time. Each item includes question context and optional AI feedback.
 *
 * Query params:
 *   page             (default: 1)
 *   limit            (default: 20, max: 100)
 *   include_feedback (default: false) — adds AI feedback when available
 */
router.get('/sessions/:sessionId', getSessionResponses);

// ─── Individual response routes ───────────────────────────────────────────────

/**
 * GET /api/v1/responses/:id
 *
 * Fetch a single response by its primary key.
 * Query: ?include_feedback=true  to include AI feedback if available.
 */
router.get('/:id', getResponseById);

/**
 * PATCH /api/v1/responses/:id
 *
 * Edit a response. Allows correcting the STT transcription before AI
 * evaluation is triggered. Not permitted once the session is completed.
 *
 * Body (at least one field required):
 *   transcribed_text?          string
 *   original_audio_url?        string | null
 *   response_duration_seconds? number | null
 */
router.patch('/:id', updateResponse);

/**
 * DELETE /api/v1/responses/:id
 *
 * Remove a response permanently. Adjusts the session's answered-count.
 * Not permitted on completed sessions.
 * Responds 204 No Content on success.
 */
router.delete('/:id', deleteResponse);

export default router;