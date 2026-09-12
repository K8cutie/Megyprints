import { describe, it, expect } from 'vitest';
import { generateAlbum, splitStudioPages, remapSlotFills, mergeStudioPages } from './generateAlbum';
import { MIN_ALBUM_PAGES } from './densities';
import type { UploadedPhoto } from './types';

/* STUDIO pages survive Regenerate / Surprise Me (owner, 2026-09-13). */
const sq = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => ({ id: `q${i}`, previewUrl: '', name: `q${i}.jpg`, type: 'image/jpeg', size: 1, width: 3000, height: 3000, capturedAt: i }));
const fills = (pages: ReturnType<typeof generateAlbum>) => pages.flatMap((p) => (p.slotFills ?? []).filter((f): f is number => f != null));

describe('a reshuffle around Studio pages', () => {
  it('keeps them exactly, at their old positions, and never reuses their photos', () => {
    const photos = sq(60);
    const album = generateAlbum(photos, '8x8');
    // The customer took pages 2 and 7 into Studio.
    album[2] = { ...album[2], studio: true, slotGeometries: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.5 }] };
    album[7] = { ...album[7], studio: true };
    const { kept, used } = splitStudioPages(album);
    expect(kept.map((k) => k.index)).toEqual([2, 7]);
    expect(used.size).toBe(fills([album[2], album[7]]).length);

    const poolMap = photos.map((_, i) => i).filter((i) => !used.has(i));
    const fresh = generateAlbum(poolMap.map((i) => photos[i]), '8x8', undefined, undefined, { minPages: MIN_ALBUM_PAGES - kept.length });
    remapSlotFills(fresh, poolMap);
    const merged = mergeStudioPages(fresh, kept);

    expect(merged.length).toBeGreaterThanOrEqual(MIN_ALBUM_PAGES);
    expect(merged[2]).toBe(album[2]);
    expect(merged[7]).toBe(album[7]);
    const all = fills(merged).sort((a, b) => a - b);
    expect(all).toEqual(photos.map((_, i) => i)); // every photo once, none twice, none lost
    expect(merged.filter((p) => p.studio).length).toBe(2);
  });
  it('with no Studio pages nothing changes', () => {
    const album = generateAlbum(sq(60), '8x8');
    const { kept, used } = splitStudioPages(album);
    expect(kept).toEqual([]);
    expect(used.size).toBe(0);
    expect(mergeStudioPages(album, kept)).toEqual(album);
  });
  it('generateAlbum honours a smaller minimum', () => {
    expect(generateAlbum(sq(30), '8x8', undefined, undefined, { minPages: 37 }).length).toBe(37);
    expect(generateAlbum(sq(30), '8x8').length).toBe(MIN_ALBUM_PAGES);
  });
});
