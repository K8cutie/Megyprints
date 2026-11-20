// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PricingModel } from '../../lib/pricing';

const setMegyMini = vi.fn<(next: unknown) => Promise<string | null>>(async () => null);
vi.mock('../../lib/storeSettings', () => ({ setMegyMini: (next: unknown) => setMegyMini(next) }));

import MegyMiniPricing from './MegyMiniPricing';

/* The owner's Megy Mini box (0062): off until turned on WITH a shipping fee;
   says what a single Mini and a Mini in a package keep. */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MODEL = {
  sheet_cost: 26.5, soft_cover_cost: 50, soft_bind_cost: 100, min_pages: 40, price_multiple: 2.5,
  hosting_reserve: 50, hosting_tiers: [], hd_memories_price: 49, sizes: {} as PricingModel['sizes'],
  mini_on: false, mini_price: 350, mini_package_price: 299, mini_shipping_fee: null, mini_free_qr: 2,
  mini_cost: 56, mini_hosting_reserve: 15,
} satisfies PricingModel;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { setMegyMini.mockClear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const show = (model: PricingModel, onSaved: (m: PricingModel) => void = () => {}) =>
  act(() => root.render(createElement(MegyMiniPricing, { model, onSaved })));
const byId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`)!;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('Admin → Pricing: Megy Mini', () => {
  it('shows it off, with what you keep (350 − 56 − 15 = 279; 299 − 56 = 243)', () => {
    show(MODEL);
    const box = byId('megy-mini-pricing').textContent!;
    expect(box).toContain('Off');
    expect(box).toContain('₱279');
    expect(box).toContain('₱243');
  });

  it('will not turn on without a shipping fee, and saves once one is typed', async () => {
    const onSaved = vi.fn();
    show(MODEL, onSaved);
    act(() => byId<HTMLInputElement>('megy-mini-on').click());
    act(() => byId<HTMLButtonElement>('megy-mini-save').click());
    await settle();
    expect(host.textContent).toContain('Type the shipping fee before turning Megy Mini on.');
    expect(setMegyMini).not.toHaveBeenCalled();

    act(() => type(byId<HTMLInputElement>('megy-mini-fee'), '120'));
    act(() => byId<HTMLButtonElement>('megy-mini-save').click());
    await settle();
    expect(setMegyMini).toHaveBeenCalledWith({ on: true, price: 350, packagePrice: 299, shippingFee: 120, freeQr: 2 });
    expect(onSaved).toHaveBeenCalled();
    expect(host.textContent).toContain('on sale at ₱350 + ₱120 shipping');
  });

  it('says so on a database without 0062', () => {
    const { mini_price: _drop, ...old } = MODEL;
    void _drop;
    show(old as PricingModel);
    expect(host.textContent).toContain('Not set up on this database yet');
  });
});
