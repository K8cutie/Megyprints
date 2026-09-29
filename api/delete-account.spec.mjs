import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   /api/delete-account — photos AND videos go with the account (0027 + 0035).
   These lock:
     · the customer's memory clips (public bucket) are removed with the
       service key, and ONLY the names the database lists for the caller,
       never anything from the request body;
     · a customer the database would refuse (order paid, not delivered) loses
       NOTHING: no PDF, no clip is touched before that refusal;
     · if the clip list cannot be read, nothing is removed and the account
       stays (fail closed);
     · delete_own_account() runs last, as the customer, and its refusal is
       passed through word for word.
   ══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://example-project.supabase.co';
process.env.VITE_SUPABASE_URL = BASE;
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

/** Everything the fakes did, in order: 'rpc:<name>', 'orders', 'remove:<bucket>:<names>'. */
let log;
/** Per-test behaviour of the fake Supabase. */
let db;
/** Which key each createClient call used. */
let clientKeys;

const freshDb = () => ({
  user: { id: 'user-1' },
  userErr: null,
  preflight: { data: { albums: 1, memories: 2, orders: 2, videos: 2, blocking: [] }, error: null },
  orders: [
    { id: 'ord-pending', status: 'pending_payment' },
    { id: 'ord-delivered', status: 'delivered' },
  ],
  ordersErr: null,
  clips: { data: ['k7m2p9qz.mp4', 'w4n8r2ta.mov'], error: null },
  removeErr: () => null,
  deleteResult: { data: { deleted_albums: 1, deleted_memories: 2, anonymized_orders: 2 }, error: null },
});

const userClient = () => ({
  auth: { getUser: async () => ({ data: { user: db.user }, error: db.userErr }) },
  rpc: async (name) => {
    log.push(`rpc:${name}`);
    if (name === 'account_deletion_preflight') return db.preflight;
    if (name === 'my_memory_clip_names') return db.clips;
    if (name === 'delete_own_account') return db.deleteResult;
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  },
  from: (table) => ({
    select: () => ({
      in: async (_col, statuses) => {
        log.push(table);
        return { data: db.orders.filter((o) => statuses.includes(o.status)), error: db.ordersErr };
      },
    }),
  }),
  storage: { from: () => ({ remove: async () => { throw new Error('customer client must never remove files'); } }) },
});

const adminClient = () => ({
  rpc: async (name) => { throw new Error(`service client must not call rpc ${name}`); },
  from: () => { throw new Error('service client must not read tables'); },
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

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url, key) => {
    clientKeys.push(key);
    return key === 'service-test' ? adminClient() : userClient();
  },
}));

let mod;
beforeAll(async () => { mod = await import('./delete-account.mjs'); });
beforeEach(() => { log = []; clientKeys = []; db = freshDb(); });

