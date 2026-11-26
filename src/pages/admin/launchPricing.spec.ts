// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PriceSchedule } from '../../lib/pricing';

/* The owner's Launch price box (0072): says whether it runs, shows what it
   does to one album, refuses a dishonest % before asking the database, and
   can end it. */

const mocks = vi.hoisted(() => ({
  loaded: { pct: 40 as number | null, until: '2099-03-31' as string | null } as { pct: number | null; until: string | null } | null,
  setLaunchPrice: vi.fn<(p: number | null, u: string | null) => Promise<string | null>>(async () => null),
}));
vi.mock('../../lib/storeSettings', () => ({
  loadOwnerLaunchPrice: async () => mocks.loaded,
  setLaunchPrice: (p: number | null, u: string | null) => mocks.setLaunchPrice(p, u),
  getPriceSchedule: () => ({
    min_pages: 40, sheet_rate: 60.95, hosting_reserve: 50, disabled_sizes: [],
    sizes: { '8x8': { pps: 4, hard_rate: 1005, soft_rate: 545 } },
  } as unknown as PriceSchedule),
}));

import LaunchPricing from './LaunchPricing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.setLaunchPrice.mockClear();
  mocks.loaded = { pct: 40, until: '2099-03-31' };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const show = async () => { act(() => root.render(createElement(LaunchPricing))); await settle(); };
const byId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`)!;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Admin → Pricing: Launch price', () => {
  it('says it runs, and what it does to an 8×8 hardcover (₱2,775 crossed out, ₱1,665 paid)', async () => {
    await show();
    expect(byId('launch-state').textContent).toBe('Running now: 40% off until March 31, 2099.');
    expect(byId('launch-example').textContent).toContain('₱2,775');
    expect(byId('launch-example').textContent).toContain('₱1,665');
    expect(byId('launch-end')).toBeTruthy();
  });

  it('refuses a dishonest % before asking the database', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('launch-pct'), '95'));
    act(() => byId<HTMLButtonElement>('launch-save').click());
    await settle();
    expect(mocks.setLaunchPrice).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Type a whole % from 1 to 90 and an end date');
  });

  it('saves a new % and end date, and can end it', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('launch-pct'), '30'));
    act(() => byId<HTMLButtonElement>('launch-save').click());
    await settle();
    expect(mocks.setLaunchPrice).toHaveBeenCalledWith(30, '2099-03-31');
    expect(host.textContent).toContain('Saved: albums show 30% off until March 31, 2099.');

    act(() => byId<HTMLButtonElement>('launch-end').click());
    await settle();
    expect(mocks.setLaunchPrice).toHaveBeenLastCalledWith(null, null);
    expect(byId('launch-state').textContent).toBe('Not running.');
  });

  it('an ended one says so, with no "End it now"', async () => {
    mocks.loaded = { pct: 40, until: '2020-01-31' };
    await show();
    expect(byId('launch-state').textContent).toBe('Not running.');
    expect(host.querySelector('[data-testid="launch-end"]')).toBeNull();
  });

  it('a database before 0072 (or not the owner) says so', async () => {
    mocks.loaded = null;
    await show();
    expect(byId('launch-pricing').textContent).toContain('Not set up on this database yet (migration 0072)');
  });
});
