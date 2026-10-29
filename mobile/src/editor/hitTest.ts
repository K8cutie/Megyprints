/* ══════════════════════════════════════════════════════════════════════════
   WHAT A TAP ON A PAGE HIT (2.0 editor, Phase 4).

   Every element a customer can tap on an album page, as a box on the page,
   in the page renderer's own coordinates (print px, no bleed: the numbers
   src/render/pagePlan.ts plans the drawing in), and which one is on top
   where a finger lands.

   The list follows the website's phone editor (BuilderPreview PageView, as
   MobileReview uses it) element for element, with its tap for each:
     • a photo frame: a QR code (onQrSlotTap) or a graphic (onOrnamentSlotTap)
       over it wins; else words in the frame (onSlotTextTap); else its photo
       (onSlotTap); else, empty, the "Click to add" box (onChooseSlot);
     • a free text, like a title (onTextTap);
     • a caption box: a QR code (onTextSlotQrTap), a graphic
       (onTextSlotOrnamentTap), its words (onTextSlotTap), a photo
       (onTextSlotPhotoTap), or, empty, the "Click to add" box (onChooseTextSlot);
     • a sticker (StudioLayer's selection).
   On top is what is on top there: the website's z-order (frames 1, their QR
   or graphic 2, free texts 3, caption boxes 5, stickers 6), then page order.
   On the cover (coverMode) an empty frame or box shows nothing and takes no
   tap, as on the website; a cover title moved by its offset is hit where it
   is drawn.

   Where the renderer draws an element, the box is the one it draws in (the
   tests hold them to planPage's items AND to the website's phone geometry,
   studioPhoneGeom.slotRectPx): a photo in the shape print clips it to (a
   circle is a circle; a heart or a star its square), a free text in its box
   turned and stretched about its top-left corner, as many lines tall as the
   renderer's wrap makes it. Every number comes from the shared album code
   (pageTemplates, binding, slotGeometry, maskShapes, slotUtils, wordArtRules);
   only the order of the steps is written here.

   Not exact yet (said in the PR): a QR code or a graphic is hit in its whole
   frame or box, not in the square the website draws it in (qrRect and
   ornamentFit are in website files that are not shared yet: lib/qrMemory
   imports the qrcode package, ornaments.ts rasterizes in a browser). The
   app draws neither yet (the renderer's own job adds them).
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { adaptTemplateToOrientation, getTemplateById } from '@web/pages/builder/pageTemplates';
import { marginForTemplate } from '@web/pages/builder/binding';
import { resolveSlotBox } from '@web/pages/builder/slotGeometry';
import { applyMask, isMaskId } from '@web/pages/builder/maskShapes';
import { dedupeSlotFills } from '@web/pages/builder/slotUtils';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { freeTextBoxWidth, TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';

export interface Rect { x: number; y: number; w: number; h: number }

/** What a tap can hit, by the website's tap for it (see the top of this file). */
export type TargetKind =
  | 'photo' // a photo in a frame (onSlotTap)
  | 'emptySlot' // an empty frame (onChooseSlot)
  | 'slotText' // words in a photo frame (onSlotTextTap)
  | 'slotQr' // a video memory's QR code in a frame (onQrSlotTap)
  | 'slotGraphic' // a graphic in a frame (onOrnamentSlotTap)
  | 'freeText' // a free text, like a title (onTextTap)
  | 'boxText' // a caption box's words (onTextSlotTap)
  | 'boxPhoto' // a photo in a caption box (onTextSlotPhotoTap)
  | 'boxQr' // a QR code in a caption box (onTextSlotQrTap)
  | 'boxGraphic' // a graphic in a caption box (onTextSlotOrnamentTap)
  | 'emptyBox' // an empty caption box (onChooseTextSlot)
  | 'sticker'; // a sticker (retired: placed ones can move or come off)

