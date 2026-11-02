/* ══════════════════════════════════════════════════════════════════════════
   HOW BIG THE PREVIEW'S BOOK IS, upright and on its side (owner, 2026-11:
   "turning the phone shows the album spread full screen, and the upright
   book gets bigger"). Plain sums, no React Native: test/previewLayout.test.ts.

   Upright (the phone held normally): one page, the closed cover, or the open
   book on "See it as an open book", as wide as the screen (UPRIGHT_EDGE at
   each side) and at most as tall as fits with the line under it ("Page 3 of
   40") still on screen. On a phone the width is what limits it, nearly
   always: the page cannot be wider than the phone.

   On its side (src/lib/screenTurning.ts lets only the Preview turn): the open
   book (two facing pages, as they print) fills the screen inside the safe
   area: clear of the camera notch, the status bar and the navigation bar.
   Its two turn buttons go where they cost the book least: at the sides
   (a square or tall album: limited by the screen's height, the sides are
   free anyway) or under it (a wide album: limited by the width). The closed
   cover is one page of the same book, in the middle of the same place, so
   the book stays the same size when it opens.

   The page pictures are drawn at one size for both ways up
   (pagePictureWidth): turning the phone draws no page again.
   ══════════════════════════════════════════════════════════════════════════ */

/** The safe area's insets (react-native-safe-area-context), points. */
export interface Insets { top: number; right: number; bottom: number; left: number }
/** A box on the screen, points from the top left. */
export interface Box { x: number; y: number; w: number; h: number }
/** What the book shows: the closed front cover, one page, or the open book. */
export type BookShows = 'closed' | 'page' | 'spread';
/** One page of the book on screen, whole points. */
export interface PageSize { pageW: number; pageH: number }

/** The phone is on its side: its screen is wider than tall. */
export const isSideways = (screenW: number, screenH: number): boolean => screenW > screenH;

/** `across` pages side by side (1, or 2 for the open book), as big as fits in
 *  w × h, in the album's shape (`aspect` = page width / height). */
export function fitPages(w: number, h: number, aspect: number, across: 1 | 2): PageSize {
  const pageW = Math.max(1, Math.floor(Math.min(w / across, h * aspect)));
  return { pageW, pageH: Math.max(1, Math.floor(pageW / aspect)) };
}

// ── Upright ────────────────────────────────────────────────────────────────

/** Between the page and the screen's side, each side (was 16). */
export const UPRIGHT_EDGE = 4;
/** Kept above and below the book in the scrolling area: its top gap, and the
 *  line under it ("Page 3 of 40") with its gaps. */
export const UPRIGHT_ROOM = 44;
/** Before the scrolling area is measured (the first moment the screen shows):
 *  what the status bar, the header and the turn bar may take. */
export const UPRIGHT_CHROME_GUESS = 260;

/** The book upright. `viewH` = the height of the area between the header and
 *  the turn bar (measured on the phone). */
export function uprightBook(o: { screenW: number; viewH: number; aspect: number; shows: BookShows }): PageSize {
  const availW = o.screenW - 2 * UPRIGHT_EDGE;
  const availH = o.viewH - UPRIGHT_ROOM;
  return fitPages(availW, availH, o.aspect, o.shows === 'spread' ? 2 : 1);
}

// ── On its side ────────────────────────────────────────────────────────────

/** Between the safe area's edge and anything on it. */
export const SIDEWAYS_EDGE = 4;
/** A round turn button: as tall as the app's buttons (components/Button). */
export const TURN_BUTTON = 52;
/** The strip a turn button takes beside or under the book (the button and a gap). */
export const CONTROL_STRIP = 64;
/** The line with the count ("2-3 / 40"). */
export const COUNTER_H = 20;
/** "Edit pages" under the book (turn buttons below): wide enough for its words. */
export const EDIT_BELOW_W = 104;

export interface SidewaysBook extends PageSize {
  /** Where the turn buttons are: beside the book, or under it. */
  controls: 'sides' | 'below';
  /** The screen inside the safe area (and SIDEWAYS_EDGE). */
  safe: Box;
  /** The place for the book: the safe area less the buttons' strip. */
  room: Box;
  /** The open book: two facing pages, in the middle of the room. */
  spread: Box;
  /** The closed book (the front cover): one page, in the middle of the room. */
  closed: Box;
  /** The turn buttons and the count. */
  back: Box;
  forward: Box;
  counter: Box;
  /** "Edit pages" ("Edit cover" on the cover): the way into the editor,
   *  on its side too (owner's phone test, 2026-11-02). */
  edit: Box;
}

