/* ══════════════════════════════════════════════════════════════════════════
   THE START SCREEN'S WORDS: the website's Albums home card
   (src/pages/homeCopy.ts ALBUMS_CARD, the owner's words), word for word. The
   app can't import that file (it pulls in browser-only code, and the website
   is frozen until Nov 9, so it can't be split), so the words are copied here
   and test/homeLook.test.tsx holds the copy to the website's, word for word.
   The website's Events card has no copy here: Events are not in the app
   (owner, 2026-11-16).
   ══════════════════════════════════════════════════════════════════════════ */
import { MIN_ALBUM_PHOTOS } from '@web/pages/builder/albumMinimum';

/** One step on a card's slides. */
export interface HomeStep { title: string; desc: string }

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

/** The app's own words around the card. */
export const HOME = {
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
