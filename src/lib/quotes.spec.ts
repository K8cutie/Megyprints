import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   AI QUOTE POOL SIZING — ensureThemeQuotes(theme, need).
   The album deals each line once, so the pool must hold one line per caption
   box. These specs drive the client against a fake /api/theme-quotes and
   prove: batches are requested until `need` is met, each batch carries the
   held lines as `avoid`, duplicates never enter the pool, a failure falls
   back to the curated corpus without caching, and the caller's wait budget
   returns what's there while the top-up keeps landing in the cache.
   ══════════════════════════════════════════════════════════════════════════ */

type Call = { theme: string; count: number; avoid: string[] };

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
    _map: m,
  };
}

/** A proxy that writes `Line N` sequentially, honouring count + avoid, with
 *  an optional per-call delay and an optional failure switch. */
function fakeProxy(opts: { delayMs?: number; fail?: () => boolean; overlap?: number } = {}) {
  const calls: Call[] = [];
  let serial = 0;
  const fetch = vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as Call;
    calls.push(body);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.fail?.()) return { ok: false, json: async () => ({}) };
    const quotes: string[] = [];
    // Optionally echo a few held lines back (a model that ignores "avoid") —
    // the client must drop them, not double-count them.
    for (let i = 0; i < (opts.overlap ?? 0) && i < body.avoid.length; i++) quotes.push(body.avoid[i]);
    for (let i = 0; i < body.count; i++) quotes.push(`Line ${++serial}`);
    return { ok: true, json: async () => ({ quotes, source: 'haiku' }) };
  });
  return { fetch, calls };
}

let storage: ReturnType<typeof fakeStorage>;
type Q = typeof import('./quotes');
let q: Q;

beforeEach(async () => {
  storage = fakeStorage();
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  q = await import('./quotes');
  q.__resetQuotesForTests();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('ensureThemeQuotes — pool grows to the album', () => {
  it('tops up in ≤60-line batches until the pool holds `need` lines, sending held lines as avoid', async () => {
    const { fetch, calls } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    const pool = await q.ensureThemeQuotes('Marriage', 80);
    expect(pool.length).toBe(80);
    expect(new Set(pool).size).toBe(80);
    expect(calls.map((c) => c.count)).toEqual([60, 20]);
    expect(calls[0].avoid).toEqual([]);
    expect(calls[1].avoid.length).toBe(60);           // the second batch knows the first
    expect(calls[1].avoid).toContain('Line 1');
    // Persisted for the next consumer (sweep / picker / next generation).
    expect(JSON.parse(storage.getItem('megy-theme-quotes')!).marriage.length).toBe(80);
  });

  it('a pool already big enough makes NO paid call', async () => {
    const { fetch } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    await q.ensureThemeQuotes('Marriage', 30);
    expect(fetch).toHaveBeenCalledTimes(1);
    await q.ensureThemeQuotes('marriage ', 25);        // same theme, case/space-insensitive
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('lines the model echoes back despite `avoid` never enter the pool twice', async () => {
    const { fetch } = fakeProxy({ overlap: 5 });
    vi.stubGlobal('fetch', fetch);
    const pool = await q.ensureThemeQuotes('Baby', 100);
    expect(new Set(pool.map((l) => l.toLowerCase())).size).toBe(pool.length);
    expect(pool.length).toBe(100);
  });

  it('caps at the per-theme maximum and stops after a bounded number of calls', async () => {
    const { fetch, calls } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    const pool = await q.ensureThemeQuotes('Travel', 10_000);
    expect(pool.length).toBe(q.QUOTES_PER_THEME_MAX);
    expect(calls.length).toBeLessThanOrEqual(5);
  });

  it('proxy down → curated corpus, nothing cached, next call retries', async () => {
    let down = true;
    const { fetch } = fakeProxy({ fail: () => down });
    vi.stubGlobal('fetch', fetch);
    const first = await q.ensureThemeQuotes('Wedding', 80);
    expect(first).toEqual(q.curatedQuotesFor('Wedding'));
    expect(storage.getItem('megy-theme-quotes')).toBeNull();
    down = false;
    const second = await q.ensureThemeQuotes('Wedding', 80);
    expect(second.length).toBe(80);
  });

  it('a proxy that returns nothing new stops the loop (no runaway spend)', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ quotes: ['Same line', 'Same line'], source: 'haiku' }) }));
    vi.stubGlobal('fetch', fetch);
    const pool = await q.ensureThemeQuotes('Kids', 80);
    expect(pool).toEqual(['Same line']);
    expect(fetch).toHaveBeenCalledTimes(2);          // first landed 1 line; second landed 0 → stop
  });

  it('wait budget spent → returns what is there NOW, the top-up finishes in the background', async () => {
    vi.useFakeTimers();
    try {
      const { fetch } = fakeProxy({ delayMs: 1000 });
      vi.stubGlobal('fetch', fetch);
      const p = q.ensureThemeQuotes('Graduation', 80, { budgetMs: 1500 });
      await vi.advanceTimersByTimeAsync(1500);
      const partial = await p;
      expect(partial.length).toBe(60);               // first batch landed, second still in flight
      await vi.advanceTimersByTimeAsync(1500);
      expect(q.quotesForThemeNow('Graduation').length).toBe(80);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a bigger ask while a top-up is running raises its target instead of starting a parallel loop', async () => {
    vi.useFakeTimers();
    try {
      const { fetch, calls } = fakeProxy({ delayMs: 100 });
      vi.stubGlobal('fetch', fetch);
      const a = q.ensureThemeQuotes('Family', 25);
      const b = q.ensureThemeQuotes('Family', 80);
      await vi.advanceTimersByTimeAsync(1000);
      const [pa, pb] = await Promise.all([a, b]);
      expect(pb.length).toBe(80);
      expect(pa.length).toBe(80);
      expect(calls.map((c) => c.count)).toEqual([25, 55]);   // sequential, no duplicate first batch
    } finally {
      vi.useRealTimers();
    }
  });

  it('an empty theme never calls the proxy and returns the generic curated set', async () => {
    const { fetch } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    const pool = await q.ensureThemeQuotes('   ', 80);
    expect(pool).toEqual(q.curatedQuotesFor(''));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('fetchThemeQuotes / moreThemeQuotes on the same pool', () => {
  it('fetchThemeQuotes = one 25-line call, then served from cache', async () => {
    const { fetch, calls } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    const set = await q.fetchThemeQuotes('Marriage');
    expect(set.source).toBe('ai');
    expect(set.quotes.length).toBe(25);
    expect(calls.map((c) => c.count)).toEqual([25]);
    await q.fetchThemeQuotes('Marriage');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('"More lines" grows the pool by another page and keeps the held lines', async () => {
    const { fetch } = fakeProxy();
    vi.stubGlobal('fetch', fetch);
    const first = await q.fetchThemeQuotes('Marriage');
    const more = await q.moreThemeQuotes('Marriage');
    expect(more.quotes.length).toBe(50);
    for (const l of first.quotes) expect(more.quotes).toContain(l);
  });
});
