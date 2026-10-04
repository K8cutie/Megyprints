/* ══════════════════════════════════════════════════════════════════════════
   trashSpot — where a photo's "Remove photo" button goes. Its place is the
   photo's top-right corner, but a video memory's QR can land there too
   (the Auto corner is the one farthest from the face): the QR covered the
   button and a tap meant for the QR could delete the photo (1-star testers,
   2026-10-04, the Commuter). Now the button takes the first corner no QR
   code covers.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Box { x: number; y: number; w: number; h: number }

export const TRASH_SIZE = 30;
export const TRASH_INSET = 6;
/** Breathing room kept between the button and a QR code. */
const GAP = 6;

type Spot = { top: number; right: number } | { top: number; left: number } | { bottom: number; right: number } | { bottom: number; left: number };

/** CSS offsets for the button inside the photo's box (`slot`, page px),
 *  keeping clear of every box in `avoid` (QR codes, page px). */
export function trashSpot(slot: Box, avoid: Box[]): Spot {
  const s = TRASH_SIZE;
  const i = TRASH_INSET;
  const right = slot.x + slot.w - i - s;
  const bottom = slot.y + slot.h - i - s;
  const spots: { css: Spot; at: Box }[] = [
    { css: { top: i, right: i }, at: { x: right, y: slot.y + i, w: s, h: s } },
    { css: { top: i, left: i }, at: { x: slot.x + i, y: slot.y + i, w: s, h: s } },
    { css: { bottom: i, right: i }, at: { x: right, y: bottom, w: s, h: s } },
    { css: { bottom: i, left: i }, at: { x: slot.x + i, y: bottom, w: s, h: s } },
  ];
  const clear = (b: Box) => avoid.every((a) =>
    b.x + b.w + GAP <= a.x || a.x + a.w + GAP <= b.x || b.y + b.h + GAP <= a.y || a.y + a.h + GAP <= b.y);
  return (spots.find((p) => clear(p.at)) ?? spots[0]).css;
}
