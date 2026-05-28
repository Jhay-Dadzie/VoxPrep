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

export function getSupabaseClientForToken(accessToken) {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)');
  }

  return createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function initializeUserProfile(id, email, full_name = null, accessToken = null) {
  const supabase = accessToken
    ? getSupabaseClientForToken(accessToken)
    : getSupabaseClient();
  const profile = { id, email, full_name: full_name || null };

  if (accessToken) {
    const { data, error } = await supabase
      .from('users')
      .update({
        email: profile.email,
        full_name: profile.full_name,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return;
    }
  }

  const { error } = await supabase.from('users').insert([profile]);

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
