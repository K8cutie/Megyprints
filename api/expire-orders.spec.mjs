import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   /api/expire-orders — the nightly cleanup of unpaid orders (0042).
   These lock:
     · it refuses to run with no CRON_SECRET, and refuses any caller without
       the exact secret (nothing is read or changed);
     · the expiry runs first, then each due order: CLAIMED first (an order
       the owner reopened is skipped untouched), PDFs, then the videos the
       DATABASE lists for that order, then the record; then videos from
       checkouts that never finished. Nothing comes from the request;
     · receipts (payment-proofs) are never touched;
     · one order's failure leaves that order unrecorded (tomorrow retries it)
       and doesn't stop the others;
     · a failed video lookup removes no videos and records nothing.
   The real thing ran end to end against a local stack:
   scripts/expire-orders-local-e2e.mjs.
   ══════════════════════════════════════════════════════════════════════════ */

const SECRET = 'cron-secret-for-tests-0123456789';
process.env.VITE_SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

let log;
let db;

const freshDb = () => ({
  expired: { data: [{ order_id: 'ord-old', order_number: 'MP-2026-OLD0001' }], error: null },
  due: { data: [{ order_id: 'ord-a' }, { order_id: 'ord-b' }], error: null },
  clips: {
    'ord-a': { data: [{ code: 'k7m2p9qz', object_name: 'k7m2p9qz.mp4' }, { code: 'k7m2p9qz', object_name: 'k7m2p9qz.mov' }], error: null },
    'ord-b': { data: [], error: null },
  },
  claim: () => true,
  orphans: { data: [{ code: 'zzorphan', object_name: 'zzorphan.mp4' }], error: null },
  removeErr: () => null,
  finishErr: () => null,
});

const adminClient = () => ({
  rpc: async (name, args) => {
    log.push(`rpc:${name}${args?.p_order_id ? `:${args.p_order_id}` : ''}${args?.p_codes?.length ? `:${args.p_codes.join(',')}` : ''}`);
    if (name === 'expire_unpaid_orders') return db.expired;
    // A list may be one answer (every call) or { batches } served in turn.
    const next = (v) => (v?.batches ? (v.batches.shift() ?? { data: [], error: null }) : v);
    if (name === 'orders_due_for_file_purge') return next(db.due);
    if (name === 'claim_order_file_purge') return { data: db.claim(args.p_order_id), error: null };
    if (name === 'orphan_clip_files') return next(db.orphans);
    if (name === 'order_clip_files_to_purge') return db.clips[args.p_order_id] ?? { data: [], error: null };
    if (name === 'finish_order_file_purge') {
      const err = db.finishErr(args.p_order_id);
      return err ? { data: null, error: err } : { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  },
  from: () => { throw new Error('the cleanup must not read tables directly'); },
  storage: {
    from: (bucket) => ({
      remove: async (names) => {
        log.push(`remove:${bucket}:${names.join(',')}`);
        const err = db.removeErr(bucket, names);
        return err ? { data: null, error: err } : { data: names.map((name) => ({ name })), error: null };
      },
    }),
  },
});

let clientsMade;
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url, key) => { clientsMade.push(key); return adminClient(); },
}));

