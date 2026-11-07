/* How many lines a free text takes on the page, wrapped the way the page
   renderer wraps it (wordArtRules wrapTextLines, measured in the page fonts:
   src/render/drawPage.ts freeText), so its tap area is as tall as it is
   drawn. Before the fonts load: one line per line typed. And where placed
   words' letters reach (freeWords.wordsInk), for their tap area. */
import type { TextElement } from '@web/pages/builder/types';
import { wordsInk, type Ink } from '@web/pages/builder/freeWords';
import { wrapTextLines } from '@web/pages/builder/wordArtRules';
import type { Measurer } from '@web/pages/builder/textFit';
import type { PageText } from '../render/pageText';
import { typedLines, type CountLines } from './hitTest';

export function renderedLines(text: PageText | null): CountLines {
  if (!text) return typedLines;
  return (t, maxWidth) => Math.max(1, wrapTextLines(text.measurer({ family: t.fontFamily, size: t.fontSize, bold: t.bold, italic: t.italic }), t.text, maxWidth).length);
}

/** Where placed words' letters reach, measured with the page fonts (the
 *  builder's measurer, design px), or their rough size before they load. */
export function placedInk(m: Measurer | null): (t: TextElement) => Ink {
  return (t) => wordsInk(t, m);
}
