/* ══════════════════════════════════════════════════════════════════════════
   PAGE PLAN: what goes where on one album page in the print file, worked
   out from the page's data without drawing anything.

   It follows the website's print renderer (src/pages/builder/printPipeline
   drawPrintPage) step by step, in the same order: paper, background (a
   colour, a wash, a texture, a picture), each template slot (QR → graphic →
   text → photo), corner art, stickers, the words, then what sits in the
   caption boxes (QR → graphic → photo). Every number comes from the
   website's own album code (the shared files): the print size, the template
   adapted to the page, the margins with the spine keep-out, a moved frame,
   a mask, a colour look, the caption margin, where a QR or a graphic sits.
   Only the order of the steps is written here again, and the golden check
   (tools/golden, test/goldenPages.test.ts) proves it still matches the
   website, pixel by pixel.

   The front cover is planned here too (`coverMode`, as print's own
   coverMode): no spine keep-out, a caption's nudge off its box honoured,
   the cover's floating shadow on its words, a picture background fitted at
   its focus and zoom. coverPlan.ts puts it into the cover file.

   Pictures the page names by address (a QR code, a graphic or a sticker,
   each kept in the album as a PNG data: URL; a mask edge or a corner file;
   a picture background) are listed in `assets`: the caller opens them and
   hands them to the drawer (drawPage.ts AssetSource).

   What the app does not draw yet is still planned where it sits, and named
   in `notDrawn`, never drawn as something else.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset, FrameStyle, SlotText, TemplateSlot, TextElement } from '@web/pages/builder/types';
import { CORNER_POSITIONS, cornerImageUrl, resolveBgImageSrc } from '@web/pages/builder/types';
import { getTemplateById, adaptTemplateToOrientation } from '@web/pages/builder/pageTemplates';
import { marginForTemplate } from '@web/pages/builder/binding';
import { resolveSlotBox } from '@web/pages/builder/slotGeometry';
import { applyMask, isMaskId, maskOverlayUrl, maskTextureUrl, type AppliedSlot } from '@web/pages/builder/maskShapes';
import { dedupeSlotFills } from '@web/pages/builder/slotUtils';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions, PRINT_DPI } from '@web/pages/builder/printSize';
import { bleedPx } from '@web/pages/builder/bleedGeometry';
import { PRINT_FRAME, PRINT_FRAME_PX } from '@web/pages/builder/printFrameSpec';
import { normalizeGradient, linearGradientEndpoints, radialGradientGeom } from '@web/pages/builder/gradient';
import { resolveTextSlotAlign, freeTextBoxWidth, CAPTION_PAD_X } from '@web/pages/builder/wordArtRules';
import { isLookId, type LookId } from '@web/pages/builder/lookRules';
import { qrRect } from '@web/lib/qrGeometry';
import { ornamentFit } from '@web/pages/builder/ornamentFit';
import { fontNotDrawn } from './fontTable';
import { textureTilePx } from './textureTile';

export interface Rect { x: number; y: number; w: number; h: number }
export interface GradientStop { offset: number; color: string }

/** Where a picture comes from: an album photo (by index), or a picture the
 *  page names by address (in PagePlan.assets). */
export type ImageRef = { photo: number } | { src: string };

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] }
  /** A material texture (textures.ts) repeated from the page's top-left, its
   *  tile `tilePx` square, laid on at `alpha` over white paper. */
  | { kind: 'texture'; name: string; color?: string; tilePx: number; alpha: number }
  /** A picture: stretched to the page, or on a cover fitted at its focus and
   *  zoom (types.bgCoverFit). Paper colour when it can't be opened. */
  | { kind: 'image'; image: ImageRef; cover: { zoom?: number; focusX?: number; focusY?: number } | null };

export interface PhotoFrame {
  /** The frame treatment in force (none on a full-bleed page). */
  style: FrameStyle;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  color: string;
  /** Mat, shadow box, rounded corners or inset lines are drawn. */
  decorated: boolean;
  /** Rectangle-like (not a circle or an oval): which mat/shadow shape. */
  isRect: boolean;
  /** The border line, design px (0 = none). */
  borderWidth: number;
}

