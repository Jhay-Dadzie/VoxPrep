/**
 * User Controller
 *
 * Thin HTTP layer — it does three things only:
 *  1. Validates the incoming request (via user.validation.js)
 *  2. Delegates to user.service.js
 *  3. Maps the result through user.mapper.js and sends a response
 *
 * No business logic lives here.
 */

import userService from './user.service.js';
import userMapper from './user.mapper.js';
import {
  validateInput,
  updateProfileSchema,
  updateStatusSchema,
  completeProfileSchema,
} from './user.validation.js';
import { info, error as _error } from '../../core/errors/logger.js';

class UserController {
  // ─── GET /users/me ──────────────────────────────────────────────────────────

  /**
   * Returns the authenticated user's full profile.
   * The user's identity comes from req.user (injected by auth.middleware protect).
   */
  async getProfile(req, res) {
    try {
      const { id: userId } = req.user;
      const accessToken = req.token;

      const row = await userService.getProfile(userId, accessToken);

      return res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully',
        data: userMapper.toProfile(row),
      });
    } catch (error) {
      _error('getProfile controller error:', error);

      const status = error.message.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to retrieve profile',
      });
    }
  }

  // ─── PATCH /users/me ────────────────────────────────────────────────────────

  /**
   * Updates mutable profile fields (full_name).
   * Only fields present in the validated body are written — no accidental nulls.
   */
  async updateProfile(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, updateProfileSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { id: userId } = req.user;
      const accessToken = req.token;

      const row = await userService.updateProfile(userId, accessToken, value);

      info(`Profile updated for user ${userId}`);

      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: userMapper.toProfile(row),
      });
    } catch (error) {
      _error('updateProfile controller error:', error);

      const status = error.message.includes('not found') ? 404 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to update profile',
      });
    }
  }

  // ─── PATCH /users/me/status ─────────────────────────────────────────────────

  /**
   * Toggles the is_active flag.
   *
   * Deactivating: sets is_active = false.
   *   The caller's JWT remains valid until expiry — if you want immediate
   *   revocation, also call POST /auth/logout from the client.
   *
   * Reactivating: sets is_active = true.
   *   Useful for a support flow or self-service reactivation.
   */
  async updateStatus(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, updateStatusSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { id: userId } = req.user;
      const accessToken = req.token;

      const row = await userService.setActiveStatus(userId, accessToken, value.is_active);

      const action = value.is_active ? 'activated' : 'deactivated';
      info(`Account ${action} for user ${userId}`);

      return res.status(200).json({
        success: true,
        message: `Account ${action} successfully`,
        data: userMapper.toStatusView(row),
      });
    } catch (error) {
      _error('updateStatus controller error:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update account status',
      });
    }
  }

  // ─── PATCH /users/me/complete-profile ──────────────────────────────────────

  /**
   * Marks the user's profile as complete (profile_completed = true).
   * Idempotent — safe to call multiple times; returns 200 either way.
   */
  async completeProfile(req, res) {
    try {
      // Validate body (must be empty; reject unexpected fields)
      const { valid, errors } = validateInput(req.body ?? {}, completeProfileSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { id: userId } = req.user;
      const accessToken = req.token;

      const row = await userService.markProfileComplete(userId, accessToken);

      return res.status(200).json({
        success: true,
        message: 'Profile marked as complete',
        data: userMapper.toCompletionView(row),
      });
    } catch (error) {
      _error('completeProfile controller error:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to mark profile as complete',
      });
    }
  }

  // ─── DELETE /users/me ───────────────────────────────────────────────────────

  /**
   * Permanently deletes the authenticated user's account and all child data
   * (cascaded in the DB schema). Requires SUPABASE_SECRET_KEY (sb_secret_...) to be set.
   *
   * The endpoint responds 204 No Content on success — the client should
   * clear its local session immediately.
   */
  async deleteAccount(req, res) {
    try {
      const { id: userId } = req.user;
      const accessToken = req.token;

      await userService.deleteAccount(userId, accessToken);

      info(`Account deleted for user ${userId}`);

      // 204 — no body
      return res.status(204).send();
    } catch (error) {
      _error('deleteAccount controller error:', error);

      if (error.message.includes('SUPABASE_SECRET_KEY')) {
        return res.status(501).json({
          success: false,
          message: 'Account deletion is not available in this environment',
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete account',
      });
    }
  }
}

export default new UserController();