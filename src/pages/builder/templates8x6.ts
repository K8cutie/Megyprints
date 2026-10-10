import type { PageTemplate } from './types';
import { buildRectTemplates } from './rectTemplates';

/** 8×6″ LANDSCAPE — page layouts.
 *
 *  Authored from the shared 4:3-rect builder, which 6×8 (the same album rotated)
 *  also uses — so a layout added once appears on BOTH sizes, transposed. The
 *  geometry and the reasoning for every shape live in rectTemplates.ts.
 *
 *  8×6 is in PER_SIZE_AUTHORED, so the tiled generator, the legacy hand-made
 *  block and the gap-fillers emit nothing selectable for it: this is the whole
 *  supply. */
export const TEMPLATES_8X6: PageTemplate[] = buildRectTemplates('8x6');
