/* WordArt's changes as plain patches (the app's own controls, on the fields
   every renderer draws: wordArtRules WordArtStyle). One source for the cover
   title (cover/coverEdits.ts) and for words on a page (TextEditorSheet). */
import { contrastOutline } from '@web/pages/builder/wordArtRules';

/** The outline's thicknesses, design px (half of it shows outside the letters). */
export const OUTLINE_WIDTHS = { thin: 2, medium: 4, thick: 8 } as const;
export type OutlineSize = keyof typeof OUTLINE_WIDTHS;

/** No outline (0), or this thick. The first time, in the colour that stands out from the words. */
export function outlinePatch(cur: { color: string; outlineColor?: string }, width: number): { outlineWidth: number | undefined; outlineColor: string | undefined } {
  return width > 0
    ? { outlineWidth: width, outlineColor: cur.outlineColor ?? contrastOutline(cur.color) }
    : { outlineWidth: undefined, outlineColor: undefined };
}

/** An outline colour: the outline in it, medium when there was none. */
export function outlineColourPatch(cur: { outlineWidth?: number }, outlineColor: string): { outlineColor: string; outlineWidth: number } {
  return { outlineColor, outlineWidth: cur.outlineWidth || OUTLINE_WIDTHS.medium };
}

/** Which of the three an outline is, the nearest (an outline from before
 *  them is 3 px: thin). Null: no outline. */
export function outlineSize(width: number | undefined): OutlineSize | null {
  if (!width) return null;
  let best: OutlineSize = 'thin';
  for (const k of Object.keys(OUTLINE_WIDTHS) as OutlineSize[]) {
    if (Math.abs(OUTLINE_WIDTHS[k] - width) < Math.abs(OUTLINE_WIDTHS[best] - width)) best = k;
  }
  return best;
}
