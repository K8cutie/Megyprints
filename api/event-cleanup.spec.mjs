import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   /api/event-cleanup — the nightly cleanup of Megyprints Events files (0044).
   These lock:
     · no CRON_SECRET → it doesn't run; a wrong secret → nothing is read;
     · it removes exactly the names the DATABASE lists, only in the three event
       buckets, in batches, then records those items; nothing comes from the
       request;
     · then it clears old personal details (event_retention_sweep);
     · an item whose files didn't go isn't retried in the same run (no loop);
     · a failed removal records nothing (tomorrow tries again);
     · Vercel runs it nightly.
   ══════════════════════════════════════════════════════════════════════════ */

const SECRET = 'cron-secret-for-tests-0123456789';
process.env.VITE_SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

let log;
let db;

const rowsFor = (id, bucketNames) => bucketNames.map(([bucket, name]) => ({ media_id: id, bucket, name }));
const freshDb = () => ({
  pages: [
    { data: [
      ...rowsFor('m1', [['event-originals', 'b/m1.jpg'], ['event-media', 'b/m1-v.jpg'], ['event-media', 'b/m1-t.jpg']]),
      ...rowsFor('m2', [['event-videos', 'b/m2.mp4'], ['event-media', 'b/m2-t.jpg']]),
    ], error: null },
    { data: [], error: null },
  ],
  removeErr: () => null,
  finished: (ids) => ids.length,
  sweep: () => ({ data: { guests: 3, bookings: 1 }, error: null }),
});

const adminClient = () => ({
  rpc: async (name, args) => {
    log.push(`rpc:${name}${args?.p_ids ? `:${args.p_ids.join(',')}` : ''}`);
    if (name === 'event_media_files_to_purge') return db.pages.shift() ?? { data: [], error: null };
    if (name === 'finish_event_media_purge') return { data: db.finished(args.p_ids), error: null };
    if (name === 'event_retention_sweep') return db.sweep();
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  },
  from: () => { throw new Error('the cleanup must not read tables directly'); },
  storage: {
    from: (bucket) => ({
      remove: async (names) => {
        log.push(`remove:${bucket}:${names.join(',')}`);
        const err = db.removeErr(bucket);
        return err ? { data: null, error: err } : { data: names.map((n) => ({ name: n })), error: null };
      },
    }),
  },
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => adminClient() }));

let mod;
beforeAll(async () => { process.env.CRON_SECRET = SECRET; mod = await import('./event-cleanup.mjs'); });
beforeEach(() => { log = []; db = freshDb(); process.env.CRON_SECRET = SECRET; });

const mkRes = () => {
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
};
const call = async (headers = { authorization: `Bearer ${SECRET}` }, method = 'GET') => {
  const res = mkRes();
  await mod.default({ method, headers, body: { names: ['victim/x.jpg'] } }, res);
  return res;
};

describe('door', () => {
  it('no CRON_SECRET: refuses to run, reads nothing', async () => {
    delete process.env.CRON_SECRET;
    const res = await call();
    expect(res.code).toBe(500);
    expect(log).toEqual([]);
  });
  it('wrong secret: 401, reads nothing', async () => {
    const res = await call({ authorization: 'Bearer nope' });
    expect(res.code).toBe(401);
    expect(log).toEqual([]);
  });
  it('POST and GET only', async () => {
    expect((await call(undefined, 'DELETE')).code).toBe(405);
  });
});

describe('what it removes', () => {
  it('exactly the listed names, per bucket, then records those items; the request body is ignored', async () => {
    const res = await call();
    expect(res.code).toBe(200);
    expect(log).toEqual([
      'rpc:event_media_files_to_purge',
      'remove:event-originals:b/m1.jpg',
      'remove:event-media:b/m1-v.jpg,b/m1-t.jpg,b/m2-t.jpg',
      'remove:event-videos:b/m2.mp4',
      'rpc:finish_event_media_purge:m1,m2',
      'rpc:event_media_files_to_purge',
      'rpc:event_retention_sweep',
    ]);
    expect(log.join('\n')).not.toMatch(/victim/);
    expect(res.body).toMatchObject({ removed: 5, recorded: 2, more: false, swept: { guests: 3, bookings: 1 } });
  });

  it('never touches another bucket, whatever the list says', () => {
    const groups = mod.byBucket([
      { media_id: 'x', bucket: 'print-pdfs', name: 'order.pdf' },
      { media_id: 'x', bucket: 'event-media', name: 'b/x-t.jpg' },
      { media_id: 'x', bucket: 'payment-proofs', name: 'r.png' },
      { media_id: 'x', bucket: 'event-videos', name: 'b/x.mp4' },
      { media_id: 'x', bucket: 'memory-clips', name: 'abcd.mp4' },
    ]);
    expect([...groups.keys()]).toEqual(['event-media', 'event-videos']);
  });

  it('an item whose files didn\'t go is not retried in the same run', async () => {
    const page = { data: rowsFor('stuck', [['event-media', 'b/stuck-t.jpg']]), error: null };
    db.pages = [page, { ...page }, { ...page }];
    db.finished = () => 0;
    const res = await call();
    expect(res.code).toBe(200);
    expect(log.filter((l) => l.startsWith('remove:'))).toEqual(['remove:event-media:b/stuck-t.jpg']);
  });

  it('a failed removal records nothing and says so', async () => {
    db.removeErr = (bucket) => (bucket === 'event-media' ? { message: 'storage unavailable' } : null);
    const res = await call();
    expect(res.code).toBe(500);
    expect(log).not.toContain('rpc:finish_event_media_purge:m1,m2');
  });
});

describe('the sweep', () => {
  it('a failed sweep says so (500), after the files are done', async () => {
    db.sweep = () => ({ data: null, error: { message: 'sweep broke' } });
    const res = await call();
    expect(res.code).toBe(500);
    expect(log).toContain('rpc:finish_event_media_purge:m1,m2');
  });
  it('the buckets it names are the ones 0044 makes', () => {
    const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations', '0044_event_camera.sql'), 'utf8');
    for (const b of mod.EVENT_BUCKETS) expect(sql).toContain(`values ('${b}', '${b}',`);
  });
});

describe('schedule', () => {
  it('Vercel runs it nightly, after the orders cleanup', () => {
    const vercel = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json'), 'utf8'));
    expect(vercel.crons).toContainEqual({ path: '/api/event-cleanup', schedule: '30 19 * * *' });
    expect(vercel.functions['api/event-cleanup.mjs']).toEqual({ maxDuration: 60 });
  });
});
