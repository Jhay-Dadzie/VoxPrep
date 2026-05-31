/**
 * User Routes
 * Pattern: /api/v1/users/*
 *
 * All endpoints require a valid JWT (protect middleware).
 * RLS in Supabase provides the secondary ownership check — the service
 * passes the user's own access token so queries are automatically scoped.
 *
 * Endpoints:
 *   GET    /users/me                  — Fetch own profile
 *   PATCH  /users/me                  — Update profile fields (full_name)
 *   PATCH  /users/me/status           — Toggle is_active flag
 *   PATCH  /users/me/complete-profile — Mark profile as completed
 *   DELETE /users/me                  — Permanently delete account
 */

import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import userController from './user.controller.js';

const router = Router();

// ─── Inline async wrapper (matches auth.routes.js pattern) ───────────────────
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ─── All user routes require authentication ───────────────────────────────────
router.use(protect);

// ─── Profile ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/users/me
 * Returns the authenticated user's full profile.
 * Headers: Authorization: Bearer <access_token>
 */
router.get('/me', asyncHandler(userController.getProfile.bind(userController)));

/**
 * PATCH /api/v1/users/me
 * Partially updates mutable profile fields.
 * Body: { full_name?: string }
 * Headers: Authorization: Bearer <access_token>
 */
router.patch('/me', asyncHandler(userController.updateProfile.bind(userController)));

// ─── State flags ──────────────────────────────────────────────────────────────

/**
 * PATCH /api/v1/users/me/status
 * Activates or deactivates the user's own account.
 * Body: { is_active: boolean }
 * Headers: Authorization: Bearer <access_token>
 *
 * Note: deactivation does NOT immediately invalidate the JWT — the client
 * should also call POST /auth/logout to sign out of Supabase.
 */
router.patch(
  '/me/status',
  asyncHandler(userController.updateStatus.bind(userController))
);

/**
 * PATCH /api/v1/users/me/complete-profile
 * Marks profile_completed = true. Idempotent — safe to call multiple times.
 * Body: {} (empty)
 * Headers: Authorization: Bearer <access_token>
 */
router.patch(
  '/me/complete-profile',
  asyncHandler(userController.completeProfile.bind(userController))
);

// ─── Account deletion ─────────────────────────────────────────────────────────

/**
 * DELETE /api/v1/users/me
 * Permanently deletes the authenticated user's account and all child data.
 * Responds 204 No Content on success.
 * Headers: Authorization: Bearer <access_token>
 *
 * Requires SUPABASE_SECRET_KEY (sb_secret_...) to be configured server-side.
 * Returns 501 if the env variable is absent.
 */
router.delete('/me', asyncHandler(userController.deleteAccount.bind(userController)));

// ─── Health ───────────────────────────────────────────────────────────────────

router.get('/health', (_req, res) =>
  res.status(200).json({ success: true, message: 'User service is healthy' })
);

export default router;