export const EMPTY_KINDS: readonly TargetKind[] = ['emptySlot', 'emptyBox'];
/** Kinds that sit in a photo frame (index = template.slots index). */
export const SLOT_KINDS: readonly TargetKind[] = ['photo', 'emptySlot', 'slotText', 'slotQr', 'slotGraphic'];
/** Kinds that sit in a caption box (index = template.textSlots index). */
export const BOX_KINDS: readonly TargetKind[] = ['boxText', 'boxPhoto', 'boxQr', 'boxGraphic', 'emptyBox'];

export interface Target {
  kind: TargetKind;
  /** The frame (template.slots) or caption box (template.textSlots) index;
   *  -1 for a free text or a sticker. */
  index: number;
  /** Stable on its page: 'slot:2', 'box:0', 'text:<id>', 'sticker:<uid>'.
   *  A frame keeps its key whatever it holds (empty, photo, words), so a
   *  selection stays on it when it is filled. */
  key: string;
  /** The box, page px (the renderer's print px), before any turn. */
  box: Rect;
  /** Degrees, about `pivot`. */
  rotation: number;
  pivot: 'center' | 'topLeft';
  /** A free text's stretch, applied after the turn, about its top-left. */
  scaleX: number;
  scaleY: number;
  shape: 'rect' | 'ellipse';
  /** The website's z-index for it (higher is on top). */
  z: number;
  /** The album photo shown (photo, boxPhoto). */
  photoIndex?: number;
  /** The TextElement (freeText, boxText). */
  textId?: string;
  /** The sticker (sticker). */
  stickerId?: string;
}

/** How many lines a text wraps to in `maxWidth` (print px), as the renderer
 *  wraps it (wordArtRules wrapTextLines with the page fonts). */
export type CountLines = (t: { text: string; fontFamily?: string; bold?: boolean; italic?: boolean; fontSize: number }, maxWidth: number) => number;

/** Without the fonts: one line per line the customer typed. */
export const typedLines: CountLines = (t) => Math.max(1, String(t.text ?? '').split('\n').length);

export interface TargetsInput {
  page: AlbumPage;
  albumSize: AlbumSizePreset;
  /** 0-based: drives which edge is the spine. */
  pageIndex: number;
  /** How many photos the album has (a frame pointing past the end is empty). */
  photoCount: number;
  /** The front cover (print's coverMode). */
  coverMode?: boolean;
  /** Binding allowance, inches (default: the editor's 3/8"). */
  bindingIn?: number;
  countLines?: CountLines;
}

export interface PageTargets {
  /** The page, print px (getPrintDimensions). */
  width: number;
  height: number;
  /** Bottom first: the last one is on top. */
  targets: Target[];
}

const Z = { frame: 1, frameTop: 2, freeText: 3, box: 5, sticker: 6 } as const;

function target(kind: TargetKind, index: number, key: string, box: Rect, z: number, extra: Partial<Target> = {}): Target {
  return { kind, index, key, box, rotation: 0, pivot: 'center', scaleX: 1, scaleY: 1, shape: 'rect', z, ...extra };
}

/** A photo's tap area: the shape print clips it to (drawPage slotPath). A
 *  circle, heart or star sits in the frame's centred square (slotShapeStyle);
 *  every other shape prints as its rectangle. */
function photoArea(box: Rect, shape: string | undefined): { box: Rect; shape: Target['shape'] } {
  if (shape === 'circle' || shape === 'heart' || shape === 'star') {
    const side = Math.min(box.w, box.h);
    return { box: { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side }, shape: shape === 'circle' ? 'ellipse' : 'rect' };
  }
  return { box, shape: 'rect' };
}

