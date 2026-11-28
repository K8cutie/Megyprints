/* ══════════════════════════════════════════════════════════════════════════
   THE PRIVACY POLICY, THE TERMS OF SERVICE AND THE RETURN AND REFUND
   POLICY, WORD FOR WORD, IN ONE PLACE.

   The website shows them as pages (src/pages/Privacy.tsx, Terms.tsx,
   Refund.tsx through components/LegalPage.tsx) and the 2.0 app shows them as
   its own screens (mobile/src/app/privacy.tsx, terms.tsx, refund.tsx), both
   from these words (owner,
   2026-11-09: "i want for TOS and privacy to be part of the native app and
   not a redirect"). Change a word here and both change; there is no other
   copy. Shared with the app (src/shared/sharedModules.ts): plain data, no
   React, no browser.

   A page is sections; a section is a heading and blocks; a block is a
   paragraph or a bulleted list; a line is runs: plain words, bold words, or
   a link. A link names WHERE it goes (LegalLinkTo), not a web address: the
   website makes it a router link or a mailto, the app opens its own screen
   (Privacy, Terms, Your orders, My Memories) or the phone's email app.

   Privacy Policy written to match how Megyprints ACTUALLY handles data (the
   photos-are-local architecture). Terms: a tester (2026-10-31): "restrict it
   to adults only ... ensure your terms of service state that all users
   declare themselves to be of legal age"; plain words, every promise one
   the shop already keeps.
   ══════════════════════════════════════════════════════════════════════════ */

import { BUSINESS_ADDRESS, BRAND_NAME, COURTS_CITY, REGISTERED_BUSINESS } from './business';
import { LEGAL_CONTACT, MIN_AGE } from './legal';
import { UNPAID_ORDER_DAYS } from './orderExpiry';

/** Where a link in the words goes. */
export type LegalLinkTo =
  | 'email' // write to LEGAL_CONTACT
  | 'privacy' // the Privacy Policy
  | 'terms' // the Terms of Service
  | 'refund' // the Return and Refund Policy
  | 'orders' // Your orders
  | 'memories' // My Memories
  | 'contact' // the Contact page (the app's "Message us")
  | 'deletion-page'; // the website's account deletion page (public/delete-account.html)

/** A piece of a line. */
export type LegalRun = string | { bold: string } | { link: LegalLinkTo; text: string };

export type LegalBlock =
  | { kind: 'paragraph'; runs: LegalRun[]; testId?: string }
  | { kind: 'list'; items: LegalRun[][] };

export interface LegalSection { title: string; blocks: LegalBlock[] }

export interface LegalDocument {
  title: string;
  /** "Last updated: <updated>". */
  updated: string;
  sections: LegalSection[];
}

const b = (bold: string): LegalRun => ({ bold });
const link = (to: LegalLinkTo, text: string): LegalRun => ({ link: to, text });
const mail = link('email', LEGAL_CONTACT);
const p = (...runs: LegalRun[]): LegalBlock => ({ kind: 'paragraph', runs });
const pId = (testId: string, ...runs: LegalRun[]): LegalBlock => ({ kind: 'paragraph', runs, testId });
const list = (...items: LegalRun[][]): LegalBlock => ({ kind: 'list', items });
const section = (title: string, ...blocks: LegalBlock[]): LegalSection => ({ title, blocks });

/** Who sells (src/lib/business.ts): "Megyprints is a brand of Bridgemedia, a
 *  business registered in the Philippines" and, once the owner gives it, its
 *  address. PayMongo checks the pages match its documents. */
