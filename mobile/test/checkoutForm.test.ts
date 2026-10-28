/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Place order on the phone must stop for exactly the things
   the website stops for, say it in the website's words, and tidy the name
   and phone the same way, or a phone customer gets an order the website
   would have refused (or is refused one it would have taken).

   The website's checks live inside its Order page (handleProceedToPayment,
   then the first lines of placeOrder), so this test cuts those two pieces
   out of src/pages/Order.tsx, runs them on Node with stand-ins for the
   screen (what they set, what they open), and requires the app's
   checkCheckout to come to the same answer for every mix of name, phone,
   address, cover, sign-in, an order already waiting, and too few photos.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import * as contact from '@web/lib/contact';
import { EMPTY_ADDRESS, type AddressValue } from '@web/lib/contact';
import * as albumMinimum from '@web/pages/builder/albumMinimum';
import type { AlbumPage } from '@web/pages/builder/types';
import { checkCheckout, COVER_PROBLEM, NAME_PROBLEM, PHONE_PROBLEM, phoneOnBlur, SIGN_IN_PROBLEM, type CheckoutCheck } from '../src/lib/checkout/checkoutForm';
import { fixtureCheckoutAlbum } from '../src/lib/checkout/fixtureAlbum';

const ORDER_SRC = readFileSync(path.resolve(__dirname, '../../src/pages/Order.tsx'), 'utf8');

function cut(from: string, to: string): string {
  const a = ORDER_SRC.indexOf(from);
  const b = ORDER_SRC.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`Order.tsx no longer has "${from}" … "${to}": update this test with the page`);
  return ORDER_SRC.slice(a, b);
}

/** The website's Form → Payment check, whole. */
const PROCEED = cut('const handleProceedToPayment = () => {', '\n  const placeSecondOrder');
/** The first lines of its placeOrder: an album short of 40 photos stops. */
const TOO_FEW = cut('    // Short of 40 photos: no order row, nothing uploaded.', '    // Photos not on this device');

interface Input {
  name: string; phone: string; address: AddressValue; coverFits: boolean; coverNote: string | null;
  signedIn: boolean; openOrderUnanswered: boolean; pages: AlbumPage[];
}

interface WebOutcome {
  errorMsg: string; errors: Record<string, string>; addressErrors: Record<string, string>;
  name: string; phone: string; openLogin: boolean; askSecond: boolean; placed: boolean; albumNotSaved: boolean;
}

