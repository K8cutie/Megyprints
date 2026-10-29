/* The way to the phone's photos from the editor ("Add photos", "Upload more
   photos"): the app's own photo picker screen, and, on the way back, the new
   photos into the album (intake.ts; IntakeBanner.tsx does it when the editor
   is on top again). A sheet is closed before going: it would stay over the
   picker otherwise. */
import { router } from 'expo-router';
import { beginIntake, type Intake } from './intake';

export function pickFromPhone(reopen: Intake['reopen'] = null): void {
  beginIntake(reopen);
  router.push('/pick-photos');
}