/** Every element a tap can hit on this page: see the top of this file. */
export function pageTargets({ page, albumSize, pageIndex, photoCount, coverMode = false, bindingIn, countLines = typedLines }: TargetsInput): PageTargets {
  const { width: W, height: H } = getPrintDimensions(albumSize);
  const { width: uiW } = getCanvasDimensions(albumSize);
  const scale = W / uiW;
  const all: Target[] = [];

  // The page's frame of reference, as pagePlan.ts works it out.
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const adapted = template ? adaptTemplateToOrientation(template, W, H) : null;
  const m = adapted ? marginForTemplate(adapted, adapted.margin, albumSize, pageIndex, { bindingIn, noBinding: coverMode }) : null;
  const safe = m ? { x: W * m.left, y: H * m.top, w: W * (1 - m.left - m.right), h: H * (1 - m.top - m.bottom) } : null;
  const inSafe = (s: { x: number; y: number; width: number; height: number }): Rect =>
    ({ x: safe!.x + s.x * safe!.w, y: safe!.y + s.y * safe!.h, w: s.width * safe!.w, h: s.height * safe!.h });
  const fromGeom = (g: { cx: number; cy: number; w: number; h: number; rot: number }): Partial<Target> & { box: Rect } =>
    ({ box: { x: (g.cx - g.w / 2) * W, y: (g.cy - g.h / 2) * H, w: g.w * W, h: g.h * H }, rotation: g.rot || 0, pivot: 'center' });

  // ── Photo frames ──
  if (adapted && safe) {
    const fills = dedupeSlotFills(page.slotFills ?? []);
    adapted.slots.forEach((raw, i) => {
      if (!raw) return;
      const rawMask = page.slotMasks?.[i];
      const slot = applyMask(resolveSlotBox(raw, page.slotGeometries?.[i]), isMaskId(rawMask) ? rawMask : null);
      const cell = inSafe(slot);
      const key = `slot:${i}`;
      if (page.qrFills?.[i]) { all.push(target('slotQr', i, key, cell, Z.frameTop)); return; }
      if (page.ornamentFills?.[i]) { all.push(target('slotGraphic', i, key, cell, Z.frameTop)); return; }
      if (page.slotTexts?.[i]) { all.push(target('slotText', i, key, cell, Z.frame)); return; }
      const photoIndex = fills[i];
      if (photoIndex != null && photoIndex >= 0 && photoIndex < photoCount) {
        const area = photoArea(cell, slot.shape);
        all.push(target('photo', i, key, area.box, Z.frame, { shape: area.shape, photoIndex }));
        return;
      }
      if (!coverMode) all.push(target('emptySlot', i, key, cell, Z.frame));
    });
  }

  // ── Free texts (and a caption whose box this layout lacks: the renderer
  //    draws it as a free text, so that is where it is tapped) ──
  for (const t of page.textElements ?? []) {
    const ts = t.boxIndex != null && adapted && safe ? adapted.textSlots?.[t.boxIndex] : undefined;
    if (ts) continue;
    const fontSize = (t.fontSize || 24) * scale;
    const boxWidth = freeTextBoxWidth(t) * scale;
    const lines = countLines({ text: t.text, fontFamily: t.fontFamily, bold: t.bold, italic: t.italic, fontSize }, boxWidth);
    all.push(target('freeText', -1, `text:${t.id}`, { x: t.x * scale, y: t.y * scale, w: boxWidth, h: lines * fontSize * TEXT_LINE_HEIGHT }, Z.freeText, {
      rotation: t.rotation || 0, pivot: 'topLeft', scaleX: t.scaleX ?? 1, scaleY: t.scaleY ?? 1, textId: t.id,
    }));
  }

  // ── Caption boxes ──
  if (adapted && safe) {
    (adapted.textSlots ?? []).forEach((ts, j) => {
      const cell = inSafe(ts);
      const key = `box:${j}`;
      if (page.textSlotQr?.[j]) {
        const g = page.textSlotQrGeom?.[j];
        all.push(g ? target('boxQr', j, key, cell, Z.box, fromGeom(g)) : target('boxQr', j, key, cell, Z.box));
        return;
      }
      if (page.textSlotOrnament?.[j]) {
        const g = page.textSlotOrnamentGeom?.[j];
        all.push(g ? target('boxGraphic', j, key, cell, Z.box, fromGeom(g)) : target('boxGraphic', j, key, cell, Z.box));
        return;
      }
      const words = (page.textElements ?? []).find((t) => t.boxIndex === j);
      if (words) {
        // The cover: a title moved off its box by its offset (fractions of the page).
        const offX = coverMode ? (words.offsetX ?? 0) * W : 0;
        const offY = coverMode ? (words.offsetY ?? 0) * H : 0;
        all.push(target('boxText', j, key, { ...cell, x: cell.x + offX, y: cell.y + offY }, Z.box, { textId: words.id }));
        return;
      }
      const photoIndex = page.textSlotFills?.[j] ?? null;
      if (photoIndex != null && photoIndex >= 0 && photoIndex < photoCount) {
        all.push(target('boxPhoto', j, key, cell, Z.box, { photoIndex }));
        return;
      }
      if (!coverMode) all.push(target('emptyBox', j, key, cell, Z.box));
    });
  }

  // ── Stickers (centre-based page fractions, turned about their centre) ──
  for (const k of page.stickers ?? []) {
    if (!k.geom) continue;
    all.push(target('sticker', -1, `sticker:${k.uid}`, fromGeom(k.geom).box, Z.sticker, { rotation: k.geom.rot || 0, stickerId: k.uid }));
  }

  // The website's stacking: by z-index, then page order.
  const order = new Map(all.map((t, i) => [t, i]));
  all.sort((a, b) => a.z - b.z || order.get(a)! - order.get(b)!);
  return { width: W, height: H, targets: all };
}

