/* The photos part's words: the website's own for the same control (its
   files are .tsx with its icons, so they can't be shared as they are), and,
   where the website's phone editor has no such control, plain words of the
   app's own (marked below). test/editorPhotosWords.test.ts fails if one of
   the website's stops matching its source. */
import { MIN_ALBUM_PAGES } from '@web/pages/builder/densities';

/** MobileReview.tsx: the tools in the bar under the page. */
export const ADD_PHOTOS = 'Add photos';
export const CHANGE_LAYOUT = 'Change layout';

/** MobileReview.tsx: the "Add a photo" sheet (an empty frame's "Add Photo",
 *  a caption box's photo), with every album photo tagged with its page. */
export const ADD_A_PHOTO = 'Add a photo';
export const UPLOAD_MORE = 'Upload more photos';
export const NO_PHOTOS_YET = 'No photos uploaded yet.';
export const THIS_PAGE = 'This page';
export const pageTag = (pageIndex: number) => `Page ${pageIndex + 1}`;

/** PropertiesPanel.tsx: the selected frame's "Replace photo". */
export const REPLACE_PHOTO = 'Replace photo';

/** StudioPhone.tsx: the pill on a tapped photo, and its two sheets. */
export const MASK = 'Mask';
export const FILTER = 'Filter';
export const ORIGINAL = 'Original';
export const MASK_HINT = 'Some edges reach into the photo — keep faces away from the edge.';

/** MobileReview.tsx: a page the customer changed, and Megy putting it back. */
export const STUDIO_YOURS = '✎ This page is yours';
export const STUDIO_FIX = 'Megy, fix this page';
export const STUDIO_FIXED = 'Back to Megy’s layout. Your photos stayed where they are in the album.';

/** LayoutPicker.tsx: "Change layout". */
export const LAYOUT_TITLE = 'Choose a layout';
export const LAYOUT_CURRENT = '✓ Current';
export const LAYOUT_NONE = 'No other layouts fit this page.';
export const LAYOUT_MEMORY_NOTE = 'This page has a video memory, so it stays one full photo with the QR in the corner. To use a layout with more photos, tap the QR and remove the video first.';

/** LayoutPicker.tsx LeftoverQuestion: a layout that can't hold every photo
 *  (or caption) on the page asks first where they go. */
export function leftoverWords(name: string, holds: number, photos: number, captions: number) {
  const them = photos === 1 ? 'it' : 'them';
  return {
    heading: `“${name}” holds ${holds} ${holds === 1 ? 'photo' : 'photos'}.`,
    photos: photos > 0
      ? `${photos === 1 ? 'One photo on this page doesn’t fit it.' : `${photos} photos on this page don’t fit it.`} Where should ${photos === 1 ? 'it' : 'they'} go?`
      : null,
    captions: captions > 0
      ? `It has no box for ${captions === 1 ? 'the caption' : 'the captions'} on this page, so ${captions === 1 ? 'it goes' : 'they go'} with the old layout.`
      : null,
    newPage: `Put ${them} on a new page after this one`,
    newPageDesc: 'The album gets one more page.',
    leaveOut: `Take ${them} out of the album`,
    leaveOutDesc: `${photos === 1 ? 'It stays' : 'They stay'} in your photos, ready to place again.`,
    apply: 'Use this layout',
    back: '‹ Choose another layout',
  };
}

/** actionEngine.ts (Megy's "add a page" / "delete page"): what is said after. */
export const PAGE_ADDED = 'A new page has been added after the current one.';
export const pageDeleted = (pageIndex: number) => `Page ${pageIndex + 1} deleted.`;

/** actionEngine.ts add_photos: the honest count after photos are added
 *  (the website's message, its parts joined with " · "). */
export function addedLine(r: { added: number; restored: number; skipped: number; unreadable: number }): string | null {
  const parts: string[] = [];
  const s = (n: number) => (n > 1 ? 's' : '');
  if (r.restored > 0) parts.push(`${r.restored} photo${s(r.restored)} put back in ${r.restored > 1 ? 'their places' : 'its place'}`);
  if (r.added > 0) parts.push(`${r.added} photo${s(r.added)} added`);
  if (r.skipped > 0) parts.push(`${r.skipped} already in your album`);
  // The app's own: a photo the phone can't open (the website names an iPhone file to save as JPG).
  if (r.unreadable > 0) parts.push(`${r.unreadable} photo${s(r.unreadable)} couldn't be opened on this phone`);
  return parts.length ? `${parts.join(' · ')}.` : null;
}

/* ── The app's own words: the website's phone editor has no such control ── */

/** Swapping a photo with another, on this page or another one (the website
 *  swaps when a photo placed elsewhere is picked: slotSwap.ts). */
export const SWAP_PHOTO = 'Swap photo';
export const SWAP_LINE = 'Now tap the photo to swap with. It can be on another page.';
export const CANCEL = 'Cancel';

/** The first taps on a photo: how to move and zoom it. */
export const MOVE_HINT = 'Drag the photo to move it in its frame. Pinch to zoom.';

/** Adding and deleting pages (the website does it through Megy's chat). */
export const PAGES_TOOL = 'Add or delete pages';
export const PAGES_TITLE = 'Pages';
export const ADD_PAGE = 'Add a page';
export const ADD_PAGE_DESC = 'A new page after this one. Then choose its layout.';
export const deletePageLabel = (pageIndex: number) => `Delete page ${pageIndex + 1}`;
export const DELETE_PAGE_DESC = 'Its photos stay in your photos, ready to place again.';
/** Said like blankPagesBody (blankPages.ts): the 40-page floor. */
export const CANT_DELETE_PAGE = `Albums need at least ${MIN_ALBUM_PAGES} pages, so a page can't be deleted.`;