export interface PhotoItem {
  kind: 'photo';
  slotIndex: number;
  photoIndex: number;
  /** The slot on the page, print px. */
  box: Rect;
  /** The template slot with its moved frame and mask applied (a soft edge or
   *  a textured edge rides on it: feather, featherSide, texture). */
  slot: AppliedSlot<TemplateSlot>;
  zoom: number | undefined;
  /** The pan, already in print px. */
  pan: { x: number; y: number };
  frame: PhotoFrame;
  /** The photo's colour look (black & white, sepia…), or null. */
  look: LookId | null;
}

/** Words inside a box (a caption box, or a text in a photo frame). */
export interface BoxTextItem {
  kind: 'boxText';
  /** 'caption' = TextElement bound to a caption box; 'slot' = SlotText in a photo frame. */
  source: 'caption' | 'slot';
  box: Rect;
  align: 'left' | 'center' | 'right';
  /** Where lines are anchored (by `align`) and the block's vertical centre. */
  anchorX: number;
  centerY: number;
  maxWidth: number;
  /** Print px. */
  fontSize: number;
  /** Print px per design px (outline and shadow scale with it). */
  scale: number;
  style: SlotText;
}

/** A free text (a title at x/y), drawn in its own box like the DOM preview. */
export interface FreeTextItem {
  kind: 'freeText';
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  boxWidth: number;
  anchorX: number;
  align: 'left' | 'center' | 'right';
  fontSize: number;
  scale: number;
  style: TextElement;
}

/** A photo in a caption box: cover-fitted, centred, clipped to the box. */
export interface BoxPhotoItem {
  kind: 'boxPhoto';
  boxIndex: number;
  photoIndex: number;
  box: Rect;
}

/** A memory QR fitted in a slot or caption box (qrRect): a white square, the
 *  code's PNG over it. */
export interface QrItem {
  kind: 'qr';
  at: 'slot' | 'caption';
  index: number;
  src: string;
  x: number;
  y: number;
  side: number;
}

/** A QR the customer moved, sized or turned in its caption box: the white
 *  square at the moved size, the code contained in it. */
