import { describe, it, expect, vi } from 'vitest';

vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { relayPageOnTemplate, layoutChangeLeftovers } from './useBuilderState';
import { getTemplateById, getTemplatesForAlbum, qrBadgeTemplate, photoSlotCount, QR_CORNERS } from './pageTemplates';
import { layoutHoldsMemory } from './generateAlbum';
import { countQrMemories } from '../../lib/pricing';
import { ALBUM_SIZES } from './types';
import type { AlbumPage, AlbumSizePreset, QrFill, PageTemplate } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A LAYOUT CHANGE NEVER DROPS A VIDEO MEMORY (1-star testers round 2, MMC-3):
   a memory on a full-page photo → "Change layout: Three Squares, Box Bottom
   Left" (the QR became its own square) → "Change layout: Full Page" → the QR
   was gone, no message, the gold "Add a video memory" button came back, and
   checkout counted one memory fewer.
   AND IT NEVER MOVES ONE OFF ITS FULL PAGE (owner, 2026-10-08): a video memory
   only ever sits on a full-bleed, one-photo page, as its corner badge. The
   QR-as-its-own-square step above is no longer possible: a layout that can't
   hold the memory leaves the page as it is.
   ══════════════════════════════════════════════════════════════════════════ */

const memory: QrFill = {
  code: 'MEM12345', destination: 'https://example.test/clip.mp4', qrPngDataUrl: 'data:image/png;base64,AA',
  memoryUrl: 'https://megyprints.com/m/MEM12345', createdAt: 1791100000000, kind: 'clip',
};

function badgePage(size: AlbumSizePreset = '8x8', corner: typeof QR_CORNERS[number] = 'tl'): AlbumPage {
  const t = qrBadgeTemplate(size, corner)!;
  const n = t.slots.length;
  const qrFills: (QrFill | null)[] = new Array(n).fill(null);
  qrFills[t.slots.findIndex((s) => s.kind === 'qr')] = memory;
  return {
    id: 'p10', layout: 'freeform', size, background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], templateId: t.id, slotFills: [9, null], qrFills,
    slotScales: [1.4, 1], slotOffsetsX: [12, 0], slotOffsetsY: [-8, 0],
  } as AlbumPage;
}
const memoriesOn = (p: AlbumPage) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])].filter(Boolean).map((q) => q!.code);
const squares8 = getTemplatesForAlbum('8x8');
const threeWithBox = squares8.find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
const fullPage = getTemplateById('t88-fb-solo')!;
const fourFull = squares8.find((t) => photoSlotCount(t) === 4 && !(t.textSlots?.length) && !t.slots.some((s) => s.kind === 'qr'))!;
const pageOn = (t: PageTemplate, fills: (number | null)[], over: Partial<AlbumPage> = {}): AlbumPage => ({
  id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
  templateId: t.id, slotFills: fills, ...over,
} as AlbumPage);

/** Every memory on the page sits in a QR-badge slot of a QR-badge layout. */
function onlyOnBadge(p: AlbumPage): boolean {
  if ((p.textSlotQr ?? []).some(Boolean)) return false;
  const t = p.templateId ? getTemplateById(p.templateId) : undefined;
  return (p.qrFills ?? []).every((q, i) => !q || (!!t && p.templateId!.startsWith('qr-badge-') && t.slots[i]?.kind === 'qr'));
}

describe('the tester\'s path: badge → three squares → full page', () => {
  it('the templates are what the tester picked', () => {
    expect(threeWithBox).toBeTruthy();
    expect(fullPage.slots).toHaveLength(1);
    expect(fourFull).toBeTruthy();
  });
  it('Three Squares leaves the memory page as it is; Full Page keeps the badge — the memory is never dropped', () => {
    const p1 = badgePage();
    const p2 = relayPageOnTemplate(p1, threeWithBox);
    expect(p2).toBe(p1); // not the QR as its own square
    const p3 = relayPageOnTemplate(p2, fullPage);
    expect(memoriesOn(p3)).toEqual(['MEM12345']);
    expect(p3.templateId).toBe(qrBadgeTemplate('8x8', 'tl')!.id); // the full-page photo with its QR chip, same corner
    expect(p3.slotFills?.[0]).toBe(9); // the same photo
    expect(countQrMemories([p3])).toBe(1); // checkout counts it
  });
  it('straight from the badge to the plain full page: the badge stays in its corner, the photo keeps its framing', () => {
    const p = relayPageOnTemplate(badgePage(), fullPage);
    expect(p.templateId).toBe(qrBadgeTemplate('8x8', 'tl')!.id);
    expect(memoriesOn(p)).toEqual(['MEM12345']);
    expect([p.slotScales?.[0], p.slotOffsetsX?.[0], p.slotOffsetsY?.[0]]).toEqual([1.4, 12, -8]);
  });
});

