import { describe, it, expect } from 'vitest';
import { generateAlbum, dealAlbumBoxes, sweepFillQuotes, ensureMemoryPages, isMemoryReady, MIN_MEMORY_PAGES, type BoxContentOptions } from './generateAlbum';
import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumSizePreset, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   AT LEAST 7 VIDEO-READY PAGES (owner, 2026-09-12): "7 QR links as the
   minimum for a 40-page album." Every generated album — any size, any pool,
   any density — offers at least MIN_MEMORY_PAGES places for a video memory,
   spread across the album, and the finish-line sweep never paves them over.
   ══════════════════════════════════════════════════════════════════════════ */

const sq = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, previewUrl: '', name: `q${i}.jpg`, type: 'image/jpeg', size: 1, width: 3000, height: 3000, capturedAt: i }));
const mixed = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => { const p = i % 5 >= 3; return { id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: p ? 3024 : 4032, height: p ? 4032 : 3024, capturedAt: i }; });
const BOX: BoxContentOptions = { quotePool: Array.from({ length: 400 }, (_, i) => `Line ${i}`), quoteFontFamily: 'Playfair Display', quoteColor: '#2D2D2D' };
const readyIdx = (pages: ReturnType<typeof generateAlbum>) => pages.map((p, i) => (isMemoryReady(p) ? i : -1)).filter((i) => i >= 0);

describe('every generated album offers at least MIN_MEMORY_PAGES video-ready pages', () => {
  expect(MIN_MEMORY_PAGES).toBe(7);
  for (const size of ['6x6', '8x8', '9x9', '8x6', '6x8'] as AlbumSizePreset[]) {
    it(`${size}: 60 / 100 / 160 / 240 photos, square and mixed, AUTO and every density`, () => {
      for (const n of [60, 100, 160, 240]) for (const photos of [sq(n), mixed(n)]) for (const density of [undefined, 2, 3, 4]) {
        const pages = generateAlbum(photos, size, density);
        dealAlbumBoxes(pages, BOX);
        const ready = readyIdx(pages);
        expect(ready.length, `${size}/${n}/${density ?? 'auto'}: video-ready pages`).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
        expect(pages.length).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
        // Spread: the ready pages are not all in the first quarter of the album.
        expect(ready[ready.length - 1], `${size}/${n}/${density ?? 'auto'}: bunched at the front ${JSON.stringify(ready)}`).toBeGreaterThan(pages.length / 4);
        // The finish-line sweep keeps them.
        const { pages: swept } = sweepFillQuotes(pages, BOX);
        expect(readyIdx(swept).length, `${size}/${n}/${density ?? 'auto'}: after sweep`).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
      }
    });
  }
  it('the generation-time dealer (boxContent passed to generateAlbum) applies the floor too', () => {
    const pages = generateAlbum(sq(160), '8x6', undefined, undefined, { boxContent: BOX });
    expect(readyIdx(pages).length).toBeGreaterThanOrEqual(MIN_MEMORY_PAGES);
  });
  it('an album that already offers enough is left alone; a short one turns empty boxes before evicting quotes', () => {
    const rich = generateAlbum(sq(60), '8x8'); // thirty box-free singles
    expect(ensureMemoryPages(rich)).toBe(0);
    const pages = generateAlbum(sq(160), '8x6');
    dealAlbumBoxes(pages, BOX); // applies the floor
    const quotesBefore = pages.reduce((n, p) => n + p.textElements.filter((t) => t.boxIndex != null).length, 0);
    // Re-running changes nothing further.
    expect(ensureMemoryPages(pages)).toBe(0);
    expect(pages.reduce((n, p) => n + p.textElements.filter((t) => t.boxIndex != null).length, 0)).toBe(quotesBefore);
  });
});