export interface FreeQrItem {
  kind: 'freeQr';
  index: number;
  src: string;
  /** Centre, size (print px) and turn (degrees). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

/** A graphic (an ornament's PNG) fitted in a slot or caption box (ornamentFit). */
export interface GraphicItem {
  kind: 'graphic';
  at: 'slot' | 'caption';
  index: number;
  src: string;
  x: number;
  y: number;
  side: number;
}

/** A graphic at its own centre, size and turn: a sticker, or a caption-box
 *  graphic the customer moved. */
export interface FreeGraphicItem {
  kind: 'freeGraphic';
  source: 'sticker' | 'caption';
  index: number;
  src: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
}

/** One corner of a theme's corner art. */
export interface CornerItem {
  kind: 'corner';
  src: string;
  x: number;
  y: number;
  size: number;
}

export type PlanItem = PhotoItem | BoxTextItem | FreeTextItem | BoxPhotoItem | QrItem | FreeQrItem | GraphicItem | FreeGraphicItem | CornerItem;

export interface PagePlan {
  albumSize: AlbumSizePreset;
  /** The page at print size, without bleed (300 DPI). */
  width: number;
  height: number;
  /** The bleed added round every edge of the print file's page, px. */
  bleed: number;
  /** The editor's design space (text sizes and pans are stored in it). */
  designWidth: number;
  designHeight: number;
  /** The front cover (print's coverMode): its words float. */
  onCover: boolean;
  background: Fill;
  /** A see-through wash over the background (its opacity below 100). */
  wash: string | null;
  items: PlanItem[];
  /** Every picture the page names by address (data: URLs, files), once each. */
  assets: string[];
  /** What is on the page that the app does not draw yet. */
  notDrawn: string[];
}

export interface PlanInput {
  page: AlbumPage;
  albumSize: AlbumSizePreset;
  /** 0-based: drives which edge is the spine. */
  pageIndex: number;
  /** How many photos the album has (a fill past the end draws nothing). */
  photoCount: number;
  /** The album's photo ids, in order: a picture background names its photo by id. */
  photoIds?: readonly string[];
  /** Binding allowance, inches (default: the editor's 3/8"). */
  bindingIn?: number;
  /** The front cover page (print's coverMode). */
  coverMode?: boolean;
}

const DEFAULT_PAPER = '#FFFBF7';
/** 1 design px of frame → print px: the print renderer's own factor. */
export const FRAME_PX = PRINT_FRAME_PX;

function backgroundOf(page: AlbumPage, W: number, H: number, uiW: number, coverMode: boolean, photoIds: readonly string[], assets: Set<string>): { fill: Fill; wash: string | null } {
  const bg = page.background;
  if (!bg) return { fill: { kind: 'solid', color: DEFAULT_PAPER }, wash: null };
  let fill: Fill = { kind: 'solid', color: DEFAULT_PAPER };
  switch (bg.type) {
    case 'solid':
      fill = { kind: 'solid', color: bg.solid || DEFAULT_PAPER };
      break;
    case 'gradient': {
      const g = normalizeGradient(bg.gradient);
      if (!g) break;
      if (g.type === 'radial') {
        const { cx, cy, r } = radialGradientGeom(W, H);
        fill = { kind: 'radial', cx, cy, r, stops: g.stops };
      } else {
        const { x1, y1, x2, y2 } = linearGradientEndpoints(g.angle, W, H);
        fill = { kind: 'linear', x1, y1, x2, y2, stops: g.stops };
      }
      break;
    }
    case 'image': {
      // resolveBgImageSrc: the album photo the id names, else the stored address.
      const at = bg.photoId ? photoIds.indexOf(bg.photoId) : -1;
      const cover = coverMode ? { zoom: bg.zoom, focusX: bg.focusX, focusY: bg.focusY } : null;
      if (at >= 0) fill = { kind: 'image', image: { photo: at }, cover };
      else {
        const src = resolveBgImageSrc(bg, []);
        if (src && !src.includes('gradient(')) {
          assets.add(src);
          fill = { kind: 'image', image: { src }, cover };
        }
      }
      break;
    }
    case 'texture':
      // The website tiles the texture at its opacity over white paper and adds no wash.
      return {
        fill: { kind: 'texture', name: String(bg.texture ?? ''), color: bg.textureColor, tilePx: textureTilePx(W / uiW), alpha: (bg.opacity ?? 100) / 100 },
        wash: null,
      };
    default:
      break;
  }
  const opacity = bg.opacity ?? 100;
  return { fill, wash: opacity < 100 ? `rgba(255, 251, 247, ${(100 - opacity) / 100})` : null };
}

/** A text whose exact font file (face, weight, style) the app doesn't have. */
function noteFont(t: { fontFamily?: string; bold?: boolean; italic?: boolean }, notDrawn: string[]): void {
  const label = fontNotDrawn({ family: t.fontFamily, bold: t.bold, italic: t.italic });
  if (label && !notDrawn.includes(label)) notDrawn.push(label);
}

/** The page's plan: see the top of this file. */
export function planPage({ page, albumSize, pageIndex, photoCount, photoIds = [], bindingIn, coverMode = false }: PlanInput): PagePlan {
  const { width: W, height: H } = getPrintDimensions(albumSize);
  const { width: uiW, height: uiH } = getCanvasDimensions(albumSize);
  const scale = W / uiW;
  const notDrawn: string[] = [];
  const items: PlanItem[] = [];
  const assets = new Set<string>();
  const { fill, wash } = backgroundOf(page, W, H, uiW, coverMode, photoIds, assets);
  const asset = (src: string): string => { assets.add(src); return src; };

  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const adapted = template ? adaptTemplateToOrientation(template, W, H) : null;
  const m = adapted ? marginForTemplate(adapted, adapted.margin, albumSize, pageIndex, { noBinding: coverMode, bindingIn }) : null;
  const safe = m ? { x: W * m.left, y: H * m.top, w: W * (1 - m.left - m.right), h: H * (1 - m.top - m.bottom) } : null;

  // ── The template's slots ──
  if (adapted && safe && (page.slotFills || page.qrFills || page.slotTexts || page.ornamentFills)) {
    const fills = dedupeSlotFills(page.slotFills ?? []);
    for (let i = 0; i < adapted.slots.length; i++) {
      const rawMask = page.slotMasks?.[i];
      const slot = applyMask(resolveSlotBox(adapted.slots[i], page.slotGeometries?.[i]), isMaskId(rawMask) ? rawMask : null);
      const box = { x: safe.x + slot.x * safe.w, y: safe.y + slot.y * safe.h, w: slot.width * safe.w, h: slot.height * safe.h };
      const qr = page.qrFills?.[i];
      if (qr) {
        const r = qrRect(box.x, box.y, box.w, box.h);
        items.push({ kind: 'qr', at: 'slot', index: i, src: asset(qr.qrPngDataUrl), x: r.dx, y: r.dy, side: r.side });
        continue;
      }
      const ornament = page.ornamentFills?.[i];
      if (ornament) {
        const r = ornamentFit(box.x, box.y, box.w, box.h);
        items.push({ kind: 'graphic', at: 'slot', index: i, src: asset(ornament.pngDataUrl), x: r.dx, y: r.dy, side: r.side });
        continue;
      }
      const st = page.slotTexts?.[i] ?? null;
      if (st) {
        const align = (st.alignment ?? 'center') as BoxTextItem['align'];
        const pad = box.w * CAPTION_PAD_X;
        noteFont(st, notDrawn);
        items.push({
          kind: 'boxText', source: 'slot', box, align,
          anchorX: align === 'left' ? box.x + pad : align === 'right' ? box.x + box.w - pad : box.x + box.w / 2,
          centerY: box.y + box.h / 2, maxWidth: box.w - pad * 2,
          fontSize: (st.fontSize || 24) * scale, scale, style: st,
        });
        continue;
      }
      const photoIndex = fills[i];
      if (photoIndex == null || photoIndex < 0 || photoIndex >= photoCount) continue;
      const fullBleed = adapted.fullBleed ?? false;
      const style: FrameStyle = (fullBleed ? 'none' : page.frameStyle) ?? 'none';
      const decorated = style !== 'none' && slot.shape !== 'heart' && !slot.masked;
      let borderWidth = fullBleed || slot.masked ? 0 : (page.photoBorderWidth ?? slot.borderWidth ?? 0);
      if (decorated && style === 'rounded') borderWidth = Math.max(borderWidth, PRINT_FRAME.rounded.minBorder);
      if (slot.texture) {
        asset(maskTextureUrl(slot.texture));
        const overlay = maskOverlayUrl(slot.texture);
        if (overlay) asset(overlay);
      }
      const rawLook = page.slotLooks?.[i];
      items.push({
        kind: 'photo', slotIndex: i, photoIndex, box, slot,
        zoom: page.slotScales?.[i],
        pan: { x: (page.slotOffsetsX?.[i] ?? 0) * (W / uiW), y: (page.slotOffsetsY?.[i] ?? 0) * (H / uiH) },
        frame: {
          style, decorated, borderWidth,
          borderStyle: page.photoBorderStyle ?? 'solid',
          color: page.photoBorderColor ?? slot.borderColor ?? '#FFFFFF',
          isRect: slot.shape !== 'circle' && slot.shape !== 'oval',
        },
        look: isLookId(rawLook) ? rawLook : null,
      });
    }
  }

  // ── A theme's corner art (one set, all four corners) ──
  if (page.cornerBase) {
    const size = Math.min(W, H) * 0.25;
    for (const pos of CORNER_POSITIONS) {
      const left = pos === 'tl' || pos === 'bl', top = pos === 'tl' || pos === 'tr';
      items.push({ kind: 'corner', src: asset(cornerImageUrl(page.cornerBase, pos)), x: left ? 0 : W - size, y: top ? 0 : H - size, size });
    }
  }

  // ── Stickers: free graphics at their centre-based page-fraction transform ──
  (page.stickers ?? []).forEach((k, i) => {
    const g = k.geom;
    if (!g) return;
    items.push({ kind: 'freeGraphic', source: 'sticker', index: i, src: asset(k.pngDataUrl), cx: g.cx * W, cy: g.cy * H, w: g.w * W, h: g.h * H, rot: g.rot || 0 });
  });

  // ── The words ──
  for (const text of page.textElements || []) {
    const fontSize = (text.fontSize || 24) * scale;
    noteFont(text, notDrawn);
    const ts = text.boxIndex != null && adapted && safe ? adapted.textSlots?.[text.boxIndex] : undefined;
    if (ts && safe) {
      // A cover caption keeps its nudge off its box (print's coverMode).
      const offX = coverMode ? (text.offsetX ?? 0) * W : 0;
      const offY = coverMode ? (text.offsetY ?? 0) * H : 0;
      const box = { x: safe.x + ts.x * safe.w + offX, y: safe.y + ts.y * safe.h + offY, w: ts.width * safe.w, h: ts.height * safe.h };
      const align = resolveTextSlotAlign(text, ts);
      const pad = box.w * CAPTION_PAD_X;
      items.push({
        kind: 'boxText', source: 'caption', box, align,
        anchorX: align === 'left' ? box.x + pad : align === 'right' ? box.x + box.w - pad : box.x + box.w / 2,
        centerY: box.y + box.h / 2, maxWidth: box.w - pad * 2, fontSize, scale, style: text,
      });
    } else {
      const align = (text.alignment ?? 'center') as FreeTextItem['align'];
      const boxWidth = freeTextBoxWidth(text) * scale;
      items.push({
        kind: 'freeText', x: text.x * scale, y: text.y * scale, rotation: text.rotation || 0,
        scaleX: text.scaleX ?? 1, scaleY: text.scaleY ?? 1, opacity: text.opacity ?? 100,
        boxWidth, anchorX: align === 'left' ? 0 : align === 'right' ? boxWidth : boxWidth / 2,
        align, fontSize, scale, style: text,
      });
    }
  }

  // ── What sits in the caption boxes (QR, graphic, photo) ──
  if (adapted && safe && (page.textSlotFills || page.textSlotQr || page.textSlotOrnament)) {
    const textSlots = adapted.textSlots ?? [];
    for (let j = 0; j < textSlots.length; j++) {
      const ts = textSlots[j];
      const box = { x: safe.x + ts.x * safe.w, y: safe.y + ts.y * safe.h, w: ts.width * safe.w, h: ts.height * safe.h };
      const tqr = page.textSlotQr?.[j];
      if (tqr) {
        const qg = page.textSlotQrGeom?.[j];
        if (qg) items.push({ kind: 'freeQr', index: j, src: asset(tqr.qrPngDataUrl), cx: qg.cx * W, cy: qg.cy * H, w: qg.w * W, h: qg.h * H, rot: qg.rot || 0 });
        else {
          const r = qrRect(box.x, box.y, box.w, box.h);
          items.push({ kind: 'qr', at: 'caption', index: j, src: asset(tqr.qrPngDataUrl), x: r.dx, y: r.dy, side: r.side });
        }
        continue;
      }
      const torn = page.textSlotOrnament?.[j];
      if (torn) {
        const tg = page.textSlotOrnamentGeom?.[j];
        if (tg) items.push({ kind: 'freeGraphic', source: 'caption', index: j, src: asset(torn.pngDataUrl), cx: tg.cx * W, cy: tg.cy * H, w: tg.w * W, h: tg.h * H, rot: tg.rot || 0 });
        else {
          const r = ornamentFit(box.x, box.y, box.w, box.h);
          items.push({ kind: 'graphic', at: 'caption', index: j, src: asset(torn.pngDataUrl), x: r.dx, y: r.dy, side: r.side });
        }
        continue;
      }
      if ((page.textElements || []).some((t) => t.boxIndex === j)) continue;
      const photoIndex = page.textSlotFills?.[j] ?? null;
      if (photoIndex == null || photoIndex < 0 || photoIndex >= photoCount) continue;
      items.push({ kind: 'boxPhoto', boxIndex: j, photoIndex, box });
    }
  }

  return {
    albumSize, width: W, height: H, bleed: bleedPx(PRINT_DPI), designWidth: uiW, designHeight: uiH, onCover: coverMode,
    background: fill, wash, items, assets: [...assets], notDrawn,
  };
}
