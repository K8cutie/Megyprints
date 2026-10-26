// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   THE BAR UNDER PLACE ORDER (owner, 2026-10-26): "Making your print file…"
   sat still for 2–4 minutes on the live tester walk (70 pages), so a tester
   would think it froze. The bar follows the real work, page by page; sending
   can't be measured, so it moves a band instead of a number. And the screen
   stays on, because a locked phone paused the print file.
   ══════════════════════════════════════════════════════════════════════════ */

const gen = vi.hoisted(() => ({ calls: [] as unknown[][], upload: [] as string[] }));
vi.mock('../pages/builder/generateAlbumPdf', () => ({
  generateAlbumPdf: async (...a: unknown[]) => {
    gen.calls.push(a);
    const on = a[3] as ((d: number, t: number, s?: boolean) => void) | undefined;
    on?.(1, 3); on?.(2, 3); on?.(3, 3);
    gen.upload.push('pdf made');
    return new Blob(['%PDF']);
  },
  generateCoverWrapPdf: async () => new Blob(['%PDF']),
}));
vi.mock('./storageUpload', () => ({ uploadOnce: async () => { gen.upload.push('uploaded'); return null; } }));
vi.mock('./supabase', () => ({ supabase: {} }));

import { PLACE_AT, pagesAt, videosAt, pagesLabel, forward } from './placeProgress';
import { keepScreenOn } from './keepScreenOn';
import { uploadOrderPrintPdf, type PrintFileProgress } from './orders';

describe('how far along', () => {
  it('the pages are most of the bar, one step per page, from 25% to 85%', () => {
    expect(pagesAt(0, 70)).toBeCloseTo(PLACE_AT.pages, 9);
    expect(pagesAt(35, 70)).toBeCloseTo(0.55, 9);
    expect(pagesAt(70, 70)).toBeCloseTo(PLACE_AT.pagesDone, 9);
    expect(PLACE_AT.pagesDone - PLACE_AT.pages).toBeGreaterThanOrEqual(0.6);
    // Each page moves it on.
    const steps = Array.from({ length: 71 }, (_, i) => pagesAt(i, 70));
    expect(steps.every((v, i) => i === 0 || v > steps[i - 1])).toBe(true);
  });
  it('making a too-big file smaller runs after the pages, never back down the bar', () => {
    expect(pagesAt(0, 70, true)).toBeCloseTo(PLACE_AT.pagesDone, 9);
    expect(pagesAt(70, 70, true)).toBeCloseTo(PLACE_AT.sending, 9);
  });
  it('the memory videos fill the stretch before the pages', () => {
    expect(videosAt(0, 2)).toBeCloseTo(PLACE_AT.videos, 9);
    expect(videosAt(2, 2)).toBeCloseTo(PLACE_AT.pages, 9);
  });
  it('the steps run in order, start to finish', () => {
    const order = [PLACE_AT.start, PLACE_AT.preparing, PLACE_AT.cover, PLACE_AT.videos, PLACE_AT.pages, PLACE_AT.pagesDone, PLACE_AT.sending, PLACE_AT.checking, PLACE_AT.saving, PLACE_AT.finishing];
    expect(order.every((v, i) => i === 0 || v > order[i - 1])).toBe(true);
    expect(PLACE_AT.finishing).toBeLessThan(1);
  });
  it('never backs down: a later step that reports less keeps what was shown', () => {
    const at60 = forward(null, 0.6);
    expect(forward(at60, 0.4).at).toBe(0.6);
    expect(forward(at60, 0.9, true)).toEqual({ at: 0.9, sending: true });
    expect(forward(null, Number.NaN).at).toBe(0);
    expect(forward(null, 7).at).toBe(1);
  });
  it('says the page being made now, then that the pages are being put together', () => {
    expect(pagesLabel(0, 70)).toBe('Making page 1 of 70…');
    expect(pagesLabel(22, 70)).toBe('Making page 23 of 70…');
    expect(pagesLabel(70, 70)).toBe('Putting your pages together…');
    expect(pagesLabel(5, 70, true)).toBe('Making the file smaller…');
    expect(pagesLabel(0, 0)).toBe('Making your print file…');
    // One line on the Place order button on a phone.
    for (const l of [pagesLabel(129, 130), pagesLabel(130, 130), pagesLabel(1, 130, true), 'Sending your print file…']) expect(l.length).toBeLessThanOrEqual(28);
  });
});

describe('the print file says where it is', () => {
  beforeEach(() => { gen.calls = []; gen.upload = []; });
  it('each page made, then "sending" — before the upload starts', async () => {
    const seen: string[] = [];
    await uploadOrderPrintPdf('order-1', { pages: [], photos: [], albumSize: '8x8' } as never, 'softcover', (p: PrintFileProgress) => {
      seen.push(p.phase === 'pages' ? `page ${p.done}/${p.total}${p.smaller ? ' smaller' : ''}` : `sending (${gen.upload.join(', ')})`);
    });
    expect(seen).toEqual(['page 1/3', 'page 2/3', 'page 3/3', 'sending (pdf made)']);
    expect(gen.upload).toEqual(['pdf made', 'uploaded']);
  });
  it('without a listener it works as before', async () => {
    await uploadOrderPrintPdf('order-1', { pages: [], photos: [], albumSize: '8x8' } as never, 'softcover');
    expect(gen.calls[0][3]).toBeUndefined();
    expect(gen.upload).toEqual(['pdf made', 'uploaded']);
  });
});

describe('keep the screen on while the files are made', () => {
  type Lock = { released: boolean; release: () => Promise<void> };
  let locks: Lock[];
  let refuse: boolean;
  const nav = navigator as unknown as { wakeLock?: unknown };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  let visibility: DocumentVisibilityState;
  beforeEach(() => {
    locks = []; refuse = false; visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    nav.wakeLock = {
      request: async (type: string) => {
        if (type !== 'screen' || refuse) throw new Error('NotAllowedError');
        const l: Lock = { released: false, release: async () => { l.released = true; } };
        locks.push(l);
        return l;
      },
    };
  });
  afterEach(() => { delete nav.wakeLock; });

  it('takes the screen lock, and lets it go when done', async () => {
    const stop = keepScreenOn();
    await flush();
    expect(locks).toHaveLength(1);
    expect(locks[0].released).toBe(false);
    stop();
    await flush();
    expect(locks[0].released).toBe(true);
  });
  it('the phone drops the lock when the page is hidden: it is taken again when the page is back', async () => {
    const stop = keepScreenOn();
    await flush();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(locks).toHaveLength(1);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(locks).toHaveLength(2);
    stop();
    await flush();
    // Done: coming back no longer takes it.
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(locks).toHaveLength(2);
  });
  it('a lock that arrives after done is let go at once', async () => {
    const stop = keepScreenOn();
    stop();
    await flush();
    expect(locks).toHaveLength(1);
    expect(locks[0].released).toBe(true);
  });
  it('refused, or a phone without it: nothing breaks', async () => {
    refuse = true;
    const stop = keepScreenOn();
    await flush();
    expect(() => stop()).not.toThrow();
    delete nav.wakeLock;
    expect(() => keepScreenOn()()).not.toThrow();
  });
});
