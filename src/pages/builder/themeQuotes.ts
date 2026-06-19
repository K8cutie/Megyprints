/** ══════════════════════════════════════════════════════════════════════════
    THEME QUOTES — curated captions per theme + free-space placement helper

    Lets Megy drop a fitting, occasion-appropriate quote into a page's empty
    band so the user doesn't have to type. Quotes are short, generic, and
    brand-safe (no famous copyrighted lines); baptism uses common blessings.
    ══════════════════════════════════════════════════════════════════════════ */

import type { TemplateType, PageTemplate } from './types';

export const THEME_QUOTES: Record<TemplateType, string[]> = {
  wedding: [
    'Two hearts, one journey',
    'Forever starts today',
    'To have and to hold',
    'Love wrote this story',
    'Together is a beautiful place',
    'The beginning of always',
  ],
  baby: [
    'Welcome to the world, little one',
    'Tiny hands, full hearts',
    'Our greatest adventure',
    'Worth the wait',
    'So small, so loved',
    'Sweet dreams, little dreamer',
  ],
  birthday: [
    'Another year of wonderful',
    'Make a wish',
    'Today we celebrate you',
    'Cheers to you',
    'The best is yet to come',
    'Let the good times roll',
  ],
  family: [
    'Home is where our story begins',
    'Together is our favorite place',
    'Love makes a family',
    'Gathered with grateful hearts',
    'The days we will remember',
    'Where life begins and love never ends',
  ],
  graduation: [
    'The tassel was worth the hassle',
    'Off to chase the dreams',
    'The future is bright',
    'And so the adventure begins',
    'Dream big, work hard',
    'This is just the beginning',
  ],
  travel: [
    'Adventure awaits',
    'Collect moments, not things',
    'Wander often, wonder always',
    'The journey is the destination',
    'Make memories everywhere',
    'Born to explore',
  ],
  minimalist: [
    'Less, but better',
    'Simply us',
    'In this moment',
    'Quiet beauty',
    'Just enough',
    'Stillness',
  ],
  kids: [
    'Oh, the fun we had',
    'Little moments, big memories',
    'Pure joy',
    'Adventure buddies',
    'Growing up wild and free',
    'Playtime forever',
  ],
  vintage: [
    'Once upon a time',
    'The good old days',
    'Timeless memories',
    'A moment to remember',
    'Made with love, kept forever',
    'Some things never fade',
  ],
  classic: [
    'Cherished moments',
    'Timeless and true',
    'A story worth telling',
    'Moments to treasure',
    'Forever in our hearts',
    'Some moments last a lifetime',
  ],
  baptism: [
    'Child of God',
    'Washed in grace',
    'A new beginning in faith',
    'Blessed and beloved',
    'Held in His hands',
    'Let the little children come',
  ],
};

/** Pick a themed quote not already used (so the album does not repeat lines).
 *  Falls back to any quote once all have been used. */
export function pickQuote(theme: TemplateType, used: Set<string>): string | null {
  const pool = THEME_QUOTES[theme] ?? [];
  if (!pool.length) return null;
  const fresh = pool.filter((q) => !used.has(q));
  const candidates = fresh.length ? fresh : pool;
  // Vary the choice without Date.now()/Math.random determinism concerns: rotate
  // by how many are already used.
  return candidates[used.size % candidates.length];
}

/** Largest empty horizontal band on a page (as 0–1 page fractions), where a
 *  quote can sit without overlapping photos. Returns null when the page is too
 *  full to fit one. Accounts for the template margins (always empty) plus the
 *  space above the topmost / below the bottommost slot. */
export function freeBandForTemplate(
  template: PageTemplate | null | undefined,
  /** y-positions (0–1 page fractions) of text already on the page — e.g. the
   *  auto-title — so the quote doesn't land on top of them. */
  occupiedY: number[] = [],
): { yTop: number; yBottom: number } | null {
  const MIN_BAND = 0.14; // need ~14% of page height to read well

  // Candidate empty bands as { yTop, yBottom, h }.
  let bands: { yTop: number; yBottom: number; h: number }[];
  if (!template || !template.slots?.length) {
    bands = [{ yTop: 0.68, yBottom: 0.94, h: 0.26 }];
  } else {
    const m = template.margin;
    const safeTop = m.top;
    const safeH = 1 - m.top - m.bottom;
    let topMost = 1;
    let bottomMost = 0;
    for (const s of template.slots) {
      const t = safeTop + s.y * safeH;
      const b = t + s.height * safeH;
      topMost = Math.min(topMost, t);
      bottomMost = Math.max(bottomMost, b);
    }
    bands = [];
    if (topMost >= MIN_BAND) bands.push({ yTop: 0.03, yBottom: topMost - 0.02, h: topMost });
    if (1 - bottomMost >= MIN_BAND) bands.push({ yTop: bottomMost + 0.02, yBottom: 0.97, h: 1 - bottomMost });
  }

  // Prefer the largest band that no existing text sits in.
  bands.sort((a, b) => b.h - a.h);
  for (const band of bands) {
    const clash = occupiedY.some((y) => y >= band.yTop - 0.05 && y <= band.yBottom + 0.05);
    if (!clash) return { yTop: band.yTop, yBottom: band.yBottom };
  }
  return null; // no clear band — page too full / already captioned
}
