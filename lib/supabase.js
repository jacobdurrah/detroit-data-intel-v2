const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
}

// Public client using the anon key (respects Row Level Security)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service client using the service role key (bypasses Row Level Security)
// Use only in trusted server-side contexts
function getServiceClient() {
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_KEY environment variable');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

module.exports = { supabase, getServiceClient };
