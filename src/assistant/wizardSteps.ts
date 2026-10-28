/* The steps of making an album, as Megy's guide names them. Moved here
   unchanged from wizard.ts so the 2.0 app's album builder (useBuilderState)
   can say which step it is on (src/shared/sharedModules.ts); wizard.ts
   re-exports it, so the website imports it from there as before.
   The step words and the made-album rules below moved here the same way
   (unchanged), so the app's Photos and Cover steps use the website's own
   words and rules instead of copies. */
import type { BuilderActions } from '../pages/builder/useBuilderState';
import { photosShortBy } from '../pages/builder/albumMinimum';

export type WizardStep =
  | 'welcome'
  | 'pick_theme'
  | 'pick_size'
  | 'design_cover'
  | 'upload_photos'
  | 'review_pages'
  | 'add_text'
  | 'finalize';

/** The photos step with a made album: the way on, and the choice to start the pages over. */
export const KEEP_PAGES = 'Keep my pages →';
export const REMAKE_ALBUM = 'Make the album again';
/** The photos step's way on once 40 photos are in: the cover comes next. */
export const TO_COVER = 'Next: pick your cover →';
/** The cover step's way on (CoverEditor's filled button), see coverStepNext. */
export const MAKE_ALBUM = 'Make my album →';
export const COVER_TO_PAGES = 'Continue to my pages →';
export const COVER_TO_PHOTOS = 'Next: add your photos →';

/** A REAL (non-empty) album exists (WizardEngine.hasBuiltAlbum). Exported so
 *  the cover editor's button and Megy's words read the album the same way. */
export function albumIsBuilt(pages: BuilderActions['albumPages']): boolean {
  return pages.length >= 40 && pages.some(
    (p) => (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0,
  );
}

/** Where the cover step's filled button goes. The cover comes after the
 *  photos, so it is where the album is made. An album already made goes back
 *  to its pages and is never made again by it (that would wipe the customer's
 *  edits and memories). Short of 40 photos (a journey saved before the photos
 *  came first, or photos left out since) it goes to the photos. */
export function coverStepNext(albumMade: boolean, photosIn: number): { label: string; go: 'pages' | 'photos' | 'make' } {
  if (albumMade) return { label: COVER_TO_PAGES, go: 'pages' };
  if (photosShortBy(photosIn) > 0) return { label: COVER_TO_PHOTOS, go: 'photos' };
  return { label: MAKE_ALBUM, go: 'make' };
}
