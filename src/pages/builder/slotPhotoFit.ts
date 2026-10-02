import type { AlbumPage, AlbumSizePreset } from './types';
import { getTemplateById, adaptTemplateToOrientation } from './pageTemplates';
import { marginForTemplate } from './binding';
import { resolveSlotBox } from './slotGeometry';
import { getCanvasDimensions } from './layouts';

/* ══════════════════════════════════════════════════════════════════════════
   SLOT PHOTO FIT — the ONE cover-fit + pan a slot photo is drawn with.

   All three renderers draw from these numbers: the DOM preview (BuilderPreview
   PageView), the Fabric editor (useCanvasEngine) and print (printPipeline).
   The face auto-centre (useBuilderState) converts into them.

   • The photo is drawn at its COVER size (it fills the slot and the long axis
     overflows), times the user's zoom, centred on the slot, then moved by the
     pan. Panning slides the photo INSIDE that overflow.
   • The pan (page.slotOffsetsX/Y) is stored in DESIGN px — the editor canvas,
     getCanvasDimensions(albumSize). Each renderer multiplies it by its own px
     per design px (print W/uiW, the DOM preview singleW/uiW, Fabric 1).
   • A pan never uncovers the slot: it is held to the overflow (panRoom) when
     the photo is drawn, so a moved or resized frame, a new layout or a new
     album size can't open a gap beside a photo panned for its old box.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Size { w: number; h: number }
export interface Pan { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The user's zoom: a multiplier on the cover fit (absent or garbage = 1). */
export function slotZoom(zoom: unknown): number {
  return finite(zoom) && zoom > 0 ? zoom : 1;
}

/** The photo's drawn size: cover-fitted to the slot, times the zoom. */
export function coverSize(img: Size, slot: Size, zoom?: number): Size {
  const k = Math.max(slot.w / img.w, slot.h / img.h) * slotZoom(zoom);
  return { w: img.w * k, h: img.h * k };
}

/** How far the photo can slide each way before the slot shows its edge. */
export function panRoom(img: Size, slot: Size, zoom?: number): Pan {
  const { w, h } = coverSize(img, slot, zoom);
  return { x: Math.max(0, (w - slot.w) / 2), y: Math.max(0, (h - slot.h) / 2) };
}

const hold = (v: number, room: number) => (finite(v) ? Math.max(-room, Math.min(room, v)) : 0);

/** Where the photo is drawn, relative to the slot's top-left, in the
 *  renderer's own px (`pan` already converted to those px). */
export function slotPhotoRect(img: Size, slot: Size, zoom?: number, pan: Pan = { x: 0, y: 0 }): Rect {
  const { w, h } = coverSize(img, slot, zoom);
  const room = panRoom(img, slot, zoom);
  return { x: (slot.w - w) / 2 + hold(pan.x, room.x), y: (slot.h - h) / 2 + hold(pan.y, room.y), w, h };
}

/** The DOM preview's <img> (object-fit: cover) for a slot photo, in preview px
 *  relative to the slot's top-left. The box is the slot scaled by the zoom
 *  about its centre, so the browser cover-fits the DECODED photo into it at
 *  exactly coverSize(); the pan rides on object-position, held to the overflow
 *  in CSS — the same draw as print, without having to know the photo's size.
 *  (The old preview moved the BOX by the pan: at zoom 1 that slid the whole
 *  photo off one side and left an empty strip.) Exact for zoom ≥ 1, where the
 *  box contains the slot, so the slot's own clip is the only clip, as in print. */
export function slotPhotoDomBox(slot: Size, zoom: number | undefined, pan: Pan) {
  const z = slotZoom(zoom);
  const width = slot.w * z;
  const height = slot.h * z;
  // How far the zoomed box reaches past the slot on each side (0 at zoom 1).
  const reach = { x: Math.max(0, (width - slot.w) / 2), y: Math.max(0, (height - slot.h) / 2) };
  return {
    left: (slot.w - width) / 2,
    top: (slot.h - height) / 2,
    width,
    height,
    objectPosition: `${cssPanAxis(pan.x, reach.x)} ${cssPanAxis(pan.y, reach.y)}`,
  };
}

/** One object-position axis: centred, moved by the pan, held so the photo
 *  still covers the SLOT. A percentage here resolves against (box − photo),
 *  which object-fit: cover keeps ≤ 0, so the photo's edge stops are 100% and
 *  0% — moved out by `reach`, the part of the zoomed box past the slot. */
