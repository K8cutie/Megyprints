// End-to-end proof of the unpaid-order cleanup (0042 + api/expire-orders.mjs)
// against a THROWAWAY LOCAL Supabase stack: real accounts, real files in real
// Storage, the real endpoint code. It creates accounts, so it refuses to run
// against anything but localhost.
//
//   E2E_SUPABASE_URL=http://127.0.0.1:<port> E2E_ANON_KEY=… E2E_SERVICE_KEY=… \
//   E2E_DB_CONTAINER=supabase_db_<project> node scripts/expire-orders-local-e2e.mjs
//
// E2E_DB_CONTAINER is the stack's Postgres container. The script uses it (via
// `docker exec psql`) only to move timestamps back, which no API can do.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const URL_ = process.env.E2E_SUPABASE_URL ?? '';
const ANON = process.env.E2E_ANON_KEY ?? '';
const SERVICE = process.env.E2E_SERVICE_KEY ?? '';
const DB = process.env.E2E_DB_CONTAINER ?? '';
const host = (() => { try { return new URL(URL_).hostname; } catch { return ''; } })();
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
  console.error(`Refusing to run: ${URL_ || '(no E2E_SUPABASE_URL)'} is not a local stack. This script creates accounts.`);
  process.exit(2);
}
if (!ANON || !SERVICE || !DB) { console.error('E2E_ANON_KEY, E2E_SERVICE_KEY and E2E_DB_CONTAINER are required.'); process.exit(2); }

const results = [];
const check = (id, label, want, got) => {
  const pass = JSON.stringify(want) === JSON.stringify(got);
  results.push({ id, pass });
  console.log(`${id} ${pass ? 'PASS' : 'FAIL'} | ${label} | want ${JSON.stringify(want)} | got ${JSON.stringify(got)}`);
};
const psql = (sql) => execFileSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = randomBytes(3).toString('hex');
const code = (c) => `zz${c}${tag}`.replace(/[01]/g, '2').replace(/[^a-z2-9]/g, 'a').slice(0, 20);

async function newCustomer(name) {
  const email = `e2e-${name}-${tag}@example.test`;
  const password = randomBytes(18).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;
  return { id: data.user.id, client };
}

const SHIP = {
  ship_name: 'Ee Tester', ship_phone: '+639000000009', ship_address: '9 Test Street, Test City', ship_zip: '0000',
  ship_region: 'NCR', ship_province: 'Metro Manila', ship_city: 'Test City', ship_barangay: 'Test', ship_street: '9 Test St',
};
const snap = (codes) => ({ pages: [{ qrFills: codes.map((c) => ({ code: c, kind: 'clip' })) }] });

async function placeOrder(cust, albumId, codes) {
  const { data, error } = await cust.client.from('orders')
    .insert({ user_id: cust.id, album_id: albumId, album_snapshot: snap(codes), album_size: '8x8', ...SHIP })
    .select('id, order_number').single();
  if (error) throw error;
  return data;
}
async function newAlbum(cust) {
  const { data, error } = await cust.client.from('albums').insert({ user_id: cust.id, title: `e2e ${tag}` }).select('id').single();
  if (error) throw error;
  return data.id;
}
const bytes = (n, type) => new Blob([randomBytes(n)], { type });
async function upload(client, bucket, name, type) {
  const { error } = await client.storage.from(bucket).upload(name, bytes(2048, type), { contentType: type, upsert: false });
  return error ? error.message : null;
}
async function mustUpload(client, bucket, name, type) {
  const err = await upload(client, bucket, name, type);
  if (err) throw new Error(`${bucket}/${name}: ${err}`);
}
const has = async (bucket, name) => (await admin.storage.from(bucket).exists(name)).data === true;
/** What the phone's clipInBucket sees: list() as that customer. */
const listed = async (cust, c) =>
  ((await cust.client.storage.from('memory-clips').list('', { search: c, limit: 20 })).data ?? []).map((o) => o.name);

