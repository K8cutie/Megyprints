import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   Error reports leave the phone (MP-2026-KGCFSQN, 2026-10-22: the cover step
   failed and the report went to the phone's console only — the live site had
   no endpoint). A production build now sends to /api/client-error, and one
   page load sends a bounded number: a loop can't send hundreds.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('./sentry', () => ({ captureException: () => {} }));

describe('errorEndpoint', async () => {
  const { errorEndpoint } = await import('./report');
  it('a production build reports to the app itself', () => {
    expect(errorEndpoint({}, true)).toBe('/api/client-error');
  });
  it('VITE_ERROR_ENDPOINT wins when set', () => {
    expect(errorEndpoint({ VITE_ERROR_ENDPOINT: ' https://x.example/e ' }, true)).toBe('https://x.example/e');
  });
  it('a dev build only logs', () => {
    expect(errorEndpoint({}, false)).toBeUndefined();
    expect(errorEndpoint({ VITE_ERROR_ENDPOINT: '  ' }, false)).toBeUndefined();
  });
});

describe('pageOf', async () => {
  const { pageOf } = await import('./report');
  it('a sign-in return link loses its tokens (red-team: the owner reads these)', () => {
    expect(pageOf('https://megyprints.vercel.app/#access_token=eyJabc.def.ghi&refresh_token=r1&expires_in=3600'))
      .toBe('https://megyprints.vercel.app/#access_token=[removed]&refresh_token=[removed]&expires_in=3600');
    expect(pageOf('https://megyprints.vercel.app/?code=pkce-123#/orders')).toBe('https://megyprints.vercel.app/?code=[removed]#/orders');
  });
  it('an ordinary page is kept as it is', () => {
    expect(pageOf('https://megyprints.vercel.app/#/orders?order=abc')).toBe('https://megyprints.vercel.app/#/orders?order=abc');
  });
  it('provider_refresh_token and token_hash too (red-team round 2)', () => {
    expect(pageOf('https://megyprints.vercel.app/#provider_refresh_token=gp-1&token_hash=th-2&type=recovery'))
      .toBe('https://megyprints.vercel.app/#provider_refresh_token=[removed]&token_hash=[removed]&type=recovery');
  });
});

describe('shortContext', async () => {
  const { shortContext } = await import('./report');
  it("a crash's long component stack is shortened, the rest kept as is", () => {
    const c = shortContext({ boundary: 'builder', attempt: 2, componentStack: 'x'.repeat(5000) })!;
    expect(c.boundary).toBe('builder');
    expect(c.attempt).toBe(2);
    expect((c.componentStack as string).length).toBe(300);
  });
});

describe('takeReportSlot', async () => {
  const { takeReportSlot, resetReportSlots, PAGE_REPORT_MAX, SAME_ERROR_MAX } = await import('./report');
  beforeEach(() => resetReportSlots());
  it('the same error goes at most SAME_ERROR_MAX times', () => {
    const sent = Array.from({ length: 10 }, () => takeReportSlot('boom|render'));
    expect(sent.filter(Boolean)).toHaveLength(SAME_ERROR_MAX);
  });
  it('at most PAGE_REPORT_MAX reports per page load', () => {
    const sent = Array.from({ length: 50 }, (_, i) => takeReportSlot(`e${i}|`));
    expect(sent.filter(Boolean)).toHaveLength(PAGE_REPORT_MAX);
  });
});

describe('reportError sends to the endpoint', () => {
  const beacons: { url: string; body: string }[] = [];
  beforeEach(() => {
    beacons.length = 0;
    vi.resetModules();
    vi.stubEnv('VITE_ERROR_ENDPOINT', '/api/client-error');
    vi.stubGlobal('navigator', { sendBeacon: (url: string, blob: Blob) => { void blob.text().then((t) => beacons.push({ url, body: t })); return true; } });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('the message, where it happened and the order', async () => {
    const { reportError } = await import('./report');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reportError(new Error('Cover file upload failed: network'), { path: 'checkout', step: 'cover_pdf', attempt: 1, orderId: 'o1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(beacons).toHaveLength(1);
    expect(beacons[0].url).toBe('/api/client-error');
    expect(JSON.parse(beacons[0].body)).toMatchObject({
      message: 'Cover file upload failed: network',
      context: { path: 'checkout', step: 'cover_pdf', attempt: 1, orderId: 'o1' },
    });
  });
});
