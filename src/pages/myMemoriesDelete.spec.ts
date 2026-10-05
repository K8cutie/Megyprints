// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   MY MEMORIES ASKS BEFORE IT DELETES, AND SAYS WHERE THE QR IS (1-star
   testers round 3, the Memory Maker): the only confirmation was a red "Tap
   again to delete", with no word that the QR was printed in an order or that
   the album still carried it. Now Delete opens a question that says both,
   with "Delete the video" and "Keep it"; after a delete the page says which
   album pages the QR came off.
   ══════════════════════════════════════════════════════════════════════════ */

const AUTH = { user: { id: 'user-1' } }; // one object: a new user every render re-runs the page's effects forever
vi.mock('../lib/authContext', () => ({ useAuth: () => AUTH }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../lib/qrMemory', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), generateQrPngDataUrl: async () => '' }));
const ROW = { code: 'vvb6inkz', destination: 'https://youtu.be/abc', title: null, scan_count: 2, created_at: '2026-10-05T00:00:00Z', updated_at: '2026-10-05T00:00:00Z', kind: 'link', expires_at: null };
vi.mock('../lib/qrMemories', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listMemories: async () => [ROW],
  pendingTermsByCode: async () => ({}),
  removeMemory: async () => true,
}));
const deleteMemoryEverywhere = vi.fn(async () => ({ ok: true, albums: [{ title: 'HK Trip', pages: [40] }] }));
vi.mock('../lib/memoryRemoval', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  memoryPlaces: async () => ({ albums: [{ id: 'album-1', title: 'HK Trip', pages: [40] }], orders: ['MP-2026-MUGCCF5'] }),
  deleteMemoryEverywhere: (...a: unknown[]) => deleteMemoryEverywhere(...(a as [])),
}));

import MyMemories from './MyMemories';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tap = async (el: Element | null) => { await act(async () => { (el as HTMLButtonElement).click(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
beforeEach(async () => {
  deleteMemoryEverywhere.mockClear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root.render(createElement(MyMemories)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('Delete in My Memories', () => {
  it('asks first, saying the order that printed the QR and the album page it comes off', async () => {
    await tap(q('memory-delete'));
    expect(q('memory-delete-warning')!.textContent).toBe(
      'This QR is printed in your order MP-2026-MUGCCF5. Deleting the video makes that printed QR show “Memory not found”. To change the video, use Replace video instead.'
      + ' It comes off page 40 of “HK Trip” too, so the next order doesn\'t print or charge it. Delete it?');
    expect(deleteMemoryEverywhere).not.toHaveBeenCalled();
  });
  it('"Keep it" keeps it', async () => {
    await tap(q('memory-delete'));
    await tap(q('memory-delete-keep'));
    expect(q('memory-delete-ask')).toBeNull();
    expect(deleteMemoryEverywhere).not.toHaveBeenCalled();
    expect(host.textContent).toContain('/m/vvb6inkz');
  });
  it('"Delete the video" deletes it everywhere, and the page says where its QR came off', async () => {
    await tap(q('memory-delete'));
    await tap(q('memory-delete-confirm'));
    expect(deleteMemoryEverywhere).toHaveBeenCalledWith('user-1', 'vvb6inkz');
    expect(host.textContent).not.toContain('/m/vvb6inkz');
    expect(q('memory-deleted')!.textContent).toBe('Deleted. Its QR came off page 40 of “HK Trip”.');
  });
});
