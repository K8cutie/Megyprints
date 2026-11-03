/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN'S WORDS: the website's home cards (src/pages/homeCopy.ts
   ALBUMS_CARD and EVENTS_CARD, the owner's words), word for word. The app
   can't import that file (it pulls in browser-only code, and the website is
   frozen until Nov 9, so it can't be split), so the words are copied here
   and test/homeLook.test.tsx holds the copy to the website's, word for word.
   ══════════════════════════════════════════════════════════════════════════ */
import { MIN_ALBUM_PHOTOS } from '@web/pages/builder/albumMinimum';

/** One step on a card's slides. */
export interface HomeStep { title: string; desc: string }

/** Events are booked for this many guests or more (src/lib/eventBookings.ts). */
export const EVENT_MIN_GUESTS = 15;

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

export const EVENTS_CARD = {
  label: 'Megyprints Events',
  title: 'All the photos your guests took, in one printed album',
  body: 'Your guests just scan your QR.',
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

/** The app's own words around the cards. */
export const HOME = {
  /** The website's badge on the Events card. */
  newBadge: 'New',
  menu: 'Menu',
  closeMenu: 'Close the menu',
  signIn: 'Sign in',
  signOut: 'Sign out',
  signedInAs: (email: string | undefined) => `Signed in as ${email ?? 'your account'}`,
  account: 'Your account',
  albums: 'My albums',
  orders: 'Your orders',
  profile: 'My profile',
  memories: 'My memories',
  continueAlbum: 'Continue my album',
  newAlbum: 'Start a new album',
  pause: 'Pause',
  play: 'Play',
  /** The dots' and the Pause button's names for a screen reader (the website's). */
  slideOf: (name: string, k: number, n: number) => `${name}, slide ${k + 1} of ${n}`,
  pauseSlides: (name: string) => `Pause the ${name} slides`,
  playSlides: (name: string) => `Play the ${name} slides`,
} as const;
