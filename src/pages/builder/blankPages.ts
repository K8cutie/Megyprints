/* ══════════════════════════════════════════════════════════════════════════
   BLANK PAGES — say so at the end, and let the customer delete them (tester,
   2026-10-21: an album of 50 pages went down to 45 filled after photos were
   deleted and moved, and the other 5 stayed blank with no way to remove them).
   Owner: "it becomes a reminder at the end with an option to further edit the
   pages or delete them."

   THE 40-PAGE FLOOR stays (price, cover spine and print all count on it). An
   album of 42 pages with 4 blank can delete 2; the other 2 stay and the
   reminder says to add photos to them. At 40 pages nothing can be deleted.
   The pages that go are the LAST blank ones, so the pages before them keep
   their numbers.

   A page is blank when NOTHING on it prints: no photo (in a frame, in a box,
   placed freely, or as the background), no words, quote, graphic, sticker or
   video QR. A page colour, a texture or the theme's corners alone are blank.
   ══════════════════════════════════════════════════════════════════════════ */

import { MIN_ALBUM_PAGES } from './densities';
import type { AlbumPage, AlbumBackground } from './types';

const any = <T>(a: readonly (T | null | undefined)[] | undefined) => (a ?? []).some((x) => x != null);

/** A photo as the page's background (not a built-in gradient preset). */
function photoBackground(bg: AlbumBackground | undefined): boolean {
  if (bg?.type !== 'image') return false;
  if (bg.photoId || bg.localPhotoId) return true;
  return !!bg.image && !bg.image.includes('gradient(');
}

/** Nothing on this page prints. */
export function isBlankPage(page: AlbumPage): boolean {
  // Photo frames: a photo, a QR, words or a graphic in any of them.
  if (any(page.slotFills) || any(page.qrFills) || any(page.slotTexts) || any(page.ornamentFills)) return false;
  // Combo / caption boxes: a photo, QR or graphic in any of them.
  if (any(page.textSlotFills) || any(page.textSlotQr) || any(page.textSlotOrnament)) return false;
  // Any words, in a box or placed freely (even "Double-tap to edit": it prints).
  if ((page.textElements ?? []).some((t) => (t.text ?? '').trim())) return false;
  if ((page.photos?.length ?? 0) > 0 || (page.stickers?.length ?? 0) > 0) return false;
  return !photoBackground(page.background);
}

/** The blank pages, first to last (0-based). */
export function blankPageIndexes(pages: readonly AlbumPage[]): number[] {
  const out: number[] = [];
  pages.forEach((p, i) => { if (isBlankPage(p)) out.push(i); });
  return out;
}

export interface BlankPagePlan {
  /** Every blank page (0-based), first to last. */
  blank: number[];
  /** The ones that can be deleted without going under the floor: the last ones. */
  deletable: number[];
  /** Blank pages that must stay (the floor): fill them, or they print blank. */
  staying: number;
}

/** What "Delete the blank pages" would do to this album. */
export function blankPagePlan(pages: readonly AlbumPage[], floor: number = MIN_ALBUM_PAGES): BlankPagePlan {
  const blank = blankPageIndexes(pages);
  const room = Math.max(0, pages.length - floor);
  const take = Math.min(room, blank.length);
  const deletable = take > 0 ? blank.slice(blank.length - take) : [];
  return { blank, deletable, staying: blank.length - deletable.length };
}

const pagesWord = (n: number) => (n === 1 ? 'page' : 'pages');

/** The reminder's heading: "5 pages are blank". */
export function blankPagesTitle(count: number): string {
  return count === 1 ? '1 page is blank' : `${count} pages are blank`;
}

/** The reminder's sentence under the heading. */
export function blankPagesBody(plan: BlankPagePlan): string {
  const n = plan.blank.length;
  const d = plan.deletable.length;
  if (d === n) {
    return n === 1
      ? 'It prints as an empty page. Delete it, or add photos to it.'
      : 'They print as empty pages. Delete them, or add photos to them.';
  }
  if (d === 0) {
    return n === 1
      ? `Albums need at least ${MIN_ALBUM_PAGES} pages, so it can't be deleted. Add photos to it, or it prints blank.`
      : `Albums need at least ${MIN_ALBUM_PAGES} pages, so these can't be deleted. Add photos to them, or they print blank.`;
  }
  const s = plan.staying;
  return s === 1
    ? `Albums need at least ${MIN_ALBUM_PAGES} pages, so you can delete ${d}. Add photos to the other one, or it prints blank.`
    : `Albums need at least ${MIN_ALBUM_PAGES} pages, so you can delete ${d}. Add photos to the other ${s}, or they print blank.`;
}

/** "Delete 5 blank pages". */
export function deleteBlankLabel(count: number): string {
  return `Delete ${count} blank ${pagesWord(count)}`;
}

/** "Edit the blank pages". */
export function editBlankLabel(count: number): string {
  return count === 1 ? 'Edit the blank page' : 'Edit the blank pages';
}

/** The quiet way on for a customer who wants the blank pages printed. */
export function orderWithBlankLabel(count: number): string {
  return count === 1 ? 'Order with the blank page' : 'Order with blank pages';
}

/** Said after the delete: "Deleted 5 blank pages. Your album has 45 pages." */
export function deletedBlankNote(deleted: number, total: number): string {
  return `Deleted ${deleted} blank ${pagesWord(deleted)}. Your album has ${total} pages.`;
}
