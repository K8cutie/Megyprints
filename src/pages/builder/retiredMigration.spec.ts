import { describe, it, expect } from 'vitest';
import { migrateRetiredPages, getTemplateById, getTemplatesForAlbum } from './pageTemplates';
import type { AlbumSizePreset } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A page stores its templateId, and retired templates stay RESOLVABLE so a
   saved album never goes blank. The side effect: an album laid out under a
   scrapped template set kept rendering that geometry forever — which is how
   the panoramic 8×6 layouts kept appearing in albums long after they stopped
   being offered. migrateRetiredPages re-points those pages onto current
   layouts. These tests pin that it heals the retired ones and leaves valid
   ones completely alone.
   ══════════════════════════════════════════════════════════════════════════ */

// Real ids from the scrapped 8×6 / 6×8 set, taken from a saved album.
const RETIRED_8X6 = [
  't86-fb-duo-big-second', 't86-fb-duo-wide-box-first', 't86-fb-trio-cols-box-below',
  't86-fb-wide-box-below', 't86-fb-duo',
];

const page = (templateId: string, fills: (number | null)[]) =>
  ({ id: `p-${templateId}`, templateId, slotFills: fills });

describe('albums laid out under a retired template set heal on load', () => {
  it('every scrapped 8×6 id is re-pointed to a template that is actually offered', () => {
    const pages = RETIRED_8X6.map((id, i) => page(id, [0, 1, 2].slice(0, i % 3 + 1)));
    const out = migrateRetiredPages(pages, '8x6');
    const offered = new Set(getTemplatesForAlbum('8x6').map((t) => t.id));
    for (const p of out) {
      expect(offered.has(p.templateId!), `${p.templateId} is not offered for 8x6`).toBe(true);
    }
    // and they really did change
    expect(out.map((p) => p.templateId)).not.toEqual(RETIRED_8X6);
  });

  it('keeps the photos, sized to the replacement layout', () => {
    const [out] = migrateRetiredPages([page('t86-fb-trio-cols-box-below', [7, 8, 9])], '8x6');
    const t = getTemplateById(out.templateId!)!;
    expect(out.slotFills!.length).toBe(t.slotCount);
    // the first photos survive, in order
    expect(out.slotFills!.slice(0, Math.min(3, t.slotCount))).toEqual([7, 8, 9].slice(0, t.slotCount));
  });

  it('does not spread the whole album onto one layout', () => {
    const many = Array.from({ length: 12 }, (_, i) => page(RETIRED_8X6[i % RETIRED_8X6.length], [0]));
    const ids = new Set(migrateRetiredPages(many, '8x6').map((p) => p.templateId));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('leaves pages on a CURRENT template untouched (same array identity)', () => {
    const live = getTemplatesForAlbum('8x6').slice(0, 3).map((t) => page(t.id, [0]));
    const out = migrateRetiredPages(live, '8x6');
    expect(out).toBe(live); // no copy at all when nothing needs migrating
  });

  it('leaves other sizes alone — square albums are not disturbed', () => {
    for (const size of ['6x6', '8x8', '9x9'] as AlbumSizePreset[]) {
      const live = getTemplatesForAlbum(size).slice(0, 4).map((t) => page(t.id, [0]));
      expect(migrateRetiredPages(live, size)).toBe(live);
    }
  });

  it('ignores a page with no template (a blank page stays blank)', () => {
    const blank = [{ id: 'x', slotFills: [] }];
    expect(migrateRetiredPages(blank, '8x6')).toBe(blank);
  });
});
