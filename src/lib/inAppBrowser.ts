/* ══════════════════════════════════════════════════════════════════════════
   Is this page open inside another app's built-in browser (Messenger,
   Facebook, Instagram…)? Google refuses to sign anyone in there ("Error 403:
   disallowed_useragent"), so the sign-in box says so and offers Chrome instead
   of a Google button that can only end on Google's error page (tester
   feedback 2026-10-26: "login using Gmail is not working"; links get shared
   and opened in Messenger).

   Our own Android app is a WebView too, but it signs in to Google through a
   Chrome tab (nativeAuth.ts); callers check isNativeShell() first.
   ══════════════════════════════════════════════════════════════════════════ */

/** First match wins: Messenger's browser also says FBAV. */
const IN_APP: [RegExp, string][] = [
  [/FB_IAB\/MESSENGER|\bMessenger(?:ForiOS)?\b/, 'Messenger'],
  [/\b(?:FBAN|FBAV|FB_IAB)\b/, 'Facebook'],
  [/Instagram/, 'Instagram'],
  [/Barcelona/, 'Threads'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/\bLine\//, 'LINE'],
  // Some other app's built-in browser on Android.
  [/; wv\)/, ''],
];

/** The app whose built-in browser this is ('' = some app), or null for a
 *  real browser (Chrome, Safari, Samsung Internet…). */
export function inAppBrowserName(ua: string): string | null {
  for (const [re, name] of IN_APP) if (re.test(ua)) return name;
  return null;
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/** A link that opens `href` in Chrome on Android (falling back to the same
 *  page if Chrome isn't there). The #route can't ride in an intent:// link,
 *  so it opens on the page's path; sign-in works from any page. */
export function openInChromeHref(href: string): string {
  const u = new URL(href);
  const page = `${u.origin}${u.pathname}${u.search}`;
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(page)};end`;
}

/** Words for the sign-in box. */
export function inAppSignInText(app: string): string {
  const where = app ? `inside ${app}` : 'inside this app';
  return `Google sign-in doesn't work ${where}. Open this page in Chrome to use Google, or sign in with your email.`;
}
