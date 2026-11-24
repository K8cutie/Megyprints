// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE PACK OFFER ON THE WEBSITE (owner's design 2026-10-26: "they click on
   the golden button and a pop-up appears"; re-asked 2026-11-24 after a 3rd
   video went in with no word). "Add a video memory" on an album whose next
   video starts a paid pack says what it costs first; the 2 free videos, a
   video that fits a pack already counted, a change to a placed video, and an
   event album (its booking pays) never see it.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ pages: [] as unknown[], eventLink: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => ({ albumPages: h.pages, getAlbumId: () => 'album-1' }) }));
vi.mock('../../lib/eventAlbum', () => ({ eventVideosForAlbum: () => [], eventLinkForAlbum: () => h.eventLink }));
vi.mock('../../lib/storeSettings', () => ({ getPriceSchedule: () => ({ hosting_tiers: [{ years: 5, price: 0 }], hd_memories_price: 99 }) }));
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
beforeEach(() => { h.eventLink = null; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const open = async (videos: number, initial: unknown = null) => {
  h.pages = withVideos(videos);
  const onClose = vi.fn();
  await act(async () => { root.render(createElement(AddQrModal, { initial: initial as never, onSave: vi.fn(), onRemove: vi.fn(), onClose })); });
  await act(async () => { await Promise.resolve(); });
  return onClose;
};
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('"Add a video memory": the pack offer', () => {
  it('the 2 free videos: straight to "Choose a video", no offer', async () => {
    for (const n of [0, 1]) {
      await open(n);
      expect(q('qr-pack-offer')).toBeNull();
      expect(host.textContent).toContain('Choose a video');
    }
  });

  it('the 3rd video: what it costs first; "Not now" closes', async () => {
    const onClose = await open(2);
    expect(q('qr-pack-offer')).not.toBeNull();
    expect(host.textContent).toContain("You've used your 2 free videos");
    expect(q('qr-pack-body')?.textContent).toBe('Add 3 more video memories for ₱100. You pay it with your album at checkout.');
    expect(host.textContent).not.toContain('Choose a video');
    act(() => q('qr-pack-no')!.click());
    expect(onClose).toHaveBeenCalled();
  });

  it('"Add 3 more · ₱100" goes on to choose the video', async () => {
    await open(2);
    expect(q('qr-pack-yes')?.textContent).toBe('Add 3 more · ₱100');
    await act(async () => { q('qr-pack-yes')!.click(); });
    expect(q('qr-pack-offer')).toBeNull();
    expect(host.textContent).toContain('Choose a video');
  });

  it('a video that fits a pack already counted (4th, 5th) says nothing; the 6th asks again', async () => {
    for (const n of [3, 4]) {
      await open(n);
      expect(q('qr-pack-offer')).toBeNull();
    }
    await open(5);
    expect(host.textContent).toContain('Your 3 extra videos are used');
  });

  it('changing a placed video, or an event album, never asks', async () => {
    await open(2, { kind: 'clip', code: 'c0', destination: 'https://x/0.mp4' });
    expect(q('qr-pack-offer')).toBeNull();
    h.eventLink = { bookingNumber: 'EV-1', cover: 'soft' };
    await open(2);
    expect(q('qr-pack-offer')).toBeNull();
  });
});
