/* ══════════════════════════════════════════════════════════════════════════
   THE ORDER TAG on the back cover: the order number, and above it a small QR
   code that opens that order (owner 2026-11-24: "a way to track orders so
   there is no confusion in production, delivery, etc").

   It sits at the bottom of the reserved back panel, centred, inside the safe
   area (PRINTER_SPEC.safeIn from the trim), under the Megy Prints mark:
     • the QR: black squares on a white square (its quiet zone, 4 squares
       round it), so it scans on any cover colour; each square a whole
       number of pixels, so it prints sharp;
     • the order number under it, in the mark's face and ink.

   It is printed only (the cover file made once the order exists). The
   cover preview has no order number yet, so it shows no tag.

   This file is the ONE layout both cover renderers draw (the website's
   print canvas and the 2.0 app's Skia), so they cannot drift.
   ══════════════════════════════════════════════════════════════════════════ */
import QRCode from 'qrcode';
import type { CoverWrapGeometry, Rect } from './coverGeometry';
import { insetRect } from './coverGeometry';
import type { TextStyle } from './types';

/** The address the printed code opens: the website's /o/<order number>
 *  (the same origin as the memory QRs). The page sends the shop to the
 *  order in Admin and the customer to their own orders. Printed forever, so
 *  it is a constant, the same for the website and the app. */
export const ORDER_SCAN_BASE = 'https://megyprints.vercel.app';

/** An order number as the database makes it (0018 gen_order_number):
 *  MP-<year>-<7 of 23456789ABCDEFGHJKMNPQRSTUVWXYZ>. */
export const ORDER_NUMBER_PATTERN = /^MP-\d{4}-[2-9A-HJKMNP-Z]{7}$/;

export const isOrderNumber = (s: string | null | undefined): s is string => !!s && ORDER_NUMBER_PATTERN.test(s);

/** The printed code's address for an order. */
export const orderScanUrl = (orderNumber: string): string => `${ORDER_SCAN_BASE}/o/${orderNumber}`;

/** How big the code is printed, inches (its white square, quiet zone in). */
export const ORDER_TAG_QR_IN = 0.8;
/** The order number's size, inches (about 8.5 pt). */
export const ORDER_TAG_TEXT_IN = 0.12;
/** Space between the code and the number, inches. */
export const ORDER_TAG_GAP_IN = 0.06;
/** Error correction M (15%): a short address stays a small code (version 4). */
export const ORDER_TAG_QR_LEVEL = 'M' as const;
/** The quiet zone round the code, in squares (the QR standard's 4). */
export const ORDER_TAG_QUIET = 4;

const PX_PER_IN = 300;

export interface OrderTag {
  orderNumber: string;
  url: string;
  /** The white square the code sits on, its quiet zone included (wrap px). */
  qrBox: Rect;
  /** One square of the code, px. */
  cell: number;
  /** The code's dark squares, joined into runs along each row (wrap px). */
  dark: Rect[];
  /** The order number, centred under the code. */
  text: { style: TextStyle; rect: Rect; rotateDeg: 0; valign: 'middle' };
}

/** The code's squares (true = dark), its quiet zone not included. */
export function orderQrModules(url: string): { size: number; dark: (row: number, col: number) => boolean } {
  const qr = QRCode.create(url, { errorCorrectionLevel: ORDER_TAG_QR_LEVEL });
  const m = qr.modules;
  return { size: m.size, dark: (row, col) => !!m.get(row, col) };
}

/** Where the tag goes on the back panel of `g`, and what it draws. Null
 *  without an order number (a preview, an old cover file). */
export function orderTagLayout(g: CoverWrapGeometry, orderNumber: string | null | undefined, ink: string): OrderTag | null {
  const number = (orderNumber ?? '').trim();
  if (!number) return null;
  const url = orderScanUrl(number);
  const qr = orderQrModules(url);
  const across = qr.size + 2 * ORDER_TAG_QUIET;
  const cell = Math.max(4, Math.round((ORDER_TAG_QR_IN * PX_PER_IN) / across));
  const side = across * cell;

  const panel = g.panels.back;
  const safe = insetRect(panel, g.safeInsetPx);
  const textPx = Math.round(ORDER_TAG_TEXT_IN * PX_PER_IN);
  const textH = Math.round(textPx * 1.35);
  const gap = Math.round(ORDER_TAG_GAP_IN * PX_PER_IN);
  const bottom = Math.floor(safe.y + safe.height);
  const textY = bottom - textH;
  const qrX = Math.round(panel.x + panel.width / 2 - side / 2);
  const qrY = textY - gap - side;

  const dark: Rect[] = [];
  for (let row = 0; row < qr.size; row++) {
    let col = 0;
    while (col < qr.size) {
      if (!qr.dark(row, col)) { col++; continue; }
      const start = col;
      while (col < qr.size && qr.dark(row, col)) col++;
      dark.push({
        x: qrX + (ORDER_TAG_QUIET + start) * cell,
        y: qrY + (ORDER_TAG_QUIET + row) * cell,
        width: (col - start) * cell,
        height: cell,
      });
    }
  }

  return {
    orderNumber: number,
    url,
    qrBox: { x: qrX, y: qrY, width: side, height: side },
    cell,
    dark,
    text: {
      style: {
        text: number, fontSize: textPx, color: ink, fontFamily: 'Cinzel, Georgia, serif',
        bold: true, italic: false, underline: false, alignment: 'center',
      },
      rect: { x: safe.x, y: textY, width: safe.width, height: textH },
      rotateDeg: 0,
      valign: 'middle',
    },
  };
}
