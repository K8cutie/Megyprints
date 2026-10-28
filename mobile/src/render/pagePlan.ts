/* ══════════════════════════════════════════════════════════════════════════
   PAGE PLAN: what goes where on one album page in the print file, worked
   out from the page's data without drawing anything.

   It follows the website's print renderer (src/pages/builder/printPipeline
   drawPrintPage) step by step, in the same order: paper, background, each
   template slot (QR → graphic → text → photo), corner art, stickers, the
   words, then what sits in the caption boxes. Every number comes from the
   website's own album code (the shared files): the print size, the template
   adapted to the page, the margins with the spine keep-out, a moved frame,
   a mask, the caption margin. Only the order of the steps is written here
   again, and the golden check (tools/golden, test/goldenPages.test.ts)
   proves it still matches the website, pixel by pixel.

   What the app does not draw yet is still planned where it sits, and named
   in `notDrawn`, never drawn as something else.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset, FrameStyle, SlotText, TemplateSlot, TextElement } from '@web/pages/builder/types';
import { getTemplateById, adaptTemplateToOrientation } from '@web/pages/builder/pageTemplates';
import { marginForTemplate } from '@web/pages/builder/binding';
import { resolveSlotBox } from '@web/pages/builder/slotGeometry';
import { applyMask, isMaskId, type AppliedSlot } from '@web/pages/builder/maskShapes';
import { dedupeSlotFills } from '@web/pages/builder/slotUtils';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions, PRINT_DPI } from '@web/pages/builder/printSize';
import { bleedPx } from '@web/pages/builder/bleedGeometry';
import { PRINT_FRAME, PRINT_FRAME_PX } from '@web/pages/builder/printFrameSpec';
import { normalizeGradient, linearGradientEndpoints, radialGradientGeom } from '@web/pages/builder/gradient';
import { resolveTextSlotAlign, freeTextBoxWidth, CAPTION_PAD_X } from '@web/pages/builder/wordArtRules';
import { fontNotDrawn } from './fontTable';

export interface Rect { x: number; y: number; w: number; h: number }
export interface GradientStop { offset: number; color: string }

export type Fill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] };

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
  /** The template slot with its moved frame and mask applied. */
  slot: AppliedSlot<TemplateSlot>;
  zoom: number | undefined;
  /** The pan, already in print px. */
  pan: { x: number; y: number };
  frame: PhotoFrame;
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

export type PlanItem = PhotoItem | BoxTextItem | FreeTextItem | BoxPhotoItem;

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
  background: Fill;
  /** A see-through wash over the background (its opacity below 100). */
  wash: string | null;
  items: PlanItem[];
  /** What is on the page that the app does not draw yet. */
  notDrawn: string[];
  /** The front cover page (PlanInput.cover): its words float on the cover's shadow. */
  onCover: boolean;
}

export interface PlanInput {
  page: AlbumPage;
  albumSize: AlbumSizePreset;
  /** 0-based: drives which edge is the spine. */
  pageIndex: number;
  /** How many photos the album has (a fill past the end draws nothing). */
  photoCount: number;
  /** Binding allowance, inches (default: the editor's 3/8"). */
  bindingIn?: number;
  /** The FRONT COVER page, as the website's cover wrap draws it (print's
   *  coverMode): no spine keep-out, a caption moved by its own nudge
   *  (offsetX / offsetY), and every word on the cover's floating shadow
   *  (wordArtShadow onCover). */
  cover?: boolean;
}

const DEFAULT_PAPER = '#FFFBF7';
/** 1 design px of frame → print px: the print renderer's own factor. */
export const FRAME_PX = PRINT_FRAME_PX;

