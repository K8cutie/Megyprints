/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW LOOKS LIKE A REAL BOOK (owner, 2026-11-03: "make the view look
   like a book effect with edges looking like pages and page flips looking
   realistic"; the drawing https://claude.ai/artifact/TF3673TheumrdrJ5YvkHb9).

   Around the pages (the room for it: previewLayout BOOK_DRESS_X / _Y):
     • the cover board under the book, a little past the pages, its shadow on
       the table;
     • the stack of page edges at each outer side: thin where few sheets are,
       thick where many are (the pages read on the left, those to come on
       the right), one fine line per few sheets; and the page edges under
       the pages;
     • one page at a time: the spine on its bound side (binding.ts: page 1,
       3, 5… are right-hand pages, bound on the left), its page edges on the
       other.
   Over the pages: each page darkens and catches a little light as it bends
   down into the spine, and a crease where the two pages meet.
   The closed book (the cover) is just the cover, with its shadow.

   Plain views and React Native's own linear-gradient backgrounds: no new
   library. Pictures only: a screen reader skips them.
   ══════════════════════════════════════════════════════════════════════════ */
import { View, type ViewStyle } from 'react-native';
import { bindingEdge } from '@web/pages/builder/binding';
import { BOARD, BOOK_DRESS_X, PAGE_EDGES_MAX, type BookShows } from './previewLayout';

export const BOOK_COLORS = {
  /** The cover board: a warm cloth brown (the drawing). */
  board: '#8A4B30',
  /** The page edges: paper and the fine line between sheets. */
  paper: '#FFFDF8',
  line: '#C9BBA6',
} as const;

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };

/** How thick the stack of page edges is (points) for `share` (0 to 1) of
 *  the book's pages on that side: never quite flat, PAGE_EDGES_MAX at most. */
export function edgeThickness(share: number): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0));
  return Math.round((1.5 + (PAGE_EDGES_MAX - 1.5) * s) * 2) / 2;
}

/** The fine lines in a stack that thick: one per 1.3 points, at least 2. */
export function edgeLines(thickness: number): number {
  return Math.max(2, Math.round(thickness / 1.3));
}

export interface BookSides {
  /** The stack of page edges at each outer side (points), or null: none there. */
  left: number | null;
  right: number | null;
  /** One page at a time: the side the spine is on. */
  spine: 'left' | 'right' | null;
}

/** What is beside the pages now. The open book (`start`: its left page's
 *  index, -1 for the inside of the front cover): the pages before it on the
 *  left, the pages after it on the right. One page: its bound side is the
 *  spine, its other side the pages beyond it. The closed book: nothing. */
export function bookSides(o: { shows: BookShows; index: number; start: number; total: number }): BookSides {
  const total = Math.max(1, o.total);
  if (o.shows === 'spread') {
    const read = o.start + 1;
    return { left: edgeThickness(read / total), right: edgeThickness((total - read - 1) / total), spine: null };
  }
  if (o.shows === 'page') {
    const spine = bindingEdge(o.index);
    return spine === 'left'
      ? { left: null, right: edgeThickness((total - o.index - 1) / total), spine }
      : { left: edgeThickness(o.index / total), right: null, spine };
  }
  return { left: null, right: null, spine: null };
}

/** A stack of page edges: paper with a fine line between the sheets. */
function Edges({ style, thickness, across, testID }: { style: ViewStyle; thickness: number; across: 'x' | 'y'; testID: string }) {
  const n = edgeLines(thickness);
  return (
    <View style={[{ position: 'absolute', backgroundColor: BOOK_COLORS.paper, overflow: 'hidden' }, style]} testID={testID}>
      {Array.from({ length: n }, (_x, k) => {
        const at = ((k + 0.5) * thickness) / n;
        return (
          <View key={k} style={across === 'x'
            ? { position: 'absolute', top: 0, bottom: 0, left: at, width: 0.8, backgroundColor: BOOK_COLORS.line }
            : { position: 'absolute', left: 0, right: 0, top: at, height: 0.8, backgroundColor: BOOK_COLORS.line }} />
        );
      })}
    </View>
  );
}

/** Under the pages (the first thing in the book, so the pages cover it): the
 *  cover board and the page edges. `W` × `H`: one page; `bookW`: the pages'
 *  width (one or two pages). */
