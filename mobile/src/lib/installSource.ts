/* ══════════════════════════════════════════════════════════════════════════
   WHICH POST AN ORDER CAME FROM, IN THE APP: the phone's part.

   Asks Google Play, once per install, which link the app was installed from,
   and keeps the post's tag on this phone for 30 days from the install. The
   rules (what a tag is, how Play's text is read) are orderSource.ts.

   Nothing here shows anything or can stop the app: a phone that can't ask
   Play, an install from no tagged link, and storage that fails all end the
   same, with no tag.
   ══════════════════════════════════════════════════════════════════════════ */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SOURCE_PATTERN, SOURCE_WINDOW_DAYS, sourceFromReferrer } from './orderSource';

/** Where this phone keeps the tag of the link the app was installed from. */
export const SOURCE_KEY = 'megy-order-source';
/** Set once Google Play has been asked, so it is asked once per install. */
export const SOURCE_ASKED_KEY = 'megy-order-source-asked';

const DAY_MS = 86_400_000;

interface StoredSource { tag: string; at: number }

/** What Google Play says about this install. */
export interface InstallFacts {
  /** Play's referrer text, e.g. "utm_source=facebook&utm_campaign=xmas-01". */
  referrer: string | null;
  /** When the app was installed (ms), when the phone says. */
  installedAt: number | null;
}

/** Google Play's answer for this install (Android only). The native half is
 *  loaded only here, when Play is really asked. */
async function askGooglePlay(): Promise<InstallFacts> {
  if (Platform.OS !== 'android') return { referrer: null, installedAt: null };
  const Application = await import('expo-application');
  const referrer = await Application.getInstallReferrerAsync();
  let installedAt: number | null = null;
  try { installedAt = (await Application.getInstallationTimeAsync()).getTime(); } catch { /* counted from now instead */ }
  return { referrer, installedAt };
}

/**
 * Ask Google Play which link this install came from, once, and keep the tag.
 * Run when the app opens. It never throws and never shows anything.
 * If Play can't be asked (no Play Store on the phone, a build put on by
 * hand), nothing is kept and it is asked again the next time the app opens.
 */
export async function captureInstallSource(
  ask: () => Promise<InstallFacts> = askGooglePlay,
  now: number = Date.now(),
): Promise<string | null> {
  try {
    if (await AsyncStorage.getItem(SOURCE_ASKED_KEY)) return null;
    const facts = await ask();
    await AsyncStorage.setItem(SOURCE_ASKED_KEY, String(now));
    const tag = sourceFromReferrer(facts.referrer);
    if (!tag) return null;
    // Counted from the install, not from today: an app installed long ago and
    // only now updated to a version that asks is not credited to an old post.
    const installedAt = facts.installedAt;
    const at = installedAt !== null && Number.isFinite(installedAt) && installedAt <= now ? installedAt : now;
    await AsyncStorage.setItem(SOURCE_KEY, JSON.stringify({ tag, at } satisfies StoredSource));
    return tag;
  } catch {
    return null;
  }
}

/** The kept tag while it still counts, else null (and forgotten). */
export async function storedOrderSource(now: number = Date.now()): Promise<string | null> {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(SOURCE_KEY)) ?? 'null') as StoredSource | null;
    if (!s || typeof s.tag !== 'string' || !SOURCE_PATTERN.test(s.tag) || !Number.isFinite(s.at)) return null;
    if (now - s.at > SOURCE_WINDOW_DAYS * DAY_MS) {
      await AsyncStorage.removeItem(SOURCE_KEY);
      return null;
    }
    return s.tag;
  } catch {
    return null;
  }
}
