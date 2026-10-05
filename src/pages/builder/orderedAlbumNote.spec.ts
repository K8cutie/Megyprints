// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   AN ALREADY-ORDERED ALBUM SAYS SO (1-star testers round 2, the returning
   customer): reopening the ordered album and adding 4 photos, nothing said it
   was in order MP-2026-2FAZ2B4 or whether the edits would change the book
   being printed. The order prints the album as it was then (album_snapshot).
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ order: null as unknown, calls: [] as unknown[][] }));
vi.mock('../../lib/myOrders', () => ({
  lastOrderForAlbum: async (...a: unknown[]) => { h.calls.push(a); return h.order; },
}));
import OrderedAlbumNote from './OrderedAlbumNote';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement;
beforeEach(() => { h.order = null; h.calls = []; sessionStorage.clear(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root?.unmount()); host.remove(); });
const actions = (over: Record<string, unknown> = {}) => ({ user: { id: 'user-1' }, getAlbumId: () => 'album-9', albumTitle: 'Hong Kong Trip Day 1', ...over }) as never;
const render = async (a: unknown) => {
  await act(async () => { root!.render(createElement(OrderedAlbumNote, { actions: a } as never)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

describe('the already-ordered note', () => {
  it('an ordered album: names the order and says changes go into a new one', async () => {
    h.order = { order_number: 'MP-2026-2FAZ2B4', material: 'glossy', cover: 'hardboundLeather', status: 'paid' };
    await render(actions());
    expect(h.calls).toEqual([['user-1', 'album-9']]);
    const note = host.querySelector('[data-testid="ordered-album-note"]');
    expect(note?.textContent).toMatch(/You ordered this album \(MP-2026-2FAZ2B4\)\. That order prints the album as it was when you ordered it, so changes you make now go into a new order\./);
  });
  it('"Got it" puts it away for this visit', async () => {
    h.order = { order_number: 'MP-2026-2FAZ2B4', material: 'glossy', cover: 'hardboundLeather' };
    await render(actions());
    act(() => { host.querySelector<HTMLButtonElement>('[data-testid="ordered-album-note-ok"]')!.click(); });
    expect(host.querySelector('[data-testid="ordered-album-note"]')).toBeNull();
    await render(actions({ albumTitle: 'renamed' }));
    expect(host.querySelector('[data-testid="ordered-album-note"]')).toBeNull();
  });
  it('never ordered, or not signed in: nothing', async () => {
    await render(actions());
    expect(host.querySelector('[data-testid="ordered-album-note"]')).toBeNull();
    h.order = { order_number: 'MP-X', material: 'matte', cover: 'softcover' };
    h.calls = [];
    await render(actions({ user: null }));
    expect(h.calls).toEqual([]);
    expect(host.querySelector('[data-testid="ordered-album-note"]')).toBeNull();
  });
});
