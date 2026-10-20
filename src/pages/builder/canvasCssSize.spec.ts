// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setCanvasCssSize } from './useCanvasEngine';

/* ══════════════════════════════════════════════════════════════════════════
   "PHOTOS SOMETIMES DONT APPEAR ON A PAGE OR DISAPPEARS" / "I ZOOMED OUT THE
   RENDERED ALBUM DISAPPEARS" (owner, 2026-10-21, on a computer). The editor
   sizes its canvas on screen with Fabric's setDimensions(…, { cssOnly }) on
   every zoom, window resize and panel change. Fabric 5.3 re-applies its retina
   scaling there even with cssOnly: on a screen set above 100% (Windows at
   125% / 150%) that re-sets the canvas's width and height — which wipes
   everything drawn — and cssOnly skips the repaint. The page sat blank until a
   page turn drew it again. A headless browser runs at exactly 100%, which is
   why no walk had seen it.

   These run Fabric's OWN methods, from the copy the app ships
   (public/fabric.min.js), on a stand-in canvas element that records what
   happens to its bitmap.
   ══════════════════════════════════════════════════════════════════════════ */

type Fab = {
  devicePixelRatio: number;
  StaticCanvas: { prototype: Record<string, (...a: unknown[]) => unknown> };
};
let fabric: Fab;
beforeAll(() => {
  const src = readFileSync(resolve(__dirname, '../../../public/fabric.min.js'), 'utf8');
  // The app loads it with a <script> tag (fabric-loader); here, the same file
  // evaluated in the test page.
  fabric = new Function(`${src}\n;return fabric;`)() as Fab;
  expect((fabric as unknown as { version: string }).version).toBe('5.3.0');
});
const realRatio = () => fabric.devicePixelRatio;
let savedRatio = 1;
afterEach(() => { fabric.devicePixelRatio = savedRatio; });

/** A canvas as the editor has it: drawn, 750×750 design px. `log` records what
 *  happens in order: 'wiped' when its bitmap is cleared (a width/height
 *  attribute set), 'drawn' when Fabric paints it. */
function editorCanvas() {
  const log: string[] = [];
  const el = (name: string) => ({
    style: {} as Record<string, string>,
    setAttribute: (attr: string) => { if (attr === 'width' || attr === 'height') log.push(`wiped:${name}`); },
  });
  const proto = fabric.StaticCanvas.prototype;
  const c = {
    width: 750, height: 750, enableRetinaScaling: true,
    lowerCanvasEl: el('page'), upperCanvasEl: el('top'), wrapperEl: { style: {} },
    contextContainer: { scale: () => {} }, contextTop: { scale: () => {} },
    setDimensions: proto.setDimensions,
    _setCssDimension: proto._setCssDimension,
    _initRetinaScaling: proto._initRetinaScaling,
    __initRetinaScaling: proto.__initRetinaScaling,
    _isRetinaScaling: proto._isRetinaScaling,
    calcOffset: () => {},
    requestRenderAll: () => { log.push('drawn'); },
    renderAll: () => { log.push('drawn'); },
  };
  return { c, log, pageWipedLast: () => log.lastIndexOf('wiped:page') > log.lastIndexOf('drawn') };
}

describe("Fabric's own cssOnly resize (the copy the app ships)", () => {
  it('on a screen above 100% it wipes the page and does not draw it again', () => {
    savedRatio = realRatio();
    fabric.devicePixelRatio = 1.25; // Windows "Scale: 125%"
    const { c, log, pageWipedLast } = editorCanvas();
    c.setDimensions({ width: '510px', height: '510px' }, { cssOnly: true });
    expect(log).toContain('wiped:page');
    expect(log).not.toContain('drawn');
    expect(pageWipedLast()).toBe(true); // blank until something else draws it
  });

  it('at exactly 100% it leaves the drawing alone — why a headless walk never saw it', () => {
    savedRatio = realRatio();
    fabric.devicePixelRatio = 1;
    const { c, log } = editorCanvas();
    c.setDimensions({ width: '510px', height: '510px' }, { cssOnly: true });
    expect(log).toEqual([]);
  });
});

describe('setCanvasCssSize — how the editor sizes its canvas on screen', () => {
  for (const ratio of [1.25, 1.5, 2, 1]) {
    it(`at ${ratio * 100}%: the page is drawn after the resize, never left wiped`, () => {
      savedRatio = realRatio();
      fabric.devicePixelRatio = ratio;
      const { c, log, pageWipedLast } = editorCanvas();
      setCanvasCssSize(c, 510, 510);
      expect(log.at(-1)).toBe('drawn');
      expect(pageWipedLast()).toBe(false);
      expect(c.lowerCanvasEl.style).toMatchObject({ width: '510px', height: '510px' }); // units: fabric 5 adds none
    });
  }

  it('is the ONLY way the editor resizes its canvas on screen (zoom, window, panels)', () => {
    const src = readFileSync(resolve(__dirname, 'useCanvasEngine.ts'), 'utf8');
    expect(src.match(/\.setDimensions\(/g)).toHaveLength(1); // the one inside setCanvasCssSize
    expect(src).toMatch(/setCanvasCssSize\(c, Math\.round\(CANVAS_W \* scale\), Math\.round\(CANVAS_H \* scale\)\)/);
  });
});
