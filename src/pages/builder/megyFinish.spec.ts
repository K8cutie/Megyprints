import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAlbum, sweepFillQuotes, fillableBoxCount, type BoxContentOptions } from './generateAlbum';
import { getTemplateById, getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage, UploadedPhoto } from './types';
import { seedMathRandom, mulberry32, TEST_SEED } from '../../test/seededRandom';

seedMathRandom();

/* ══════════════════════════════════════════════════════════════════════════
   "LET MEGY FINISH" COUNTS WHAT IT CAN FILL (1-star testers, 2026-10-04, the
   Penny-Pincher: a 6×4 album showed "22 boxes waiting", the tap said "Megy
   filled 2 — 20 left (out of unique lines)", and the button kept inviting a
   tap forever). The 20 weren't out of lines — the quote CADENCE (never a
   quote on two pages in a row) keeps them open by design; they print as open
   space. Now "N boxes waiting" counts only the boxes Megy can fill, and the
   answer says which reason left the rest.
   ══════════════════════════════════════════════════════════════════════════ */

const photos: UploadedPhoto[] = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 4032, height: 3024, capturedAt: i,
}));
const lines = (n: number, tag = 'line') => Array.from({ length: n }, (_, i) => `${tag} ${i}`);
const box = (pool: string[]): BoxContentOptions => ({ quotePool: pool, quoteFontFamily: 'Georgia', quoteColor: '#333' });
const boxesOn = (pages: AlbumPage[]) => pages.reduce((n, p) => n + ((p.templateId ? getTemplateById(p.templateId)?.textSlots?.length : 0) ?? 0), 0);
const album = () => {
  const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(TEST_SEED));
  try { return generateAlbum(photos, '6x4', 1, undefined, { boxContent: box(lines(100, 'dealt')) }); } finally { spy.mockRestore(); }
};

describe('a 6×4 album, one photo a page, a caption box on most pages', () => {
  it('"boxes waiting" = what the sweep can fill; after the sweep it is 0 (the button goes away)', () => {
    const pages = album();
    const fillable = fillableBoxCount(pages);
    const r = sweepFillQuotes(pages, box(lines(100)));
    expect(r.filled).toBe(fillable);
    expect(r.noLine).toBe(0);
    expect(fillableBoxCount(r.pages)).toBe(0);
    expect(boxesOn(pages)).toBeGreaterThanOrEqual(r.heldBack + r.filled);
  });

  it('exactly: a page with a quote, then four empty boxes → Megy can fill 2, the cadence keeps 2 open', () => {
    const t = getTemplatesForAlbum('6x4').find((x) => x.slots.length === 1 && (x.textSlots?.length ?? 0) === 1)!;
    const pg = (i: number, quote?: string): AlbumPage => ({
      id: `pg${i}`, layout: 'freeform', size: '6x4', background: { type: 'solid', solid: '#fff' }, photos: [], templateId: t.id, slotFills: [i],
      textElements: quote ? [{ id: `q${i}`, text: quote, boxIndex: 0, x: 0, y: 0, fontSize: 28, fontFamily: 'Georgia', color: '#333' } as AlbumPage['textElements'][number]] : [],
    } as AlbumPage);
    const pages = [pg(0, 'A dealt quote'), pg(1), pg(2), pg(3), pg(4)];
    expect(fillableBoxCount(pages)).toBe(2); // "2 boxes waiting", not 4
    const r = sweepFillQuotes(pages, box(lines(10)));
    expect({ filled: r.filled, heldBack: r.heldBack, noLine: r.noLine }).toEqual({ filled: 2, heldBack: 2, noLine: 0 });
    expect(fillableBoxCount(r.pages)).toBe(0); // the button goes away
  });

  it('out of lines is told apart from held back', () => {
    const pages = album();
    const fillable = fillableBoxCount(pages);
    if (fillable < 2) return; // nothing to run short of on this seed
    const r = sweepFillQuotes(pages, box(lines(1)));
    expect(r.filled).toBe(1);
    expect(r.noLine).toBe(fillable - 1);
    expect(r.remaining).toBe(r.heldBack + r.noLine);
  });
});

describe('the preview says what happened (source guards)', () => {
  const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
  it('no more "out of unique lines" for boxes the cadence keeps open', () => {
    expect(src).not.toMatch(/out of unique lines/);
    expect(src).toMatch(/The rest stay open, so quotes don\\'t crowd every page\./);
    expect(src).toMatch(/No unused quotes left for this theme\. Tap a box to write your own\./);
  });
});
