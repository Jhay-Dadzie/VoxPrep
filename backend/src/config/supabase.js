import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

// ─── Env helpers ──────────────────────────────────────────────────────────────

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(', ')}`);
  }
}

let supabaseClient;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  requireEnv('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY');

  supabaseClient = createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  );
  return supabaseClient;
}


export function getSupabaseClientForToken(accessToken) {
  requireEnv('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY');

  return createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    },
  );
}

export function getSupabaseAdminClient() {
  requireEnv('SUPABASE_URL', 'SUPABASE_SECRET_KEY');

  return createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

// ─── User profile bootstrap ───────────────────────────────────────────────────
// Called once after signup to upsert a row into the public `users` table.
// Uses the user's own access token so RLS is respected on insert.

export async function initializeUserProfile(id, email, full_name = null, accessToken = null, avatarUrl = null, last_login = null) {
  const supabase = accessToken
    ? getSupabaseClientForToken(accessToken)
    : getSupabaseClient();

  const now = new Date().toISOString();
  const avatarUpdatedAt = avatarUrl ? now : null;

  const profile = {
    id,
    email,
    full_name: full_name || null,
    avatar_url: avatarUrl,
    avatar_updated_at: avatarUpdatedAt,
    last_login,
    updated_at: now,
  };

  // If accessToken provided, try to update existing row first (e.g., Google login after email signup)
  if (accessToken) {
    const { data, error } = await supabase
      .from('users')
      .update({
        email: profile.email,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        avatar_updated_at: profile.avatar_updated_at,
        last_login: profile.last_login,
        updated_at: profile.updated_at,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (data) return; // Row already existed and was updated — done
  }

  // Insert new row (no accessToken or row didn't exist)
  const { error } = await supabase.from('users').insert([profile]);
  if (error) throw error;
}

// ─── SSR cookie-based client ──────────────────────────────────────────────────
// Used when the session is carried in cookies (e.g. Express middleware
// that reads/writes Set-Cookie headers). Not needed for Bearer-token flows.

export function createClient(context) {
  requireEnv('SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY');

  return createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(context.req.headers.cookie ?? '');
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            context.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value)),
          );
        },
      },
    },
  );
}