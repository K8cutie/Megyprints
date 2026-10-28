/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE PHOTOS PART DOES TO THE ALBUM: each a few lines on the website's
   own album builder (ctx.builder, the shared useBuilderState), called with
   the arguments the website's editor calls it with. No page object is ever
   changed here; the builder does it, so undo, saving and the account work as
   on the website. The sheets and buttons (index.ts and its .tsx files) only
   call these, and the tests call them the same way.
   ══════════════════════════════════════════════════════════════════════════ */
import type { PageTemplate } from '@web/pages/builder/types';
import { findPhotoSlot, placedPhotoPages, swapNotice } from '@web/pages/builder/slotSwap';
import { blankPagePlan, deletedBlankNote } from '@web/pages/builder/blankPages';
import { MIN_ALBUM_PAGES } from '@web/pages/builder/densities';
import { edgeGuardMessage, type MaskId } from '@web/pages/builder/maskShapes';
import type { LookId } from '@web/pages/builder/lookRules';
import { SOFT_MESSAGE } from '@web/pages/builder/slotGeometry';
import type { EditorContext } from '../registry';
import type { Target } from '../hitTest';
import { frameCell, softAt, type FramingChange } from './framing';
import { PAGE_ADDED, pageDeleted, pageTag, STUDIO_FIXED, THIS_PAGE } from './words';

/* ── "Add a photo" (MobileReview's sheet) ─────────────────────────────── */

/** What the "Add a photo" sheet fills: a photo frame (fillSlot) or a caption
 *  box (setTextSlotPhoto). */
export interface PickTarget { kind: 'slot' | 'box'; index: number }

/** Each album photo's tag in the sheet: "This page", "Page 3", or none (not
 *  placed). ONE PHOTO, ONE PLACE: picking a placed one brings it here. */
export function photoTags(ctx: Pick<EditorContext, 'builder' | 'pageIndex'>): (string | null)[] {
  const placedOn = placedPhotoPages(ctx.builder.albumPages);
  return ctx.builder.uploadedPhotos.map((_p, i) => {
    const on = placedOn.get(i);
    return on === undefined ? null : on === ctx.pageIndex ? THIS_PAGE : pageTag(on);
  });
}

/** A photo picked in the sheet, exactly as MobileReview places it: a frame
 *  takes it with fillSlot (a photo placed elsewhere swaps with this frame's,
 *  and the customer is told where it came from: swapNotice), a caption box
 *  with setTextSlotPhoto on this page. */
export function placePicked(ctx: EditorContext, target: PickTarget, photoIndex: number): void {
  const b = ctx.builder;
  if (target.kind === 'box') { b.setTextSlotPhoto(target.index, photoIndex, ctx.pageIndex); return; }
  const onPage = placedPhotoPages(b.albumPages).get(photoIndex);
  const wasEmpty = (ctx.page.slotFills?.[target.index] ?? null) === null;
  const notice = swapNotice(onPage === undefined ? null : { pageIndex: onPage, slotIndex: -1 }, ctx.pageIndex, wasEmpty);
  b.fillSlot(target.index, photoIndex);
  if (notice) ctx.say(notice);
}

/* ── Swap: "Swap photo", then a tap on the other frame ─────────────────── */

/** The photo waiting to be swapped, and the frame it was in when "Swap
 *  photo" was pressed. Kept while pages turn, so it can go to another page. */
export interface PendingSwap { photoIndex: number; pageIndex: number; slotIndex: number }

let pending: PendingSwap | null = null;
const swapListeners = new Set<() => void>();
const notify = () => swapListeners.forEach((l) => l());

export function pendingSwap(): PendingSwap | null {
  return pending;
}
export function onSwapChange(fn: () => void): () => void {
  swapListeners.add(fn);
  return () => { swapListeners.delete(fn); };
}
export function startSwap(target: Target, ctx: Pick<EditorContext, 'pageIndex'>): void {
  if (target.kind !== 'photo' || target.photoIndex == null) return;
  pending = { photoIndex: target.photoIndex, pageIndex: ctx.pageIndex, slotIndex: target.index };
  notify();
}
export function cancelSwap(): void {
  if (!pending) return;
  pending = null;
  notify();
}

/** The tap that ends a swap: on another photo or an empty frame, on this
 *  page or another, the waiting photo goes there with fillSlot, which swaps
 *  the two frames (framing travels with each photo) or, into an empty frame,
 *  moves it (slotSwap placePhoto, the website's ONE PHOTO, ONE PLACE). A tap
 *  on the photo itself calls it off. False: no swap waiting (or not a frame),
 *  so the tap goes on as usual. */
export function swapOnTap(target: Target, ctx: EditorContext): boolean {
  const p = pending;
  if (!p || (target.kind !== 'photo' && target.kind !== 'emptySlot')) return false;
  if (ctx.pageIndex === p.pageIndex && target.index === p.slotIndex) {
    cancelSwap();
    ctx.select(target);
    return true;
  }
  const from = findPhotoSlot(ctx.builder.albumPages, p.photoIndex);
  const notice = swapNotice(from, ctx.pageIndex, target.kind === 'emptySlot');
  cancelSwap();
  ctx.builder.fillSlot(target.index, p.photoIndex);
  ctx.select({ ...target, kind: 'photo', photoIndex: p.photoIndex });
  if (notice) ctx.say(notice);
  return true;
}

/* ── Move and zoom (framing.ts works them out) ─────────────────────────── */

/** Stores a move or a zoom with the website's setters (one undo step each),
 *  and says when a zoom makes the photo print soft (slotGeometry's line). */
