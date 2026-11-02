/* The app's links, before Expo Router opens a screen for them: a Google
   sign-in coming back (megyprints://auth?… or the website's
   https://megyprints.vercel.app/auth-native.html#…, lib/googleSignIn.ts)
   opens the auth-return screen with its answer; every other link goes where
   it went. Never throws (a throw here could stop the app). */
import { parseAuthReturn } from '../lib/googleSignIn';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const p = parseAuthReturn(path);
    return p ? `/auth-return?${p.toString()}` : path;
  } catch {
    return path;
  }
}
