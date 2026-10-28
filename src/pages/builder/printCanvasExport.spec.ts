/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: renderPageCanvasForPrint is how the 2.0 app's golden check
   (tools/golden) reaches the website's print renderer: the picture a
   print-file page is made from, before it is shrunk and JPEG'd. If it drew
   something other than what the print file is made from, the app would be
   checked against the wrong picture. Nothing on the website calls it.

   It must be the print file's own drawing: the page at 300 DPI (drawPrintPage
   with its words in, like `bakeWords`), then printBleed's withBleed — the
   page at (bleed, bleed) and its edges mirrored out into the 0.125" bleed.
   Here with a recording stand-in for the browser canvas (the suite runs in
   Node), so the calls themselves are checked.
   ══════════════════════════════════════════════════════════════════════════ */
import { describe, it, expect, afterEach } from 'vitest';
import { renderPageCanvasForPrint, PRINT_DPI } from './printPipeline';
import { bleedPx } from './printBleed';
import type { AlbumPage } from './types';

interface Call { fn: string; args: unknown[] }
interface FakeCanvas { width: number; height: number; calls: Call[]; getContext: () => unknown }

const made: FakeCanvas[] = [];

/** A canvas whose 2D context records every call (and returns harmless values). */
function fakeCanvas(): FakeCanvas {
  const canvas: FakeCanvas = { width: 300, height: 150, calls: [], getContext: () => ctx };
  const ctx: unknown = new Proxy({ canvas }, {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (s: string) => ({ width: String(s).length * 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      return (...args: unknown[]) => { canvas.calls.push({ fn: prop, args }); };
    },
    set(target: Record<string, unknown>, prop: string, value: unknown) { target[prop] = value; return true; },
  });
  made.push(canvas);
  return canvas;
}

const realDocument = (globalThis as { document?: unknown }).document;
function withFakeDocument(): void {
  (globalThis as { document?: unknown }).document = { createElement: (tag: string) => { if (tag !== 'canvas') throw new Error(tag); return fakeCanvas(); } };
}
afterEach(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  made.length = 0;
});

const page = (size: AlbumPage['size']): AlbumPage => ({
  id: 'p', layout: 'freeform', size, background: { type: 'solid', solid: '#FCE883' }, photos: [], textElements: [],
} as AlbumPage);

describe('renderPageCanvasForPrint: the picture a print-file page is made from', () => {
  it('is the page at 300 DPI with the 0.125" bleed round every edge', async () => {
    withFakeDocument();
    const b = bleedPx(PRINT_DPI);
    expect(b).toBe(38);
    const out8 = (await renderPageCanvasForPrint({ page: page('8x8'), photos: [], albumSize: '8x8' })) as unknown as FakeCanvas;
    expect([out8.width, out8.height]).toEqual([2400 + 2 * b, 2400 + 2 * b]);
    const out64 = (await renderPageCanvasForPrint({ page: page('6x4'), photos: [], albumSize: '6x4' })) as unknown as FakeCanvas;
    expect([out64.width, out64.height]).toEqual([1800 + 2 * b, 1200 + 2 * b]);
  });

  it('draws the page once at (bleed, bleed), then mirrors its 4 edges and 4 corners outward', async () => {
    withFakeDocument();
    const out = (await renderPageCanvasForPrint({ page: page('8x8'), photos: [], albumSize: '8x8', pageIndex: 3 })) as unknown as FakeCanvas;
    const trim = made.find((c) => c !== out && c.width === 2400)!;
    expect(trim).toBeTruthy();
    const draws = out.calls.filter((c) => c.fn === 'drawImage');
    expect(draws[0].args).toEqual([trim, 38, 38]);
    expect(draws.slice(1)).toHaveLength(8); // mirrored strips: 4 sides + 4 corners
    expect(draws.slice(1).every((d) => d.args[0] === trim)).toBe(true);
    // The trim page itself was painted: white paper, then the page colour.
    expect(trim.calls.filter((c) => c.fn === 'fillRect').length).toBeGreaterThanOrEqual(2);
  });

  it('draws the words by default, and leaves exactly them out with words: false', async () => {
    const withText: AlbumPage = {
      ...page('8x8'),
      textElements: [{ id: 't', text: 'Summer 2026', x: 40, y: 40, fontSize: 30, fontFamily: 'serif', color: '#2D2D2D', rotation: 0, opacity: 100 }],
    } as AlbumPage;
    const trimOf = (out: FakeCanvas) => made.find((c) => c !== out && c.width === 2400)!;
    withFakeDocument();
    const full = (await renderPageCanvasForPrint({ page: withText, photos: [], albumSize: '8x8' })) as unknown as FakeCanvas;
    const fullTrim = trimOf(full);
    expect(fullTrim.calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0])).toEqual(['Summer 2026']);
    made.length = 0;
    const bare = (await renderPageCanvasForPrint({ page: withText, photos: [], albumSize: '8x8', words: false })) as unknown as FakeCanvas;
    const bareTrim = trimOf(bare);
    expect(bareTrim.calls.some((c) => c.fn === 'fillText' || c.fn === 'strokeText')).toBe(false);
    // Everything else is drawn the same.
    const notWords = (t: FakeCanvas) => t.calls.filter((c) => c.fn !== 'fillText' && c.fn !== 'save' && c.fn !== 'restore' && c.fn !== 'translate' && c.fn !== 'scale' && c.fn !== 'rotate' && c.fn !== 'beginPath' && c.fn !== 'moveTo' && c.fn !== 'lineTo' && c.fn !== 'stroke');
    expect(notWords(bareTrim)).toEqual(notWords(fullTrim));
  });
});