export function storeFraming(ctx: EditorContext, slotIndex: number, changes: readonly FramingChange[]): void {
  for (const c of changes) {
    if (c.kind === 'offset') { ctx.builder.setSlotOffset(slotIndex, c.dx, c.dy); continue; }
    const cell = frameCell(ctx.page, slotIndex, ctx.builder.albumSize, ctx.pageIndex);
    const photoIndex = ctx.page.slotFills?.[slotIndex];
    const photo = photoIndex != null ? ctx.builder.uploadedPhotos[photoIndex] : undefined;
    const wasSoft = cell ? softAt(photo, cell, ctx.page.slotScales?.[slotIndex] ?? 1) : false;
    ctx.builder.setSlotScale(slotIndex, c.zoom);
    if (cell && !wasSoft && softAt(photo, cell, c.zoom)) ctx.say(SOFT_MESSAGE);
  }
}

/* ── Mask and Filter (StudioPhone's sheets) ────────────────────────────── */

/** MobileReview pickMask: the shape (none = the template's), and the edge's warning. */
export function pickMask(ctx: EditorContext, slotIndex: number, id: MaskId | 'none'): void {
  ctx.builder.setSlotMask(slotIndex, id === 'none' ? null : id);
  const warn = edgeGuardMessage(id);
  if (warn) ctx.say(warn);
}

/** MobileReview pickLook: a colour treatment (none = as shot). */
export function pickLook(ctx: EditorContext, slotIndex: number, id: LookId | 'none'): void {
  ctx.builder.setSlotLook(slotIndex, id === 'none' ? null : id);
}

/** MobileReview "Megy, fix this page": the page back to Megy's layout. */
export function fixStudioPage(ctx: EditorContext): void {
  ctx.builder.resetStudioPage();
  ctx.select(null);
  ctx.say(STUDIO_FIXED);
}

/* ── Change layout (LayoutPicker) ──────────────────────────────────────── */

/** The layouts offered for the page on screen: its own first ("✓ Current"),
 *  then every one that holds its photos within the crop budget, per frame
 *  (the builder's availableTemplatesForCurrentPage → layoutChoicesForPage). */
export function layoutChoices(ctx: EditorContext): PageTemplate[] {
  return ctx.builder.availableTemplatesForCurrentPage();
}

export interface LayoutAsk { t: PageTemplate; photos: number; captions: number }

/** LayoutPicker choose: a layout that takes nothing off the page is applied
 *  at once; one that would asks first (returned). */
export function chooseLayout(ctx: EditorContext, t: PageTemplate): LayoutAsk | null {
  const loses = ctx.builder.layoutChangeLoses(t.id);
  if (loses.photos === 0 && loses.captions === 0) {
    ctx.builder.applyPageLayout(t.id);
    ctx.select(null);
    return null;
  }
  return { t, ...loses };
}

/** LayoutPicker apply: after the question, photos the layout can't hold go
 *  on a new page after this one, or out of the album (kept in the photos). */
export function applyLayout(ctx: EditorContext, ask: LayoutAsk, leftover: 'new-page' | 'leave-out'): void {
  ctx.builder.applyPageLayout(ask.t.id, leftover);
  ctx.select(null);
}

/** How many photos a layout holds (QR corners are not photos). */
export const photosHeld = (t: PageTemplate) => t.slots.filter((s) => s.kind !== 'qr').length;

/* ── Pages ─────────────────────────────────────────────────────────────── */

/** A page can be deleted: the album keeps the 40-page floor. */
export const canDeletePage = (ctx: Pick<EditorContext, 'builder'>) => ctx.builder.albumPages.length > MIN_ALBUM_PAGES;

/** A new empty page after this one (addPage moves to it), as Megy's "add a page" does. */
export function addPageAfter(ctx: EditorContext): void {
  ctx.builder.addPage();
  ctx.select(null);
  ctx.say(PAGE_ADDED);
}

/** This page goes (deletePage: never under the 40-page floor), as Megy's "delete page". */
export function deleteThisPage(ctx: EditorContext): boolean {
  if (!canDeletePage(ctx)) return false;
  const i = ctx.pageIndex;
  ctx.builder.deletePage(i);
  ctx.select(null);
  ctx.say(pageDeleted(i));
  return true;
}

/* ── The blank pages reminder (blankPages.ts) ──────────────────────────── */

/** The album's blank pages: which, and which can go without going under 40. */
export const blankPlan = (ctx: Pick<EditorContext, 'builder'>) => blankPagePlan(ctx.builder.albumPages);

/** "Delete 5 blank pages": the last blank ones, in one undo step (deletePages),
 *  and the website's line after. Returns how many went. */
export function deleteBlankPages(ctx: EditorContext): number {
  const plan = blankPlan(ctx);
  const total = ctx.builder.albumPages.length;
  const n = ctx.builder.deletePages(plan.deletable);
  if (n > 0) {
    ctx.select(null);
    ctx.say(deletedBlankNote(n, total - n));
  }
  return n;
}

/** "Edit the blank pages": the next blank page after this one (the first
 *  again after the last); null when this page is the only blank one (the
 *  button is not shown then: it would go nowhere). */
export function nextBlankPage(ctx: Pick<EditorContext, 'builder' | 'pageIndex'>): number | null {
  const blank = blankPlan(ctx).blank;
  const next = blank.find((i) => i > ctx.pageIndex) ?? blank[0];
  return next == null || next === ctx.pageIndex ? null : next;
}
