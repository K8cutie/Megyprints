/* ══════════════════════════════════════════════════════════════════════════
   WHICH POST AN ORDER CAME FROM, IN THE APP: the rules.

   A post's link to the app's Play Store page can carry a short tag:
     …/details?id=com.megyprints.app&referrer=utm_source%3Dfacebook%26utm_campaign%3Dxmas-01
   Google Play hands that "referrer" text to the app it installs (the Install
   Referrer API). The app reads it once, keeps the tag on this phone for 30
   days from the install (installSource.ts), and an order placed in that time
   carries it in orders.source (checkout/sendOrder.ts), so the owner can see
   which posts bring orders.

   What is kept is the post's own label ("xmas-01"): the same for everyone
   who came from that post, and nothing about the person or the phone. It is a
   note for the owner. It never changes a price, and a missing, old or
   malformed tag only means the order has no source.

   This file is plain rules with nothing from the phone in it, so the order
   sender and its tests can use it as they are.
   ══════════════════════════════════════════════════════════════════════════ */

/** How long a tag counts after the install. */
export const SOURCE_WINDOW_DAYS = 30;
/** A tag: lower-case letters, digits and hyphens, 1 to 40 characters (the
 *  database keeps the same rule for orders.source). */
export const SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** A tag as the database keeps it, or null when it isn't one. */
export function normalizeSource(raw: string | null | undefined): string | null {
  const tag = (raw ?? '').trim().toLowerCase();
  return SOURCE_PATTERN.test(tag) ? tag : null;
}

/** The tag in Play's referrer text: its utm_campaign. Read by hand, part by
 *  part, so one part that isn't URL text doesn't lose the rest. An install
 *  from no tagged link ("utm_source=google-play&utm_medium=organic") has none. */
export function sourceFromReferrer(referrer: string | null | undefined): string | null {
  for (const part of String(referrer ?? '').split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      if (decodeURIComponent(part.slice(0, eq)) !== 'utm_campaign') continue;
      return normalizeSource(decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')));
    } catch { /* not URL text: no tag in this part */ }
  }
  return null;
}

/** The app can reach a database without orders.source (the app is out before
 *  the migration is applied). PostgREST then refuses the WHOLE order over
 *  that one column: PGRST204 ("Could not find the 'source' column of 'orders'
 *  in the schema cache") or 42703. The order is then sent again without it. */
export function isMissingSourceColumn(err: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return !!err
    && (err.code === 'PGRST204' || err.code === '42703')
    && /['"]source['"]/.test(err.message ?? '');
}