/** Runs the website's two pieces with these inputs and writes down what they did. */
function websiteCheck(i: Input): WebOutcome {
  const out: WebOutcome = { errorMsg: '', errors: {}, addressErrors: {}, name: i.name, phone: i.phone, openLogin: false, askSecond: false, placed: false, albumNotSaved: false };
  const ref = { current: { scrollIntoView() {}, focus() {} } };
  const js = ts.transpileModule(`${PROCEED}\nconst placeOrder = () => {\n${TOO_FEW}\nplaced();\n};\nhandleProceedToPayment();`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope: Record<string, unknown> = {
    ...contact,
    ...albumMinimum,
    setErrorMsg: (m: string) => { out.errorMsg = m; },
    setErrors: (e: Record<string, string>) => { out.errors = e; },
    setAddressErrors: (e: Record<string, string>) => { out.addressErrors = e; },
    setName: (n: string) => { out.name = n; },
    setPhone: (p: string) => { out.phone = p; },
    setAskSecond: (v: boolean) => { out.askSecond = v; },
    setAlbumNotSaved: (v: boolean) => { out.albumNotSaved = v; },
    openLogin: () => { out.openLogin = true; },
    placed: () => { out.placed = true; },
    getPendingPrintJob: () => ({ pages: i.pages }),
    eventLink: null, eventDeal: null,
    coverFits: i.coverFits, coverNote: i.coverNote,
    createdOrderRef: { current: null },
    name: i.name, phone: i.phone, address: i.address,
    user: i.signedIn ? { id: 'user-1' } : null,
    openOrder: i.openOrderUnanswered ? { id: 'o1' } : null,
    secondOkRef: { current: false },
    nameRef: ref, phoneRef: ref, addressRef: ref,
    HTMLInputElement: class {},
  };
  const names = Object.keys(scope);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(...names, js)(...names.map((n) => scope[n]));
  return out;
}

/** The website's outcome and the app's answer agree. */
function expectSame(web: WebOutcome, app: CheckoutCheck) {
  if (app.ok) {
    expect(web.placed).toBe(true);
    expect(web.errorMsg).toBe('');
    expect(app.name).toBe(web.name);
    expect(app.phone).toBe(web.phone);
    return;
  }
  expect(web.placed && !web.errorMsg).toBe(false);
  switch (app.kind) {
    case 'fields':
      expect(app.errors).toEqual(web.errors);
      expect(app.addressErrors).toEqual(web.addressErrors);
      expect(web.errorMsg).toBe('');
      break;
    case 'askSecond':
      expect(web.askSecond).toBe(true);
      expect(app.name).toBe(web.name);
      expect(app.phone).toBe(web.phone);
      break;
    case 'message':
      expect(app.message).toBe(web.errorMsg);
      expect(!!app.signIn).toBe(web.openLogin);
      expect(!!app.openAlbum).toBe(web.albumNotSaved);
      if (app.name !== undefined) expect(app.name).toBe(web.name);
      if (app.phone !== undefined) expect(app.phone).toBe(web.phone);
      break;
  }
}

const QC: AddressValue = { regionCode: '13', regionName: 'National Capital Region (NCR)', provinceCode: 'NCR', provinceName: 'Metro Manila', cityCode: '1381300000', cityName: 'Quezon City', barangayCode: '1381300001', barangayName: 'Alicia', street: '123 Rizal St., Purok 2', zip: '1109' };
const fixture = fixtureCheckoutAlbum();
const shortAlbum = fixture.pages.slice(0, 6);

const names = ['Juan Dela Cruz', '  Juan   Dela  Cruz ', 'J', '', '12345', 'María Clara', 'A'.repeat(81)];
const phones = ['0917 123 4567', '+63 (917) 123-4567', '639171234567', '9171234567', '0817 123 4567', '1234', ''];
const addresses: [string, AddressValue][] = [
  ['complete', QC],
  ['nothing picked', { ...EMPTY_ADDRESS }],
  ['no barangay', { ...QC, barangayCode: '', barangayName: '' }],
  ['street of 120', { ...QC, street: `${'A'.repeat(110)} Street 12` }],
  ['street of 121 (said, never cut)', { ...QC, street: `${'A'.repeat(111)} Street 12` }],
  ['street with emoji, 120 as the database counts', { ...QC, street: `${'🌼'.repeat(5)}${'B'.repeat(115)}` }],
  ['street of punctuation only', { ...QC, street: '---' }],
  ['street too short', { ...QC, street: 'ab' }],
  ['ZIP of 3 digits', { ...QC, zip: '110' }],
];

describe("Place order stops where the website stops, in its words", () => {
  it('the website still checks with these pieces', () => {
    expect(PROCEED).toContain("newErrors.name = 'Please enter your full name.'");
    expect(PROCEED).toContain(NAME_PROBLEM);
    expect(PROCEED).toContain(PHONE_PROBLEM);
    expect(PROCEED).toContain(SIGN_IN_PROBLEM);
    expect(PROCEED).toContain(COVER_PROBLEM);
    expect(TOO_FEW).toContain('tooFewToOrderMessage(albumPhotoCount(handed.pages))');
  });

  let compared = 0;
  it('every name, phone and address: the same boxes said, the same tidying', () => {
    for (const name of names) for (const phone of phones) for (const [, address] of addresses) {
      const input: Input = { name, phone, address, coverFits: true, coverNote: null, signedIn: true, openOrderUnanswered: false, pages: fixture.pages };
      expectSame(websiteCheck(input), checkCheckout(input));
      compared++;
    }
  });

  const flags: [string, Partial<Input>][] = [
    ['not signed in', { signedIn: false }],
    ['an order already waiting for payment', { openOrderUnanswered: true }],
    ['a cover the press cannot make, with the note', { coverFits: false, coverNote: 'Hardbound does not fit our press for this size. Choose Softcover.' }],
    ['a cover the press cannot make, no note', { coverFits: false, coverNote: null }],
    ['an album short of 40 photos', { pages: shortAlbum }],
    ['not signed in AND short of photos (sign-in is said first)', { signedIn: false, pages: shortAlbum }],
    ['an order waiting AND short of photos (the question comes first)', { openOrderUnanswered: true, pages: shortAlbum }],
    ['not signed in AND an order waiting (sign-in is said first)', { signedIn: false, openOrderUnanswered: true }],
    ['a cover that does not fit AND not signed in (the cover is said first)', { coverFits: false, coverNote: null, signedIn: false }],
  ];
  it.each(flags)('%s', (_l, f) => {
    for (const name of ['Juan Dela Cruz', 'J']) for (const phone of ['0917 123 4567', '1234']) for (const [, address] of addresses.slice(0, 3)) {
      const input: Input = { name, phone, address, coverFits: true, coverNote: null, signedIn: true, openOrderUnanswered: false, pages: fixture.pages, ...f };
      expectSame(websiteCheck(input), checkCheckout(input));
      compared++;
    }
  });

  it('the street over 120 is said with its count, and nothing is cut', () => {
    const r = checkCheckout({ name: 'Juan Dela Cruz', phone: '09171234567', address: addresses[4][1], coverFits: true, coverNote: null, signedIn: true, openOrderUnanswered: false, pages: fixture.pages });
    expect(r).toMatchObject({ ok: false, kind: 'fields', addressErrors: { street: 'Too long: 121 of 120 characters. Shorten it so nothing gets cut.' } });
  });

  it('the test album has enough photos to order', () => {
    expect(albumMinimum.photosShortBy(albumMinimum.albumPhotoCount(fixture.pages))).toBe(0);
    expect(albumMinimum.photosShortBy(albumMinimum.albumPhotoCount(shortAlbum))).toBeGreaterThan(0);
  });

  afterAll(() => { if (compared) console.log(`checkout checks compared with the website's: ${compared}`); });
});

describe('the phone box tidies a number when you leave it, as the website does', () => {
  const blur = cut('onBlur={() => { const c = normalizePHPhone(phone); if (c) setPhone(formatPHPhoneDisplay(c)); }}', '\n');
  it.each(['0917 123 4567', '+63 917 1234567', '639171234567', '9171234567', '0917-123-4567', '1234', '', 'abc'])('%j', (typed) => {
    expect(blur).toContain('if (c) setPhone(formatPHPhoneDisplay(c))');
    const c = contact.normalizePHPhone(typed);
    expect(phoneOnBlur(typed)).toBe(c ? contact.formatPHPhoneDisplay(c) : typed);
  });
});
