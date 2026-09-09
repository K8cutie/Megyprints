import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   /m/:code resolver — hosted clips + hosting terms (migration 0030).
   The resolver is the only thing a scanner ever touches, so these lock:
     · a hosted clip plays on the branded page (<video>), media-src scoped to
       the project origin, nothing framed;
     · an expired term shows the renewal page — never a dead link, never a
       redirect;
     · ONLY the clips bucket on the project origin counts as "ours" — another
       bucket / the REST API on the same origin is treated as an untrusted
       link (manual click, no auto-forward);
     · legacy YouTube memories still embed exactly as before.
   ══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://lvbsrbmikunynphlbckt.supabase.co';
process.env.VITE_SUPABASE_URL = BASE;
process.env.VITE_SUPABASE_ANON_KEY = 'anon-test';

const rpc = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));

let mod;
beforeAll(async () => { mod = await import('./m.mjs'); });
beforeEach(() => { rpc.mockReset(); });

const mkRes = () => {
  const r = { code: 0, body: '', headers: {}, statusCode: 0,
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    end(b) { r.body = String(b); r.code = r.statusCode; } };
  return r;
};
const mkReq = (code) => ({ query: { code }, headers: { host: 'megyprints.vercel.app', 'x-real-ip': `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
const row = (over) => ({ destination: `${BASE}/storage/v1/object/public/memory-clips/k7m2p9qz.mp4`, title: null, kind: 'clip', expires_at: null, ...over });
const inYears = (n) => new Date(Date.now() + n * 365 * 86400e3).toISOString();

describe('isHostedClip', () => {
  const u = (s) => new URL(s);
  it('accepts exactly our bucket prefix + a code-shaped name', () => {
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/k7m2p9qz.mp4`))).toBe(true);
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/abcd.webm`))).toBe(true);
  });
  it('rejects other buckets, the REST API, other origins, odd names, and query/hash tricks', () => {
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/print-pdfs/k7m2p9qz.pdf`))).toBe(false);
    expect(mod.isHostedClip(u(`${BASE}/rest/v1/qr_memories?select=*`))).toBe(false);
    expect(mod.isHostedClip(u(`https://evil.example/storage/v1/object/public/memory-clips/k7m2p9qz.mp4`))).toBe(false);
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/../print-pdfs/x.mp4`))).toBe(false);
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/K7M2P9QZ.mp4`))).toBe(false);
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/k7m2p9qz.mp4?x=1`))).toBe(false);
    expect(mod.isHostedClip(u(`${BASE}/storage/v1/object/public/memory-clips/k7m2p9qz.exe`))).toBe(false);
  });
});

describe('handler', () => {
  it('hosted clip → 200, plays in a <video>, media-src scoped to the project origin, nothing framed, term shown', async () => {
    rpc.mockResolvedValue({ data: [row({ expires_at: inYears(10), title: 'Lola’s 80th' })], error: null });
    const res = mkRes();
    await mod.default(mkReq('k7m2p9qz'), res);
    expect(res.code).toBe(200);
    expect(res.body).toContain('<video');
    expect(res.body).toContain('memory-clips/k7m2p9qz.mp4');
    expect(res.body).toContain('Lola’s 80th');
    expect(res.body).toMatch(/stays live until \w+ \d{4}/);
    expect(res.body).not.toContain('<iframe');
    expect(res.body).not.toContain('http-equiv="refresh"');
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain(`media-src ${BASE}`);
    expect(csp).not.toContain('frame-src');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('expired term → renewal page: no video, no redirect, still 200, links to the memories page with the code', async () => {
    rpc.mockResolvedValue({ data: [row({ expires_at: inYears(-1) })], error: null });
    const res = mkRes();
    await mod.default(mkReq('k7m2p9qz'), res);
    expect(res.code).toBe(200);
    expect(res.body).toContain('hosting term has ended');
    expect(res.body).not.toContain('<video');
    expect(res.body).not.toContain('http-equiv="refresh"');
    expect(res.body).toContain('https://megyprints.vercel.app/#/memories?renew=k7m2p9qz');
    expect(res.headers['content-security-policy']).not.toContain('media-src');
  });

  it('a legacy link (no expiry) never expires and still embeds YouTube exactly as before', async () => {
    rpc.mockResolvedValue({ data: [{ destination: 'https://youtu.be/dQw4w9WgXcQ', title: null, kind: 'link', expires_at: null }], error: null });
    const res = mkRes();
    await mod.default(mkReq('abcd2345'), res);
    expect(res.code).toBe(200);
    expect(res.body).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(res.headers['content-security-policy']).toContain('frame-src https://www.youtube-nocookie.com');
    expect(res.headers['content-security-policy']).not.toContain('media-src');
  });

  it('something else on the Supabase origin is NOT ours: manual-click interstitial, no auto-forward, no media', async () => {
    rpc.mockResolvedValue({ data: [row({ destination: `${BASE}/storage/v1/object/public/print-pdfs/order.pdf` })], error: null });
    const res = mkRes();
    await mod.default(mkReq('k7m2p9qz'), res);
    expect(res.code).toBe(200);
    expect(res.body).not.toContain('<video');
    expect(res.body).not.toContain('http-equiv="refresh"');
    expect(res.body).toContain('tap only if you trust it');
  });

  it('unknown code → 404 branded not-found; bad code shape → 400 without touching the DB', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const r1 = mkRes();
    await mod.default(mkReq('zzzzzzzz'), r1);
    expect(r1.code).toBe(404);
    const r2 = mkRes();
    await mod.default(mkReq('../etc'), r2);
    expect(r2.code).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a title is HTML-escaped on every page', async () => {
    rpc.mockResolvedValue({ data: [row({ title: '<script>alert(1)</script>', expires_at: inYears(-1) })], error: null });
    const res = mkRes();
    await mod.default(mkReq('k7m2p9qz'), res);
    expect(res.body).not.toContain('<script>alert');
    rpc.mockResolvedValue({ data: [row({ title: '<img src=x onerror=alert(1)>' })], error: null });
    const res2 = mkRes();
    await mod.default(mkReq('k7m2p9qz'), res2);
    expect(res2.body).not.toContain('<img src=x');
    expect(res2.body).toContain('&lt;img');
  });
});
