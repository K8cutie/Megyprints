/* ══════════════════════════════════════════════════════════════════════════
   MOVING AND ZOOMING A PHOTO IN ITS FRAME (the photos part).

   A selected photo moves with one finger and zooms with two, in the ONE fit
   every renderer draws a frame's photo with (slotPhotoFit, shared): cover-
   fitted to the frame, times the zoom, centred, then moved by the pan, the
   pan held to the photo's overflow so a frame never shows its edge. The app's
   page renderer calls the same slotPhotoRect on the same numbers
   (src/render/drawPage.ts), so what the finger shows is what is drawn and
   printed.

   Kept the website's way, through its own album builder (ctx.builder):
     • the pan is stored in DESIGN px (getCanvasDimensions), added with
       setSlotOffset(slot, dx, dy) as the website's editors add it; here it is
       held to the overflow before it is stored, so a photo pushed past its
       edge moves back the moment the finger turns;
     • the zoom with setSlotScale(slot, zoom), kept between ZOOM_MIN (the
       cover fit: under 1 the photo would no longer cover its frame) and
       ZOOM_MAX (the website's own zoom slider's top, PropertiesPanel).
   One finger's move is one undo step, one pinch another: each is stored the
   moment that finger work ends (a second finger coming down ends a move, one
   lifting ends a pinch), so two steps are never saved from one album state
   (the website's pushSnapshot would save the same state twice, and the
   second Undo would change nothing).

   Everything here is plain arithmetic on the page, so it is tested without a
   phone (test/editorPhotosFraming.test.ts); FramingOverlay.tsx puts it on the
   finger.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { adaptTemplateToOrientation, getTemplateById } from '@web/pages/builder/pageTemplates';
import { marginForTemplate } from '@web/pages/builder/binding';
import { printSharpness, resolveSlotBox, type GuardContext, type SlotBox } from '@web/pages/builder/slotGeometry';
import { applyMask, isMaskId } from '@web/pages/builder/maskShapes';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { coverSize, panRoom, slotPhotoRect, slotZoom, type Pan, type Rect, type Size } from '@web/pages/builder/slotPhotoFit';

/** The cover fit: a photo always covers its frame. */
export const ZOOM_MIN = 1;
/** The website's zoom slider's top (PropertiesPanel "Zoom": max 10). */
export const ZOOM_MAX = 10;
/** A finger moving less than this (screen px) has tapped. */
export const TAP_SLOP = 10;

export const clampZoom = (z: number): number => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number.isFinite(z) ? z : ZOOM_MIN));

/** A photo frame on a page, as the page renderer places it (planPage). */
export interface FrameCell {
  /** The frame, page px (the renderer's print px): planPage's photo box. */
  box: Rect;
  /** The template's turn for the frame's photo (drawPage turns the photo, not the clip). */
  rotation: number;
  /** Page px per design px, each axis (planPage: the pan × W/uiW, × H/uiH). */
  k: { x: number; y: number };
  /** The frame as the print rules see it (safe-area fractions), and their context. */
  slot: SlotBox;
  guard: GuardContext;
}

/** Where frame `slotIndex` of `page` is drawn: the same steps, in the same
 *  order, as planPage (src/render/pagePlan.ts), every number from the shared
 *  album code. Null when the page has no such frame. */
export function frameCell(page: AlbumPage, slotIndex: number, albumSize: AlbumSizePreset, pageIndex: number, bindingIn?: number): FrameCell | null {
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  if (!template) return null;
  const { width: W, height: H } = getPrintDimensions(albumSize);
  const { width: uiW, height: uiH } = getCanvasDimensions(albumSize);
  const adapted = adaptTemplateToOrientation(template, W, H);
  const raw = adapted.slots[slotIndex];
  if (!raw) return null;
  const m = marginForTemplate(adapted, adapted.margin, albumSize, pageIndex, { bindingIn });
  const safe = { x: W * m.left, y: H * m.top, w: W * (1 - m.left - m.right), h: H * (1 - m.top - m.bottom) };
  const rawMask = page.slotMasks?.[slotIndex];
  const slot = applyMask(resolveSlotBox(raw, page.slotGeometries?.[slotIndex]), isMaskId(rawMask) ? rawMask : null);
  return {
    box: { x: safe.x + slot.x * safe.w, y: safe.y + slot.y * safe.h, w: slot.width * safe.w, h: slot.height * safe.h },
    rotation: slot.rotation ?? 0,
    k: { x: W / uiW, y: H / uiH },
    slot: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
    guard: { albumSize, pageIndex, template },
  };
}

