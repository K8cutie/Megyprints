// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   PRICES COME BACK WITH THE CONNECTION (1-star testers round 2, CD-1): opened
   offline, checkout showed ₱0 and "Pricing unavailable — please refresh",
   and stayed that way minutes after the connection returned — the schedule
   was fetched once, at app start. Price stays FAIL-CLOSED (no schedule → no
   price), but the load now tries again and tells checkout when it lands.
   ══════════════════════════════════════════════════════════════════════════ */

const net = vi.hoisted(() => ({ online: false, calls: 0, launch: null as unknown, video: 'missing' as unknown }));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    // `calls` counts the price list's requests; the launch price (0072) is
    // read beside it and never decides whether the prices loaded.
    rpc: async (name: string) => {
      if (name === 'public_launch_price') {
        return net.online && net.launch ? { data: net.launch, error: null } : { data: null, error: { message: 'Failed to fetch' } };
      }
      // The video offer (0073) IS part of the prices. 'missing' = a database
      // before 0073 (no such function: the 0066 packs).
      if (name === 'public_video_offer') {
        if (!net.online) return { data: null, error: { message: 'Failed to fetch' } };
        return net.video === 'missing'
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.public_video_offer' } }
          : net.video === 'fail' ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
            : { data: net.video, error: null };
      }
      net.calls++;
      return net.online
        ? { data: { rates: { '8x8': 1 }, disabled_sizes: ['6x4'] }, error: null }
        : { data: null, error: { message: 'Failed to fetch' } };
    },
  },
}));

type Mod = typeof import('./storeSettings');
let m: Mod;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  net.online = false; net.calls = 0; net.launch = null; net.video = 'missing';
  m = await import('./storeSettings');
});
afterEach(() => { vi.useRealTimers(); });

describe('the video offer (0073) is part of the prices', () => {
  it('the sale rides along with the prices', async () => {
    net.online = true; net.video = { single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } };
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()?.video_offer).toEqual({ single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } });
  });

  it('a database before 0073 (no such function): the prices load, with no offer (the 0066 packs)', async () => {
    net.online = true; net.video = 'missing';
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()).not.toBeNull();
    expect(m.getPriceSchedule()?.video_offer).toBeNull();
  });

  it('an offer that did not load: NO prices (never a guessed video price), and it tries again', async () => {
    net.online = true; net.video = 'fail';
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()).toBeNull();
    net.video = { single: 50, pack: null };
    await vi.advanceTimersByTimeAsync(3000);
    expect(m.getPriceSchedule()?.video_offer).toEqual({ single: 50, pack: null });
  });
});

describe('the launch price (0072) rides along with the prices', () => {
  it('while it runs, the schedule carries it', async () => {
    net.online = true; net.launch = { pct: 40, until: '2099-03-31' };
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()?.launch).toEqual({ pct: 40, until: '2099-03-31' });
  });

  it('a database before 0072 (or a failed read): the prices still load, with no launch price', async () => {
    net.online = true; net.launch = null;
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()).not.toBeNull();
    expect(m.getPriceSchedule()?.launch).toBeNull();
  });

  it('a dishonest one (over 90%) is never put on the schedule', async () => {
    net.online = true; net.launch = { pct: 95, until: '2099-03-31' };
    await m.loadStoreSettings();
    expect(m.getPriceSchedule()?.launch).toBeNull();
  });
});

describe('a schedule that did not load is tried again', () => {
  it('offline at start: no price (fail-closed), but ready — and it retries with backoff', async () => {
    await m.loadStoreSettings();
    expect(m.isStoreSettingsReady()).toBe(true);
    expect(m.getPriceSchedule()).toBeNull();
    expect(net.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(net.calls).toBe(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(net.calls).toBe(3);
  });
  it('back online: the browser\'s "online" fetches it at once, and checkout hears it', async () => {
    await m.loadStoreSettings();
    const heard = vi.fn();
    m.onStoreSettingsChange(heard);
    net.online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getPriceSchedule()).not.toBeNull();
    expect(m.getDisabledSizes()).toEqual(['6x4']);
    expect(heard).toHaveBeenCalled();
    // Loaded: no more retries.
    const calls = net.calls;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(net.calls).toBe(calls);
  });
  it('"tap to try again" loads it now; two taps make one request', async () => {
    await m.loadStoreSettings();
    net.online = true;
    const before = net.calls;
    await Promise.all([m.retryStoreSettings(), m.retryStoreSettings()]);
    expect(net.calls).toBe(before + 1);
    expect(m.getPriceSchedule()).not.toBeNull();
  });
  it('unsubscribing stops the calls', async () => {
    const heard = vi.fn();
    const off = m.onStoreSettingsChange(heard);
    off();
    net.online = true;
    await m.loadStoreSettings();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('checkout (source guards)', () => {
  const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
  it('re-renders when prices arrive', () => {
    expect(src).toMatch(/useEffect\(\(\) => onStoreSettingsChange\(\(\) => setPriceTick\(\(n\) => n \+ 1\)\), \[\]\);/);
  });
  it('the unpriced button answers its tap — it tries again — and never says ₱0', () => {
    expect(src).toMatch(/onClick=\{priceReady \? handleProceedToPayment : \(settingsReady && albumInfo !== 'loading' \? retryPrices : undefined\)\}/);
    expect(src).toMatch(/Prices didn't load — tap to try again/);
    expect(src).not.toMatch(/Pricing unavailable — please refresh/);
    // payTotal: the total, ₱0 with a tester code (0057), or the discount less
    // with an affiliate code (0061). Unpriced is '—'.
    expect(src).toMatch(/\{priceReady \? `₱\$\{payTotal\.toLocaleString\('en-PH'\)\}` : '—'\}/);
    expect(src).toMatch(/const payTotal = checkoutPayTotal\(totalPrice, tester, affiliate\);/);
  });
});
