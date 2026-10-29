/* ══════════════════════════════════════════════════════════════════════════
   PHOTOS ADDED FROM THE PHONE WHILE EDITING (MobileReview's "Add photos" and
   the "Add a photo" sheet's "Upload more photos").

   The website opens the browser's file picker in place. The app has its own
   photo picker screen (src/app/pick-photos.tsx), which puts the picked photos
   on the Photos step's list (the draft) and comes back. When the editor is on
   top again, the photos picked since it was left go into the album builder:
   albumFlow.syncPhotos, the Photos step's own way in (the phone is asked
   whether each one opens; the same photo picked twice goes in once; a photo
   the album was missing on this phone goes back in its places), given only
   the new photos and nothing to take out: nothing the album has leaves it
   here, even an album opened from the account whose photos are not on the
   Photos step's list. Then the honest count is said (the website's words:
   words.ts addedLine), and the "Add a photo" sheet opens again if it was the
   way there. When any photo came in, the editor's Undo starts again from
   here (ctx.restartUndo): the website's undo steps hold the photo list as it
   was and adding photos saves no step, so an Undo past this point would
   take the photos out again.
   ══════════════════════════════════════════════════════════════════════════ */
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import type { InspectPhotos } from '../../builder/appPhotos';
import { syncPhotos } from '../../builder/albumFlow';
import type { DraftPhoto } from '../../lib/photoDraft';
import { addedLine } from './words';

/** A trip to the photo picker from the editor. */
export interface Intake {
  /** The Photos step's photos (keys) when the editor was left. */
  before: ReadonlySet<string> | null;
  /** The sheet to open again on the way back. */
  reopen: { id: string; params: unknown } | null;
}

let intake: Intake | null = null;

/** Called on the way to the picker. */
export function beginIntake(reopen: Intake['reopen'] = null): void {
  intake = { before: null, reopen };
}
/** The editor left the screen: the photos it knew then (once per trip). */
export function intakeLeaving(keys: () => ReadonlySet<string>): void {
  if (intake && !intake.before) intake = { ...intake, before: keys() };
}
/** The editor is on top again: the trip, once (null: no trip). */
export function takeIntake(): Intake | null {
  const t = intake;
  if (t && t.before) intake = null;
  return t && t.before ? t : null;
}
/** Tests: forget any trip. */
export function resetIntake(): void {
  intake = null;
}

type AddBuilder = Pick<BuilderActions, 'uploadedPhotos' | 'albumPages' | 'coverFront' | 'addPhotos'>;

/** Puts the photos picked on the trip into the builder (see the top of this
 *  file): the line to say (null: nothing new), and whether any photo came in
 *  (added, or put back in its places). */
export async function addPickedPhotos(builder: AddBuilder, draft: readonly DraftPhoto[], before: ReadonlySet<string>, inspect?: InspectPhotos): Promise<{ line: string | null; cameIn: boolean }> {
  const fresh = draft.filter((p) => !before.has(p.key));
  if (!fresh.length) return { line: null, cameIn: false };
  const nothingOut = { removePhoto: () => {}, leaveOutPhotos: () => {}, keepPhotos: () => {} };
  const r = await syncPhotos({
    uploadedPhotos: builder.uploadedPhotos, albumPages: builder.albumPages, coverFront: builder.coverFront,
    addPhotos: builder.addPhotos, ...nothingOut,
  }, fresh, inspect);
  return { line: addedLine(r), cameIn: r.added + r.restored > 0 };
}
