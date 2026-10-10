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

const net = vi.hoisted(() => ({ online: false, calls: 0 }));
vi.mock('./supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    rpc: async () => {
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
  net.online = false; net.calls = 0;
  m = await import('./storeSettings');
});
afterEach(() => { vi.useRealTimers(); });

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
    expect(src).toMatch(/\{priceReady \? `₱\$\{totalPrice\.toLocaleString\('en-PH'\)\}` : '—'\}/);
  });
});
