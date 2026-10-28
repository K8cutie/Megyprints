import { isNativeShell } from './nativeShell';
import { TESTING_PHASE } from './testingPhase';

/* Where a tester leaves feedback on Google Play (components/PlayFeedbackCard):
   the app's Play page, where "Private feedback to developer" is. Google has
   no link straight to the stars. */
export const PLAY_LISTING_URL = 'https://play.google.com/store/apps/details?id=com.megyprints.app';

/** In the Android app, while the testing switch is on (testingPhase). */
export function showPlayFeedback(inApp: boolean = isNativeShell(), switchOn: boolean = TESTING_PHASE): boolean {
  return inApp && switchOn;
}
