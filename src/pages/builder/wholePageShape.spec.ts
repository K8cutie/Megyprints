import { describe, it, expect } from 'vitest';
import { generateAlbum, templatesForPhotoRatio } from './generateAlbum';
import { pagesForPhotos } from './useBuilderState';
import { getTemplateById, getTemplatesForAlbum, orientationOfRatio, orientationOfShape } from './pageTemplates';
import { ALBUM_INCHES } from './templateKit';
import type { AlbumPage, AlbumSizePreset, PageTemplate, PhotoRatio, UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   A PHOTO NEVER FILLS A WHOLE PAGE OF THE OTHER SHAPE (2026-10-21).

   11.5×8 is a LANDSCAPE page. Its only single-photo layouts for a portrait
   were the gap fillers' full pages (gap-115x8-34-1 / -23-1), which the
   full-bleed rule stretches over the whole sheet: a 3:4 phone photo printed
   11.5" wide, so about half of it — the top of the heads and the feet — was
   cut off. The generator's crop guard filtered those out, then put them back
   whenever a shape had nothing else ("safeSingles.length > 0 ? safeSingles :
   onePhoto"), which on 11.5×8 is every portrait. 8.5×11 is the same mistake
   turned round: a landscape on the whole of a portrait page. Measured over
   240 albums on main: ~670 such pages on 11.5×8.

   orientation.spec missed it because it reads the frame's DECLARED ratio
   (3:4), not the shape the photo actually prints at. This spec reads the
   printed shape: a photo over the whole sheet prints at the page's shape.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['11.5x8', '8.5x11', '6x6', '8x8', '9x9', '6x4', '8x6', '6x8'];

const photo = (id: number, w: number, h: number): UploadedPhoto => ({
  id: `p${id}`, previewUrl: '', name: `p${id}.jpg`, type: 'image/jpeg',
  size: 1000, width: w, height: h, capturedAt: 1_700_000_000_000 + id * 60_000,
});

/** Camera shapes: phone (3:4 / 4:3), DSLR (2:3 / 3:2), and a screenshot. */
const PORTRAITS: [number, number][] = [[3024, 4032], [4000, 6000], [1080, 1920]];
const LANDSCAPES: [number, number][] = [[4032, 3024], [6000, 4000], [1920, 1080]];

/** `n` photos, `portraitShare` of them upright, the rest landscape, dealt in
 *  a fixed scattered order so runs of each shape come out uneven. */
function roll(n: number, portraitShare: number): UploadedPhoto[] {
  return Array.from({ length: n }, (_, i) => {
    const upright = ((i * 7919) % 100) / 100 < portraitShare;
    const [w, h] = (upright ? PORTRAITS : LANDSCAPES)[(i * 31) % 3];
    return photo(i, w, h);
  });
}

/** The shape (width / height) of the page a whole-sheet photo covers, or null
 *  for any other frame (those are drawn at their own ratio: orientation.spec's
 *  job). The page's TRIM shape, as the generator judges a full page: the spine
 *  reserve would make a square page read as slightly upright, and a landscape
 *  on a square page losing its sides is the owner's accepted trade. Worked out
 *  here from the template itself, not from the generator's helpers. */
function wholeSheetShape(page: AlbumPage, slot: number, size: AlbumSizePreset): number | null {
  const t = page.templateId ? getTemplateById(page.templateId) : undefined;
  return t ? templateWholeSheet(t, slot, size) : null;
}
function templateWholeSheet(t: PageTemplate, slot: number, size: AlbumSizePreset): number | null {
  const s = t.slots[slot];
  if (!s) return null;
  const whole = t.fullBleed && s.x <= 0.001 && s.y <= 0.001 && s.width >= 0.999 && s.height >= 0.999;
  return whole ? ALBUM_INCHES[size].w / ALBUM_INCHES[size].h : null;
}

/** A portrait over a landscape page, or the other way round. */
const crosses = (photo: 'portrait' | 'landscape' | 'square', frame: number) => {
  const fo = orientationOfShape(frame);
  return (photo === 'portrait' && fo === 'landscape') || (photo === 'landscape' && fo === 'portrait');
};

/** Pages where a photo sits over the whole sheet across its orientation. */
function wholePageCrossings(pages: AlbumPage[], photos: UploadedPhoto[], size: AlbumSizePreset): string[] {
  const out: string[] = [];
  pages.forEach((page, pi) => {
    (page.slotFills ?? []).forEach((f, si) => {
      if (f == null) return;
      const shape = wholeSheetShape(page, si, size);
      if (shape == null) return;
      const p = photos[f];
      if (crosses(orientationOfShape(p.width / p.height), shape)) {
        out.push(`page ${pi + 1} ${page.templateId}: ${p.width}x${p.height} over a ${orientationOfShape(shape)} page`);
      }
    });
  });
  return out;
}

/** Every photo exactly once, at least 40 pages, and no page without a photo. */
function wholeAlbum(pages: AlbumPage[], photos: UploadedPhoto[]): string[] {
  const problems: string[] = [];
  const seen = new Map<number, number>();
  for (const p of pages) for (const f of p.slotFills ?? []) if (f != null) seen.set(f, (seen.get(f) ?? 0) + 1);
  const missing = photos.map((_, i) => i).filter((i) => !seen.has(i));
  const twice = [...seen].filter(([, n]) => n > 1).map(([i]) => i);
  if (missing.length) problems.push(`not placed: ${missing.join(',')}`);
  if (twice.length) problems.push(`placed twice: ${twice.join(',')}`);
  if (pages.length < 40) problems.push(`${pages.length} pages`);
  const blank = pages.map((p, i) => ((p.slotFills ?? []).some((f) => f != null) ? -1 : i + 1)).filter((i) => i > 0);
  if (blank.length) problems.push(`blank pages: ${blank.join(',')}`);
  return problems;
}

const MODES: { label: string; perPage?: number; randomize?: boolean }[] = [
  { label: 'Auto' },
  { label: '1 per page', perPage: 1 },
  { label: '2 per page', perPage: 2 },
  { label: '3 per page', perPage: 3 },
  { label: 'Surprise', randomize: true },
];

describe('a photo never fills a whole page of the other shape', () => {
  for (const size of SIZES) {
    if (getTemplatesForAlbum(size).length === 0) continue;
    it(`${size}: portraits, landscapes and mixes, every photos-per-page`, () => {
      const bad: string[] = [];
      for (const share of [1, 0.8, 0.5, 0.2, 0]) {
        for (const n of [40, 41, 57, 83, 120, 200]) {
          for (const m of MODES) {
            const photos = roll(n, share);
            const pages = generateAlbum(photos, size, m.perPage, undefined, { randomize: m.randomize });
            const crossed = wholePageCrossings(pages, photos, size);
            if (crossed.length) bad.push(`${share * 100}% upright, ${n} photos, ${m.label}: ${crossed.length} pages, e.g. ${crossed[0]}`);
          }
        }
      }
      expect(bad, bad.slice(0, 12).join('\n')).toEqual([]);
    });
  }
});

const CAMERA_RATIOS: PhotoRatio[] = ['3:4', '2:3', '9:16', '4:3', '3:2', '16:9', '1:1'];

describe('every size has a one-photo page for every photo shape', () => {
  // The generator's fallback deals EVERY single of a shape when none is
  // crop-safe, so the deck itself must hold one that doesn't cross: that is
  // the hole 11.5×8 had for portraits and 8.5×11 for landscapes.
  for (const size of SIZES) {
    if (getTemplatesForAlbum(size).length === 0) continue;
    it(`${size}`, () => {
      const missing = CAMERA_RATIOS.filter((r) => !templatesForPhotoRatio(size, r)
        .filter((t) => t.slotCount === 1)
        .some((t) => { const whole = templateWholeSheet(t, 0, size); return whole == null || !crosses(orientationOfRatio(r), whole); }));
      expect(missing, `${size} has no single that keeps a ${missing.join(' / ')} photo's shape`).toEqual([]);
    });
  }
});

describe('a photo moved to a new page keeps its shape too', () => {
  // Change layout → "put them on a new page" (pagesForPhotos) took the first
  // layout whose ratio matched: on 11.5×8 a portrait's is the full page.
  for (const size of SIZES) {
    if (getTemplatesForAlbum(size).length === 0) continue;
    it(`${size}: one spare photo of each shape`, () => {
      const bad: string[] = [];
      for (const r of CAMERA_RATIOS) {
        const [page] = pagesForPhotos([0], size, { 0: r });
        const whole = wholeSheetShape(page, 0, size);
        if (whole != null && crosses(orientationOfRatio(r), whole)) bad.push(`${r} → ${page.templateId}`);
        expect(page.slotFills).toEqual([0]);
      }
      expect(bad).toEqual([]);
    });
  }

  it('11.5×8: two spare portraits share a page that takes them both', () => {
    const pages = pagesForPhotos([0, 1], '11.5x8', { 0: '3:4', 1: '3:4' });
    expect(pages).toHaveLength(1);
    expect(pages[0].slotFills).toEqual([0, 1]);
    const t = getTemplateById(pages[0].templateId!)!;
    expect(t.slots.every((s) => orientationOfRatio(s.ratio ?? t.targetRatio) === 'portrait')).toBe(true);
  });
});

describe('the album still holds together', () => {
  for (const size of ['11.5x8', '8.5x11'] as AlbumSizePreset[]) {
    it(`${size}: every photo once, 40+ pages, no blank page`, () => {
      const bad: string[] = [];
      for (const share of [1, 0.8, 0.5, 0.2, 0]) {
        for (const n of [40, 41, 57, 83, 120, 200]) {
          // Not Surprise: on main it pads short albums with blank pages on
          // EVERY size (it skips fill mode), a separate bug from this one.
          for (const m of MODES.filter((x) => !x.randomize)) {
            const photos = roll(n, share);
            const pages = generateAlbum(photos, size, m.perPage, undefined, { randomize: m.randomize });
            const problems = wholeAlbum(pages, photos);
            if (problems.length) bad.push(`${share * 100}% upright, ${n} photos, ${m.label}: ${problems.join('; ')}`);
          }
        }
      }
      expect(bad, bad.slice(0, 12).join('\n')).toEqual([]);
    });
  }

  it('40 upright photos on 11.5×8 make 40 pages, each one photo', () => {
    const photos = roll(40, 1);
    const pages = generateAlbum(photos, '11.5x8', undefined);
    expect(pages).toHaveLength(40);
    expect(pages.every((p) => (p.slotFills ?? []).filter((f) => f != null).length === 1)).toBe(true);
    expect(wholePageCrossings(pages, photos, '11.5x8')).toEqual([]);
  });

  it('40 landscape photos on 8.5×11 make 40 pages, each one photo', () => {
    const photos = roll(40, 0);
    const pages = generateAlbum(photos, '8.5x11', undefined);
    expect(pages).toHaveLength(40);
    expect(pages.every((p) => (p.slotFills ?? []).filter((f) => f != null).length === 1)).toBe(true);
    expect(wholePageCrossings(pages, photos, '8.5x11')).toEqual([]);
  });
});
