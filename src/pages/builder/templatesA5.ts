import type { PageTemplate } from './types';
import { buildRectTemplates } from './rectTemplates';

/** A5 PORTRAIT (148 x 210 mm), the MEGY MINI's page (lib/megyMini).
 *
 *  The 6x8 deck rebuilt on A5's own inches by the shared 4:3-rect builder, so
 *  every frame keeps the house gutter and the 2" print floor on the smaller
 *  page. Geometry + reasoning live in rectTemplates.ts.
 *
 *  A5 is in PER_SIZE_AUTHORED, so the generators emit nothing selectable for
 *  it: this is the whole supply. */
export const TEMPLATES_A5: PageTemplate[] = buildRectTemplates('5.8x8.3');