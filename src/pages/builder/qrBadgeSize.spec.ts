import { describe, it, expect } from 'vitest';
import { qrBadgeTemplate, QR_CORNERS } from './pageTemplates';
import { marginForTemplate, bindingEdge, BINDING_INCHES } from './binding';
import { ALBUM_INCHES } from './templateKit';
import { QR_MIN_PRINT_IN, type AlbumSizePreset } from './types';
import { qrRect } from '../../lib/qrMemory';

/* ══════════════════════════════════════════════════════════════════════════
   THE MEMORY QR CHIP'S PRINTED SIZE.

   Owner (2026-10-21), on 6×4: "can it still be reduced?" → "0.9 lets go with
   that". On a 4"-tall page the chip took over a quarter of the height. The
   size is what PRINTS: a full-bleed page still stops 3/8" short of the spine
   (binding.ts), so the chip is measured inside what is left, on both page
   sides. The other sizes keep the chip they have printed all along.
   ══════════════════════════════════════════════════════════════════════════ */

const SIZES: AlbumSizePreset[] = ['6x4', '8x6', '6x8', '6x6', '8x8', '11.5x8', '8.5x11'];

/** The QR as it prints on page `pageIndex`: inches from the page's left / top. */
function printedQr(size: AlbumSizePreset, corner: typeof QR_CORNERS[number], pageIndex: number) {
  const t = qrBadgeTemplate(size, corner)!;
  const { w: iw, h: ih } = ALBUM_INCHES[size];
  const m = marginForTemplate(t, t.margin, size, pageIndex);
  const safeX = m.left * iw, safeY = m.top * ih;
  const safeW = iw * (1 - m.left - m.right), safeH = ih * (1 - m.top - m.bottom);
  const s = t.slots.find((x) => x.kind === 'qr')!;
  const r = qrRect(safeX + s.x * safeW, safeY + s.y * safeH, s.width * safeW, s.height * safeH);
  return { x0: r.dx, y0: r.dy, x1: r.dx + r.side, y1: r.dy + r.side, side: r.side, iw, ih };
}

describe('the memory QR chip on a 6×4 page', () => {
  it('prints 0.9" on every corner, on a right-hand and a left-hand page', () => {
    for (const corner of QR_CORNERS) {
      for (const pageIndex of [0, 1]) {
        expect(printedQr('6x4', corner, pageIndex).side, `${corner} page ${pageIndex + 1}`).toBeCloseTo(0.9, 6);
      }
    }
  });

  it('sits 0.35" in from the page\'s outer edges, and 0.35" in from the spine strip', () => {
    for (const corner of QR_CORNERS) {
      for (const pageIndex of [0, 1]) {
        const q = printedQr('6x4', corner, pageIndex);
        const spineLeft = bindingEdge(pageIndex) === 'left';
        const fromLeft = q.x0 - (spineLeft ? BINDING_INCHES : 0);
        const fromRight = q.iw - (spineLeft ? 0 : BINDING_INCHES) - q.x1;
        const fromSide = corner === 'tl' || corner === 'bl' ? fromLeft : fromRight;
        const fromTopOrBottom = corner === 'tl' || corner === 'tr' ? q.y0 : q.ih - q.y1;
        expect(fromSide, `${corner} page ${pageIndex + 1}`).toBeCloseTo(0.35, 6);
        expect(fromTopOrBottom, `${corner} page ${pageIndex + 1}`).toBeCloseTo(0.35, 6);
      }
    }
  });
});

describe('the memory QR chip on every size', () => {
  it('never prints under the 0.8" scan floor, and never in the spine strip', () => {
    for (const size of SIZES) {
      for (const corner of QR_CORNERS) {
        for (const pageIndex of [0, 1]) {
          const q = printedQr(size, corner, pageIndex);
          expect(q.side, `${size} ${corner}`).toBeGreaterThanOrEqual(QR_MIN_PRINT_IN);
          const inSpine = bindingEdge(pageIndex) === 'left' ? q.x0 < BINDING_INCHES - 1e-9 : q.x1 > q.iw - BINDING_INCHES + 1e-9;
          expect(inSpine, `${size} ${corner} page ${pageIndex + 1}`).toBe(false);
        }
      }
    }
  });

  it('the other sizes keep the chip they have always printed', () => {
    for (const size of SIZES.filter((s) => s !== '6x4')) {
      const { w: iw, h: ih } = ALBUM_INCHES[size];
      const qr = qrBadgeTemplate(size, 'br')!.slots.find((s) => s.kind === 'qr')!;
      expect(qr.width, size).toBeCloseTo(1.2 / iw, 9);
      expect(qr.height, size).toBeCloseTo(1.2 / ih, 9);
      expect(printedQr(size, 'br', 0).side, size).toBeCloseTo(1.2 * (iw - BINDING_INCHES) / iw, 6);
    }
  });
});
