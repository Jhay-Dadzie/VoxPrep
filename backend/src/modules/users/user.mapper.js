/**
 * User Mapper
 *
 * Transforms raw Supabase rows into the API response shapes.
 * Nothing from the DB should reach the client unless it passes through here.
 *
 * Rules:
 *  - Never expose internal flags unless they are genuinely needed by the client
 *  - Dates are returned as ISO 8601 strings (Supabase already does this, but
 *    we guard with a fallback in case the driver returns a Date object)
 *  - null stays null — we do not coerce missing data into empty strings
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely convert a value to an ISO string. Returns null if the value is falsy.
 * @param {string|Date|null|undefined} v
 * @returns {string|null}
 */
function toISO(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : v;
}

// ─── Public shapes ────────────────────────────────────────────────────────────

/**
 * Full profile — returned from GET /users/me and PATCH /users/me.
 * Includes state flags so the client can decide what UI to show.
 *
 * @param {object} row  - Raw users table row
 * @returns {object}
 */
function toProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name ?? null,
    is_active: row.is_active ?? true,
    profile_completed: row.profile_completed ?? false,
    last_login: toISO(row.last_login),
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

/**
 * Minimal shape — useful in list contexts or nested objects where full
 * profile detail is unnecessary (e.g. audit summaries, session owners).
 *
 * @param {object} row
 * @returns {object}
 */
function toSummary(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name ?? null,
  };
}

/**
 * Status-only shape — returned from PATCH /users/me/status.
 *
 * @param {object} row
 * @returns {object}
 */
function toStatusView(row) {
  if (!row) return null;
  return {
    id: row.id,
    is_active: row.is_active,
    updated_at: toISO(row.updated_at),
  };
}

/**
 * Profile-completion shape — returned from PATCH /users/me/complete-profile.
 *
 * @param {object} row
 * @returns {object}
 */
function toCompletionView(row) {
  if (!row) return null;
  return {
    id: row.id,
    profile_completed: row.profile_completed,
    updated_at: toISO(row.updated_at),
  };
}

export { toProfile, toSummary, toStatusView, toCompletionView };

export default { toProfile, toSummary, toStatusView, toCompletionView };