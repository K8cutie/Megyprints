import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   /api/client-error — where the app's error reports land (0051).
   Public on purpose, so these lock what it does with a report: store it
   through log_client_error with every field cut to size, never act on it,
   always answer 204, and refuse what the shared guard refuses.
   ══════════════════════════════════════════════════════════════════════════ */

process.env.VITE_SUPABASE_URL = 'https://lvbsrbmikunynphlbckt.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
delete process.env.CLIENT_ERRORS_DAILY;
delete process.env.CLIENT_ERRORS_PER_IP_DAILY;

const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));

let mod;
beforeAll(async () => { mod = await import('./client-error.mjs'); });
beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: true, error: null }); vi.spyOn(console, 'error').mockImplementation(() => {}); });

const mkRes = () => {
  const r = { statusCode: 0, body: undefined, headers: {},
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    status(c) { r.statusCode = c; return r; },
    json(b) { r.body = b; return r; },
    end() { return r; } };
  return r;
};
let ip = 0;
const mkReq = (body, over = {}) => ({
  method: 'POST', body,
  headers: { 'x-real-ip': `10.9.${Math.floor(++ip / 250)}.${ip % 250}`, 'user-agent': 'Mozilla/5.0 (Linux; Android 14; SM-A546E) Chrome/129.0', ...over },
});

describe('readReport', () => {
  it('keeps only the known fields, cut to size', () => {
    const r = mod.readReport({ message: 'x'.repeat(5000), stack: 's'.repeat(9000), context: { step: 'cover_pdf', orderId: 'o1' }, url: 'u'.repeat(900), extra: 'dropped' }, 'a'.repeat(900));
    expect(r.p_message).toHaveLength(1000);
    expect(r.p_stack).toHaveLength(2000);
    expect(r.p_url).toHaveLength(500);
    expect(r.p_user_agent).toHaveLength(400);
    expect(r.p_context).toEqual({ step: 'cover_pdf', orderId: 'o1' });
    expect(Object.keys(r).sort()).toEqual(['p_context', 'p_message', 'p_stack', 'p_url', 'p_user_agent']);
  });
  it('a text body is not read: the app sends JSON, and text is what another site can make a browser send (red-team)', () => {
    expect(mod.readReport(JSON.stringify({ message: 'boom' }), 'ua')).toBeNull();
  });
  it('fields are cut by BYTES: 3-byte characters store no more than the limit (red-team)', () => {
    const r = mod.readReport({ message: '漢'.repeat(1000), stack: '漢'.repeat(2000), url: '漢'.repeat(500) }, '漢'.repeat(400));
    expect(Buffer.byteLength(r.p_message)).toBeLessThanOrEqual(1000);
    expect(Buffer.byteLength(r.p_stack)).toBeLessThanOrEqual(2000);
    expect(Buffer.byteLength(r.p_url)).toBeLessThanOrEqual(500);
    expect(Buffer.byteLength(r.p_user_agent)).toBeLessThanOrEqual(400);
    expect(r.p_message).toMatch(/^漢+$/); // no half character at the end
  });
  it("a crash's long component stack is shortened, and the context kept (red-team)", () => {
    const r = mod.readReport({ message: 'm', context: { boundary: 'builder', componentStack: '\n    at Foo (x.tsx:1)'.repeat(400) } }, 'ua');
    expect(r.p_context.boundary).toBe('builder');
    expect(Buffer.byteLength(r.p_context.componentStack)).toBeLessThanOrEqual(300);
    expect(Buffer.byteLength(JSON.stringify(r.p_context))).toBeLessThanOrEqual(2048);
  });
  it('a huge scrub-bait field is cut before it is scrubbed (stays fast)', () => {
    // Timed against the same machine, not a fixed 50 ms: CI's runner is ~5×
    // slower than a laptop and the cut path took 50.1 ms there (PR #182).
    // Scrubbing a whole 16 KB field is ~13× the cut path, and grows with the
    // square of the length, so a missing cut (two such scrubs) still fails.
    const bait = 'eyJ'.repeat(5400);
    const time = (f) => { const t0 = performance.now(); f(); return performance.now() - t0; };
    mod.readReport({ message: bait, stack: bait }, 'ua'); // warm up
    const cut = Math.min(...[1, 2, 3].map(() => time(() => mod.readReport({ message: bait, stack: bait }, 'ua'))));
    const whole = time(() => mod.scrub(bait));
    expect(cut).toBeLessThan(whole / 4);
  });
  it('no message, not an object, or broken JSON → nothing', () => {
    expect(mod.readReport({ stack: 's' })).toBeNull();
    expect(mod.readReport({ message: '   ' })).toBeNull();
    expect(mod.readReport(['message'])).toBeNull();
    expect(mod.readReport('{not json')).toBeNull();
    expect(mod.readReport(null)).toBeNull();
  });
  it('a context that is not a plain object is left out', () => {
    expect(mod.readReport({ message: 'm', context: ['a'] }).p_context).toBeNull();
    expect(mod.readReport({ message: 'm', context: 'step' }).p_context).toBeNull();
  });
  it('sign-in tokens and keys are cut out of every field (red-team: the owner reads these)', () => {
    // A made-up token, put together here so it never sits in the file whole.
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1c2VyLTEifQ', 'c2lnbmF0dXJlLWhlcmU'].join('.');
    const r = mod.readReport({
      message: `Auth failed for ${jwt}`,
      stack: `at https://megyprints.vercel.app/?code=pkce-secret-1 (x.js:1)`,
      url: `https://megyprints.vercel.app/#access_token=${jwt}&refresh_token=r-123&expires_in=3600`,
      context: { note: `apikey=sb-secret-9 and ${jwt}`, step: 'login' },
    }, 'ua');
    const all = JSON.stringify(r);
    for (const secret of [jwt, 'pkce-secret-1', 'r-123', 'sb-secret-9']) expect(all).not.toContain(secret);
    expect(r.p_url).toBe('https://megyprints.vercel.app/#access_token=[removed]&refresh_token=[removed]&expires_in=3600');
    expect(r.p_context).toEqual({ note: 'apikey=[removed] and [removed]', step: 'login' });
  });
  it('tokens written as JSON, bearer tokens and token_hash are cut out too (red-team round 2)', () => {
    const r = mod.readReport({
      message: 'Request failed: {"refresh_token":"opaque-r-777","provider_refresh_token": "gp-555"} Authorization: Bearer opaque-b-999',
      url: 'https://megyprints.vercel.app/?token_hash=th-321&type=recovery',
    }, 'ua');
    const all = JSON.stringify(r);
    for (const secret of ['opaque-r-777', 'gp-555', 'opaque-b-999', 'th-321']) expect(all).not.toContain(secret);
    expect(r.p_message).toBe('Request failed: {"refresh_token":"[removed]","provider_refresh_token": "[removed]"} Authorization: Bearer [removed]');
    expect(r.p_url).toBe('https://megyprints.vercel.app/?token_hash=[removed]&type=recovery');
  });
  it('an ordinary report is left as it is', () => {
    const r = mod.readReport({ message: 'Cover file upload failed: Failed to fetch', url: 'https://megyprints.vercel.app/#/order', context: { path: 'checkout', step: 'cover_pdf', orderId: '41e317be-3e80-4143-ba17-7baad464132e' } }, 'ua');
    expect(r.p_message).toBe('Cover file upload failed: Failed to fetch');
    expect(r.p_url).toBe('https://megyprints.vercel.app/#/order');
    expect(r.p_context.orderId).toBe('41e317be-3e80-4143-ba17-7baad464132e');
  });
});

