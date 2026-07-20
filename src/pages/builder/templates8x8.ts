import type { PageTemplate } from './types';
import { buildSquareTemplates } from './squareTemplates';

/** 8×8″ square layouts — the same square set as 6×6, one physical size up.
 *  Every frame is larger, so all clear the 2" print floor with room to spare
 *  (the 6×6's floor-critical 1/3 column is 2.00", it is 2.67" here). 8×8 could
 *  eventually add denser 4-photo layouts a 6×6 can't hold; those go here.
 *  See squareTemplates.ts for the shared geometry. */
export const TEMPLATES_8X8: PageTemplate[] = buildSquareTemplates('8x8');
