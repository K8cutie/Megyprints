/* ══════════════════════════════════════════════════════════════════════════
   SIGN IN WITH GOOGLE IS ONLY IN THE PLAY APP.

   Google's answer comes back through the website's page
   (public/auth-native.js), which hands it only to the Play app's package
   (com.megyprints.app). The test app is another package
   (com.megyprints.app.dev): there Android would open the Play Store instead,
   and the sign-in would be lost (owner's test, 2026-11-02). So the test app
   shows no Google button, and says where it is and how to sign in here.
   ══════════════════════════════════════════════════════════════════════════ */
import { buildKind } from '../buildKind';

/** The Google button is offered (the Play app). */
export const googleSignInHere = (): boolean => buildKind() === 'play';

export const GOOGLE_IN_PLAY_APP_SHORT = 'Sign in with Google is in the Megy Prints app from the Play Store.';
export const GOOGLE_IN_PLAY_APP = `${GOOGLE_IN_PLAY_APP_SHORT} In this test app, sign in with your email and password. Signed up with Google and have no password? Tap "Forgot password?" to make one.`;