const WHO_SELLS = `${BRAND_NAME} is a brand of ${REGISTERED_BUSINESS}, a business registered in the Philippines`
  + (BUSINESS_ADDRESS ? `, at ${BUSINESS_ADDRESS}.` : '.');

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  updated: 'November 2026',
  sections: [
    section('Who we are',
      p('Megyprints is a photo-album design and printing service. This policy explains what information we collect when you use our app and website, how we use it, and the choices you have. Questions? Email us at ', mail, '.'),
      pId('privacy-who-sells', WHO_SELLS, ` "We" and "us" in this policy mean ${BRAND_NAME} and ${REGISTERED_BUSINESS}.`),
    ),
    section('Where your photos go',
      p('While you design an album, ', b('your photos are stored only on your own device'), ' (in your browser, or inside the Megy Prints app on your phone). They are ', b('not'), ' uploaded to our servers during design, with one exception that happens only when you ask for it:'),
      p('When you tap ', b('Write a line for this photo'), ", small copies of the photos on that page (at most 6, at 512 pixels) are sent through our server to Anthropic, the company that makes Claude AI, which writes caption lines for them. We don't save these copies. Anthropic does not use them to train its AI; it keeps them for a limited time for safety checks, then deletes them. You need to be signed in to use it, and to stop misuse we count how many times it is used each day (those counts are deleted after 30 days)."),
      pId('privacy-ml-kit', 'In the Megy Prints Android app (version 2.0 and later), ', b('Google ML Kit finds the faces in your photos on your phone'), ", to check your photos (for example, for closed eyes). Your photos are never sent anywhere for this. ML Kit does send Google basic diagnostics: your phone's make, model and Android version, the app's version, a random ID for this install of the app (not your name or number), and how long and how well it worked."),
      p('When you place an order, a print-ready file of your finished album — which includes the photos you placed — is generated on your device and uploaded to our secure, private storage so that we can print and ship it. Only our fulfillment team can access this file, and it is used solely to produce and deliver your album.'),
    ),
    section('Information we collect',
      list(
        [b('Account details'), ' — your email address (including if you sign in with Google), so you can save albums and manage your orders.'],
        [b('Order & delivery details'), ' — your name, contact number, and shipping address, used to deliver your album.'],
        [b('Living-memory QR links'), ' — if you attach a video to an album, we store that link so the printed QR code can open it. You can re-point or remove it anytime.'],
        [b('Basic technical data'), ' — anonymous error and performance diagnostics that help us keep the app working.'],
      ),
    ),
    section('How we use your information',
      list(
        ['To produce, print, and ship the albums you order.'],
        ['To create and manage your account and order history.'],
        ['To respond to your questions and provide support.'],
        ['To operate, secure, and improve the service.'],
      ),
      p('We do ', b('not'), ' sell your personal information or your photos.'),
    ),
    section('Service providers we rely on',
      p('We use a small number of trusted providers to run Megyprints:'),
      list(
        [b('Supabase'), ' — secure database, private file storage, and sign-in.'],
        [b('Vercel'), ' — hosting for the app and website.'],
        [b('Google'), ' — optional "Sign in with Google."'],
        [b('Google ML Kit'), ' — finds faces in your photos on your phone, in the Android app (2.0 and later). Your photos are never sent.'],
        [b('Anthropic'), " — Claude AI, which writes quote lines for your album's theme, and for a page's photos when you tap Write a line for this photo."],
      ),
      p('These providers process data only to provide their service to us.'),
    ),
    section('Payment',
      p('You pay by bank transfer: at checkout you scan our InstaPay QR code with your own bank or e-wallet app and send the amount shown. We do ', b('not'), ' collect or store your card or bank details in the app.'),
      p("You can attach a screenshot of your transfer receipt and its reference number. It's optional. We keep it in private storage, only to confirm your payment."),
    ),
    section('Deleting your account',
      p('You can delete your account and its data at any time, two ways:'),
      list(
        [b('In the app'), ' — ', b('My Profile → Delete my account'), '. It happens immediately.'],
        [b('By asking us'), ' — email ', mail, ', or use the ', link('deletion-page', 'account deletion page'), '. We complete it within 30 days.'],
      ),
      p('Deleting removes your sign-in and profile, every album and the photos in it, your QR memory links (printed codes stop working) and the videos you uploaded for them, the print files from your past orders, any payment receipt you attached, and the name, phone number and address on those orders.'),
      p(b('What we keep:'), " if you've ordered before, we keep a receipt-only record of that sale — order number, amount, status and dates, and the album's size, material and page count — because Philippine tax and accounting rules require a business to keep records of its sales. That record carries no name, phone number, address or photos, and is no longer linked to you."),
      p("One exception: if an order is paid but not yet delivered, we still need your delivery details to finish it, so the account can't be deleted until it arrives — or until you ask us to cancel the order."),
      p('Otherwise we keep your account and order information for as long as your account is active or as needed to fulfill and support your orders.'),
    ),
    section('Your rights',
      p('The Data Privacy Act of 2012 (Republic Act 10173) gives you these rights over your personal information:'),
      list(
        [b('To know'), ' what we collect, why, and who we share it with. This policy tells you.'],
        [b('To see it:'), ' ask us for a copy of the personal information we keep about you.'],
        [b('To correct it'), ' if it is wrong or out of date.'],
        [b('To have it deleted, or to stop us using it.'), ' Deleting your account (above) does this.'],
        [b('To be paid for harm'), ' caused by wrong use of your information.'],
        [b('To complain'), ' to the National Privacy Commission (privacy.gov.ph) if you think we handled your information wrongly.'],
      ),
      p('To use any of these rights, email ', mail, '. We may first ask you to show that the account is yours.'),
    ),
    section('Children',
      pId('privacy-age', `Megyprints is for people ${MIN_AGE} and older: you must be ${MIN_AGE} or older to make an account or place an order (see our `, link('terms', 'Terms of Service'), `). We don't knowingly collect personal information from anyone under ${MIN_AGE}. If you think a child has given us their information, email us at `, mail, " and we'll delete it."),
    ),
    section('Security',
      p('The app is served over HTTPS, order files live in private storage with access limited to our fulfillment team, and access is controlled at the database level. No method of storage is perfectly secure, but we take reasonable steps to protect your information.'),
    ),
    section('Changes to this policy',
      p('We may update this policy from time to time. When we do, we\'ll change the "Last updated" date above.'),
    ),
    section('Contact',
      p('For any privacy questions or requests, email ', mail, ' or reach us via the Contact page.'),
    ),
  ],
};

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of Service',
  updated: 'November 2026',
  sections: [
    section('About these terms',
      p('Megyprints designs and prints photo albums in the Philippines. These terms are the rules for using our app and website. By making an account or placing an order, you agree to them. Questions? Email us at ', mail, '.'),
      pId('terms-who-sells', WHO_SELLS),
    ),
    section(`You must be ${MIN_AGE} or older`,
      pId('terms-age', 'To make an account or place an order, you must be ', b(`${MIN_AGE} years old or older`), '. When you make an account or place an order, you confirm that you are.'),
    ),
    section('Your photos',
      p('Your photos stay yours. You let us use them only to make, print and deliver your album, and to play a QR memory video you add.'),
      p('Only use photos you took yourself or have permission to use. If a photo shows other people, make sure they are okay with it being printed.'),
    ),
    section("What we won't print",
      p("Don't add, and we won't print:"),
      list(
        [`sexual images of anyone under ${MIN_AGE}. We report these to the police.`],
        ['sexual or explicit pictures'],
        ['pictures that are illegal, hateful, or threaten someone'],
        ['private photos of someone, used without their permission'],
        ["other people's photos or artwork that you don't have the right to use"],
      ),
      p('We may cancel an order, or close an account, that breaks these rules.'),
    ),
    section('Ordering and paying',
      list(
        ['Prices are in Philippine pesos. You see the total before you order.'],
        ['You pay by InstaPay: scan our QR code with your bank or e-wallet app.'],
        ['We start printing after we confirm your payment.'],
        ['You can cancel an unpaid order yourself, in ', link('orders', 'Your orders'), `. An unpaid order closes by itself after ${UNPAID_ORDER_DAYS} days. Your album stays saved.`],
        ['We deliver to the address you give us in the Philippines.'],
      ),
      p(b('Check your album before you order.'), ' We print it the way you made it: the photos, how they are cropped, and every word and its spelling.'),
    ),
    section('If something is wrong',
      p("If your album arrives damaged, or it isn't the album you ordered, email ", mail, " with your order number. We print you a new album for free. If we can't, you can choose your money back. Our ", link('refund', 'Return and Refund Policy'), ' says how, and by when to tell us.'),
    ),
    section('QR memory videos',
      p('Anyone who scans the printed QR code can watch its video, so only add videos you are happy to share. The same rules as for photos apply. The video stays up for the number of years you choose when you order. You can change it or remove it at any time in ', link('memories', 'My Memories'), '.'),
    ),
    section('Words written by AI',
      p("Some lines in your album can be written by AI, like the line Megy writes for a photo. AI can get things wrong. Read every line before you order, and change any you don't like."),
    ),
    section('Your account',
      p('Keep your password to yourself. You are responsible for what is done with your account. You can delete your account at any time in ', b('My Profile'), '. Our ', link('privacy', 'Privacy Policy'), ' says what that deletes and what we must keep.'),
    ),
    section('Changes to these terms',
      p('We may update these terms. When we do, we change the "Last updated" date above. If you keep using Megyprints after that, the new terms apply.'),
    ),
    section('If we disagree',
      pId('terms-disputes', 'Tell us first. Email ', mail, " with your order number and what went wrong. We reply within a day, Monday to Saturday, and we'll try to fix it with you."),
      p("If we can't settle it together, you can file a complaint with the Department of Trade and Industry (DTI). The DTI helps buyers and sellers settle it through mediation."),
      p(COURTS_CITY
        ? `If it is still not settled, the case goes to the proper courts of ${COURTS_CITY}.`
        : 'If it is still not settled, the case goes to the proper courts of the Philippines.'),
    ),
    section('Law',
      p('These terms follow the laws of the Philippines.'),
    ),
    section('Contact',
      p('Email ', mail, ' or reach us through the ', link('contact', 'Contact page'), '.'),
    ),
  ],
};

