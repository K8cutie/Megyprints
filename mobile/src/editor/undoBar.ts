/* ══════════════════════════════════════════════════════════════════════════
   THE EDITOR'S UNDO AND REDO: the website's own history (useBuilderState
   pushSnapshot / undo / redo: 20 steps of the pages, the photos, the page
   open, the size; the cover is not in it), on two buttons.

   Where Undo stops: at the album as it was when the editor was first opened
   on it. The website's history also holds "Make my album" (generateAlbum
   saves a step), so an Undo right after making the album would take every
   page away (the album as it was before it was made). On the website that
   step is reached only from Megy's History panel or her chat ("undo"), never
   from the phone editor (MobileReview has no Undo). Here an Undo button
   could reach it, so it shows only while the pages differ from where the
   editor started. Undo itself is the builder's, step for step: going back
   to that point gives back the very pages the editor started on (the
   website's snapshot keeps them as they were, the same object), which is
   how it is told.

   Going to the Preview and coming back keeps the start: when the editor is
   opened again on exactly the pages it was left on, its Undo still walks
   back over what was done before. Anything that changed the pages in
   between (another album opened, the album made again) starts afresh, so
   Undo can never land on another album's pages or an album not made yet.
   Redo is shown whenever the builder has one.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage } from '@web/pages/builder/types';

type Pages = readonly AlbumPage[];

export function undoShown(canUndo: boolean, pages: Pages, start: Pages): boolean {
  return canUndo && pages !== start;
}

/** Where the editor left off: the start it had, and the pages it was left on. */
export interface EditorVisit { start: Pages; leftOn: Pages }

/** The start of the editor's Undo when it opens on `pages`: the last visit's
 *  start when nothing changed the pages since it was left, else `pages`. */
export function startOnOpen(pages: Pages, last: EditorVisit | null): Pages {
  return last && last.leftOn === pages ? last.start : pages;
}

/** The last visit, kept for the app's one album builder while the app runs
 *  (the screen unmounts when it is left). */
let lastVisit: EditorVisit | null = null;
export function rememberVisit(visit: EditorVisit | null): void {
  lastVisit = visit;
}
export function lastEditorVisit(): EditorVisit | null {
  return lastVisit;
}
