/* The "Edit pages" screen's words: the website's own for the same control
   (its files are .tsx with its icons, so they can't be shared as they are).
   test/editorWords.test.ts fails if one stops matching the website's source. */

/** BuilderPreview.tsx: the Preview's way into the editor. */
export const EDIT_PAGES = 'Edit pages';

/** MobileReview.tsx: the line over the page. */
export const pageLine = (index: number, total: number) => `Page ${index + 1} of ${total} · tap a photo to style it`;

/** PageTurnBar.tsx (phone): the page turn, in words both ways. */
export const PREVIOUS_PAGE = 'Previous page';
export const NEXT_PAGE = 'Next page';
export const DONE_PREVIEW = 'Done — Preview my album';
export const BACK_TO_PREVIEW = 'Back to preview';

/** MegyAssistant.tsx History: the album's undo, the website's buttons. */
export const UNDO = 'Undo';
export const REDO = 'Redo';

/** BuilderPreview.tsx EmptyChooserBox, chooserFit.ts CHOOSER_TITLE (shared):
 *  what an empty frame or caption box offers, and a dealt box's one invitation. */
export const SLOT_OPTIONS = ['Photo', 'Quote', 'Text'];
export const BOX_OPTIONS = ['Quote', 'Text'];
export const ROLL_LABELS = {
  quote: 'Let AI write a quote',
  text: 'Your words here',
} as const;

/** SlotChooser.tsx: the sheet an empty frame or box opens. */
export const ADD_TO_THIS_BOX = 'Add to this box';
export const CHOICE_WORDS = {
  photo: { label: 'Add Photo', desc: 'Place one of your photos here' },
  quote: { label: 'Add Quote', desc: 'Megy writes a line from the photos on this page' },
  text: { label: 'Your Text', desc: 'Type your own caption or title' },
} as const;

/** RemoveGraphicModal.tsx: a retired graphic or sticker, which can only come off. */
export const RETIRED_COPY = {
  graphic: {
    title: 'Graphic',
    body: 'Graphics have been replaced by themed quotes. This one still prints, but it can’t be swapped for another — remove it and the box is free for a quote, your own text, or a photo.',
  },
  sticker: {
    title: 'Sticker',
    body: 'Stickers are no longer offered. This one still prints where it is, but it can’t be swapped for another — remove it if you’d rather the page without it.',
  },
} as const;
export const KEEP_IT = 'Keep it';
export const REMOVE = 'Remove';

/** BuilderPreview.tsx PageView: the button on a photo in the phone editor. */
export const REMOVE_PHOTO = 'Remove photo';

/** Close a sheet (SlotChooser, RemoveGraphicModal: their × is "Close"). */
export const CLOSE = 'Close';

/* ── The app's own: what TalkBack says for each thing on the page (the
   website's page is made of elements a screen reader reads as they are;
   the app's page is one picture, so each thing on it gets a name). ── */
export const A11Y = {
  photo: (n: number) => `Photo ${n}`,
  boxPhoto: 'Photo in a caption box',
  words: (text: string) => `Words: ${text.trim() || 'empty'}`,
  emptySlot: (options: readonly string[]) => (options.length ? `Empty frame. Add: ${options.join(', ')}` : 'Empty frame'),
  emptyBox: (options: readonly string[]) => (options.length ? `Empty caption box. Add: ${options.join(', ')}` : 'Empty caption box'),
  qr: 'Video memory QR code',
  graphic: 'Graphic',
  sticker: 'Sticker',
} as const;
