import type { PageTemplate } from './types';
import { buildRectTemplates } from './rectTemplates';

/** 6×8″ PORTRAIT — page layouts.
 *
 *  6×8 is 8×6 rotated, so both are authored from the shared 4:3-rect builder and
 *  every composition is the landscape one transposed (columns become rows, and
 *  each slot's ratio flips 4:3 ↔ 3:4 / 2:3 ↔ 3:2). Geometry + reasoning live in
 *  rectTemplates.ts.
 *
 *  6×8 is in PER_SIZE_AUTHORED, so the generators emit nothing selectable for
 *  it: this is the whole supply. */
export const TEMPLATES_6X8: PageTemplate[] = buildRectTemplates('6x8');