/** The book on its side. `screenW` × `screenH` is the whole screen (the app
 *  draws under the bars, edge to edge); `insets` are what the safe area keeps
 *  clear of. */
export function sidewaysBook(o: { screenW: number; screenH: number; insets: Insets; aspect: number }): SidewaysBook {
  const { insets, aspect } = o;
  const safe: Box = {
    x: insets.left + SIDEWAYS_EDGE,
    y: insets.top + SIDEWAYS_EDGE,
    w: Math.max(0, o.screenW - insets.left - insets.right - 2 * SIDEWAYS_EDGE),
    h: Math.max(0, o.screenH - insets.top - insets.bottom - 2 * SIDEWAYS_EDGE),
  };
  const sidesRoom: Box = { x: safe.x + CONTROL_STRIP, y: safe.y, w: Math.max(0, safe.w - 2 * CONTROL_STRIP), h: safe.h };
  const belowRoom: Box = { x: safe.x, y: safe.y, w: safe.w, h: Math.max(0, safe.h - CONTROL_STRIP) };
  const sides = fitPages(sidesRoom.w, sidesRoom.h, aspect, 2);
  const below = fitPages(belowRoom.w, belowRoom.h, aspect, 2);
  const controls = sides.pageW >= below.pageW ? 'sides' : 'below';
  const room = controls === 'sides' ? sidesRoom : belowRoom;
  const { pageW, pageH } = controls === 'sides' ? sides : below;

  const top = room.y + Math.floor((room.h - pageH) / 2);
  const spread: Box = { x: room.x + Math.floor((room.w - 2 * pageW) / 2), y: top, w: 2 * pageW, h: pageH };
  // Exactly over the open book's right page slid half a page left (the
  // opening turn's slide, planTurn's shift: the cover lands where it was).
  const closed: Box = { x: spread.x + pageW / 2, y: top, w: pageW, h: pageH };

  const btn = (x: number, y: number): Box => ({ x, y, w: TURN_BUTTON, h: TURN_BUTTON });
  if (controls === 'sides') {
    // At the screen's edges, where the thumbs are, halfway up.
    const y = safe.y + Math.floor((safe.h - TURN_BUTTON) / 2);
    return {
      pageW, pageH, controls, safe, room, spread, closed,
      back: btn(safe.x, y),
      forward: btn(safe.x + safe.w - TURN_BUTTON, y),
      // Top of the right-hand strip.
      counter: { x: safe.x + safe.w - CONTROL_STRIP, y: safe.y, w: CONTROL_STRIP, h: COUNTER_H },
      // Top of the left-hand strip, across from the count.
      edit: { x: safe.x, y: safe.y, w: CONTROL_STRIP - SIDEWAYS_EDGE, h: TURN_BUTTON },
    };
  }
  // In the bottom corners; between them "Edit pages", then the count.
  const y = safe.y + safe.h - TURN_BUTTON;
  const gap = SIDEWAYS_EDGE * 2;
  const editX = safe.x + TURN_BUTTON + gap;
  const counterX = editX + EDIT_BELOW_W + gap;
  return {
    pageW, pageH, controls, safe, room, spread, closed,
    back: btn(safe.x, y),
    forward: btn(safe.x + safe.w - TURN_BUTTON, y),
    counter: { x: counterX, y: y + Math.floor((TURN_BUTTON - COUNTER_H) / 2), w: Math.max(0, safe.x + safe.w - TURN_BUTTON - gap - counterX), h: COUNTER_H },
    edit: { x: editX, y, w: EDIT_BELOW_W, h: TURN_BUTTON },
  };
}

// ── The page pictures ──────────────────────────────────────────────────────

/** Widest a page picture is drawn (px): as before. */
export const PICTURE_MAX_PX = 1400;

/** The width (px) the page pictures are drawn at: the widest a page is shown
 *  either way up on this phone, in its pixels. The same number upright and
 *  turned, so turning the phone draws no page again (each picture is drawn
 *  once, kept in the cache under a name with its width). */
export function pagePictureWidth(o: { screenW: number; screenH: number; aspect: number; pixelRatio: number }): number {
  const short = Math.min(o.screenW, o.screenH);
  const long = Math.max(o.screenW, o.screenH);
  const upright = uprightBook({ screenW: short, viewH: long, aspect: o.aspect, shows: 'page' }).pageW;
  const turned = sidewaysBook({ screenW: long, screenH: short, insets: { top: 0, right: 0, bottom: 0, left: 0 }, aspect: o.aspect }).pageW;
  return Math.min(PICTURE_MAX_PX, Math.round(Math.max(upright, turned) * o.pixelRatio));
}
