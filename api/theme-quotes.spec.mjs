import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   /api/theme-quotes — batch + avoid contract (2026-09-09).
   The client sizes its pool to the album and tops up in batches; each call
   says how many lines it wants and which lines it already holds. The proxy
   must clamp both, forward the held lines to the model as "don't repeat",
   and filter any echoes so a top-up always yields NEW lines.
   ══════════════════════════════════════════════════════════════════════════ */

process.env.ANTHROPIC_API_KEY = 'test-key';
let mod;
beforeAll(async () => { mod = await import('./theme-quotes.mjs'); });
afterEach(() => { vi.unstubAllGlobals(); });

const mkRes = () => {
  const r = { code: 0, body: null, headers: {}, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, setHeader(k, v) { r.headers[k] = v; } };
  return r;
};
const mkReq = (body, ip) => ({ method: 'POST', headers: { 'x-real-ip': ip ?? `10.0.0.${Math.floor(Math.random() * 250)}` }, body });

describe('parseBody', () => {
  it('defaults count to 25 and avoid to []', () => {
    expect(mod.parseBody({ theme: 'Marriage' })).toEqual({ theme: 'Marriage', count: 25, avoid: [] });
  });
  it('clamps count to [1, 60] and keeps only the newest 200 string avoid entries', () => {
    expect(mod.parseBody({ theme: 't', count: 500 }).count).toBe(60);
    expect(mod.parseBody({ theme: 't', count: -3 }).count).toBe(1);
    expect(mod.parseBody({ theme: 't', count: 'abc' }).count).toBe(25);
    const avoid = Array.from({ length: 300 }, (_, i) => `line ${i}`).concat([42, null, '']);
    const p = mod.parseBody({ theme: 't', avoid });
    expect(p.avoid.length).toBe(200);
    expect(p.avoid[0]).toBe('line 100');           // newest kept
    expect(p.avoid.every((s) => typeof s === 'string' && s)).toBe(true);
  });
  it('tolerates a string body and a broken body', () => {
    expect(mod.parseBody('{"theme":"x","count":10}')).toEqual({ theme: 'x', count: 10, avoid: [] });
    expect(mod.parseBody('{oops').theme).toBe('');
  });
});

describe('clean', () => {
  it('drops held lines (case/punctuation-insensitive), duplicates, unsafe and over-long lines, and caps at count', () => {
    const out = mod.clean(
      ['Two hearts, one journey', 'two hearts one journey!', 'Fresh as morning', 'Fresh as morning',
       'Love is patient — Paul', 'x'.repeat(60), 'ok', 'Another good line', 'Yet another line'],
      { count: 2, avoid: ['TWO HEARTS, ONE JOURNEY'] },
    );
    expect(out).toEqual(['Fresh as morning', 'Another good line']);
  });
});

describe('handler', () => {
  it('forwards count + avoid to the model and returns only NEW lines', async () => {
    let prompt = '';
    let maxTokens = 0;
    vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
      const b = JSON.parse(init.body);
      prompt = b.messages[0].content;
      maxTokens = b.max_tokens;
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(['Held line one', 'Brand new line', 'Second new line', 'Third new line']) }] }) };
    }));
    const res = mkRes();
    await mod.default(mkReq({ theme: 'Marriage', count: 2, avoid: ['Held line one'] }), res);
    expect(res.code).toBe(200);
    expect(res.body.source).toBe('haiku');
    expect(res.body.quotes).toEqual(['Brand new line', 'Second new line']);
    expect(prompt).toContain('JSON array of 7 lines');      // count + 5 headroom
    expect(prompt).toContain('Do NOT repeat');
    expect(prompt).toContain('"Held line one"');
    expect(maxTokens).toBeGreaterThanOrEqual(300 + 7 * 25);
  });

  it('a 60-line batch gets a max_tokens budget that cannot truncate the array', async () => {
    let maxTokens = 0;
    vi.stubGlobal('fetch', vi.fn(async (_u, init) => {
      maxTokens = JSON.parse(init.body).max_tokens;
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: '[]' }] }) };
    }));
    await mod.default(mkReq({ theme: 'Travel', count: 60 }), mkRes());
    // 65 lines × ~20 tokens + JSON overhead comfortably below the budget.
    expect(maxTokens).toBeGreaterThanOrEqual(1900);
  });

  it('a big avoid list is under the abuse guard body cap (a legit top-up is never 413)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: '["A brand new line"]' }] }) })));
    const avoid = Array.from({ length: 200 }, (_, i) => `A held caption line number ${i} for the album`.slice(0, 46));
    const body = { theme: 'Family reunion', count: 40, avoid };
    const res = mkRes();
    await mod.default(mkReq(body), res);
    expect(res.code).toBe(200);
    expect(res.body.quotes).toEqual(['A brand new line']);
  });
});