/** A photo's framing: the zoom and the pan, the pan in page px. */
export interface Framing { zoom: number; pan: Pan }

/** The framing stored on the page for frame `slotIndex` (zoom as stored, pan in page px). */
export function storedFraming(page: AlbumPage, slotIndex: number, cell: FrameCell): Framing {
  return {
    zoom: slotZoom(page.slotScales?.[slotIndex]),
    pan: { x: (page.slotOffsetsX?.[slotIndex] ?? 0) * cell.k.x, y: (page.slotOffsetsY?.[slotIndex] ?? 0) * cell.k.y },
  };
}

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** The pan held to the photo's overflow at `zoom` (what slotPhotoRect draws). */
export function heldPan(img: Size, frame: Size, zoom: number, pan: Pan): Pan {
  const room = panRoom(img, frame, zoom);
  return {
    x: Math.max(-room.x, Math.min(room.x, finite(pan.x))),
    y: Math.max(-room.y, Math.min(room.y, finite(pan.y))),
  };
}

/** Where the photo is drawn in the frame, page px from the frame's corner:
 *  slotPhotoRect, the renderer's own call. */
export function photoRect(img: Size, cell: FrameCell, f: Framing): Rect {
  return slotPhotoRect(img, { w: cell.box.w, h: cell.box.h }, f.zoom, f.pan);
}

/** What the builder is asked to store: the website's own two setters. */
export type FramingChange =
  | { kind: 'offset'; dx: number; dy: number } // setSlotOffset(slot, dx, dy), design px
  | { kind: 'scale'; zoom: number }; // setSlotScale(slot, zoom)

export interface TouchPoint { x: number; y: number }

const EPS = 1e-6;

/** One gesture on a selected photo, from the first finger down to the last
 *  one up. Touches are screen px; `screenPerPage` is the page's scale on the
 *  screen. Each call returns what to store now (see the top of this file). */
export class FramingGesture {
  /** What the page holds (page px pan, as stored: may be past the overflow). */
  private stored: Framing;
  /** What the finger shows: the zoom, and the pan as drawn (held). */
  live: Framing;
  private mode: 'none' | 'pan' | 'pinch' = 'none';
  private start: TouchPoint = { x: 0, y: 0 };
  /** Where the finger was at the last step of a move (the photo follows step by step). */
  private prev: TouchPoint = { x: 0, y: 0 };
  private startDist = 0;
  private startZoom = 1;
  private panMoved = false;
  private pinched = false;
  /** The farthest any finger went from where it came down (screen px). */
  private travel = 0;
  private origin: TouchPoint | null = null;

  constructor(private img: Size, private cell: FrameCell, stored: Framing, private screenPerPage: number) {
    this.stored = { zoom: stored.zoom, pan: { ...stored.pan } };
    this.live = { zoom: stored.zoom, pan: heldPan(img, this.frame, stored.zoom, stored.pan) };
  }

  private get frame(): Size {
    return { w: this.cell.box.w, h: this.cell.box.h };
  }

  /** Nothing moved and no second finger: a tap. */
  get isTap(): boolean {
    return !this.pinched && this.travel < TAP_SLOP;
  }

  /** One finger only: how far it went from where it came down (screen px),
   *  for a swipe that could not move the photo (it turns the page then). */
  get oneFingerTravel(): { dx: number; dy: number } | null {
    if (this.pinched || this.twoFingers || !this.origin || !this.last) return null;
    return { dx: this.last.x - this.origin.x, dy: this.last.y - this.origin.y };
  }
  private twoFingers = false;
  private last: TouchPoint | null = null;

