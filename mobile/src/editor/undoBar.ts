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

   Two things the website's history does that an Undo button must not show:
     • Photos added while editing are not a step (addPhotos saves none), but
       every step holds the photo list as it was, so an Undo past them would
       take them out of the album (and the photo picker then says they are
       already in it). When photos come in, the editor's Undo starts again
       there (restartHere): it can never step back past them. Redo steps
       made before they came in hold the old photo list too, so Redo is
       held back until the next edit clears them (redoShown).
     • Every cover change saves a step of the PAGES that changes nothing
       (setBoxText, setPageColor, setPageBackground push a snapshot whatever
       the scope; the snapshot has no cover), and a cover drag or the title
       makes many. A cover change ends the editor's Undo there too
       (coverChanged: the next time the editor is on top it starts afresh),
       so no Undo press lands on those empty steps. Any step that still
       changes nothing on the pages is stepped over (nothingChanged), up to
       the 20 the history holds, never past the start.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, UploadedPhoto } from '@web/pages/builder/types';

type Pages = readonly AlbumPage[];

export function undoShown(canUndo: boolean, pages: Pages, start: Pages): boolean {
  return canUndo && pages !== start;
}

/** Redo, held back after photos came in while the album still had Redo
 *  steps: those steps hold the photo list as it was before the photos too,
 *  so a Redo would take them out again. The album's next edit clears its
 *  Redo steps (pushSnapshot), and the hold goes with them. */
export function redoShown(canRedo: boolean, heldBack: boolean): boolean {
  return canRedo && !heldBack;
}

/** Changes whenever the cover is changed (coverChanged). A start kept from
 *  before a cover change is not used again. */
let coverEpoch = 0;
export function coverChanged(): void {
  coverEpoch++;
}
export function coverChanges(): number {
  return coverEpoch;
}

/** Where the editor left off: the start it had, the pages it was left on,
 *  and the cover changes up to then. */
export interface EditorVisit { start: Pages; leftOn: Pages; cover?: number }

/** The start of the editor's Undo when it opens on `pages`: the last visit's
 *  start when nothing changed the pages (or the cover) since it was left,
 *  else `pages`. */
export function startOnOpen(pages: Pages, last: EditorVisit | null): Pages {
  return last && last.leftOn === pages && (last.cover ?? coverEpoch) === coverEpoch ? last.start : pages;
}

/** An Undo or Redo step that changed nothing a customer sees on the pages
 *  (the same pages, or pages with the same content, and the same photos):
 *  the editor takes the next one too. */
export function nothingChanged(
  before: { pages: Pages; pagesJson: string; photos: readonly UploadedPhoto[] },
  now: { pages: Pages; photos: readonly UploadedPhoto[] },
): boolean {
  if (now.photos !== before.photos && now.photos.length !== before.photos.length) return false;
  return now.pages === before.pages || JSON.stringify(now.pages) === before.pagesJson;
}

/** The most steps one press of Undo or Redo takes (the website keeps 20). */
export const MOST_STEPS = 20;

/** The last visit, kept for the app's one album builder while the app runs
 *  (the screen unmounts when it is left). */
let lastVisit: EditorVisit | null = null;
export function rememberVisit(visit: EditorVisit | null): void {
  lastVisit = visit ? { cover: coverEpoch, ...visit } : null;
}
export function lastEditorVisit(): EditorVisit | null {
  return lastVisit;
}
