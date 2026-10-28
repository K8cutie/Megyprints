/* The website side of the caption-fit check, bundled by fitWeb.mjs and run in
   headless Chromium: the website's own textFit (captionFits, quoteRoom,
   coverTitleFit) with the browser's own canvas measurer (canvasMeasurer:
   what the website's builder uses), on the golden pages' captions and a set
   of captions made to need shrinking. Nothing here measures anything itself. */

import { captionBoxSize, captionFits, coverTitleFit, quoteRoom } from '../../src/pages/builder/textFit';
import { defaultMeasurer } from '../../src/pages/builder/canvasMeasurer';
import type { AlbumPage, AlbumSizePreset } from '../../src/pages/builder/types';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }

/** One caption to fit: in a page's box (pageIndex, boxIndex), or a cover title. */
export interface FitCase {
  name: string;
  page: AlbumPage;
  albumSize: AlbumSizePreset;
  pageIndex: number;
  boxIndex: number;
  cover?: boolean;
}

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const api = {
  async registerFonts(fonts: FontIn[]): Promise<number> {
    for (const f of fonts) {
      const face = new FontFace(f.face, fromBase64(f.base64), { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' });
      await face.load();
      document.fonts.add(face);
    }
    return document.fonts.size;
  },

  /** The website's answers for each case. */
  fit(cases: FitCase[]) {
    const m = defaultMeasurer();
    if (!m) throw new Error('no canvas measurer in this browser');
    return cases.map((c) => {
      const el = c.page.textElements.find((t) => t.boxIndex === c.boxIndex);
      if (!el) throw new Error(`${c.name}: no caption in box ${c.boxIndex}`);
      const box = captionBoxSize(c.page, c.boxIndex, c.albumSize, c.pageIndex, { coverMode: !!c.cover });
      if (!box) throw new Error(`${c.name}: no box ${c.boxIndex}`);
      const fit = c.cover ? coverTitleFit(c.page, c.albumSize, m) : captionFits(el.text, el, box, m);
      const room = quoteRoom(box, el, 100, m);
      // The widths textFit's wrap asks for: every word, and the whole line.
      m.font = `${el.italic ? 'italic' : 'normal'} ${el.bold ? 'bold' : 'normal'} ${el.fontSize || 24}px ${el.fontFamily || 'serif'}`;
      const words = el.text.split(/\s+/).filter(Boolean);
      return {
        name: c.name, box, fit, room, font: m.font,
        widths: [el.text, ...words].map((t) => ({ text: t, width: m.measureText(t).width })),
      };
    });
  },
};

(globalThis as unknown as { fitCheck: typeof api }).fitCheck = api;
