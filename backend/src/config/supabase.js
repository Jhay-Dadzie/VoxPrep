import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY


if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)');
}


const supabase = createClient(supabaseUrl, supabasePublishableKey);

export default supabase;
