/* "Write a line for this photo" asked a signed-out customer to sign in. The
   website keeps its picker open and carries on by itself once they are in
   (once). The app's sign-in is a screen of its own, so the picker closes,
   remembers the box here, and the editor opens it again on that box, writing
   at once, when the customer comes back signed in (ResumeQuote, a banner
   with nothing to show, in index.ts). Coming back still signed out, or on
   another page, does nothing; the wish is kept for a few minutes only. */
import type { WordsTarget } from './wordsFlow';

const KEEP_MS = 10 * 60 * 1000;

let wish: { pageIndex: number; target: WordsTarget; at: number } | null = null;

export function askToResume(w: { pageIndex: number; target: WordsTarget }, now = Date.now()): void {
  wish = { ...w, at: now };
}

/** The box to open the picker on again, once (null: nothing waiting here). */
export function takeResume(pageIndex: number, signedIn: boolean, now = Date.now()): WordsTarget | null {
  if (!wish) return null;
  if (now - wish.at > KEEP_MS) { wish = null; return null; }
  if (!signedIn || wish.pageIndex !== pageIndex) return null;
  const t = wish.target;
  wish = null;
  return t;
}

/** Tests only. */
export function forgetResume(): void {
  wish = null;
}