function cssPanAxis(px: number, reach: number): string {
  const v = finite(px) ? Math.round(px * 1000) / 1000 : 0;
  if (v === 0) return '50%';
  const d = Math.floor(reach * 1000) / 1000; // down: a stop a hair tight, never a hair of gap
  return `clamp(calc(100% - ${d}px), calc(50% ${v < 0 ? '-' : '+'} ${Math.abs(v)}px), ${d}px)`;
}

/* ── Face auto-centre ─────────────────────────────────────────────────────── */

/** Where a face sits in the pan room: −1…+1 per axis, the share of the room
 *  the photo has to slide to centre it. −1 = the face is at the left/top, so the
 *  photo moves RIGHT/DOWN to show it; 0 = no pan.

    @param faceCenter  — {x, y} from detectFaceCenter (0-1, relative to photo)
    @param photoAspect — photo width / height
    @param slotAspect  — slot width / height
    @param zoom        — the slot's zoom (crops both axes when > 1)

    EDGE CASE: a face near the photo's edge can't be centred without showing
    that edge, so it is clamped into the SAFE ZONE first — the band of view
    centres that keep the photo covering the slot: [visible/2, 1 − visible/2].
    (This used to clamp to [0.5 − visible/2, 0.5 + visible/2] and divide by
    visible/2, which under-panned every face; the two agree only when exactly
    half the photo shows.) */
export function computeFaceOffset(
  faceCenter: { x: number; y: number },
  photoAspect: number,
  slotAspect: number,
  zoom?: number,
): { offsetX: number; offsetY: number } {
  if (!(photoAspect > 0 && slotAspect > 0 && Number.isFinite(photoAspect) && Number.isFinite(slotAspect))) {
    return { offsetX: 0, offsetY: 0 };
  }
  // Cover-fit: the share of the photo the slot shows on each axis (the long
  // axis is cropped), then the zoom crops both.
  const z = slotZoom(zoom);
  const visibleWidth = Math.min(1, (photoAspect > slotAspect ? slotAspect / photoAspect : 1) / z);
  const visibleHeight = Math.min(1, (photoAspect > slotAspect ? 1 : photoAspect / slotAspect) / z);
  return { offsetX: axisOffset(faceCenter.x, visibleWidth), offsetY: axisOffset(faceCenter.y, visibleHeight) };
}

function axisOffset(face: number, visible: number): number {
  const room = (1 - visible) / 2; // how far the view's centre can travel from 0.5
  if (!(room > 1e-9) || !finite(face)) return 0; // nothing cropped → nothing to pan
  const centre = Math.max(visible / 2, Math.min(1 - visible / 2, face));
  return (centre - 0.5) / room;
}

/** computeFaceOffset's −1…+1 → the DESIGN-px pan the renderers read:
 *  px = −offset × overflow / 2 on each axis. `slot` in design px. */
export function faceOffsetToPan(offset: { offsetX: number; offsetY: number }, img: Size, slot: Size, zoom?: number): Pan {
  const room = panRoom(img, slot, zoom);
  return { x: -offset.offsetX * room.x || 0, y: -offset.offsetY * room.y || 0 };
}

/** The DESIGN-px pan that centres a detected face in a slot — as far as the
 *  photo's overflow allows. `img` = the photo's natural size. */
export function faceCentrePan(face: { x: number; y: number }, img: Size, slot: Size, zoom?: number): Pan {
  if (!(img.w > 0 && img.h > 0 && slot.w > 0 && slot.h > 0)) return { x: 0, y: 0 };
  return faceOffsetToPan(computeFaceOffset(face, img.w / img.h, slot.w / slot.h, zoom), img, slot, zoom);
}

/** A photo slot's box in DESIGN px — the space the pan is stored in — placed
 *  exactly as the renderers place it: the orientation-adapted template, the
 *  margin plus binding keep-out (none on a cover panel), the Studio override. */
export function slotDesignSize(
  page: Pick<AlbumPage, 'templateId' | 'slotGeometries'>,
  slotIndex: number,
  albumSize: AlbumSizePreset,
  pageIndex: number,
  coverMode = false,
): Size | null {
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  if (!template) return null;
  const { width: W, height: H } = getCanvasDimensions(albumSize);
  const adapted = adaptTemplateToOrientation(template, W, H);
  const raw = adapted.slots[slotIndex];
  if (!raw) return null;
  const m = marginForTemplate(adapted, adapted.margin, albumSize, pageIndex, { noBinding: coverMode });
  const box = resolveSlotBox(raw, page.slotGeometries?.[slotIndex]);
  return { w: box.width * W * (1 - m.left - m.right), h: box.height * H * (1 - m.top - m.bottom) };
}
