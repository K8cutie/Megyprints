/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY AND THE TERMS OF SERVICE, IN THE APP.

   Two screens of the app's own (src/app/privacy.tsx, terms.tsx), drawn from
   the website's words (src/lib/legalPages.ts, shared: one copy, so the app
   and the website always say the same). Owner, 2026-11-09: "i want for TOS
   and privacy to be part of the native app and not a redirect". Until then
   both opened the website in the browser, and the website there offered
   "Install Megy Prints", a second Megy Prints (the website on the home
   screen) beside the app.

   Google Play's User Data policy wants the privacy policy linked in Play
   Console (the website's page, which stays) AND inside the app (owner,
   2026-11-03: "the privacy clause and all other applicable clauses pls add
   it to 2.0").

   The agree line is the website's TermsAgreeLine (src/components/
   TermsAgreeLine.tsx, #233), word for word: making an account or placing an
   order means you agree to the Terms and you're 18 or older (a tester,
   2026-10-31: "restrict it to adults only"). A line, not a checkbox.
   ══════════════════════════════════════════════════════════════════════════ */
import { LEGAL_CONTACT, MIN_AGE } from '@web/lib/legal';
import type { LegalLinkTo } from '@web/lib/legalPages';
import { siteFile, sitePage } from './checkout/site';

export { MIN_AGE };

/** The website's link words (Footer.tsx and Navbar.tsx). */
export const PRIVACY_LABEL = 'Privacy Policy';
export const TERMS_LABEL = 'Terms of Service';

/** The app's own screens. */
export const PRIVACY_SCREEN = '/privacy';
export const TERMS_SCREEN = '/terms';

/** The agree line around its link: "By placing an order you agree to our
 *  Terms of Service and confirm you're 18 or older." */
export function agreeWords(by: string): { before: string; link: string; after: string } {
  return { before: `By ${by} you agree to our `, link: TERMS_LABEL, after: ` and confirm you're ${MIN_AGE} or older.` };
}

/** Where a link in the words goes on the phone: a screen of the app, or an
 *  address the phone opens (the email app; the website's Contact page, as
 *  "Message us" opens it; the website's account deletion form, for people
 *  without the app). */
export type LegalTarget = { screen: string } | { url: string };

export function legalTarget(to: LegalLinkTo): LegalTarget {
  switch (to) {
    case 'privacy': return { screen: PRIVACY_SCREEN };
    case 'terms': return { screen: TERMS_SCREEN };
    case 'orders': return { screen: '/orders' };
    case 'memories': return { screen: '/memories' };
    case 'email': return { url: `mailto:${LEGAL_CONTACT}` };
    case 'contact': return { url: sitePage('contact') };
    case 'deletion-page': return { url: siteFile('delete-account.html') };
  }
}
