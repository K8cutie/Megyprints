import type { PageTemplate } from './types';
import { buildRectTemplates } from './rectTemplates';

/** A5 PORTRAIT (148 x 210 mm), the MEGY MINI's page (lib/megyMini): its FIRST
 *  layouts, the 6x8 deck rebuilt on A5's own inches (rectTemplates.ts).
 *
 *  RETIRED 2026-11-17 for the Mini's own layouts (miniTemplates.ts; owner:
 *  "im trying to avoid pages with lots of free spaces since the pages for
 *  mini are very few"): most of these carry a word box, which printed as an
 *  empty white area on about half a Mini's pages. pageTemplates puts every id
 *  here in RETIRED_TEMPLATE_IDS: still resolvable, so a Mini made before
 *  opens and prints exactly as it was, but never dealt or offered again.
 *
 *  A5 is in PER_SIZE_AUTHORED, so the generators emit nothing selectable for
 *  it: miniTemplates.ts is the whole supply. */
export const TEMPLATES_A5: PageTemplate[] = buildRectTemplates('5.8x8.3');