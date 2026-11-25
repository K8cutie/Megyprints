/* ══════════════════════════════════════════════════════════════════════════
   WHO SELLS: THE BUSINESS BEHIND MEGYPRINTS, IN ONE PLACE.

   For now Megyprints takes payments through PayMongo under Bridgemedia, a
   registered business (owner's handoff, 2026-11-25). PayMongo checks that the
   website matches its documents: the footer must say "Megyprints is a brand
   of Bridgemedia", and the site must show a Philippine business address.
   Later Megyprints gets its own registration and its own PayMongo account:
   change the words here and every page and app screen changes with them.

   Shared with the 2.0 app (src/shared/sharedModules.ts): plain data, no
   React, no browser.

   BUSINESS_ADDRESS and COURTS_CITY are null until the owner gives them (they
   must match Bridgemedia's DTI papers). While null, nothing shows: no
   "[address]" placeholder on a live page (PayMongo refuses placeholder
   pages, and so do customers).
   ══════════════════════════════════════════════════════════════════════════ */

/** The shop's name, as the legal pages write it. */
export const BRAND_NAME = 'Megyprints';

/** The registered business that sells for now, spelled as on its DTI
 *  certificate of business name registration. */
export const REGISTERED_BUSINESS = 'Bridgemedia';

/** The footer line PayMongo asks for, word for word. */
export const BRAND_OF_LINE = `${BRAND_NAME} is a brand of ${REGISTERED_BUSINESS}.`;

/** The business address on the DTI papers, one line. null: not given yet. */
export const BUSINESS_ADDRESS: string | null = null;

/** The city whose courts hear a case about an order (the business
 *  address's city). null: not given yet; the Terms then name the courts of
 *  the Philippines in general. */
export const COURTS_CITY: string | null = null;
