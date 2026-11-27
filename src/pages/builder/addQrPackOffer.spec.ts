// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE VIDEO POP-UP ON THE WEBSITE (owner's design 2026-10-26: "they click on
   the golden button and a pop-up appears"; re-asked 2026-11-24 after a 3rd
   video went in with no word; the Christmas sale drawn and approved the same
   day). "Add a video memory" says what the next video costs before choosing
   it: in the sale, "Get 3 for ₱100" (33% off ₱150) or "Get 1 for ₱50". The
   free videos, a video inside a group already counted, a change to a placed
   video, and an event album (its booking pays) never see it.
   ══════════════════════════════════════════════════════════════════════════ */

const XMAS = { single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2099-12-31' } };
const h = vi.hoisted(() => ({ pages: [] as unknown[], eventLink: null as unknown, offer: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => ({ albumPages: h.pages, getAlbumId: () => 'album-1' }) }));
vi.mock('../../lib/eventAlbum', () => ({ eventVideosForAlbum: () => [], eventLinkForAlbum: () => h.eventLink }));
vi.mock('../../lib/storeSettings', () => ({
  getPriceSchedule: () => ({ hosting_tiers: [{ years: 5, price: 0 }], hd_memories_price: 99, ...(h.offer ? { video_offer: h.offer } : {}) }),
}));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));
vi.mock('../../lib/memoryClips', async (orig) => ({
  ...(await orig<typeof import('../../lib/memoryClips')>()),
  hostedMemoriesEnabled: () => true,
  listStagedCodes: async () => [],
  getStagedClip: async () => null,
  currentClipQuality: () => 'standard',
  stagedClipQuality: async () => null,
}));

import AddQrModal from './AddQrModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** An album with `n` video memories, one a page. */
const withVideos = (n: number) => Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`, qrFills: i < n ? [{ kind: 'clip', code: `c${i}`, destination: `https://x/${i}.mp4` }] : [],
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { h.eventLink = null; h.offer = XMAS; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const open = async (videos: number, initial: unknown = null) => {
  h.pages = withVideos(videos);
  const onClose = vi.fn();
  await act(async () => { root.render(createElement(AddQrModal, { initial: initial as never, onSave: vi.fn(), onRemove: vi.fn(), onClose })); });
  await act(async () => { await Promise.resolve(); });
  return onClose;
};
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('"Add a video memory": the pop-up in the Christmas sale', () => {
  it('the 2 free videos: straight to "Choose a video"; its line says how more are sold', async () => {
    for (const n of [0, 1]) {
      await open(n);
      expect(q('qr-pack-offer')).toBeNull();
      expect(host.textContent).toContain('Choose a video');
      expect(host.textContent).toContain('2 memories included · more ₱50 each, or 3 for ₱100 until December 31');
    }
  });

  it('the 3rd video: the drawing (tag, ₱150 crossed out, ₱100, 33% off, two "Get" buttons); "Not now" closes', async () => {
    const onClose = await open(2);
    expect(q('qr-pack-tag')?.textContent).toBe('Christmas sale');
    expect(host.textContent).toContain('Get 3 more video memories');
    expect(q('qr-pack-price')?.querySelector('s')?.textContent).toBe('₱150');
    expect(q('qr-pack-price')?.textContent).toContain('₱100');
    expect(q('qr-pack-price')?.textContent).toContain('33% off');
    expect(q('qr-pack-body')?.textContent).toBe("You've used your 2 free videos. Each extra video is ₱50, but until December 31 you get 3 for ₱100. You pay with your album at checkout.");
    expect(q('qr-pack-yes')?.textContent).toBe('Get 3 for ₱100');
    expect(q('qr-pack-single')?.textContent).toBe('Get 1 for ₱50');
    expect(host.textContent).not.toContain('Choose a video');
    act(() => q('qr-pack-no')!.click());
    expect(onClose).toHaveBeenCalled();
  });

  it('both "Get" buttons go on to choose the video', async () => {
    for (const id of ['qr-pack-yes', 'qr-pack-single']) {
      await act(async () => { root.unmount(); });
      root = createRoot(host);
      await open(2);
      await act(async () => { q(id)!.click(); });
      expect(q('qr-pack-offer')).toBeNull();
      expect(host.textContent).toContain('Choose a video');
    }
  });

  it('inside a group already counted (4th, 5th) it says nothing; after 3 more it asks again', async () => {
    for (const n of [3, 4]) {
      await open(n);
      expect(q('qr-pack-offer')).toBeNull();
    }
    await open(5);
    expect(q('qr-pack-body')?.textContent?.startsWith("You've used 5 videos.")).toBe(true);
  });

  it('changing a placed video, or an event album, never asks', async () => {
    await open(2, { kind: 'clip', code: 'c0', destination: 'https://x/0.mp4' });
    expect(q('qr-pack-offer')).toBeNull();
    h.eventLink = { bookingNumber: 'EV-1', cover: 'soft' };
    await open(2);
    expect(q('qr-pack-offer')).toBeNull();
  });
});

describe('after the sale, or on a price list from before 0078', () => {
  it('no sale: one button, ₱50', async () => {
    h.offer = { single: 50, pack: null };
    await open(2);
    expect(q('qr-pack-tag')).toBeNull();
    expect(q('qr-pack-yes')?.textContent).toBe('Get 1 for ₱50');
    expect(q('qr-pack-single')).toBeNull();
  });

  it('before 0078: the 0066 packs, as before', async () => {
    h.offer = null;
    await open(2);
    expect(q('qr-pack-yes')?.textContent).toBe('Add 3 more · ₱100');
  });
});