async function runEndpoint({ secret, auth, method = 'GET' } = {}) {
  process.env.VITE_SUPABASE_URL = URL_;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret;
  const { default: handler } = await import('../api/expire-orders.mjs');
  let status = 0; let body = null;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  await handler({ method, headers: auth ? { authorization: auth } : {} }, res);
  return { status, body };
}
const status = (id) => psql(`select status from public.orders where id = ${q(id)}`);
/** Move a cancel back in time. The lifecycle guard pins cancelled_at for every
 *  writer, so it is switched off for this one statement (this stack only). */
const backdateCancel = (id, interval) => psql(
  `begin; alter table public.orders disable trigger orders_lifecycle_guard_trg; update public.orders set cancelled_at = now() - interval ${q(interval)} where id = ${q(id)}; alter table public.orders enable trigger orders_lifecycle_guard_trg; commit;`);

async function main() {
  const A = await newCustomer('a');
  const B = await newCustomer('b');
  const C = await newCustomer('c');
  const c1 = code('one'); const c2 = code('two'); const c3 = code('orf'); const c4 = code('yng');

  // ── Setup: A's album with two videos, ordered and never paid ──
  const album1 = await newAlbum(A);
  const album2 = await newAlbum(A);
  const o1 = await placeOrder(A, album1, [c1, c2]);
  check('S0', 'the database keeps the order\'s memory codes', `{${[c1, c2].sort().join(',')}}`, psql(`select memory_codes from public.orders where id = ${q(o1.id)}`));
  await mustUpload(A.client, 'print-pdfs', `${o1.id}.pdf`, 'application/pdf');
  await mustUpload(A.client, 'print-pdfs', `${o1.id}-cover.pdf`, 'application/pdf');
  await mustUpload(A.client, 'memory-clips', `${c1}.mp4`, 'video/mp4');
  await mustUpload(A.client, 'memory-clips', `${c2}.mp4`, 'video/mp4');
  for (const c of [c1, c2]) {
    const { error } = await A.client.from('qr_memories').insert({ code: c, user_id: A.id, destination: `https://e2e.invalid/storage/v1/object/public/memory-clips/${c}.mp4`, kind: 'clip' });
    if (error) throw error;
  }
  // A receipt the cleanup must keep (evidence if a payment is disputed).
  await mustUpload(admin, 'payment-proofs', `${o1.id}.png`, 'image/png');
  psql(`update public.orders set created_at = now() - interval '8 days' where id = ${q(o1.id)}`);

  // Videos uploaded when /order opened, for a checkout that never happened.
  // One is dated 8 days back; on this fresh stack 0042 ran minutes ago, so the
  // "uploaded before 0042, never removed" line is moved back too (this stack
  // only).
  psql(`create or replace function public.clip_purge_since() returns timestamptz language sql stable set search_path = '' as $f$ select now() - interval '30 days' $f$`);
  await mustUpload(A.client, 'memory-clips', `${c3}.mp4`, 'video/mp4');
  await mustUpload(A.client, 'memory-clips', `${c4}.mp4`, 'video/mp4');
  psql(`update storage.objects set created_at = now() - interval '8 days' where bucket_id = 'memory-clips' and name = ${q(`${c3}.mp4`)}`);

  // ── What the phone's checkout relies on (memoryClips.clipInBucket = list) ──
  check('S1', 'uploader finds own clip by code with list(search)', [`${c1}.mp4`], await listed(A, c1));
  check('S2', 'another account finds nothing (RLS applies to list)', [], await listed(B, c1));
  check('S3', 'a longer code finds nothing', [], await listed(A, `${c1}zz`));
  // Why not exists(): on this PUBLIC bucket it answers for anyone (and on the
  // hosted CDN, possibly from cache after a delete). Recorded, not relied on.
  check('S4', 'exists() answers for another account on a public bucket', true, (await B.client.storage.from('memory-clips').exists(`${c1}.mp4`)).data);

  // ── The endpoint's door ──
  check('D1', 'no CRON_SECRET configured: refuses to run', 500, (await runEndpoint({ secret: undefined, auth: 'Bearer x' })).status);
  const secret = randomBytes(24).toString('hex');
  const night = () => runEndpoint({ secret, auth: `Bearer ${secret}` });
  check('D2', 'no Authorization header: 401', 401, (await runEndpoint({ secret })).status);
  check('D3', 'wrong secret: 401', 401, (await runEndpoint({ secret, auth: `Bearer ${secret.slice(0, -1)}x` })).status);
  check('D4', 'PUT: 405', 405, (await runEndpoint({ secret, auth: `Bearer ${secret}`, method: 'PUT' })).status);
  check('D5', 'nothing changed by the refused calls', 'pending_payment', status(o1.id));

  // ── Night 1: the 8-day-old unpaid order is cancelled; its files wait 3 days ──
  const n1 = await night();
  check('N1', 'night 1 runs', 200, n1.status);
  check('N2', '...and cancels the 8-day-old order', true, (n1.body?.expired ?? []).includes(o1.order_number));
  check('N3', 'the order is Cancelled, with its cancel time', 'cancelled|t', psql(`select status || '|' || (cancelled_at is not null)::text::char from public.orders where id = ${q(o1.id)}`));
  check('N4', 'its print file is still there (3 days to match a late payment)', true, await has('print-pdfs', `${o1.id}.pdf`));
  check('N5', 'the unfinished-checkout video, 8 days old, is removed', false, await has('memory-clips', `${c3}.mp4`));
  check('N6', 'a 1-minute-old one is kept', true, await has('memory-clips', `${c4}.mp4`));
  check('N7', '...the night reports it', 1, n1.body?.orphans);

  // While it's closed: no "I've sent", no new files.
  const sent = await A.client.rpc('submit_payment_proof', { p_order_id: o1.id, p_reference: 'REF1', p_proof_path: null });
  check('C1', '"I\'ve sent" on the closed order is refused', 'MP003', sent.error?.code);
  check('C2', '...with what to do', true, /closed because it wasn't paid within 7 days/.test(sent.error?.message ?? ''));
  check('C3', 'a receipt for the closed order is refused', true, !!(await upload(A.client, 'payment-proofs', `${o1.id}.jpg`, 'image/jpeg')));

  // A reorder of the SAME video on another album, placed since: it must keep c2.
  const o2 = await placeOrder(A, album2, [c2]);

  // ── Night 2, 3+ days after the cancel ──
  backdateCancel(o1.id, '4 days');
  const n2 = await night();
  check('N8', 'night 2 runs', 200, n2.status);
  check('N9', '...and cleans the cancelled order', true, (n2.body?.purged ?? 0) >= 1);
  check('N10', 'print PDF removed', false, await has('print-pdfs', `${o1.id}.pdf`));
  check('N11', 'cover PDF removed', false, await has('print-pdfs', `${o1.id}-cover.pdf`));
  check('N12', 'the video only this order used is removed', false, await has('memory-clips', `${c1}.mp4`));
  check('N13', 'the video a live reorder uses is KEPT', true, await has('memory-clips', `${c2}.mp4`));
  check('N14', 'the removed video\'s memory row is gone', '0', psql(`select count(*) from public.qr_memories where code = ${q(c1)}`));
  check('N15', 'the kept video\'s memory row stays', '1', psql(`select count(*) from public.qr_memories where code = ${q(c2)}`));
  check('N16', 'the receipt is kept', true, await has('payment-proofs', `${o1.id}.png`));
  check('N17', 'the order row is kept, marked cleaned', 'cancelled|t', psql(`select status || '|' || (files_purged_at is not null)::text::char from public.orders where id = ${q(o1.id)}`));
  check('N18', 'the album stays in the account', '1', psql(`select count(*) from public.albums where id = ${q(album1)}`));
  check('N19', 'the phone\'s check now sees the video gone (so a reorder uploads it again)', [], await listed(A, c1));
  check('N20', '...and still sees the kept one', [`${c2}.mp4`], await listed(A, c2));

  // After the cleanup the files can't come back, and the order can't reopen.
  check('P1', 'the customer can\'t put the print file back', true, !!(await upload(A.client, 'print-pdfs', `${o1.id}.pdf`, 'application/pdf')));
  check('P2', 'the order can\'t be reopened (nothing to print)', true,
    /MP002|print files were removed/.test((() => { try { psql(`update public.orders set status = 'pending_payment' where id = ${q(o1.id)}`); return 'ALLOWED'; } catch (e) { return String(e.stderr ?? e.message); } })()));
  check('P3', '...nor marked paid', true,
    /MP002|print files were removed/.test((() => { try { psql(`update public.orders set payment_status = 'paid', status = 'paid' where id = ${q(o1.id)}`); return 'ALLOWED'; } catch (e) { return String(e.stderr ?? e.message); } })()));

  // ── Night 3: an already-cleaned order is not touched again ──
  backdateCancel(o1.id, '9 days');
  const n3 = await night();
  check('N21', 'already cleaned: not due again', '0', psql(`select count(*) from public.orders_due_for_file_purge(500) where order_id = ${q(o1.id)}`));
  check('N22', 'night 3 runs clean', 200, n3.status);
  check('N23', 'the live reorder is untouched', 'pending_payment', status(o2.id));

  // ── The customer cancels their own unpaid order ──
  const cancel = await A.client.rpc('cancel_my_unpaid_order', { p_order_id: o2.id });
  check('K1', 'A cancels the reorder from Your orders', true, cancel.data);
  check('K2', '...it is Cancelled by the customer', 'cancelled|customer', psql(`select status || '|' || (status_history -> -1 ->> 'by') from public.orders where id = ${q(o2.id)}`));
  const other = await B.client.rpc('cancel_my_unpaid_order', { p_order_id: o2.id });
  check('K3', 'B cancelling A\'s order changes nothing', false, other.data);
  // The customer's own cancel: its files go on the very next run (no 3 days).
  check('K4', '...a closed order takes no new print file', true, !!(await upload(A.client, 'print-pdfs', `${o2.id}-cover.pdf`, 'application/pdf')));
  const o3 = await placeOrder(A, album2, [c2]);
  await mustUpload(A.client, 'print-pdfs', `${o3.id}.pdf`, 'application/pdf');
  check('K5', 'A cancels another order right after placing it', true, (await A.client.rpc('cancel_my_unpaid_order', { p_order_id: o3.id })).data);
  const n4 = await night();
  check('K6', 'the next run cleans it at once', true, (n4.body?.purged ?? 0) >= 1 && !(await has('print-pdfs', `${o3.id}.pdf`)));
  check('K7', 'with no open order left using it, the shared video goes too', false, await has('memory-clips', `${c2}.mp4`));

  // ── The limit under a burst: 6 orders at the same instant ──
  const albumC = await newAlbum(C);
  const burst = await Promise.allSettled(Array.from({ length: 6 }, () => placeOrder(C, albumC, [])));
  const ok = burst.filter((r) => r.status === 'fulfilled').length;
  const refused = burst.filter((r) => r.status === 'rejected' && r.reason?.code === 'MP001').length;
  check('L1', '6 orders at once: exactly 3 placed', 3, ok);
  check('L2', '...and 3 refused with MP001', 3, refused);
  check('L3', 'the database holds 3 unpaid orders for C', '3', psql(`select count(*) from public.orders where user_id = ${q(C.id)} and status = 'pending_payment'`));
  const msg = burst.find((r) => r.status === 'rejected')?.reason?.message ?? '';
  check('L4', 'the refusal is the sentence', true, msg.startsWith('You already have 3 orders waiting for payment.'));
  const cOrder = burst.find((r) => r.status === 'fulfilled').value;
  check('L5', 'C cancels one in Your orders...', true, (await C.client.rpc('cancel_my_unpaid_order', { p_order_id: cOrder.id })).data);
  let placedAfter = false;
  try { await placeOrder(C, albumC, []); placedAfter = true; } catch { /* refused */ }
  check('L6', '...and can order again', true, placedAfter);

  const fails = results.filter((r) => !r.pass).length;
  console.log(`\nEXPIRE-ORDERS LOCAL E2E — ${results.length - fails}/${results.length} PASS`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