const mkRes = () => {
  const r = { code: 0, body: null, headers: {},
    status(c) { r.code = c; return r; },
    json(b) { r.body = b; return r; },
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; } };
  return r;
};
const ip = () => `10.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const mkReq = (over = {}) => ({
  method: 'POST',
  headers: { authorization: 'Bearer user-jwt', 'x-real-ip': ip() },
  body: {},
  ...over,
});
const call = async (req = mkReq()) => { const res = mkRes(); await mod.default(req, res); return res; };
const removals = () => log.filter((l) => l.startsWith('remove:'));

describe('happy path', () => {
  it('removes the caller\'s PDFs and clips with the service key, then deletes the account as the caller', async () => {
    const res = await call();
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ deleted_albums: 1, deleted_memories: 2, anonymized_orders: 2, deleted_videos: 2 });
    expect(log).toEqual([
      'rpc:account_deletion_preflight',
      'orders',
      'rpc:my_memory_clip_names',
      'remove:print-pdfs:ord-pending.pdf,ord-delivered.pdf',
      'remove:memory-clips:k7m2p9qz.mp4,w4n8r2ta.mov',
      'rpc:delete_own_account',
    ]);
  });

  it('lists clips with the CUSTOMER\'s token; the service key is used only to remove', async () => {
    await call();
    // One customer client (lists, preflight, delete) and one service client (removals).
    expect(clientKeys).toEqual(['anon-test', 'service-test']);
  });

  it('removes only what the database lists; names in the request body are ignored', async () => {
    const res = await call(mkReq({ body: { clips: ['victim01.mp4'], names: ['victim02.mp4'], paths: ['../print-pdfs/x.pdf'] } }));
    expect(res.code).toBe(200);
    expect(log.join('\n')).not.toMatch(/victim|\.\.\//);
    expect(removals()).toEqual([
      'remove:print-pdfs:ord-pending.pdf,ord-delivered.pdf',
      'remove:memory-clips:k7m2p9qz.mp4,w4n8r2ta.mov',
    ]);
  });

  it('removes in batches of REMOVE_BATCH so a big account never hits the per-request cap', async () => {
    const names = Array.from({ length: 250 }, (_, i) => `c${String(i).padStart(4, 'a')}.mp4`);
    db.clips = { data: names, error: null };
    const res = await call();
    expect(res.code).toBe(200);
    const clipCalls = removals().filter((l) => l.startsWith('remove:memory-clips:'));
    expect(clipCalls.map((l) => l.split(':')[2].split(',').length)).toEqual([100, 100, 50]);
    expect(clipCalls.flatMap((l) => l.split(':')[2].split(','))).toEqual(names);
    expect(res.body.deleted_videos).toBe(250);
  });

  it('no files at all → no service client, straight to the database', async () => {
    db.orders = [];
    db.clips = { data: [], error: null };
    const res = await call();
    expect(res.code).toBe(200);
    expect(clientKeys).toEqual(['anon-test']);
    expect(log).toEqual(['rpc:account_deletion_preflight', 'orders', 'rpc:my_memory_clip_names', 'rpc:delete_own_account']);
    expect(res.body.deleted_videos).toBe(0);
  });

  it('drops anything in the list that is not a name (defensive; the RPC returns strings)', async () => {
    db.clips = { data: ['k7m2p9qz.mp4', null, '', 42, { name: 'x' }], error: null };
    await call();
    expect(removals()).toContain('remove:memory-clips:k7m2p9qz.mp4');
  });
});

describe('a customer the database would refuse loses nothing', () => {
  it('order paid, not delivered → 409 with the database\'s own sentence, and no file is touched', async () => {
    db.preflight = { data: { blocking: [{ order_number: 'MP-7K2Q', status: 'in_production' }] }, error: null };
    const res = await call();
    expect(res.code).toBe(409);
    expect(res.body.error).toBe(
      'Order MP-7K2Q is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.',
    );
    expect(removals()).toEqual([]);
    expect(log).toEqual(['rpc:account_deletion_preflight']);
    expect(clientKeys).toEqual(['anon-test']);
  });

  it('preflight itself fails → 500, nothing removed, nothing deleted', async () => {
    db.preflight = { data: null, error: { message: 'You are not signed in.' } };
    const res = await call();
    expect(res.code).toBe(500);
    expect(removals()).toEqual([]);
    expect(log).not.toContain('rpc:delete_own_account');
  });
});

describe('fail closed', () => {
  it('clip list errors (e.g. 0035 not applied yet) → 500, NOT EVEN the PDFs are removed, account stays', async () => {
    db.clips = { data: null, error: { message: 'Could not find the function public.my_memory_clip_names' } };
    const res = await call();
    expect(res.code).toBe(500);
    expect(res.body.error).toBe('Could not look up your memory videos, so nothing was deleted. Please try again.');
    expect(removals()).toEqual([]);
    expect(log).not.toContain('rpc:delete_own_account');
  });

  it('clip list comes back as something other than an array → same refusal', async () => {
    db.clips = { data: null, error: null };
    const res = await call();
    expect(res.code).toBe(500);
    expect(removals()).toEqual([]);
    expect(log).not.toContain('rpc:delete_own_account');
  });

  it('clip removal fails → 500 and the account is NOT deleted', async () => {
    db.removeErr = (bucket) => (bucket === 'memory-clips' ? { message: 'storage unavailable' } : null);
    const res = await call();
    expect(res.code).toBe(500);
    expect(res.body.error).toBe('storage unavailable');
    expect(log).not.toContain('rpc:delete_own_account');
  });

  it('a clip survives the removal → the database refuses (guard b2) and that message reaches the customer', async () => {
    db.deleteResult = { data: null, error: { message: 'Could not remove 1 memory video(s), so nothing was deleted. Please try again.' } };
    const res = await call();
    expect(res.code).toBe(409);
    expect(res.body.error).toBe('Could not remove 1 memory video(s), so nothing was deleted. Please try again.');
  });
});

describe('door checks (unchanged)', () => {
  it('POST only', async () => {
    const res = await call(mkReq({ method: 'GET' }));
    expect(res.code).toBe(405);
  });

  it('no token → 401, no client work at all', async () => {
    const res = await call(mkReq({ headers: { 'x-real-ip': ip() } }));
    expect(res.code).toBe(401);
    expect(clientKeys).toEqual([]);
  });

  it('token the auth server rejects → 401, nothing listed or removed', async () => {
    db.user = null;
    db.userErr = { message: 'invalid JWT' };
    const res = await call();
    expect(res.code).toBe(401);
    expect(log).toEqual([]);
  });
});

describe('no service key', () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  afterEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = saved; vi.resetModules(); });

  it('refuses before touching anything rather than deleting the account and leaving the files', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    const bare = await import('./delete-account.mjs');
    const res = mkRes();
    await bare.default(mkReq(), res);
    expect(res.code).toBe(500);
    expect(res.body.error).toBe('Account deletion is misconfigured. Please contact the shop.');
    expect(log).toEqual([]);
  });
});

/* ── The SQL half, pinned from here so `npm test` notices if it drifts ────── */
const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const latestDefining = (fn) => {
  const files = readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const hits = files.filter((f) => readFileSync(join(MIGRATIONS, f), 'utf8').includes(`create or replace function public.${fn}()`));
  return readFileSync(join(MIGRATIONS, hits[hits.length - 1]), 'utf8');
};
/** The body of `create or replace function public.<fn>()` up to its closing `$$;`. */
const fnBody = (fn) => {
  const sql = latestDefining(fn);
  const start = sql.indexOf(`create or replace function public.${fn}()`);
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start)));
};

describe('migrations', () => {
  it('the latest delete_own_account() still refuses while PDFs OR clips remain', () => {
    const body = fnBody('delete_own_account');
    expect(body).toContain("s.bucket_id = 'print-pdfs'");
    expect(body).toContain("s.bucket_id = 'memory-clips'");
    expect(body).toMatch(/owner_id\s*=\s*v_uid::text/);
    expect(body).toMatch(/if v_clips > 0 then\s+raise exception/);
  });

  it('the clip list and the guard key off the same owner, so what is removed is what is checked', () => {
    const lister = fnBody('my_memory_clip_names');
    expect(lister).toContain("s.bucket_id = 'memory-clips'");
    expect(lister).toContain('s.owner_id = auth.uid()::text');
    expect(fnBody('account_deletion_preflight')).toMatch(/'memory-clips'\s+and s\.owner_id = v_uid::text/);
  });

  it('blockedMessage() is the database\'s refusal, word for word', () => {
    const body = fnBody('delete_own_account');
    const m = /'(Order % is paid and not yet delivered[^']*)'/.exec(body);
    expect(m).not.toBeNull();
    expect(mod.blockedMessage([{ order_number: '%' }])).toBe(m[1]);
  });
});
