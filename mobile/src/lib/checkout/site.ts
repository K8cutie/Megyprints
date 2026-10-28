/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S OWN FILES, READ BY THE APP AT CHECKOUT.

   Some things checkout shows are plain files the website serves from its
   public/ folder, not code: the address lists (public/psgc/, about 2.8 MB,
   too big to put inside the app), the payment QR (public/pay/), and the
   sample photos the test album uses (public/sample-photos/). The app reads
   them from the live website, exactly as the website's own pages do, so the
   app and the website always show the same lists and the same QR.

   EXPO_PUBLIC_WEBSITE_URL (mobile/.env.local) points the app at another copy
   of the website, for example a local one; without it, the live site.
   ══════════════════════════════════════════════════════════════════════════ */

/** The live website (the same address the 1.x app opens). */
export const DEFAULT_WEBSITE_URL = 'https://megyprints.vercel.app';

/** The website this build reads its files from, without a trailing slash. */
export const WEBSITE_URL = (process.env.EXPO_PUBLIC_WEBSITE_URL || DEFAULT_WEBSITE_URL).replace(/\/+$/, '');

/** A file the website serves from public/: siteFile('psgc/regions.json'). */
export function siteFile(path: string, base: string = WEBSITE_URL): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
