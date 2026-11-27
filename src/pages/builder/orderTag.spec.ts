import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import { deriveBrandedBack } from './coverLayout';
import { coverWrapGeometry, insetRect, type Rect } from './coverGeometry';
import { ALBUM_SIZES, type AlbumBackground, type AlbumPage, type AlbumSizePreset, type CoverType } from './types';
import {
  isOrderNumber, orderScanUrl, orderTagLayout, ORDER_SCAN_BASE, ORDER_TAG_QUIET, ORDER_TAG_QR_LEVEL,
} from './orderTag';

/* ══════════════════════════════════════════════════════════════════════════
   THE ORDER TAG ON THE BACK COVER (owner 2026-11-24: the order number and a
   QR code, "a way to track orders so there is no confusion in production,
   delivery, etc"). On every size and every cover it sits inside the safe
   area at the bottom of the back panel, under the Megy Prints mark, and its
   squares are exactly the code for the order's address.
   ══════════════════════════════════════════════════════════════════════════ */

const NUMBER = 'MP-2026-9M5572U';
const COVERS: CoverType[] = ['softcover', 'hardboundLeather', 'hardboundLinen', 'premiumVelvet', 'acrylicLayflat', 'staple'];
const front = (solid: string, size: AlbumSizePreset): AlbumPage => ({
  id: 'cover-front', layout: 'freeform', size, background: { type: 'solid', solid } as AlbumBackground,
  photos: [], templateId: 'cover-plain', slotFills: [], textElements: [],
} as unknown as AlbumPage);

const inside = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('the order number', () => {
  it('is known by the shape the database makes (0018 gen_order_number)', () => {
    expect(isOrderNumber(NUMBER)).toBe(true);
    expect(isOrderNumber('MP-2026-KGCFSQN')).toBe(true);
    // 0, O, 1, I and L are never in one; nor is anything else.
    for (const bad of ['MP-2026-9M5572O', 'MP-2026-9M5572I', 'MP-2026-9M557', 'mp-2026-9m5572u', 'MP-2026-9M5572U ', '', null]) {
      expect(isOrderNumber(bad)).toBe(false);
    }
  });

  it('opens /o/<number> on the live website, the same origin as the memory QRs', () => {
    expect(ORDER_SCAN_BASE).toBe('https://megyprints.vercel.app');
    expect(orderScanUrl(NUMBER)).toBe('https://megyprints.vercel.app/o/MP-2026-9M5572U');
  });
});

describe('the tag on the back cover', () => {
  it('only on an order\'s cover file: a preview (no number) is the mark alone, as before', () => {
    const g = coverWrapGeometry('8x8', 40, 'hardboundLinen');
    const none = deriveBrandedBack(front('#F4EDE4', '8x8'), g);
    expect(none.tag).toBeNull();
    expect(none.texts.map((t) => t.style.text)).toEqual(['Megy Prints', 'megyprints.com']);
    expect(deriveBrandedBack(front('#F4EDE4', '8x8'), g, '  ').tag).toBeNull();

    const tagged = deriveBrandedBack(front('#F4EDE4', '8x8'), g, NUMBER);
    expect(tagged.texts.map((t) => t.style.text)).toEqual(['Megy Prints', 'megyprints.com', NUMBER]);
    // The mark itself does not move.
    expect(tagged.texts.slice(0, 2)).toEqual(none.texts);
  });

  for (const size of ALBUM_SIZES.map((s) => s.preset)) {
    for (const cover of COVERS) {
      it(`${size} ${cover}: inside the back's safe area, under the mark, the number under the code`, () => {
        const g = coverWrapGeometry(size, 40, cover);
        const b = deriveBrandedBack(front('#1F3A5F', size), g, NUMBER);
        const tag = b.tag!;
        const safe = insetRect(g.panels.back, g.safeInsetPx);
        expect(inside(tag.qrBox, safe)).toBe(true);
        expect(inside(tag.text.rect, safe)).toBe(true);
        // At the bottom: the number's box ends at the safe edge.
        expect(tag.text.rect.y + tag.text.rect.height).toBe(Math.floor(safe.y + safe.height));
        expect(tag.qrBox.y + tag.qrBox.height).toBeLessThan(tag.text.rect.y);
        // Clear of the Megy Prints mark (and its tagline), with room to spare.
        for (const mark of b.texts.slice(0, 2)) {
          expect(overlaps(tag.qrBox, mark.rect)).toBe(false);
          expect(tag.qrBox.y - (mark.rect.y + mark.rect.height)).toBeGreaterThan(60);
        }
        // Centred on the back panel, on whole pixels.
        const mid = g.panels.back.x + g.panels.back.width / 2;
        expect(Math.abs(tag.qrBox.x + tag.qrBox.width / 2 - mid)).toBeLessThanOrEqual(1);
        expect(Number.isInteger(tag.qrBox.x) && Number.isInteger(tag.qrBox.y)).toBe(true);
      });
    }
  }

  it('is about 0.8" square with squares of whole pixels (5 px or more at 300 DPI), every one inside the quiet zone', () => {
    const g = coverWrapGeometry('6x4', 24, 'staple');
    const tag = orderTagLayout(g, NUMBER, '#2D2D2D')!;
    expect(tag.qrBox.width).toBe(tag.qrBox.height);
    expect(tag.qrBox.width / 300).toBeGreaterThan(0.7);
    expect(tag.qrBox.width / 300).toBeLessThan(0.9);
    expect(Number.isInteger(tag.cell) && tag.cell >= 5).toBe(true);
    const quiet = ORDER_TAG_QUIET * tag.cell;
    const code: Rect = { x: tag.qrBox.x + quiet, y: tag.qrBox.y + quiet, width: tag.qrBox.width - 2 * quiet, height: tag.qrBox.height - 2 * quiet };
    for (const r of tag.dark) expect(inside(r, code)).toBe(true);
  });

  it('its squares are exactly the QR code for the order\'s address', () => {
    const g = coverWrapGeometry('8x8', 40, 'softcover');
    const tag = orderTagLayout(g, NUMBER, '#2D2D2D')!;
    const qr = QRCode.create(orderScanUrl(NUMBER), { errorCorrectionLevel: ORDER_TAG_QR_LEVEL });
    const n = qr.modules.size;
    const drawn = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
    const origin = { x: tag.qrBox.x + ORDER_TAG_QUIET * tag.cell, y: tag.qrBox.y + ORDER_TAG_QUIET * tag.cell };
    for (const r of tag.dark) {
      const row = (r.y - origin.y) / tag.cell;
      for (let c = (r.x - origin.x) / tag.cell; c < (r.x - origin.x + r.width) / tag.cell; c++) drawn[row][c] = true;
    }
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) expect(drawn[row][col]).toBe(!!qr.modules.get(row, col));
    expect(tag.qrBox.width).toBe((n + 2 * ORDER_TAG_QUIET) * tag.cell);
  });

  it('the number is in the mark\'s face and ink, readable on a light cover and a dark one', () => {
    const g = coverWrapGeometry('8x8', 40, 'softcover');
    const light = deriveBrandedBack(front('#F4EDE4', '8x8'), g, NUMBER);
    const dark = deriveBrandedBack(front('#1F1F1F', '8x8'), g, NUMBER);
    expect(light.tag!.text.style.fontFamily).toBe(light.texts[0].style.fontFamily);
    expect(light.tag!.text.style.color).toBe(light.texts[0].style.color);
    expect(dark.tag!.text.style.color).toBe(dark.texts[0].style.color);
    expect(light.tag!.text.style.color).not.toBe(dark.tag!.text.style.color);
  });
});