/* The Return and Refund Policy (PayMongo asks for a "Return & Refund
   Policy" before it turns payments on, owner's handoff 2026-11-25). Built on
   what the shop already said (albums are made to order; a defect is printed
   again for free) and on Philippine law, checked 2026-11-25:
   - no refund for a change of mind (DTI: buyers are not entitled to one;
     owner: "There is no change of mind law in PH", "it will kill us");
   - a fault: the seller may fix it within 30 days (RA 7394 Art. 100); if not
     fixed, the BUYER chooses a replacement, the money back, or a lower price;
   - faults are covered at least 60 days after the sale (Art. 68(e)); a
     shorter limit has no legal effect (Art. 68(b)(6), Art. 106);
   - "no video, no refund" is illegal (DTI): photos are asked for, never
     required;
   - if the seller asks for the item back, the return costs the buyer
     nothing (Internet Transactions Act, RA 11967);
   - not delivered, cancelled by us, or paid too much: the money goes back.
   Not legal advice: a lawyer should read it before production. */

/** Days after delivery to tell us an album has a fault (the law's minimum
 *  cover for a fault in a new product: RA 7394 Art. 68(e)). */
export const FAULT_REPORT_DAYS = 60;
/** Days we have to send a good album once told of a fault (Art. 100). */
export const FIX_DAYS = 30;
/** Working days to send a refund once we agree to it (owner to confirm). */
export const REFUND_WORKING_DAYS = 7;

