/** ══════════════════════════════════════════════════════════════════════════
    THEME QUOTES — curated captions per theme + free-space placement helper

    Lets Megy drop a fitting, occasion-appropriate quote into a page's empty
    band so the user doesn't have to type. Quotes are short, generic, and
    brand-safe (no famous copyrighted lines); baptism uses common blessings.
    ══════════════════════════════════════════════════════════════════════════ */

import type { TemplateType, PageTemplate } from './types';
import { QUOTE_BANK } from './quoteBank';

/** The pre-loaded lines per theme — one list, kept in quoteBank.ts (100 per
 *  occasion, original or public domain). */
export const THEME_QUOTES: Record<TemplateType, string[]> = QUOTE_BANK;

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
