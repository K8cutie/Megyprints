/* A VIDEO MEMORY KEEPS THE PHOTO'S MASK (owner, 2026-11-04: "i added a mask on
   a picture then i added the QR the mask disappeared, and you need to re apply
   the mask"). The builder keeps it (memoryOnlyFullPage.spec.ts); here: the app's
   page plan draws the photo masked and the QR exactly where it would be with
   no mask, and a tap finds each. */
import type { AlbumPage } from '@web/pages/builder/types';
import { qrBadgeTemplate } from '@web/pages/builder/pageTemplates';
import { pageTargets } from '../src/editor/hitTest';
import { planPage, type PagePlan } from '../src/render/pagePlan';

const badge = qrBadgeTemplate('8x8', 'br')!;
const qrAt = badge.slots.findIndex((s) => s.kind === 'qr');
const memory = { code: 'MEM12345', qrPngDataUrl: 'data:image/png;base64,AAAA' };

function memoryPage(extra: Partial<AlbumPage>): AlbumPage {
  const fills: (number | null)[] = new Array(badge.slots.length).fill(null);
  fills[0] = 0;
  const qrFills: unknown[] = new Array(badge.slots.length).fill(null);
  qrFills[qrAt] = memory;
  return {
    id: 'p', layout: 'freeform', size: '8x8', photos: [], textElements: [],
    background: { type: 'solid', solid: '#FFFFFF', opacity: 100 },
    templateId: badge.id, slotFills: fills, qrFills, ...extra,
  } as unknown as AlbumPage;
}
const plan = (page: AlbumPage): PagePlan => planPage({ page, albumSize: '8x8', pageIndex: 1, photoCount: 1, photoIds: ['p0'] });
const photoOf = (p: PagePlan) => p.items.find((i) => i.kind === 'photo') as Extract<PagePlan['items'][number], { kind: 'photo' }>;
const qrOf = (p: PagePlan) => p.items.find((i) => i.kind === 'qr') as Extract<PagePlan['items'][number], { kind: 'qr' }>;

describe('a memory page with a masked photo', () => {
  const plain = plan(memoryPage({}));
  const masked = plan(memoryPage({ slotMasks: ['heart'] }));

  it('the photo is drawn in the mask', () => {
    expect(photoOf(plain).slot.masked).toBeFalsy();
    expect(photoOf(masked).slot.shape).toBe('heart');
  });

  it('the QR is where it is on any memory page, whole, not in the mask', () => {
    const a = qrOf(plain);
    const b = qrOf(masked);
    expect([b.x, b.y, b.side]).toEqual([a.x, a.y, a.side]);
    expect(b.side).toBeGreaterThan(0);
  });

  it('a tap finds both: the photo in its mask, the QR in its corner', () => {
    const targets = pageTargets({ page: memoryPage({ slotMasks: ['heart'] }), albumSize: '8x8', pageIndex: 1, photoCount: 1 }).targets;
    expect(targets.map((t) => t.kind).sort()).toEqual(['photo', 'slotQr']);
    expect(targets.some((t) => t.kind === 'emptySlot')).toBe(false);
  });
});