export function BookUnder({ shows, W, H, sides }: { shows: BookShows; W: number; H: number; sides: BookSides }) {
  if (shows === 'closed') return null;
  const bookW = shows === 'spread' ? 2 * W : W;
  const under = 3;
  const left = sides.left ?? 0;
  const right = sides.right ?? 0;
  return (
    <View {...hidden} style={{ position: 'absolute', left: 0, top: 0, width: bookW, height: H }} testID="preview-book-under">
      <View testID="preview-board" style={{
        position: 'absolute', left: -BOOK_DRESS_X, top: -BOARD, width: bookW + 2 * BOOK_DRESS_X, height: H + under + 2 * BOARD,
        borderRadius: 5, backgroundColor: BOOK_COLORS.board,
        boxShadow: '0 14px 28px -6px rgba(70, 45, 25, 0.45), 0 4px 10px rgba(70, 45, 25, 0.22)',
      }} />
      {sides.spine && (
        // One page: the hinge of the cover on the spine side.
        <View testID={`preview-hinge-${sides.spine}`} style={{
          position: 'absolute', top: -BOARD, height: H + under + 2 * BOARD, width: BOOK_DRESS_X,
          left: sides.spine === 'left' ? -BOOK_DRESS_X : bookW,
          backgroundImage: `linear-gradient(${sides.spine === 'left' ? 90 : 270}deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.06) 100%)`,
        }} />
      )}
      {sides.left != null && <Edges testID="preview-edges-left" thickness={left} across="x" style={{ left: -left, top: 1, width: left, height: H, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 }} />}
      {sides.right != null && <Edges testID="preview-edges-right" thickness={right} across="x" style={{ left: bookW, top: 1, width: right, height: H, borderTopRightRadius: 2, borderBottomRightRadius: 2 }} />}
      <Edges testID="preview-edges-under" thickness={under} across="y" style={{ left: -left, top: H, width: bookW + left + right, height: under }} />
    </View>
  );
}

/** How far into a page the bend toward the spine shows. */
export const SPINE_SHADE = 0.28;
/** The bend: a little light where the page lifts, then darker into the spine. */
const BEND = 'rgba(0, 0, 0, 0) 0%, rgba(255, 255, 255, 0.18) 35%, rgba(90, 60, 35, 0.12) 72%, rgba(60, 38, 20, 0.32) 100%';

/** Over the pages: each bends down into the spine. */
export function SpineShade({ shows, W, H, sides }: { shows: BookShows; W: number; H: number; sides: BookSides }) {
  if (shows === 'closed') return null;
  const g = Math.round(W * SPINE_SHADE);
  const toward = (side: 'left' | 'right', x: number) => (
    <View key={side} style={{ position: 'absolute', top: 0, height: H, left: x, width: g, backgroundImage: `linear-gradient(${side === 'right' ? 90 : 270}deg, ${BEND})` }} />
  );
  return (
    <View {...hidden} style={{ position: 'absolute', left: 0, top: 0, width: shows === 'spread' ? 2 * W : W, height: H }} testID="preview-spine-shade">
      {shows === 'spread' && [
        toward('right', W - g),
        toward('left', W),
        <View key="crease" style={{ position: 'absolute', top: 0, height: H, left: W - 1.5, width: 3, backgroundImage: 'linear-gradient(90deg, rgba(50, 30, 15, 0) 0%, rgba(50, 30, 15, 0.38) 50%, rgba(50, 30, 15, 0) 100%)' }} />,
      ]}
      {shows === 'page' && sides.spine === 'left' && toward('left', 0)}
      {shows === 'page' && sides.spine === 'right' && toward('right', W - g)}
    </View>
  );
}

/* ── The page turn (preview.tsx TurnLayer) ───────────────────────────────── */

/** The leaf bending like paper: its spine side darker, light where it curves, its edge a touch darker. */
const LEAF_BEND = 'rgba(60, 38, 20, 0.28) 0%, rgba(0, 0, 0, 0) 22%, rgba(255, 255, 255, 0.22) 70%, rgba(0, 0, 0, 0.1) 100%';

export const TURN_LOOK = {
  /** The leaf's angle (0 lying right, -180 lying left), sampled for its free edge's place (W·cos). */
  angles: Array.from({ length: 13 }, (_x, k) => -180 + k * 15),
  /** How wide the shadow the leaf throws is, of a page. */
  band: 0.35,
  /** The leaf's front is hinged on its left; its back, once over, on its right. */
  leafFront: `linear-gradient(90deg, ${LEAF_BEND})`,
  leafBack: `linear-gradient(270deg, ${LEAF_BEND})`,
  /** The shadow beside the leaf's free edge: dark at the edge, fading away from the spine. */
  castRight: 'linear-gradient(90deg, rgba(40, 25, 15, 0.32) 0%, rgba(40, 25, 15, 0) 100%)',
  castLeft: 'linear-gradient(270deg, rgba(40, 25, 15, 0.32) 0%, rgba(40, 25, 15, 0) 100%)',
} as const;
