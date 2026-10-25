// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ═══════════════════════════════════════════════════════════════════════════
   THE GOLD BUTTON'S POP-UP, PAST THE FREE VIDEOS (owner, 2026-10-26): "ran
   out of free videos, we have a special offer, choose the best package".
   Mounts the real AddQrModal (every add-video path opens it) on a stand-in
   album and price list.
   ═══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  pages: [] as unknown[],
  schedule: null as unknown,
  eventAlbums: new Set<string>(),
}));
vi.mock('../../lib/storeSettings', () => ({ getPriceSchedule: () => h.schedule }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => ({ albumPages: h.pages, getAlbumId: () => 'album-1' }) }));
vi.mock('../../lib/eventAlbum', () => ({
  eventVideosForAlbum: () => [],
  eventLinkForAlbum: (id: string) => (h.eventAlbums.has(id) ? { bookingId: 'b1', bookingNumber: 'EV-1', videos: [] } : null),
}));
vi.mock('../../lib/memoryClips', () => ({
  hostedMemoriesEnabled: () => true,
  validateClipFile: vi.fn(), stageClip: vi.fn(), getStagedClip: async () => null, removeStagedClip: vi.fn(),
  publicClipUrl: () => 'https://example.test/c.mp4', listStagedCodes: async () => [], currentClipQuality: () => 'standard',
  setClipQuality: vi.fn(), stagedClipQuality: async () => null,
  QUALITY_TARGETS: { standard: { label: '720p' }, hd: { label: '1080p' } }, MAX_CLIP_SECONDS: 120,
}));
vi.mock('../../lib/qrMemory', () => ({
  mintCode: () => 'code', memoryUrl: () => 'https://example.test/m/code', generateQrPngDataUrl: async () => 'data:',
  validateDestination: () => ({ error: 'x' }), videoEmbedInfo: () => null,
}));
vi.mock('../../lib/qrMemories', () => ({ tryCreateMemory: vi.fn(), updateMemoryDestination: vi.fn() }));
vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../components/AuthModalProvider', () => ({ useAuthModal: () => ({ openLogin: vi.fn() }) }));

import AddQrModal from './AddQrModal';
import { readVideoPackages, writeVideoPackages } from '../../lib/videoPackageChoice';

