/**
 * Operator / fulfillment routes — Megyprints staff only.
 * All reads use supabaseAdmin (service_role), which bypasses RLS, so the
 * operator can see EVERY customer's orders. Gated by requireStaff.
 */
const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../supabaseAdmin');
const requireStaff = require('../middleware/requireStaff');

const VALID_STATUS = [
  'pending_payment', 'paid', 'in_production', 'printed', 'shipped', 'delivered', 'cancelled',
];
const PHOTO_BUCKET = 'album-photos';

// Every route below requires a valid staff session.
router.use(requireStaff);

// ── List all orders (the operator's queue) ──
// GET /api/admin/orders?status=in_production
router.get('/orders', async (req, res) => {
  const { status } = req.query;
  let q = supabaseAdmin
    .from('orders')
    .select('id, order_number, status, payment_status, amount, currency, album_size, material, cover, page_count, ship_name, ship_phone, created_at')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: data.length, orders: data });
});

// ── One order, in full (the production view) ──
// GET /api/admin/orders/:id
router.get('/orders/:id', async (req, res) => {
  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error || !order) return res.status(404).json({ error: 'Order not found' });

  // Try to resolve printable photo URLs from the snapshot.
  // NOTE: new albums store photos LOCALLY (IndexedDB on the customer's device),
  // so most/all will have no storagePath and cannot be fetched here. This is the
  // known fulfillment gap — photos must be uploaded to storage at order time.
  const photos = Array.isArray(order.album_snapshot && order.album_snapshot.photos)
    ? order.album_snapshot.photos
    : [];
  const cloudPhotos = photos.filter((p) => p && p.storagePath);

  let signed = [];
  if (cloudPhotos.length) {
    const { data: urls, error: sErr } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(cloudPhotos.map((p) => p.storagePath), 60 * 60);
    if (!sErr && urls) {
      signed = urls.map((u, i) => ({ id: cloudPhotos[i].id, url: u.signedUrl, error: u.error }));
    }
  }

  res.json({
    order,
    photos: {
      total: photos.length,
      inCloud: cloudPhotos.length,
      signed,
      warning: cloudPhotos.length < photos.length
        ? 'Some or all photos are stored locally on the customer device, not in cloud storage. They cannot be printed until they are uploaded at order time.'
        : undefined,
    },
  });
});

// ── Advance an order's status (the production pipeline) ──
// PATCH /api/admin/orders/:id/status   body: { status }
router.patch('/orders/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUS.includes(status)) {
    return res.status(400).json({ error: `Invalid status. One of: ${VALID_STATUS.join(', ')}` });
  }

  const { data: current, error: e1 } = await supabaseAdmin
    .from('orders')
    .select('status_history')
    .eq('id', req.params.id)
    .single();
  if (e1 || !current) return res.status(404).json({ error: 'Order not found' });

  const history = Array.isArray(current.status_history) ? current.status_history : [];
  history.push({ status, at: new Date().toISOString(), by: req.staff.email });

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status, status_history: history })
    .eq('id', req.params.id)
    .select('id, order_number, status')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ order: data });
});

module.exports = router;
