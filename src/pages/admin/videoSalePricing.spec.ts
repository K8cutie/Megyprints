// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* The owner's Video memory sale box (0073): says whether a sale runs and its
   % off, refuses a sale with no name or end before asking the database, saves
   a new theme, and ends one. */

const mocks = vi.hoisted(() => ({
  loaded: null as { name: string | null; until: string | null; single: number; packSize: number; packPrice: number } | null,
  setVideoSale: vi.fn<(n: string | null, u: string | null) => Promise<string | null>>(async () => null),
}));
vi.mock('../../lib/storeSettings', () => ({
  loadOwnerVideoSale: async () => mocks.loaded,
  setVideoSale: (n: string | null, u: string | null) => mocks.setVideoSale(n, u),
}));

import VideoSalePricing from './VideoSalePricing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mocks.setVideoSale.mockClear();
  mocks.loaded = { name: 'Christmas sale', until: '2099-12-31', single: 50, packSize: 3, packPrice: 100 };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const show = async () => { act(() => root.render(createElement(VideoSalePricing))); await settle(); };
const byId = <T extends HTMLElement>(id: string) => host.querySelector<T>(`[data-testid="${id}"]`)!;
const type = (el: HTMLInputElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('Admin → Pricing: Video memory sale', () => {
  it('says the sale runs, ₱50 each, 3 for ₱100 (33% off)', async () => {
    await show();
    expect(byId('video-sale-state').textContent).toBe('Running now: Christmas sale, until December 31, 2099.');
    expect(byId('video-sale-pricing').textContent).toContain('(33% off)');
    expect(byId('video-sale-end')).toBeTruthy();
  });

  it('refuses a sale with no name before asking the database', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('video-sale-name'), '  '));
    act(() => byId<HTMLButtonElement>('video-sale-save').click());
    await settle();
    expect(mocks.setVideoSale).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Type a name (up to 30 letters) and an end date');
  });

  it('saves a new theme, and ends a sale', async () => {
    await show();
    act(() => type(byId<HTMLInputElement>('video-sale-name'), 'Valentine sale'));
    act(() => byId<HTMLButtonElement>('video-sale-save').click());
    await settle();
    expect(mocks.setVideoSale).toHaveBeenCalledWith('Valentine sale', '2099-12-31');
    act(() => byId<HTMLButtonElement>('video-sale-end').click());
    await settle();
    expect(mocks.setVideoSale).toHaveBeenLastCalledWith(null, null);
    expect(byId('video-sale-state').textContent).toBe('No sale: extra videos are ₱50 each.');
  });

  it('a database before 0073 (or not the owner) says so', async () => {
    mocks.loaded = null;
    await show();
    expect(byId('video-sale-pricing').textContent).toContain('Not set up on this database yet (migration 0073)');
  });
});