  /** The fingers on the screen now (first call: the first finger down). */
  touches(list: readonly TouchPoint[]): FramingChange[] {
    const out: FramingChange[] = [];
    if (!list.length) return out;
    if (!this.origin) this.origin = list[0];
    this.last = list[0];
    this.travel = Math.max(this.travel, Math.hypot(list[0].x - this.origin.x, list[0].y - this.origin.y));
    if (list.length >= 2) {
      this.twoFingers = true;
      const d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
      if (this.mode !== 'pinch') {
        out.push(...this.storePan());
        this.mode = 'pinch';
        this.startDist = d;
        this.startZoom = this.live.zoom;
      }
      if (this.startDist > 0 && d > 0) {
        const zoom = clampZoom(this.startZoom * (d / this.startDist));
        if (Math.abs(zoom - this.live.zoom) > EPS) this.pinched = true;
        // The pan stays as stored; drawn held to the new overflow, as the renderer will.
        this.live = { zoom, pan: heldPan(this.img, this.frame, zoom, this.stored.pan) };
      }
      return out;
    }
    const t = list[0];
    if (this.mode === 'pinch') out.push(...this.storeZoom());
    if (this.mode !== 'pan') {
      this.mode = 'pan';
      this.start = t;
      this.prev = t;
    }
    if (!this.panMoved && Math.hypot(t.x - this.start.x, t.y - this.start.y) >= TAP_SLOP) this.panMoved = true;
    if (this.panMoved) {
      // Step by step, held each time: pushed past the edge, the photo stops
      // there and comes back the moment the finger turns.
      const dx = (t.x - this.prev.x) / this.screenPerPage;
      const dy = (t.y - this.prev.y) / this.screenPerPage;
      this.live = { zoom: this.live.zoom, pan: heldPan(this.img, this.frame, this.live.zoom, { x: this.live.pan.x + dx, y: this.live.pan.y + dy }) };
      this.prev = t;
    }
    return out;
  }

  /** The last finger is up (or the gesture was taken away): store what is left. */
  end(): FramingChange[] {
    const out = this.mode === 'pan' ? this.storePan() : this.mode === 'pinch' ? this.storeZoom() : [];
    this.mode = 'none';
    return out;
  }

  private storePan(): FramingChange[] {
    if (!this.panMoved) return [];
    this.panMoved = false;
    const dx = (this.live.pan.x - this.stored.pan.x) / this.cell.k.x;
    const dy = (this.live.pan.y - this.stored.pan.y) / this.cell.k.y;
    if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return [];
    this.stored = { ...this.stored, pan: { ...this.live.pan } };
    return [{ kind: 'offset', dx, dy }];
  }

  private storeZoom(): FramingChange[] {
    if (!this.pinched || Math.abs(this.live.zoom - this.stored.zoom) < EPS) return [];
    this.stored = { ...this.stored, zoom: this.live.zoom };
    return [{ kind: 'scale', zoom: this.live.zoom }];
  }
}

/** Will this photo print soft at `zoom` in this frame? (slotGeometry's
 *  printSharpness: a zoom shows 1/zoom of the photo across the frame, as a
 *  frame `zoom` times bigger would.) */
export function softAt(photo: Pick<UploadedPhoto, 'width' | 'height'> | undefined, cell: FrameCell, zoom: number): boolean {
  const z = slotZoom(zoom);
  return printSharpness(photo, { ...cell.slot, width: cell.slot.width * z, height: cell.slot.height * z }, cell.guard) === 'soft';
}

/** The photo's cover size at zoom 1, page px (the preview draws it this big
 *  and scales it: the phone decodes the picture once, not at every zoom). */
export function baseSize(img: Size, cell: FrameCell): Size {
  return coverSize(img, { w: cell.box.w, h: cell.box.h }, 1);
}
