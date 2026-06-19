/**
 * Supabase admin client — uses the SERVICE ROLE key, which BYPASSES RLS.
 * This must only ever run on the server. Never expose this key to the browser.
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('[megyprints] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — admin routes will not work until they are.');
}

const supabaseAdmin = createClient(url || '', serviceKey || '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = { supabaseAdmin };
