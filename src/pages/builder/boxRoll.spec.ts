import { describe, it, expect } from 'vitest';
import { generateAlbum, dealBoxContent, makeQuoteDealer, rollBoxKind, BOX_ROLL_WEIGHTS, type BoxContentOptions } from './generateAlbum';
import { getTemplatesForAlbum } from './pageTemplates';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto, BoxRoll } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY DEALS THE COMBO BOXES.
   A combo/caption box no longer generates empty (waiting on the 3-way
   chooser): it rolls quote/text/qr at the owner-set odds. A rolled quote is
   materialized IMMEDIATELY as a bound caption in setBoxText's exact shape;
   text/qr are stored as the box's dealt kind (invitations, editor-only).
   Callers that don't opt in (these specs' siblings, legacy paths) must get
   byte-identical pre-feature output.
   ══════════════════════════════════════════════════════════════════════════ */

const roll = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
  const portrait = i % 5 >= 3;
  return {
    id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1000,
    width: portrait ? 3024 : 4032, height: portrait ? 4032 : 3024, capturedAt: i,
  };
});

const BOX: BoxContentOptions = {
  quotePool: ['Two hearts, one journey', 'Forever starts today', 'To have and to hold'],
  quoteFontFamily: 'Playfair Display',
  quoteColor: '#2D2D2D',
};

const boxCountOf = (page: AlbumPage, size: AlbumSizePreset): number => {
  const t = getTemplatesForAlbum(size).find((x) => x.id === page.templateId);
  return t?.textSlots?.length ?? 0;
};

describe('box dealing', () => {
  it('weights sum to 1 (a broken edit here silently skews every album)', () => {
    const sum = Object.values(BOX_ROLL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('no boxContent → no rolls anywhere (legacy callers unchanged)', () => {
    const pages = generateAlbum(roll(80), '8x8', undefined);
    expect(pages.every((p) => p.textSlotRoll === undefined)).toBe(true);
  });

  it('with boxContent → every box-bearing page is dealt, parallel to its textSlots', () => {
    const pages = generateAlbum(roll(80), '8x8', undefined, undefined, { boxContent: BOX });
    let sawBoxPage = false;
    for (const p of pages) {
      const boxes = boxCountOf(p, '8x8');
      if (boxes === 0) {
        expect(p.textSlotRoll, `box-free page ${p.id} must not carry rolls`).toBeUndefined();
        continue;
      }
      sawBoxPage = true;
      expect(p.textSlotRoll, `box page ${p.id} missing its deal`).toBeDefined();
      expect(p.textSlotRoll!.length).toBe(boxes);
      p.textSlotRoll!.forEach((r, j) => {
        expect(r === 'quote' || r === 'text' || r === 'qr', `page ${p.id} box ${j} kind ${r}`).toBe(true);
        const caption = p.textElements.find((t) => t.boxIndex === j);
        if (r === 'quote') {
          // Materialized NOW, in setBoxText's shape, from the pool.
          expect(caption, `quote box ${j} on ${p.id} has no caption`).toBeDefined();
          expect(BOX.quotePool).toContain(caption!.text);
          expect(caption!.italic).toBe(true);
          expect(caption!.fontSize).toBe(28);
          expect(caption!.fontFamily).toBe(BOX.quoteFontFamily);
          expect(caption!.color).toBe(BOX.quoteColor);
          expect(caption!.alignment).toBe('center');
          expect(caption!.opacity).toBe(100);
        } else {
          // Invitations stay EMPTY — nothing that could reach the printed page.
          expect(caption, `${r} box ${j} on ${p.id} must not have a caption`).toBeUndefined();
        }
      });
    }
    // 80 photos on 8x8 always deals some caption-band layouts; if this ever
    // goes false the assertions above ran on nothing and the test is vacuous.
    expect(sawBoxPage).toBe(true);
  });

  it('roll odds hit the owner-set 45/30/25 (±3% at N=10k)', () => {
    const n = 10_000;
    const counts: Record<BoxRoll, number> = { quote: 0, text: 0, qr: 0 };
    for (let i = 0; i < n; i++) counts[rollBoxKind()]++;
    expect(counts.quote / n).toBeGreaterThan(BOX_ROLL_WEIGHTS.quote - 0.03);
    expect(counts.quote / n).toBeLessThan(BOX_ROLL_WEIGHTS.quote + 0.03);
    expect(counts.text / n).toBeGreaterThan(BOX_ROLL_WEIGHTS.text - 0.03);
    expect(counts.text / n).toBeLessThan(BOX_ROLL_WEIGHTS.text + 0.03);
    expect(counts.qr / n).toBeGreaterThan(BOX_ROLL_WEIGHTS.qr - 0.03);
    expect(counts.qr / n).toBeLessThan(BOX_ROLL_WEIGHTS.qr + 0.03);
  });

  it('an empty quote pool degrades quote rolls to text invitations, never blanks', () => {
    const template = getTemplatesForAlbum('8x8').find((t) => (t.textSlots?.length ?? 0) > 0)!;
    expect(template, 'no box-bearing 8x8 template — fixture broken').toBeDefined();
    // Enough boxes that at 45% odds P(no quote roll) < 1e-20 — the degrade
    // path is exercised with certainty, not luck.
    for (let i = 0; i < 80; i++) {
      const page: AlbumPage = {
        id: `t${i}`, layout: 'freeform', size: '8x8', templateId: template.id,
        slotFills: [], photos: [], textElements: [],
        background: { type: 'solid', solid: '#FFFFFF' },
      } as unknown as AlbumPage;
      dealBoxContent(page, template, { ...BOX, quotePool: [] }, makeQuoteDealer([]));
      expect(page.textSlotRoll!.every((r) => r === 'text' || r === 'qr')).toBe(true);
      expect(page.textElements.length).toBe(0);
    }
  });

  it('the quote dealer never deals the same line twice in a row', () => {
    const deal = makeQuoteDealer(['a', 'b', 'c']);
    let prev: string | null = null;
    for (let i = 0; i < 60; i++) {
      const q = deal();
      expect(q).not.toBeNull();
      expect(q, `draw ${i} repeated "${q}"`).not.toBe(prev);
      prev = q;
    }
  });
});
