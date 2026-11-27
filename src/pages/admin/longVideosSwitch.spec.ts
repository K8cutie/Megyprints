// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   LONGER VIDEOS ON / OFF IN THE PRICING TAB (owner, 2026-11-23: "disable the
   longer videos first and put an on off switch for those features in the
   admin panel"; 0079). It shows what is live, and a tap sends exactly that.
   ═══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  model: null as Record<string, unknown> | null,
  switches: [] as boolean[],
  answer: null as string | null,
}));
vi.mock('../../lib/storeSettings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/storeSettings')>()),
  getDisabledSizes: () => [],
  loadOwnerPricingModel: async () => h.model,
  setLongVideosOn: async (on: boolean) => { h.switches.push(on); return h.answer; },
}));
vi.mock('./TesterCodeSettings', () => ({ default: () => null }));
vi.mock('./MegyMiniPricing', () => ({ default: () => null }));

import PricingPanel from './PricingPanel';

const MODEL = {
  sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, hosting_reserve: 50,
  hosting_tiers: [{ years: 5, price: 0 }], hd_memories_price: 99, video_3min_price: 199, video_5min_price: 399,
  shipping_allowance: 200, compare_multiple: null, compare_until: null, price_multiple: 2.3,
  sizes: {
    '6x4': { hb: 250, pps: 18, surcharge: 0 }, '6x6': { hb: 280, pps: 12, surcharge: 0 },
    '6x8': { hb: 350, pps: 8, surcharge: 0 }, '8x6': { hb: 350, pps: 8, surcharge: 0 },
    '8x8': { hb: 350, pps: 4, surcharge: 0 }, '11.5x8': { hb: 450, pps: 4, surcharge: 300 },
    '8.5x11': { hb: 500, pps: 4, surcharge: 300 },
  },
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  h.model = { ...MODEL, long_videos_on: false }; h.switches = []; h.answer = null;
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
const open = async () => { await act(async () => { root.render(createElement(PricingPanel)); }); await settle(); };
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = async (id: string) => { await act(async () => { $(id)!.click(); }); await settle(); };

describe('the longer-videos switch', () => {
  it('shows what is live: off, with Off picked', async () => {
    await open();
    expect($('long-videos-status')?.textContent).toBe('Off now');
    expect($('long-videos-off')?.getAttribute('aria-checked')).toBe('true');
    expect($('long-videos-on')?.getAttribute('aria-checked')).toBe('false');
  });

  it('On: sends on, then says customers can add videos up to 5 minutes', async () => {
    await open();
    await click('long-videos-on');
    expect(h.switches).toEqual([true]);
    expect($('long-videos-status')?.textContent).toBe('On now');
    expect($('long-videos-saved')?.textContent).toBe('Saved. Longer videos are on: customers can add videos up to 5 minutes.');
  });

  it('Off from on: sends off, videos are up to 2 minutes again', async () => {
    h.model = { ...MODEL, long_videos_on: true };
    await open();
    await click('long-videos-off');
    expect(h.switches).toEqual([false]);
    expect($('long-videos-status')?.textContent).toBe('Off now');
    expect($('long-videos-saved')?.textContent).toBe('Saved. Longer videos are off: videos are up to 2 minutes again.');
  });

  it("a switch that didn't go through says so, and what's live stays shown", async () => {
    h.answer = 'not authorized';
    await open();
    await click('long-videos-on');
    expect($('long-videos-status')?.textContent).toBe('Off now');
    expect(host.textContent).toContain("Couldn't save: not authorized");
  });

  it('a database before 0079 shows no switch', async () => {
    h.model = { ...MODEL };
    await open();
    expect($('long-videos-status')).toBeNull();
    expect($('long-videos-on')).toBeNull();
  });
});