describe('a memory placed in a frame or a box before memories moved to full pages (old albums)', () => {
  it('in a box, onto Four Squares or another boxed layout: the page stays as it is', () => {
    const from = pageOn(threeWithBox, [1, 2, 3], { textSlotQr: [memory] });
    expect(relayPageOnTemplate(from, fourFull)).toBe(from);
    const other = squares8.find((t) => t.id !== threeWithBox.id && photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0)!;
    expect(relayPageOnTemplate(from, other)).toBe(from);
  });
  it('in a box, onto Full Page: it becomes the corner badge on the first photo; the other two photos are the leftovers', () => {
    const from = pageOn(threeWithBox, [1, 2, 3], { textSlotQr: [memory] });
    const p = relayPageOnTemplate(from, fullPage);
    expect(p.templateId).toMatch(/^qr-badge-8x8-(tl|tr|bl|br)$/);
    expect(p.slotFills?.[0]).toBe(1);
    expect(onlyOnBadge(p)).toBe(true);
    expect(memoriesOn(p)).toEqual(['MEM12345']);
    expect(layoutChangeLeftovers(from, fullPage).photos).toEqual([2, 3]);
  });
  it('in the FIRST frame, onto Full Page: the photo is the page\'s first photo, not an empty page', () => {
    const from = pageOn(fourFull, [null, 4, 5, 6], { qrFills: [memory, null, null, null] });
    const p = relayPageOnTemplate(from, fullPage);
    expect(p.slotFills?.[0]).toBe(4);
    expect(onlyOnBadge(p)).toBe(true);
  });
  it('in a Studio-moved, masked frame, onto Full Page: the badge photo is full bleed — no moved frame, no mask (they would carry onto the QR slot)', () => {
    const hero = squares8.find((t) => photoSlotCount(t) === 3 && !(t.textSlots?.length))!;
    const from = pageOn(hero, [1, 2, null], {
      qrFills: [null, null, memory], studio: true, slotMasks: ['heart', null, null], slotLooks: ['bw', null, null],
      slotGeometries: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }, { x: 0.3, y: 0.3, width: 0.45, height: 0.45 }],
    } as Partial<AlbumPage>);
    const p = relayPageOnTemplate(from, fullPage);
    expect(onlyOnBadge(p)).toBe(true);
    expect(p.slotGeometries ?? []).toEqual([]);
    expect(p.slotMasks ?? []).toEqual([]);
    expect(p.slotLooks ?? []).toEqual([]); // a different layout's filter by slot number isn't this photo's
  });
  it('two memories on one page: no layout holds both, so it stays as it is', () => {
    const second = { ...memory, code: 'MEM99999' };
    const from = pageOn(threeWithBox, [1, 2, 3], { textSlotQr: [memory], qrFills: [null, null, null] });
    const two = { ...from, textSlotQr: [memory], qrFills: [null, second, null] } as AlbumPage;
    expect(relayPageOnTemplate(two, fullPage)).toBe(two);
    expect(relayPageOnTemplate(two, fourFull)).toBe(two);
  });
});

describe('every size, every layout the picker or Megy can reach', () => {
  const sizes = ALBUM_SIZES.map((s) => s.preset).filter((s) => qrBadgeTemplate(s, 'tl'));
  it('there are sizes to check', () => expect(sizes.length).toBeGreaterThan(3));
  for (const size of sizes) {
    it(`${size}: a memory page re-laid onto any layout keeps its memory, on the corner badge only`, () => {
      for (const corner of QR_CORNERS) {
        const from = badgePage(size, corner);
        for (const t of getTemplatesForAlbum(size)) {
          const p = relayPageOnTemplate(from, t);
          expect(memoriesOn(p), `${t.id}`).toEqual(['MEM12345']);
          expect(onlyOnBadge(p), `${t.id}`).toBe(true);
          if (!layoutHoldsMemory(t)) expect(p, `${t.id}`).toBe(from);
        }
      }
    });
  }
});

describe('pages without memories', () => {
  it('change layout exactly as before', () => {
    const from = pageOn(threeWithBox, [1, 2, 3]);
    const p = relayPageOnTemplate(from, fourFull);
    expect(p.templateId).toBe(fourFull.id);
    expect(p.slotFills).toEqual([1, 2, 3, null]);
    expect(memoriesOn(p)).toEqual([]);
  });
});