/** Is page point (x, y) inside the target as drawn (turned, stretched, shaped)? */
export function contains(t: Target, x: number, y: number): boolean {
  const { box } = t;
  let px = x, py = y;
  if (t.rotation) {
    const ox = t.pivot === 'center' ? box.x + box.w / 2 : box.x;
    const oy = t.pivot === 'center' ? box.y + box.h / 2 : box.y;
    const r = (-t.rotation * Math.PI) / 180;
    const dx = x - ox, dy = y - oy;
    px = ox + dx * Math.cos(r) - dy * Math.sin(r);
    py = oy + dx * Math.sin(r) + dy * Math.cos(r);
  }
  if (t.pivot === 'topLeft' && (t.scaleX !== 1 || t.scaleY !== 1)) {
    if (!t.scaleX || !t.scaleY) return false;
    px = box.x + (px - box.x) / t.scaleX;
    py = box.y + (py - box.y) / t.scaleY;
  }
  if (t.shape === 'ellipse') {
    const rx = box.w / 2, ry = box.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    const nx = (px - (box.x + rx)) / rx, ny = (py - (box.y + ry)) / ry;
    return nx * nx + ny * ny <= 1;
  }
  return px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
}

/** The element on top at page point (x, y), or null (the page itself). */
export function hitTest(targets: readonly Target[], x: number, y: number): Target | null {
  for (let i = targets.length - 1; i >= 0; i--) if (contains(targets[i], x, y)) return targets[i];
  return null;
}

/** A point on the page as shown (screen px, `shownWidth` wide) → page px. */
export function toPagePoint(screenX: number, screenY: number, shownWidth: number, pageWidth: number): { x: number; y: number } {
  const k = pageWidth / Math.max(1, shownWidth);
  return { x: screenX * k, y: screenY * k };
}

/** The four corners of a target as drawn (page px), for an outline or a test. */
export function corners(t: Target): { x: number; y: number }[] {
  const { box } = t;
  const local = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]];
  const ox = t.pivot === 'center' ? box.x + box.w / 2 : box.x;
  const oy = t.pivot === 'center' ? box.y + box.h / 2 : box.y;
  const r = (t.rotation * Math.PI) / 180;
  return local.map(([x, y]) => {
    let dx = x - ox, dy = y - oy;
    if (t.pivot === 'topLeft') { dx *= t.scaleX; dy *= t.scaleY; }
    return { x: ox + dx * Math.cos(r) - dy * Math.sin(r), y: oy + dx * Math.sin(r) + dy * Math.cos(r) };
  });
}