describe('handler', () => {
  it('stores a report with the phone it came from and the caps, answers 204', async () => {
    const res = mkRes();
    await mod.default(mkReq({ message: 'Cover file upload failed: network', context: { path: 'checkout', step: 'cover_pdf', attempt: 1 } }, { 'x-real-ip': '203.0.113.7' }), res);
    expect(res.statusCode).toBe(204);
    expect(rpc).toHaveBeenCalledWith('log_client_error', expect.objectContaining({
      p_message: 'Cover file upload failed: network',
      p_context: { path: 'checkout', step: 'cover_pdf', attempt: 1 },
      p_user_agent: expect.stringContaining('SM-A546E'),
      p_daily_cap: 300,
      p_ip_cap: 30,
      p_order_cap: 20,
    }));
    // The address is stored only as a keyed hash.
    const args = rpc.mock.calls[0][1];
    expect(args.p_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(args)).not.toContain('203.0.113.7');
  });
  it("a report another website made the visitor's browser send is not stored (red-team)", async () => {
    for (const site of ['cross-site', 'same-site', 'none']) {
      const res = mkRes();
      await mod.default(mkReq({ message: 'flood' }, { 'sec-fetch-site': site }), res);
      expect(res.statusCode).toBe(204);
    }
    expect(rpc).not.toHaveBeenCalled();
    const ok = mkRes();
    await mod.default(mkReq({ message: 'real' }, { 'sec-fetch-site': 'same-origin' }), ok);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('only POST', async () => {
    const res = mkRes();
    await mod.default({ ...mkReq({ message: 'm' }), method: 'GET' }, res);
    expect(res.statusCode).toBe(405);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('an empty report is not stored, and still gets 204', async () => {
    const res = mkRes();
    await mod.default(mkReq({ nothing: true }), res);
    expect(res.statusCode).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('a body over the guard cap is refused before anything is stored', async () => {
    const res = mkRes();
    await mod.default(mkReq({ message: 'm', stack: 'x'.repeat(20_000) }), res);
    expect(res.statusCode).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('a database refusal or an outage still answers 204 (the app never waits on it)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const a = mkRes();
    await mod.default(mkReq({ message: 'm' }), a);
    expect(a.statusCode).toBe(204);
    rpc.mockRejectedValueOnce(new Error('fetch failed'));
    const b = mkRes();
    await mod.default(mkReq({ message: 'm' }), b);
    expect(b.statusCode).toBe(204);
  });
  it('one address sending in a loop is cut off by the burst guard', async () => {
    const headers = { 'x-real-ip': '10.200.0.1' };
    const codes = [];
    for (let i = 0; i < 25; i++) {
      const res = mkRes();
      await mod.default(mkReq({ message: `m${i}` }, headers), res);
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 20).every((c) => c === 204)).toBe(true);
    expect(codes.slice(20).every((c) => c === 429)).toBe(true);
  });
});
