/**
 * requireStaff — gate for operator/admin routes.
 *
 * service_role bypasses ALL row-level security, so these routes MUST verify
 * the caller is actually Megyprints staff before doing anything. We verify the
 * caller's Supabase access token and check their email against STAFF_EMAILS.
 */
const { supabaseAdmin } = require('../supabaseAdmin');

const STAFF = (process.env.STAFF_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

module.exports = async function requireStaff(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing bearer token' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const email = (data.user.email || '').toLowerCase();
    if (STAFF.length === 0 || !STAFF.includes(email)) {
      return res.status(403).json({ error: 'Not authorized — staff only' });
    }

    req.staff = { id: data.user.id, email };
    next();
  } catch (err) {
    console.error('[megyprints] requireStaff failed:', err);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};