let mod;
beforeAll(async () => { mod = await import('./expire-orders.mjs'); });
beforeEach(() => {
  log = []; clientsMade = []; db = freshDb();
  process.env.CRON_SECRET = SECRET;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const mkRes = () => {
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
};
const call = async (over = {}) => {
  const res = mkRes();
  await mod.default({ method: 'GET', headers: { authorization: `Bearer ${SECRET}` }, query: {}, body: {}, ...over }, res);
  return res;
};

describe('the door', () => {
  it('no CRON_SECRET configured: refuses to run at all (fail closed)', async () => {
    delete process.env.CRON_SECRET;
    const res = await call();
    expect(res.code).toBe(500);
    expect(clientsMade).toEqual([]);
    expect(log).toEqual([]);
  });
  it('a too-short CRON_SECRET counts as not configured', async () => {
    process.env.CRON_SECRET = 'short';
    const res = await call({ headers: { authorization: 'Bearer short' } });
    expect(res.code).toBe(500);
    expect(log).toEqual([]);
  });
  it.each([
    ['no header', {}],
    ['wrong secret', { authorization: `Bearer ${SECRET.slice(0, -1)}x` }],
    ['secret plus extra', { authorization: `Bearer ${SECRET}x` }],
    ['not a bearer', { authorization: SECRET }],
  ])('%s: 401, nothing read or changed', async (_label, headers) => {
    const res = await call({ headers });
    expect(res.code).toBe(401);
    expect(clientsMade).toEqual([]);
    expect(log).toEqual([]);
  });
  it('only GET and POST', async () => {
    const res = await call({ method: 'DELETE' });
    expect(res.code).toBe(405);
    expect(log).toEqual([]);
  });
  it('secretMatches is exact', () => {
    expect(mod.secretMatches(SECRET, SECRET)).toBe(true);
    expect(mod.secretMatches(SECRET.toUpperCase(), SECRET)).toBe(false);
    expect(mod.secretMatches('', SECRET)).toBe(false);
    expect(mod.secretMatches(undefined, SECRET)).toBe(false);
  });
});

describe('a night', () => {
  it('expires, then for each due order claims it, removes its PDFs, then the videos the database lists, then records it; then the unfinished-checkout videos', async () => {
    const res = await call();
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ expired: ['MP-2026-OLD0001'], purged: 2, skipped: 0, videos: 2, orphans: 1, errors: [], more: false });
    expect(clientsMade).toEqual(['service-test']);
    expect(log).toEqual([
      'rpc:expire_unpaid_orders',
      'rpc:orders_due_for_file_purge',
      'rpc:claim_order_file_purge:ord-a',
      'remove:print-pdfs:ord-a.pdf,ord-a-cover.pdf',
      'rpc:order_clip_files_to_purge:ord-a',
      'remove:memory-clips:k7m2p9qz.mp4,k7m2p9qz.mov',
      'rpc:finish_order_file_purge:ord-a:k7m2p9qz',
      'rpc:claim_order_file_purge:ord-b',
      'remove:print-pdfs:ord-b.pdf,ord-b-cover.pdf',
      'rpc:order_clip_files_to_purge:ord-b',
      'rpc:finish_order_file_purge:ord-b',
      'rpc:orphan_clip_files',
      'remove:memory-clips:zzorphan.mp4',
    ]);
  });
  it('an order the claim refuses (reopened since the list) is skipped: nothing of it removed', async () => {
    db.claim = (id) => id !== 'ord-a';
    const res = await call();
    expect(res.code).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.purged).toBe(1);
    expect(log.some((l) => l.includes('ord-a.pdf') || l.includes('order_clip_files_to_purge:ord-a') || l.includes('finish_order_file_purge:ord-a'))).toBe(false);
  });
  it('the unfinished-checkout list failing: reported, nothing removed from it', async () => {
    db.orphans = { data: null, error: { message: 'down' } };
    const res = await call();
    expect(res.code).toBe(500);
    expect(res.body.errors).toEqual([{ order_id: null, error: 'orphan list: down' }]);
    expect(log).not.toContain('remove:memory-clips:zzorphan.mp4');
  });
  it('no unfinished-checkout videos: no removal call', async () => {
    db.orphans = { data: [], error: null };
    await call();
    expect(log[log.length - 1]).toBe('rpc:orphan_clip_files');
  });
  it('never touches receipts', async () => {
    await call();
    expect(log.some((l) => l.includes('payment-proofs'))).toBe(false);
  });
  it('ignores anything in the request (no names, no order ids from outside)', async () => {
    await call({ query: { order: 'someone-else' }, body: { names: ['evil.mp4'], order_id: 'x' } });
    expect(log.some((l) => l.includes('evil') || l.includes('someone-else'))).toBe(false);
  });
  it('one order failing to remove its PDF: that order is not recorded, the next still is', async () => {
    db.removeErr = (bucket, names) => (bucket === 'print-pdfs' && names[0] === 'ord-a.pdf' ? { message: 'boom' } : null);
    const res = await call();
    expect(res.code).toBe(500);
    expect(res.body.purged).toBe(1);
    expect(res.body.errors).toEqual([{ order_id: 'ord-a', error: 'print-pdfs: boom' }]);
    expect(log).not.toContain('rpc:finish_order_file_purge:ord-a:k7m2p9qz');
    expect(log).not.toContain('remove:memory-clips:k7m2p9qz.mp4,k7m2p9qz.mov');
    expect(log).toContain('rpc:finish_order_file_purge:ord-b');
  });
  it('the video list failing: no video removed, order not recorded', async () => {
    db.clips['ord-a'] = { data: null, error: { message: 'down' } };
    const res = await call();
    expect(res.body.errors[0]).toEqual({ order_id: 'ord-a', error: 'video list: down' });
    expect(log.some((l) => l.startsWith('remove:memory-clips:k7m2p9qz'))).toBe(false);
    expect(log.some((l) => l.startsWith('rpc:finish_order_file_purge:ord-a'))).toBe(false);
  });
  it('the expiry failing: stops before any file is removed', async () => {
    db.expired = { data: null, error: { message: 'down' } };
    const res = await call();
    expect(res.code).toBe(500);
    expect(log).toEqual(['rpc:expire_unpaid_orders']);
  });
  it('the due list failing: stops before any file is removed', async () => {
    db.due = { data: null, error: { message: 'down' } };
    const res = await call();
    expect(res.code).toBe(500);
    expect(log.some((l) => l.startsWith('remove:'))).toBe(false);
  });
  it('a full batch is followed by the next one in the same run (no backlog)', async () => {
    const ids = (from, n) => Array.from({ length: n }, (_, i) => ({ order_id: `ord-${from + i}` }));
    db.due = { batches: [{ data: ids(0, mod.PURGE_BATCH), error: null }, { data: ids(mod.PURGE_BATCH, 7), error: null }] };
    const res = await call();
    expect(res.body.purged).toBe(mod.PURGE_BATCH + 7);
    expect(res.body.more).toBe(false);
  });
  it('an order that fails is tried once per run, not again and again', async () => {
    db.removeErr = (bucket, names) => (bucket === 'print-pdfs' && names[0] === 'ord-a.pdf' ? { message: 'boom' } : null);
    // The failing order stays due, so every list returns it first.
    db.due = { data: [{ order_id: 'ord-a' }, ...Array.from({ length: mod.PURGE_BATCH - 1 }, (_, i) => ({ order_id: `ord-x${i}` }))], error: null };
    const res = await call();
    expect(log.filter((l) => l === 'rpc:claim_order_file_purge:ord-a')).toHaveLength(1);
    expect(res.body.errors.filter((e) => e.order_id === 'ord-a')).toHaveLength(1);
  });
  it('unfinished-checkout videos: batch after batch, and a name that comes back is not looped on', async () => {
    const names = (from, n) => Array.from({ length: n }, (_, i) => ({ code: `zzorp${from + i}`, object_name: `zzorp${from + i}.mp4` }));
    db.orphans = { batches: [{ data: names(0, mod.ORPHAN_BATCH), error: null }, { data: names(0, 3), error: null }] };
    const res = await call();
    expect(res.body.orphans).toBe(mod.ORPHAN_BATCH);
    expect(log.filter((l) => l.startsWith('rpc:orphan_clip_files'))).toHaveLength(2);
  });
  it('past the time budget it stops starting new orders', async () => {
    const realNow = Date.now;
    let t = 0;
    Date.now = () => { t += mod.TIME_BUDGET_MS / 2 + 1; return t; };
    try {
      const res = await call();
      expect(res.body.more).toBe(true);
      expect(res.body.purged).toBeLessThan(2);
    } finally { Date.now = realNow; }
  });
});
