import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

let supabaseClient;

export function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)');
  }

  supabaseClient = createSupabaseClient(supabaseUrl, supabasePublishableKey);
  return supabaseClient;
}

export async function initializeUserProfile(id, email, full_name = null) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('users').insert([{ id, email, full_name }]);

  if (error) {
    throw error;
  }
}

export function createClient(context) {

  const supabaseUrl = process.env.SUPABASE_URL
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)');
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.req.headers.cookie ?? '')
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          context.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value))
        )
        Object.entries(headers).forEach(([key, value]) => context.res.setHeader(key, value))
      },
    },
  })
}
