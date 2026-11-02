/* ══════════════════════════════════════════════════════════════════════════
   A VIDEO MEMORY'S QR ON THE PAGE'S OUTER EDGE (src/lib/memories/qrSide.ts),
   never next to the binding (owner, 2026-11-02):
     • which corners are outer, by the page's place (the website's
       bindingEdge): page 1 bound on its left, page 2 on its right;
     • every size, every corner, both sides: the QR the app prints is on the
       outer half of the page, its top or bottom kept, on a real template;
     • Auto: the outer corner farthest from the face (bottom when none);
     • on a real album (the website's own album state): a QR saved next to
       the binding, and one whose page moved to the other side when a page
       was added before it, are read, drawn and printed on the outer edge;
       Undo brings the page back where it was, still outside;
     • the order's copy of the album says the same as its print files.
   ══════════════════════════════════════════════════════════════════════════ */
import { bindingEdge } from '@web/pages/builder/binding';
import { getTemplateById, qrBadgeCornerOf, qrBadgeTemplate, QR_CORNERS, type QrCorner } from '@web/pages/builder/pageTemplates';
import type { AlbumPage, AlbumSizePreset, QrFill } from '@web/pages/builder/types';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { autoOuterCorner, outerCornerOf, outerCorners, qrPageOnOuterSide, qrPagesOnOuterSide, withQrOnOuterSide } from '../src/lib/memories/qrSide';
import { albumSnapshot, buildOrderInsert, type OrderAlbumRow } from '../src/lib/checkout/orderPayload';
import { planPage } from '../src/render';
import { act, builder, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

const SIZES: AlbumSizePreset[] = ['6x4', '8x6', '6x8', '6x6', '8x8', '11.5x8', '8.5x11'];
const isTop = (c: QrCorner) => c === 'tl' || c === 'tr';
const badgePage = (size: AlbumSizePreset, corner: QrCorner, over: Partial<AlbumPage> = {}): AlbumPage => ({
  id: `p-${corner}`, templateId: qrBadgeTemplate(size, corner)!.id, slotFills: [0, null], qrFills: [null, fill('abcd2345')], ...over,
} as AlbumPage);
function fill(code: string): QrFill {
  return { code, destination: `https://x/${code}.mp4`, qrPngDataUrl: 'data:image/png;base64,QR', memoryUrl: `https://megyprints.vercel.app/m/${code}`, createdAt: 1, kind: 'clip' } as QrFill;
}
/** Where the page's QR prints: its middle, as 0–1 of the page's width. */
function qrMiddle(page: AlbumPage, albumSize: AlbumSizePreset, pageIndex: number): number {
  const plan = planPage({ page, albumSize, pageIndex, photoCount: 1 });
  const qr = plan.items.find((it) => it.kind === 'qr') as { x: number; side: number } | undefined;
  if (!qr) throw new Error('no QR on the page');
  return (qr.x + qr.side / 2) / plan.width;
}

describe('the outer corners', () => {
  it('page 1 is bound on its left: its outer corners are on the right; page 2 the other way', () => {
    expect(outerCorners(0)).toEqual(['tr', 'br']);
    expect(outerCorners(1)).toEqual(['tl', 'bl']);
    for (let i = 0; i < 6; i++) {
      for (const c of outerCorners(i)) expect(c.endsWith(bindingEdge(i) === 'left' ? 'r' : 'l')).toBe(true);
    }
  });

  it('every size, every corner, both sides: the QR prints on the outer half, at the same top or bottom', () => {
    const wrong: string[] = [];
    for (const size of SIZES) {
      for (const corner of QR_CORNERS) {
        for (const pageIndex of [0, 1, 2, 3]) {
          const page = qrPageOnOuterSide(badgePage(size, corner), pageIndex);
          const moved = qrBadgeCornerOf(page.templateId)!;
          const label = `${size} ${corner} page ${pageIndex + 1}`;
          if (getTemplateById(page.templateId!)?.id !== page.templateId) wrong.push(`${label}: no such template`);
          if (!outerCorners(pageIndex).includes(moved)) wrong.push(`${label}: ${moved} is not outer`);
          if (isTop(moved) !== isTop(corner)) wrong.push(`${label}: top/bottom changed`);
          if (moved !== outerCornerOf(corner, pageIndex)) wrong.push(`${label}: ${moved}`);
          const middle = qrMiddle(page, size, pageIndex);
          if (bindingEdge(pageIndex) === 'left' ? middle <= 0.5 : middle >= 0.5) wrong.push(`${label}: prints at ${middle.toFixed(2)} of the width`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('only the corner changes; a page already outside, or without a QR corner, is left as it is', () => {
    const inner = badgePage('8x8', 'bl', { background: { type: 'solid', color: '#fff' } } as Partial<AlbumPage>);
    const moved = qrPageOnOuterSide(inner, 0);
    expect({ ...moved, templateId: inner.templateId }).toEqual(inner);
    const outside = badgePage('8x8', 'br');
    expect(qrPageOnOuterSide(outside, 0)).toBe(outside);
    const plain = { id: 'p', templateId: 'single-full', slotFills: [0] } as AlbumPage;
    expect(qrPageOnOuterSide(plain, 1)).toBe(plain);
  });

  it('Auto: the outer corner farthest from the face; no face: the bottom one', () => {
    for (const pageIndex of [0, 1]) {
      const [top, bottom] = outerCorners(pageIndex);
      expect(autoOuterCorner(null, pageIndex)).toBe(bottom);
      const cornerAt: Record<QrCorner, [number, number]> = { tl: [0, 0], tr: [1, 0], bl: [0, 1], br: [1, 1] };
      const wrong: string[] = [];
      for (let x = 0; x <= 1.001; x += 0.1) {
        for (let y = 0; y <= 1.001; y += 0.1) {
          const far = (c: QrCorner) => Math.hypot(cornerAt[c][0] - x, cornerAt[c][1] - y);
          const best = far(top) > far(bottom) ? top : far(bottom) > far(top) ? bottom : null;
          const auto = autoOuterCorner({ x, y }, pageIndex);
          if (best && auto !== best) wrong.push(`${x.toFixed(1)},${y.toFixed(1)} page ${pageIndex + 1}: ${auto}, not ${best}`);
          if (!outerCorners(pageIndex).includes(auto)) wrong.push(`${x.toFixed(1)},${y.toFixed(1)} page ${pageIndex + 1}: ${auto} is not outer`);
        }
      }
      expect(wrong).toEqual([]);
    }
  });

  it('the pages: nothing to move gives the same pages back; the same pages in, the same answer', () => {
    const fine = [badgePage('8x8', 'tr'), badgePage('8x8', 'bl')];
    expect(qrPagesOnOuterSide(fine)).toBe(fine);
    const mixed = [badgePage('8x8', 'tl'), badgePage('8x8', 'br')];
    const once = qrPagesOnOuterSide(mixed);
    expect(once.map((p) => qrBadgeCornerOf(p.templateId))).toEqual(['tr', 'bl']);
    expect(qrPagesOnOuterSide(mixed)).toBe(once);
  });
});

describe('on a real album (the website\'s own album state)', () => {
  /** A single-photo page of the album that can take a memory, on the side asked. */
  async function memoryPage(side: 'left' | 'right'): Promise<number> {
    for (let i = 0; i < builder().albumPages.length; i++) {
      if (bindingEdge(i) !== side) continue;
      await act(async () => { builder().goToPage(i); });
      if (builder().canAddMemoryQr) return i;
    }
    throw new Error(`no single-photo page bound on the ${side}`);
  }

  it('a QR saved next to the binding is read, drawn and printed on the outer edge', async () => {
    await madeAlbum(SCENARIOS[0]);
    const size = builder().albumSize;
    const i = await memoryPage('right'); // a left-hand page: its outer edge is its left
    await act(async () => { await builder().applyMemoryQr(fill('abcd2345'), 'br'); });
    expect(qrBadgeCornerOf(builder().albumPages[i].templateId)).toBe('br');
    expect(qrMiddle(builder().albumPages[i], size, i)).toBeGreaterThan(0.5); // as saved: by the binding
    const seen = withQrOnOuterSide(builder());
    expect(qrBadgeCornerOf(seen.albumPages[i].templateId)).toBe('bl');
    expect(seen.currentPage).toBe(seen.albumPages[i]);
    expect(qrMiddle(seen.albumPages[i], size, i)).toBeLessThan(0.5);
    // Every other page is the builder's own.
    seen.albumPages.forEach((p, k) => { if (k !== i) expect(p).toBe(builder().albumPages[k]); });
  });

  it('a page that moves to the other side takes its QR to the new outer edge; Undo brings it back, still outside', async () => {
    await madeAlbum(SCENARIOS[0]);
    const size = builder().albumSize;
    const i = await memoryPage('right');
    await act(async () => { await builder().applyMemoryQr(fill('abcd2345'), 'bl'); });
    const before = withQrOnOuterSide(builder());
    expect(before.albumPages).toBe(builder().albumPages); // already outside: nothing to move
    const code = (p: AlbumPage) => p.qrFills?.find(Boolean)?.code;
    await act(async () => { builder().duplicatePage(0); });
    const at = builder().albumPages.findIndex((p) => code(p) === 'abcd2345');
    expect(at).toBe(i + 1);
    expect(bindingEdge(at)).toBe('left'); // now a right-hand page
    const seen = withQrOnOuterSide(builder());
    expect(qrBadgeCornerOf(seen.albumPages[at].templateId)).toBe('br');
    expect(qrMiddle(seen.albumPages[at], size, at)).toBeGreaterThan(0.5);
    await act(async () => { builder().undo(); });
    const back = withQrOnOuterSide(builder());
    expect(back.albumPages.findIndex((p) => code(p) === 'abcd2345')).toBe(i);
    expect(qrBadgeCornerOf(back.albumPages[i].templateId)).toBe('bl');
  });
});

describe('the order\'s copy of the album', () => {
  it('says what the print files say: the QR on the outer edge; the rest as saved', () => {
    const pages = [badgePage('8x8', 'tl'), badgePage('8x8', 'tl')];
    const row: OrderAlbumRow = {
      id: 'a1', title: 'Trip', album_type: 'standard', album_size: '8x8', selected_template: 'classic', photos_per_page: null,
      pages, photos: [], cover_photo: null, cover_front: null,
    };
    const snap = albumSnapshot(row);
    expect((snap.pages as AlbumPage[]).map((p) => qrBadgeCornerOf(p.templateId))).toEqual(['tr', 'tl']);
    expect({ ...snap, pages: null }).toEqual(albumSnapshot({ ...row, pages: null }));
    expect(qrBadgeCornerOf(pages[0].templateId)).toBe('tl'); // the saved album is not changed
    const order = buildOrderInsert({
      userId: 'u1', album: row, specs: { material: 'matte', cover: 'hardboundLeather', size: '8x8' },
      shipping: { name: 'Juan Dela Cruz', phone: '09171234567', address: { regionCode: '13', regionName: 'NCR', provinceCode: '1374', provinceName: 'Metro Manila', cityCode: '137404', cityName: 'Quezon City', barangayCode: '1', barangayName: 'Bagumbayan', street: '1 Rizal St', zip: '1110' } as never },
      now: new Date('2026-11-02T00:00:00Z'),
    });
    expect(order.album_snapshot).toEqual(snap);
    // Not a page array: kept as it is.
    expect(albumSnapshot({ ...row, pages: null }).pages).toBeNull();
  });
});
