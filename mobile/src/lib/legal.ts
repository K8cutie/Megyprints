/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY AND THE TERMS OF SERVICE, FROM THE APP.

   Both are pages of the website (src/pages/Privacy.tsx, #218; src/pages/
   Terms.tsx, #233), opened in the browser, the way the website's footer and
   phone menu link them. Google Play's User Data policy wants the privacy
   policy linked in Play Console AND inside the app; 1.x had it because it
   shows the website's footer, so 2.0 links it itself (owner, 2026-11-03:
   "the privacy clause and all other applicable clauses pls add it to 2.0").

   The agree line is the website's TermsAgreeLine (src/components/
   TermsAgreeLine.tsx, #233), word for word: making an account or placing an
   order means you agree to the Terms and you're 18 or older (a tester,
   2026-10-31: "restrict it to adults only"). A line, not a checkbox.

   MIN_AGE is the website's own (src/lib/legal.ts, shared). The words are in
   the website's .tsx files (with its router links, so they can't be shared
   as they are): test/legalLinks.test.tsx holds them to those files.
   ══════════════════════════════════════════════════════════════════════════ */
import { MIN_AGE } from '@web/lib/legal';
import { sitePage } from './checkout/site';

export { MIN_AGE };

/** The website's link words (Footer.tsx and Navbar.tsx). */
export const PRIVACY_LABEL = 'Privacy Policy';
export const TERMS_LABEL = 'Terms of Service';

/** https://megyprints.vercel.app/#/privacy and #/terms. */
export const PRIVACY_PAGE = sitePage('privacy');
export const TERMS_PAGE = sitePage('terms');

/** The agree line around its link: "By placing an order you agree to our
 *  Terms of Service and confirm you're 18 or older." */
export function agreeWords(by: string): { before: string; link: string; after: string } {
  return { before: `By ${by} you agree to our `, link: TERMS_LABEL, after: ` and confirm you're ${MIN_AGE} or older.` };
}
