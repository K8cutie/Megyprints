/* ══════════════════════════════════════════════════════════════════════════
   SIGN IN WITH APPLE (iPhone only).

   Apple's App Review rule 4.8: an app that offers a sign-in like Google's
   must offer one that keeps the email private, and Sign in with Apple is it.
   It makes or opens a Megy Prints account the same way Google does: Apple's
   own sheet (expo-apple-authentication) gives an identity token, and
   Supabase signs in with it (signInWithIdToken). A one-time code guards it:
   Apple is given its SHA-256, Supabase the code itself, and Supabase checks
   they match, so a token taken from elsewhere can't sign anyone in.

   Before it works for customers (the owner's steps, docs/mobile-port-plan.md
   "iPhone"): Sign in with Apple switched on for the app's identifier in the
   Apple Developer account, and the Apple provider switched on in Supabase
   (Auth → Providers → Apple) with the app's bundle ids as its client ids.
   Until then Supabase refuses the token and the screen says it did not work.
   ══════════════════════════════════════════════════════════════════════════ */
import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Platform } from 'react-native';

/** What the screen says when it did not work (not when the person closed Apple's sheet). */
export const APPLE_DID_NOT_WORK = 'Sign in with Apple did not work. Try again, or sign in with your email and password.';

/** Apple's sheet closed without signing in (expo-apple-authentication). */
export const APPLE_CANCELLED = 'ERR_REQUEST_CANCELED';

/** Is Sign in with Apple offered here? iPhone only, when the phone has it. */
export async function appleSignInHere(isAvailable: () => Promise<boolean> = AppleAuthentication.isAvailableAsync): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await isAvailable();
  } catch {
    return false;
  }
}

interface IdTokenClient {
  auth: {
    signInWithIdToken(args: { provider: 'apple'; token: string; nonce: string }): Promise<{ error: { message: string } | null }>;
  };
}

export type AppleResult = { ok: true } | { ok: false; cancelled: true } | { ok: false; cancelled: false; error: string };

/** Apple's sheet, then Supabase. Never throws. */
export async function signInWithApple(o: {
  client: IdTokenClient;
  randomHex: () => string;
  sha256: (text: string) => Promise<string>;
  /** Apple's sheet with the hashed one-time code; its identity token. */
  ask: (hashedNonce: string) => Promise<{ identityToken: string | null }>;
}): Promise<AppleResult> {
  const nonce = o.randomHex();
  let token: string | null;
  try {
    token = (await o.ask(await o.sha256(nonce))).identityToken;
  } catch (e) {
    if ((e as { code?: unknown })?.code === APPLE_CANCELLED) return { ok: false, cancelled: true };
    return { ok: false, cancelled: false, error: APPLE_DID_NOT_WORK };
  }
  if (!token) return { ok: false, cancelled: false, error: APPLE_DID_NOT_WORK };
  try {
    const { error } = await o.client.auth.signInWithIdToken({ provider: 'apple', token, nonce });
    return error ? { ok: false, cancelled: false, error: APPLE_DID_NOT_WORK } : { ok: true };
  } catch {
    return { ok: false, cancelled: false, error: APPLE_DID_NOT_WORK };
  }
}

/** Apple's own sheet: name and email asked for, with the hashed one-time code. */
export const askApple = (hashedNonce: string) =>
  AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });

export const sha256Hex = (text: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
