/**
 * User Service
 *
 * Owns all database interactions for the `users` table.
 *
 * Design decisions:
 *  - Every mutating query uses getSupabaseClientForToken(accessToken) so that
 *    Supabase Row Level Security policies enforce ownership — the service never
 *    needs to re-check "does this user own this row?" manually.
 *  - READ queries also use the token client for RLS consistency.
 *  - The service never returns raw DB rows; the controller/mapper layer handles
 *    shaping. The service returns { data, error } or throws.
 *  - Audit trail is fire-and-forget (warn on failure, never crash the request).
 *  - All public methods are async and throw on unrecoverable errors so the
 *    controller's try/catch gives a clean 4xx/5xx split.
 */

import {
  getSupabaseClient,
  getSupabaseClientForToken,
  getSupabaseAdminClient,
} from '../../config/supabase.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLE = 'users';

/**
 * Columns safe to return to the API layer.
 * We never select * — audit/internal columns stay server-side.
 */
const PUBLIC_COLUMNS =
  'id, email, full_name, is_active, profile_completed, last_login, created_at, updated_at';

// ─── Service class ────────────────────────────────────────────────────────────

class UserService {
  // ── Reads ──────────────────────────────────────────────────────────────────

  /**
   * Fetch the authenticated user's own profile.
   * RLS on users table guarantees auth.uid() = id.
   *
   * @param {string} userId      - From req.user.id (already verified JWT)
   * @param {string} accessToken - Raw Bearer token forwarded to Supabase
   * @returns {Promise<object>}  - Raw DB row (mapper applied in controller)
   */
  async getProfile(userId, accessToken) {
    const supabase = getSupabaseClientForToken(accessToken);

    const { data, error } = await supabase
      .from(TABLE)
      .select(PUBLIC_COLUMNS)
      .eq('id', userId)
      .single();

    if (error) {
      _error(`getProfile failed for user ${userId}:`, error);
      throw new Error('Failed to retrieve user profile');
    }

    if (!data) {
      throw new Error('User profile not found');
    }

    return data;
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Update mutable profile fields (full_name for now; extendable).
   * The UPDATE is scoped by RLS — the user can only update their own row.
   *
   * @param {string} userId
   * @param {string} accessToken
   * @param {{ full_name?: string }} fields  - Already validated, strip-unknown applied
   * @returns {Promise<object>}  - Updated row
   */
  async updateProfile(userId, accessToken, fields) {
    if (!fields || Object.keys(fields).length === 0) {
      throw new Error('No fields provided for update');
    }
  
    const supabase = getSupabaseClientForToken(accessToken);
  
    // Update public.users
    const { data, error } = await supabase
      .from(TABLE)
      .update(fields)
      .eq('id', userId)
      .select(PUBLIC_COLUMNS)
      .single();
  
    if (error) {
      _error(`updateProfile failed for user ${userId}:`, error);
      throw new Error('Failed to update user profile');
    }
  
    if (!data) {
      throw new Error('User not found or update not permitted');
    }
  
    // Sync auth.users metadata
    if (fields.full_name) {
      try {
        const adminClient = getSupabaseAdminClient();
  
        const { error: authError } =
          await adminClient.auth.admin.updateUserById(userId, {
            user_metadata: {
              full_name: fields.full_name,
            },
          });
  
        if (authError) {
          warn(
            `Failed to sync auth metadata for user ${userId}:`,
            authError
          );
        }
      } catch (err) {
        warn(
          `Failed to sync auth metadata for user ${userId}:`,
          err
        );
      }
    }
  
    await this._logAudit({
      user_id: userId,
      action: 'profile_updated',
      resource_type: 'user',
      resource_id: userId,
      details: {
        updated_fields: Object.keys(fields),
      },
    });
  
    info(`Profile updated for user ${userId}`);
  
    return data;
  }

  /**
   * Set is_active flag — used for both self-deactivation and re-activation.
   * A deactivated user's JWT is still technically valid until expiry, so
   * callers should combine this with a Supabase sign-out if needed.
   *
   * @param {string} userId
   * @param {string} accessToken
   * @param {boolean} isActive
   * @returns {Promise<object>}  - Updated row (id, is_active, updated_at)
   */
  async setActiveStatus(userId, accessToken, isActive) {
    const supabase = getSupabaseClientForToken(accessToken);

    const { data, error } = await supabase
      .from(TABLE)
      .update({ is_active: isActive })
      .eq('id', userId)
      .select('id, is_active, updated_at')
      .single();

    if (error) {
      _error(`setActiveStatus failed for user ${userId}:`, error);
      throw new Error('Failed to update account status');
    }

    if (!data) {
      throw new Error('User not found or update not permitted');
    }

    await this._logAudit({
      user_id: userId,
      action: isActive ? 'account_activated' : 'account_deactivated',
      resource_type: 'user',
      resource_id: userId,
    });

    info(`User ${userId} is_active set to ${isActive}`);
    return data;
  }

  /**
   * Mark a user's profile as complete.
   *
   * profile_completed is a one-way flag in the schema — once true it should
   * not normally be reset to false by the user. We enforce this here:
   * if already complete we return the current row without a redundant write.
   *
   * @param {string} userId
   * @param {string} accessToken
   * @returns {Promise<object>}  - Row with profile_completed and updated_at
   */
  async markProfileComplete(userId, accessToken) {
    const supabase = getSupabaseClientForToken(accessToken);

    // ── Check current state (avoids unnecessary write) ─────────────────────
    const { data: current, error: fetchError } = await supabase
      .from(TABLE)
      .select('id, profile_completed, updated_at')
      .eq('id', userId)
      .single();

    if (fetchError || !current) {
      _error(`markProfileComplete fetch failed for user ${userId}:`, fetchError);
      throw new Error('Failed to retrieve user for profile completion');
    }

    if (current.profile_completed) {
      // Already done — idempotent response
      info(`markProfileComplete: user ${userId} was already complete`);
      return current;
    }

    // ── Write ───────────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from(TABLE)
      .update({ profile_completed: true })
      .eq('id', userId)
      .select('id, profile_completed, updated_at')
      .single();

    if (error) {
      _error(`markProfileComplete update failed for user ${userId}:`, error);
      throw new Error('Failed to mark profile as complete');
    }

    await this._logAudit({
      user_id: userId,
      action: 'profile_completed',
      resource_type: 'user',
      resource_id: userId,
    });

    info(`Profile marked complete for user ${userId}`);
    return data;
  }

  /**
   * Hard-delete a user's own account.
   *
   * Cascade deletes on all child tables are defined in the schema.
   * We sign the user out first so their active JWT cannot be reused.
   *
   * Uses getSupabaseAdminClient() which is built with the new SUPABASE_SECRET_KEY
   * (sb_secret_...) — the replacement for the deprecated legacy service_role key.
   * The admin client bypasses RLS and can call auth.admin.deleteUser.
   *
   * @param {string} userId
   * @param {string} accessToken
   * @returns {Promise<{ deleted: true }>}
   */
  async deleteAccount(userId, accessToken) {
    // Guard: SUPABASE_SECRET_KEY must be set (checked inside getSupabaseAdminClient)
    // Throws with a clear message if the env var is missing.
    const adminClient = getSupabaseAdminClient();

    // Sign the user's session out first so their JWT cannot be reused
    const userClient = getSupabaseClientForToken(accessToken);
    await userClient.auth.signOut();

    // Delete the user from auth.users via the admin API (bypasses RLS)
    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      _error(`deleteAccount failed for user ${userId}:`, error);
      throw new Error('Failed to delete account');
    }

    await this._logAudit({
      user_id: userId,
      action: 'account_deleted',
      resource_type: 'user',
      resource_id: userId,
    });

    info(`Account deleted for user ${userId}`);
    return { deleted: true };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Fire-and-forget audit trail.
   * Mirrors the pattern used in auth.service.js — never throws, only warns.
   */
  async _logAudit({ user_id, action, resource_type, resource_id, details = null }) {
    const supabase = getSupabaseClient();

    try {
      await supabase.from('audit_log').insert([
        {
          user_id,
          action,
          resource_type,
          resource_id,
          details,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      warn('Failed to log audit trail:', err);
    }
  }
}

export default new UserService();