const PACKAGES = [{ videos: 2, price: 100 }, { videos: 5, price: 200 }, { videos: 12, price: 300 }];
const withPackages = { hosting_tiers: [{ years: 5, price: 0 }], hd_memories_price: 49, qr_packages: PACKAGES };
/** An album whose first `n` pages each carry one QR memory. */
const album = (n: number) => Array.from({ length: Math.max(n, 40) }, (_, i) => (i < n ? { id: `p${i}`, qrFills: [{ code: `c${i}`, kind: 'clip' }] } : { id: `p${i}` }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  localStorage.clear(); onClose.mockClear(); h.eventAlbums.clear(); h.schedule = withPackages;
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const render = async (videos: number, initial: unknown = null) => {
  h.pages = album(videos);
  await act(async () => {
    root.render(createElement(AddQrModal, { initial: initial as never, onSave: vi.fn(), onRemove: vi.fn(), onClose }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); }); };
const pickerShown = () => [...host.querySelectorAll('button')].some((b) => b.textContent?.includes('Choose a video'));

describe('before the free videos run out', () => {
  it('6 used: the video picker, counting "Video 7 of 7 free · then packages from ₱100"', async () => {
    await render(6);
    expect($('video-packages')).toBeNull();
    expect(pickerShown()).toBe(true);
    expect($('qr-video-counter')!.textContent).toMatch(/^Video 7 of 7 free · then packages from ₱100/);
  });
});

describe('7 used: "You ran out of free videos"', () => {
  it('the three packages, most videos first, +12 picked: "₱600, now ₱300 · Save 50%", one button "Add 12 more videos · ₱300"', async () => {
    await render(7);
    expect(pickerShown()).toBe(false);
    expect($('video-packages')!.textContent).toContain('You ran out of free videos');
    expect($('video-packages')!.textContent).toContain('You used all 7 free videos in this album. We have a special offer: choose the best package.');
    const options = [...host.querySelectorAll('[role="radio"]')];
    expect(options.map((o) => o.getAttribute('data-testid'))).toEqual(['video-package-12', 'video-package-5', 'video-package-2']);
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect($('video-package-was-12')!.textContent).toBe('₱600');
    expect($('video-package-save-12')!.textContent).toBe('Save 50%');
    expect($('video-package-save-5')!.textContent).toBe('Save 20%');
    expect($('video-package-save-2')).toBeNull();
    expect($('video-package-add')!.textContent).toBe('Add 12 more videos · ₱300');
    expect(host.textContent).toContain('You pay with your album at checkout.');
  });

  it('picking +5, then Add: the package goes on the album and the video picker opens, "Video 8 of 12"', async () => {
    await render(7);
    await click($('video-package-5'));
    expect($('video-package-add')!.textContent).toBe('Add 5 more videos · ₱200');
    await click($('video-package-add'));
    expect(readVideoPackages('album-1')).toEqual([5]);
    expect($('video-packages')).toBeNull();
    expect(pickerShown()).toBe(true);
    expect($('qr-video-counter')!.textContent).toMatch(/^Video 8 of 12 · 5-video package/);
  });

  it('Not now closes it and puts nothing on the album', async () => {
    await render(7);
    await click($('video-package-not-now'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(readVideoPackages('album-1')).toEqual([]);
  });

  it("an event album never asks: its deal includes the videos", async () => {
    h.eventAlbums.add('album-1');
    await render(7);
    expect($('video-packages')).toBeNull();
    expect(pickerShown()).toBe(true);
  });

  it('changing a video already on the album never asks', async () => {
    await render(7, { code: 'c0', kind: 'clip', destination: 'https://example.test/c.mp4', qrPngDataUrl: 'data:', memoryUrl: 'https://example.test/m/c0' });
    expect($('video-packages')).toBeNull();
  });

  it('a price list without packages (before 0056): no pop-up, "₱20 each after" as before', async () => {
    h.schedule = { hosting_tiers: [{ years: 5, price: 0 }], hd_memories_price: 49 };
    await render(7);
    expect($('video-packages')).toBeNull();
    expect(host.textContent).toContain('7 memories included · ₱20 each after');
  });
});

describe('the package full', () => {
  it('+12 with 19 used: "Your video package is full", moving up 14 / 17 / 24 more, priced as more than now', async () => {
    writeVideoPackages('album-1', [12]);
    await render(19);
    expect($('video-packages')!.textContent).toContain('Your video package is full');
    expect($('video-packages')!.textContent).toContain('You used all 19 videos in this album. Choose a bigger package.');
    const options = [...host.querySelectorAll('[role="radio"]')];
    expect(options.map((o) => o.getAttribute('data-testid'))).toEqual(['video-package-24', 'video-package-17', 'video-package-14']);
    expect(options[2].textContent).toContain('₱100 more than now');
    expect($('video-package-add')!.textContent).toBe('Switch to 24 more videos · ₱600');
    await click($('video-package-14'));
    await click($('video-package-add'));
    expect(readVideoPackages('album-1')).toEqual([12, 2]);
    expect(pickerShown()).toBe(true);
    expect($('qr-video-counter')!.textContent).toMatch(/^Video 20 of 21 · 12 \+ 2 video packages/);
  });

  it('+12 with 10 used still has room: no pop-up, "Video 11 of 19"', async () => {
    writeVideoPackages('album-1', [12]);
    await render(10);
    expect($('video-packages')).toBeNull();
    expect($('qr-video-counter')!.textContent).toMatch(/^Video 11 of 19 · 12-video package/);
  });
});
