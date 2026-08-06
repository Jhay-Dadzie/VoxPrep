import { createClient } from '@supabase/supabase-js'

/**
 * Supabase clients.
 *
 * Two of them, deliberately:
 *
 * - `getSupabase()` uses the publishable key and is subject to RLS. Use it for
 *   anything acting on behalf of a signed-in user.
 * - `getSupabaseAdmin()` uses the service role key and bypasses RLS entirely.
 *   Every write this server makes needs it: the policies in supabase_schema.sql
 *   are written against `auth.uid()`, which is NULL for a server-side call, so
 *   inserts fail without it. interview_questions has no INSERT policy at all.
 *
 * Both are lazy. Importing this module must not throw, so that question
 * generation keeps working on a machine where Supabase is not configured yet.
 * The service role key must never reach the client — it is full database access.
 */

let cached = null
let cachedAdmin = null

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function getSupabase() {
  if (cached) return cached

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY')
  }

  cached = createClient(url, key)
  return cached
}

export function getSupabaseAdmin() {
  if (cachedAdmin) return cachedAdmin

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cachedAdmin
}
