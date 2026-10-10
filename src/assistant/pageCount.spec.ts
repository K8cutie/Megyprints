import { describe, it, expect } from 'vitest';
import { WizardEngine } from './wizard';
import type { BuilderActions } from '../pages/builder/useBuilderState';

/* ══════════════════════════════════════════════════════════════════════════
   ONE PAGE COUNT EVERYWHERE (1-star testers, 2026-10-04): the editor said
   "Page 3 of 40" and Megy's Step 5 card said "you're on page 3 of 38" — Megy
   counted only pages with photos or text, so two pages whose content sat in
   their caption boxes didn't count, and it called the album "reviewed" two
   pages early. Every page prints and is priced: Megy counts them all.
   ══════════════════════════════════════════════════════════════════════════ */

const photoPage = (i: number) => ({ id: `p${i}`, slotFills: [i], photos: [], textElements: [] });
// Content in the caption box only (a combo-box photo / QR): no slotFills, no textElements.
const boxPage = (i: number) => ({ id: `p${i}`, slotFills: [null], photos: [], textElements: [], textSlotFills: [i] });
const pages = Array.from({ length: 40 }, (_, i) => (i === 10 || i === 39 ? boxPage(i) : photoPage(i)));

const at = (index: number) => {
  const w = new WizardEngine({
    albumTitle: 'HK', phase: 'edit', albumPages: pages, uploadedPhotos: [], albumSize: '8x8',
    currentPageIndex: index, currentPage: pages[index],
  } as unknown as BuilderActions, false);
  w.state.step = 'review_pages';
  return w.getMessage();
};

describe("Megy's review card counts the album's pages", () => {
  it('page 3 → "page 3 of 40", like the editor', () => {
    expect(at(2).body).toContain('page 3 of 40');
  });
  it('page 39 is still being reviewed (it said "all reviewed" there)', () => {
    const m = at(38);
    expect(m.title).toBe('Step 5: Review Each Page 🔍');
    expect(m.body).toContain('page 39 of 40');
  });
  it('the last page (40) → all 40 reviewed', () => {
    const m = at(39);
    expect(m.title).toBe('All Pages Reviewed 🎉');
    expect(m.body).toContain('all **40** pages');
  });
});
