import type { PageTemplate } from './types';
import { buildSquareTemplates } from './squareTemplates';

/** 6×6″ square layouts. The definitions are shared across all square sizes —
 *  see squareTemplates.ts for the geometry, house rules, and print-floor math.
 *  6×6 is the tightest square (its 1/3 hero column sits exactly on the 2" floor),
 *  so a layout that clears the floor here clears it on 8×8 and 9×9 too. */
export const TEMPLATES_6X6: PageTemplate[] = buildSquareTemplates('6x6');
