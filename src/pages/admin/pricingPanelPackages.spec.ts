// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   VIDEO PACKAGES IN THE PRICING TAB (owner, 2026-10-26): the owner changes the
   packages himself, like the memory-hosting terms. Mounts the real panel on a
   stand-in cost model; set_qr_packages (0056) is the save.
   ═══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ saved: [] as unknown[] }));
vi.mock('../../lib/storeSettings', () => ({
  setPriceMultiple: vi.fn(), getDisabledSizes: () => [], setDisabledSizes: vi.fn(),
  loadOwnerPricingModel: async () => ({
    sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, price_multiple: 2.5, hosting_reserve: 50,
    hosting_tiers: [{ years: 5, price: 0 }, { years: 10, price: 99 }], hd_memories_price: 49, shipping_allowance: 200,
    compare_multiple: null, compare_until: null,
    qr_packages: [{ videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 12, price: 300 }],
    sizes: Object.fromEntries(['6x4', '6x6', '6x8', '8x6', '8x8', '9x9', '11.5x8', '8.5x11'].map((s) => [s, { pps: 4, hb: 350, surcharge: 0 }])),
  }),
  setHostingReserve: vi.fn(), setHostingTiers: vi.fn(), setHdMemoriesPrice: vi.fn(), setShippingAllowance: vi.fn(), setPriceCompare: vi.fn(),
  setQrPackages: async (p: unknown) => { h.saved.push(p); return null; },
}));

import PricingPanel from './PricingPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); h.saved = []; });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const section = () => host.querySelector('[data-testid="pricing-video-packages"]') as HTMLElement;
const input = (label: string) => section().querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const type = async (el: HTMLInputElement, v: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const button = (text: string) => [...section().querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

describe('Video packages in the Pricing tab', () => {
  it('shows the packages with what each video costs and the saving against the ₱50 one', async () => {
    await act(async () => { root.render(createElement(PricingPanel)); });
    await settle();
    expect(section().textContent).toContain('highest price per video (₱50 each now)');
    expect([0, 1, 2].map((i) => [input(`Package ${i + 1} videos`).value, input(`Package ${i + 1} price`).value]))
      .toEqual([['2', '100'], ['5', '200'], ['12', '300']]);
    expect(section().textContent).toContain('₱25 each · Save 50%');
    expect(section().textContent).toContain('₱40 each · Save 20%');
  });

  it('the owner changes a price and saves: set_qr_packages gets the packages, smallest first', async () => {
    await act(async () => { root.render(createElement(PricingPanel)); });
    await settle();
    await type(input('Package 3 price'), '350');
    await act(async () => { button('Save packages').click(); });
    await settle();
    expect(h.saved).toEqual([[{ videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 12, price: 350 }]]);
    expect(section().textContent).toContain('Saved — the builder and checkout now offer these packages.');
  });

  it('two packages with the same number of videos: said in words, nothing saved', async () => {
    await act(async () => { root.render(createElement(PricingPanel)); });
    await settle();
    await type(input('Package 2 videos'), '2');
    await act(async () => { button('Save packages').click(); });
    await settle();
    expect(h.saved).toEqual([]);
    expect(section().textContent).toContain('Two packages have the same number of videos.');
  });
});