function backgroundOf(page: AlbumPage, W: number, H: number, notDrawn: string[]): { fill: Fill; wash: string | null } {
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
    case 'image':
      notDrawn.push('photo or picture background');
      break;
    case 'texture':
      // The website tiles the texture at its opacity and adds no wash.
      notDrawn.push('texture background');
      return { fill, wash: null };
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
export function planPage({ page, albumSize, pageIndex, photoCount, bindingIn, cover = false }: PlanInput): PagePlan {
  const { width: W, height: H } = getPrintDimensions(albumSize);
  const { width: uiW, height: uiH } = getCanvasDimensions(albumSize);
  const scale = W / uiW;
  const notDrawn: string[] = [];
  const items: PlanItem[] = [];
  const { fill, wash } = backgroundOf(page, W, H, notDrawn);

  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const adapted = template ? adaptTemplateToOrientation(template, W, H) : null;
  const m = adapted ? marginForTemplate(adapted, adapted.margin, albumSize, pageIndex, { noBinding: cover, bindingIn }) : null;
  const safe = m ? { x: W * m.left, y: H * m.top, w: W * (1 - m.left - m.right), h: H * (1 - m.top - m.bottom) } : null;

  // ── The template's slots ──
  if (adapted && safe && (page.slotFills || page.qrFills || page.slotTexts || page.ornamentFills)) {
    const fills = dedupeSlotFills(page.slotFills ?? []);
    for (let i = 0; i < adapted.slots.length; i++) {
      const rawMask = page.slotMasks?.[i];
      const slot = applyMask(resolveSlotBox(adapted.slots[i], page.slotGeometries?.[i]), isMaskId(rawMask) ? rawMask : null);
      const box = { x: safe.x + slot.x * safe.w, y: safe.y + slot.y * safe.h, w: slot.width * safe.w, h: slot.height * safe.h };
      if (page.qrFills?.[i]) { notDrawn.push(`QR code (slot ${i + 1})`); continue; }
      if (page.ornamentFills?.[i]) { notDrawn.push(`graphic (slot ${i + 1})`); continue; }
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
      if (slot.feather) notDrawn.push(`soft edge (slot ${i + 1})`);
      if (slot.texture) notDrawn.push(`textured edge ${slot.texture} (slot ${i + 1})`);
      if (page.slotLooks?.[i]) notDrawn.push(`colour look ${page.slotLooks[i]} (slot ${i + 1})`);
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
      });
    }
  }

  if (page.cornerBase) notDrawn.push('corner art');
  if ((page.stickers ?? []).some((k) => !!k.geom)) notDrawn.push('stickers');

  // ── The words ──
  for (const text of page.textElements || []) {
    const fontSize = (text.fontSize || 24) * scale;
    noteFont(text, notDrawn);
    const ts = text.boxIndex != null && adapted && safe ? adapted.textSlots?.[text.boxIndex] : undefined;
    if (ts && safe) {
      // COVER: the caption's own nudge off its box, as page fractions.
      const offX = cover ? (text.offsetX ?? 0) * W : 0;
      const offY = cover ? (text.offsetY ?? 0) * H : 0;
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
      if (page.textSlotQr?.[j]) { notDrawn.push(`QR code (caption box ${j + 1})`); continue; }
      if (page.textSlotOrnament?.[j]) { notDrawn.push(`graphic (caption box ${j + 1})`); continue; }
      if ((page.textElements || []).some((t) => t.boxIndex === j)) continue;
      const photoIndex = page.textSlotFills?.[j] ?? null;
      if (photoIndex == null || photoIndex < 0 || photoIndex >= photoCount) continue;
      const ts = textSlots[j];
      items.push({ kind: 'boxPhoto', boxIndex: j, photoIndex, box: { x: safe.x + ts.x * safe.w, y: safe.y + ts.y * safe.h, w: ts.width * safe.w, h: ts.height * safe.h } });
    }
  }

  return {
    albumSize, width: W, height: H, bleed: bleedPx(PRINT_DPI), designWidth: uiW, designHeight: uiH,
    background: fill, wash, items, notDrawn, onCover: cover,
  };
}
