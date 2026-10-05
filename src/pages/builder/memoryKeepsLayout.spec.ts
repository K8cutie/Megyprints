import { describe, it, expect, vi } from 'vitest';

vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { relayPageOnTemplate } from './useBuilderState';
import { getTemplateById, getTemplatesForAlbum, qrBadgeTemplate, photoSlotCount } from './pageTemplates';
import { countQrMemories } from '../../lib/pricing';
import type { AlbumPage, QrFill, PageTemplate } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   A LAYOUT CHANGE NEVER DROPS A VIDEO MEMORY (1-star testers round 2, MMC-3):
   a memory on a full-page photo → "Change layout: Three Squares, Box Bottom
   Left" (the QR became its own square) → "Change layout: Full Page" → the QR
   was gone, no message, the gold "Add a video memory" button came back, and
   checkout counted one memory fewer.
   ══════════════════════════════════════════════════════════════════════════ */

const memory: QrFill = {
  code: 'MEM12345', destination: 'https://example.test/clip.mp4', qrPngDataUrl: 'data:image/png;base64,AA',
  memoryUrl: 'https://megyprints.com/m/MEM12345', createdAt: 1791100000000, kind: 'clip',
};

function badgePage(): AlbumPage {
  const t = qrBadgeTemplate('8x8', 'tl')!;
  const n = t.slots.length;
  const qrFills: (QrFill | null)[] = new Array(n).fill(null);
  qrFills[t.slots.findIndex((s) => s.kind === 'qr')] = memory;
  return {
    id: 'p10', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
    photos: [], textElements: [], templateId: t.id, slotFills: [9, null], qrFills,
    slotScales: [1, 1], slotOffsetsX: [0, 0], slotOffsetsY: [0, 0],
  } as AlbumPage;
}
const memoriesOn = (p: AlbumPage) => [...(p.qrFills ?? []), ...(p.textSlotQr ?? [])].filter(Boolean).map((q) => q!.code);
const squares8 = getTemplatesForAlbum('8x8');
const threeWithBox = squares8.find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
const fullPage = getTemplateById('t88-fb-solo')!;
const fourFull = squares8.find((t) => photoSlotCount(t) === 4 && !(t.textSlots?.length) && !t.slots.some((s) => s.kind === 'qr'))!;

describe('the tester\'s path: badge → three squares → full page', () => {
  it('the templates are what the tester picked', () => {
    expect(threeWithBox).toBeTruthy();
    expect(fullPage.slots).toHaveLength(1);
    expect(fourFull).toBeTruthy();
  });
  it('the memory is still on the page after every change — back as the corner badge on the full page', () => {
    const p1 = badgePage();
    const p2 = relayPageOnTemplate(p1, threeWithBox);
    expect(memoriesOn(p2)).toEqual(['MEM12345']);
    const p3 = relayPageOnTemplate(p2, fullPage);
    expect(memoriesOn(p3)).toEqual(['MEM12345']);
    expect(p3.templateId).toMatch(/^qr-badge-8x8-(tl|tr|bl|br)$/); // the full-page photo with its QR chip
    expect(p3.slotFills?.[0]).toBe(9); // the same photo
    expect(countQrMemories([p3])).toBe(1); // checkout counts it
  });
  it('straight from the badge to the plain full page: the badge stays, in its corner', () => {
    const p = relayPageOnTemplate(badgePage(), fullPage);
    expect(p.templateId).toBe(qrBadgeTemplate('8x8', 'tl')!.id);
    expect(memoriesOn(p)).toEqual(['MEM12345']);
  });
});

describe('wherever the new layout has room', () => {
  const pageOn = (t: PageTemplate, fills: (number | null)[], over: Partial<AlbumPage> = {}): AlbumPage => ({
    id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
    templateId: t.id, slotFills: fills, ...over,
  } as AlbumPage);
  it('a full four-photo page with no box: the memory takes the last frame, and that photo leaves the page', () => {
    const from = pageOn(threeWithBox, [1, 2, 3], { textSlotQr: [memory] });
    const p = relayPageOnTemplate(from, fourFull);
    expect(memoriesOn(p)).toEqual(['MEM12345']);
    expect(p.slotFills?.filter((f) => f != null)).toHaveLength(3); // 3 photos + the memory in 4 frames
  });
  it('a caption box with a memory, onto another layout with a box: it stays in a box or a frame', () => {
    const from = pageOn(threeWithBox, [1, 2, 3], { textSlotQr: [memory] });
    const other = squares8.find((t) => t.id !== threeWithBox.id && photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0)!;
    expect(memoriesOn(relayPageOnTemplate(from, other))).toEqual(['MEM12345']);
  });
  it('a page without memories changes layout exactly as before', () => {
    const from = pageOn(threeWithBox, [1, 2, 3]);
    const p = relayPageOnTemplate(from, fourFull);
    expect(p.templateId).toBe(fourFull.id);
    expect(p.slotFills).toEqual([1, 2, 3, null]);
    expect(memoriesOn(p)).toEqual([]);
  });
});
