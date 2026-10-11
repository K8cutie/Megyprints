/* ══════════════════════════════════════════════════════════════════════════
   THE HOME PAGE'S CLAIMS — only what's true.

   The home page used to show three customer quotes ("Sarah M.", "Mr. Dela
   Cruz", "Jenny L.") with five stars and stock photos. They came in with the
   page templates on 2026-05-23, months before the first real payment
   (2026-09-12): placeholders shown as real customers. Same rule as Megy
   Travel: no made-up testimonials, names, ratings or counts. Only what the app
   really does.

   It also sold "6 handcrafted themes" and "Pick a Template". The builder is a
   guided wizard now (name & occasion first, unskippable), themes are gone, and
   the album is PRINTED and SHIPPED. homeCopy.spec.ts holds these words to the
   app: the numbers come from the same constants the builder and checkout use.
   ══════════════════════════════════════════════════════════════════════════ */

import { MIN_ALBUM_PHOTOS } from './builder/albumMinimum';
import { FREE_QR_MEMORIES } from '../lib/pricing';
import { FONTS } from './builder/fonts';
import { COMMON_THEMES } from '../lib/albumTheme';
import { EVENT_MIN_GUESTS } from '../lib/eventBookings';

/** One step on a Home card's slides. */
export interface HomeStep { title: string; desc: string }

/** The two cards at the top of Home, side by side (the owner's canvas board
 *  "Home with Albums and Events", 2026-10-09; built 2026-10-10). Megy's
 *  "Hi, I'm Megy" card is gone: each card says what it is, its middle plays
 *  the steps by itself, and its button stays put. The words are the owner's. */
export const ALBUMS_CARD = {
  label: 'Megyprints Albums',
  title: 'Turn your photos into a printed album',
  hook: `Already have the photos? Upload ${MIN_ALBUM_PHOTOS} or more. Megy designs the pages. We print on premium paper and ship it to your door.`,
  how: 'Here’s how',
  steps: [
    { title: 'You upload', desc: `Pick ${MIN_ALBUM_PHOTOS} or more photos from your phone.` },
    { title: 'Megy designs', desc: 'Every page laid out for you. Change anything you like.' },
    { title: 'Add a video memory', desc: 'Tap the gold button. Scan the QR and the video plays.' },
    { title: 'We print & ship', desc: 'Premium paper, delivered to your door.' },
  ] as readonly HomeStep[],
  cta: 'Start Creating',
} as const;

/** Events for 15 or more guests are BOOKED (owner, 2026-10-10), so the
 *  card says who it's for and its button books. The board's "Try it now" was
 *  the instant demo of the under-15 self-serve events, which aren't built
 *  (they'd add cost), so: "Book your event", and step 1 is booking. */
export const EVENTS_CARD = {
  label: 'Megyprints Events',
  title: 'Shared Memories, Different Perspectives',
  body: 'Every photo from every phone, finally in one album. Your guests just scan your QR.',
  how: 'Want to know how?',
  steps: [
    { title: 'Book your event', desc: 'You get a QR code made just for it.' },
    { title: 'Guests scan it', desc: 'With their phone camera. Nothing to download.' },
    { title: 'Everyone’s photos come to you', desc: 'All in one place, in your account.' },
    { title: 'Pick the best. We print it.', desc: 'Your album, shipped to your door.' },
  ] as readonly HomeStep[],
  who: `For weddings, debuts and celebrations with ${EVENT_MIN_GUESTS} or more guests.`,
  cta: 'Book your event',
} as const;

export type HomeFeatureKey = 'printed' | 'layout' | 'memories' | 'photos';

/** The strip under the hero. */
export const HOME_FEATURES: { key: HomeFeatureKey; label: string; desc: string }[] = [
  {
    key: 'printed',
    label: 'Printed and shipped',
    desc: 'Digital printing on premium paper, shipped to your door',
  },
  {
    key: 'layout',
    label: 'Megy lays out the pages',
    desc: 'Add your photos and every page is laid out for you',
  },
  {
    key: 'memories',
    label: 'Video memories',
    desc: `Scan the QR on a full-page photo and its video plays. ${FREE_QR_MEMORIES} included`,
  },
  {
    key: 'photos',
    label: `${MIN_ALBUM_PHOTOS} photos or more`,
    desc: 'At least one for every page. Add as many as you like',
  },
];

/** "How It Works": the wizard's path, in its order. Text is the wizard's
 *  optional step between Review and Preview, so it rides in Review here. */
export const HOW_IT_WORKS: { title: string; desc: string }[] = [
  {
    title: 'Name & occasion',
    desc: 'Give your album a name and pick what it’s for, like a wedding or a birthday. Megy writes the quotes on your pages to match.',
  },
  {
    title: 'Size',
    desc: 'Pick your album size. Bigger albums fit more photos on a page.',
  },
  {
    title: 'Cover',
    desc: 'Put a title on the front cover. You can skip it and come back later.',
  },
  {
    title: 'Photos',
    desc: `Add ${MIN_ALBUM_PHOTOS} or more and Megy lays them out into pages. Your photos stay on your device until you order.`,
  },
  {
    title: 'Review',
    desc: 'Go page by page. Change a layout or add a caption. A full-page photo can also carry a video, printed as a QR code.',
  },
  {
    title: 'Preview',
    desc: 'Flip through the whole album like a real book before you order.',
  },
  {
    title: 'Order',
    desc: 'Place your order. We print your album on premium paper and ship it to your door.',
  },
];

export type DemoStepKey = 'occasion' | 'upload' | 'design' | 'text' | 'preview';

/** The occasions the demo shows: the first three chips of the real step 1. */
export const DEMO_OCCASIONS: readonly string[] = COMMON_THEMES.slice(0, 3);

/** "See the Editor in Action": what each demo step says. */
export const DEMO_STEP_DETAILS: Record<DemoStepKey, { title: string; desc: string; features: string[] }> = {
  occasion: {
    title: 'Name It, Pick the Occasion',
    desc: 'Give your album a name and pick what it’s for. Megy writes the quotes on your pages to match.',
    features: [
      `${DEMO_OCCASIONS.join(', ')} and more`,
      'Or type your own',
      'Quotes that fit the occasion',
    ],
  },
  upload: {
    title: 'Add Your Photos',
    desc: `Add ${MIN_ALBUM_PHOTOS} or more photos, as many as you like. Megy sorts them into pages by when they were taken.`,
    features: [
      'Pick them all at once',
      'Megy points out blurry and repeat shots',
      'Your photos stay on your device until you order',
    ],
  },
  design: {
    title: 'Megy Lays Out the Pages',
    desc: 'Your photos go into layouts that fit their shape. Don’t like a page? Change its layout.',
    features: [
      'Layouts matched to each photo',
      'Change any page’s layout',
      'Masks, filters and photo edges',
    ],
  },
  text: {
    title: 'Add Your Words',
    desc: 'Add a caption or a title to any page.',
    features: [
      `${FONTS.length} fonts to choose from`,
      'Captions on any page',
    ],
  },
  preview: {
    title: 'Preview & Order',
    desc: 'Flip through your album like a real book. Then order, and we print it on premium paper and ship it to your door.',
    features: [
      'Real page turns',
      'See the price before you pay',
      'Printed and shipped to you',
    ],
  },
};
