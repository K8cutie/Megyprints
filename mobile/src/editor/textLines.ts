/* How many lines a free text takes on the page, wrapped the way the page
   renderer wraps it (wordArtRules wrapTextLines, measured in the page fonts:
   src/render/drawPage.ts freeText), so its tap area is as tall as it is
   drawn. Before the fonts load: one line per line typed. */
import { wrapTextLines } from '@web/pages/builder/wordArtRules';
import type { PageText } from '../render/pageText';
import { typedLines, type CountLines } from './hitTest';

export function renderedLines(text: PageText | null): CountLines {
  if (!text) return typedLines;
  return (t, maxWidth) => Math.max(1, wrapTextLines(text.measurer({ family: t.fontFamily, size: t.fontSize, bold: t.bold, italic: t.italic }), t.text, maxWidth).length);
}
