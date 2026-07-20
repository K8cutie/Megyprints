import type { PageTemplate } from './types';
import { buildSquareTemplates } from './squareTemplates';

/** 9×9″ square layouts — the same square set as 6×6, the largest square size.
 *  Every frame is largest here (the 6×6's floor-critical 1/3 column is 3.00"),
 *  so the whole set clears the 2" floor comfortably. 9×9-specific dense layouts
 *  would go here. See squareTemplates.ts for the shared geometry. */
export const TEMPLATES_9X9: PageTemplate[] = buildSquareTemplates('9x9');