export const REFUND_POLICY: LegalDocument = {
  title: 'Return and Refund Policy',
  updated: 'November 2026',
  sections: [
    section('Albums are made to order',
      p("We print every album from the pages you made, just for you. So we can't cancel or refund an order because you changed your mind. But if we make a mistake, we make it right."),
      pId('refund-who-sells', WHO_SELLS),
    ),
    // Owner, 2026-11-25: "There is no change of mind law in PH": no
    // change-of-mind refund once an order is paid (the draft offered one
    // until printing started).
    section('Cancelling an order',
      list(
        ['An unpaid order: cancel it yourself in ', link('orders', 'Your orders'), '. You pay nothing.'],
        ["A paid order: we can't cancel it or refund it because you changed your mind."],
      ),
    ),
    section('If something is wrong with your album',
      p('We print you a new album for free, and send it to you for free, when:'),
      list(
        ['it arrives damaged (torn, bent, wet, or coming apart)'],
        ["it isn't the album you ordered (the wrong size, cover or pages, or someone else's album)"],
        ['a page is printed wrong by our mistake (missing, out of order, smudged or cut off)'],
        ['it comes apart with normal use (for example, the binding comes loose)'],
      ),
      pId('refund-fix-days', `We send the new album within ${FIX_DAYS} days after you tell us.`),
      pId('refund-when-refund', "If we can't, or the new album is wrong too, you choose: another new album, your money back, or a lower price."),
    ),
    section('When we refund you',
      list(
        ["Your album never arrives (for example, it is lost in delivery): we refund you in full, or send a new one if you'd rather."],
        ["We cancel your paid order (for example, if we can't print it): we refund you in full."],
        ['You paid more than your order total: we send back the extra.'],
        ["Your QR video stops playing before the years you paid for are over, because of a problem on our side: we fix it. If we can't, we refund the video years you didn't get."],
      ),
    ),
    section("What we can't refund",
      list(
        ['A change of mind, once you have paid.'],
        ['Something that was in the album you made: spelling and words, how photos are cropped, or photos that were blurry or small to begin with. We print the album the way you made it, so check every page before you order.'],
        ['Small colour differences between your screen and the paper. A screen gives off light and paper doesn\'t, so colours on paper can look a little different.'],
        ['Damage after delivery from water, sun or rough handling.'],
      ),
    ),
    section('How to tell us',
      list(
        [`Email `, mail, ` within ${FAULT_REPORT_DAYS} days after your album arrives. If it arrived damaged, please tell us as soon as you can.`],
        ['Write your order number and what is wrong.'],
        ['If you can, add photos of the problem, and of the box if it arrived damaged. Photos help us fix it faster, but they are not required.'],
      ),
      pId('refund-send-back', "You don't need to send the album back unless we ask. If we ask, we pay for the shipping. We reply within a day, Monday to Saturday."),
    ),
    section('How we pay you back',
      pId('refund-how-paid', `A refund for an album is everything you paid for it, shipping included. We send it by InstaPay to the bank or e-wallet account you tell us, within ${REFUND_WORKING_DAYS} working days after we agree to it. We pay the transfer fee.`),
    ),
    section('Your rights by law',
      p('This policy does not take away any right you have under the Consumer Act of the Philippines (Republic Act 7394). Our ', link('terms', 'Terms of Service'), ' say what happens if we disagree.'),
    ),
    section('Questions',
      p('Email ', mail, ' or reach us through the ', link('contact', 'Contact page'), '.'),
    ),
  ],
};

/** A line's words, without bold or links: what a reader hears. */
export function runsText(runs: LegalRun[]): string {
  return runs.map((r) => (typeof r === 'string' ? r : 'bold' in r ? r.bold : r.text)).join('');
}
