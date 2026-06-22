// ──────────────────────────────────────────────────────────────────────────
// Personas — the "agents" that attack the build→order wizard, each with a
// different behavior profile. The journey runner (journey.ts) drives each one
// from the first wizard step and records the furthest point it reaches.
//
// The GOAL for every persona is the same: reach the fulfillment screen
// (an order_number returned from createOrderFromLatestAlbum). What differs is
// HOW they behave along the way — and therefore which roadblock (if any) they
// hit first.
// ──────────────────────────────────────────────────────────────────────────

export interface Persona {
  id: string;
  name: string;
  blurb: string;
  // Behavior knobs that decide which guards the persona trips.
  buildsAlbum: boolean; // do they actually build an album in the Design phase?
  albumsBuilt: number; // how many albums they create (>1 exercises "latest-album" logic)
  signedInDuringBuild: boolean; // were they logged in while building? (cloud-sync happens only if so)
  signedInAtCheckout: boolean; // are they logged in when they hit "Submit Order"?
  fillsShipping: boolean; // did they fill name/phone/address?
}

export const PERSONAS: Persona[] = [
  {
    id: 'happy',
    name: 'Prepared Paula',
    blurb: 'Logs in first, builds one album, fills every field. The control path — proves the funnel CAN complete.',
    buildsAlbum: true,
    albumsBuilt: 1,
    signedInDuringBuild: true,
    signedInAtCheckout: true,
    fillsShipping: true,
  },
  {
    id: 'ghost',
    name: 'Guest Gary',
    blurb: 'Never signs in. Builds happily, then tries to order as a guest.',
    buildsAlbum: true,
    albumsBuilt: 1,
    signedInDuringBuild: false,
    signedInAtCheckout: false,
    fillsShipping: true,
  },
  {
    id: 'late',
    name: 'Late-Binder Lena',
    blurb: 'Builds her album FIRST, then signs in only at checkout — the most common real-world flow.',
    buildsAlbum: true,
    albumsBuilt: 1,
    signedInDuringBuild: false,
    signedInAtCheckout: true,
    fillsShipping: true,
  },
  {
    id: 'rusher',
    name: 'Rushing Rico',
    blurb: 'Signed in, builds, but slams Submit with blank shipping fields.',
    buildsAlbum: true,
    albumsBuilt: 1,
    signedInDuringBuild: true,
    signedInAtCheckout: true,
    fillsShipping: false,
  },
  {
    id: 'serial',
    name: 'Serial Sofia',
    blurb: 'Builds TWO albums in one session, then orders — exercises the "latest album" assumption.',
    buildsAlbum: true,
    albumsBuilt: 2,
    signedInDuringBuild: true,
    signedInAtCheckout: true,
    fillsShipping: true,
  },
];
