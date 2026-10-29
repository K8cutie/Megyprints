/* ══════════════════════════════════════════════════════════════════════════
   DRAWING SURFACES, KEPT FOR REUSE.

   Why: in react-native-skia 2.14 a surface's canvas (surface.getCanvas())
   keeps the surface alive, and the canvas can't be disposed: so
   surface.dispose() frees nothing until JavaScript's garbage collector gets
   round to the canvas, and the collector counts a canvas as 1 KB whatever
   the surface holds. A renderer that makes a new surface for every page,
   every baked photo and every halved picture piles them up: on the
   emulator, two runs of the golden pages took the app's native memory from
   180 MB to 1.9 GB (a page's surfaces are 25 MB each, a cover's 60 MB, a
   12 MP photo's first halving 12 MB).

   And dispose() makes it worse there: a disposed surface tells the
   collector it holds nothing (256 bytes) while its canvas still holds the
   pixels. So on the phone a surface is let go of by dropping it, never
   disposed (releaseSurface): the collector then counts its full size and
   frees it, canvas and all, soon. CanvasKit (Node, the tests) has no
   collector hook at all, so there dispose() is right and frees it at once.

   So the renderer takes its surfaces from here, by size, and gives them
   back when it has drawn: a surface (and its one canvas) is made once per
   size and used again, cleared to transparent, its canvas back at its first
   state (every drawing runs between a save() made here and
   restoreToCount(1)). A picture taken from it (makeImageSnapshot) stays
   right when the surface is drawn on again: Skia copies the pixels first if
   the picture is still in use. At most `perSize` idle surfaces per size and
   `maxIdleBytes` in all are kept; the oldest beyond that are let go of.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkCanvas, SkImage, SkSurface, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';

/** Let go of a surface the right way for this Skia (see above). RN Skia's
 *  CanvasKit wrappers keep the CanvasKit object as `ref`; the phone's JSI
 *  objects have no such field. */
export function releaseSurface(surface: SkSurface): void {
  if ('ref' in (surface as object)) surface.dispose();
}

/** Is this RN Skia's CanvasKit build (Node, the tests) rather than the
 *  phone's native Skia? (Its objects carry the CanvasKit object as `ref`.) */
export function isCanvasKit(Sk: Skia): boolean {
  return 'ref' in (Sk.Paint() as object);
}

export interface Drawable {
  surface: SkSurface;
  canvas: SkCanvas;
  w: number;
  h: number;
}

export class SurfacePool {
  /** Idle surfaces, the longest idle first. */
  private readonly idle: Drawable[] = [];
  private idleBytes = 0;
  /** Surfaces made so far (for the tests). */
  made = 0;

  constructor(
    private readonly Skia: Skia,
    private readonly maxIdleBytes = 160 * 1024 * 1024,
    private readonly perSize = 2,
  ) {}

  /** A transparent w × h surface to draw on; give it back (give, or snapshot) when done. */
  take(w: number, h: number): Drawable {
    for (let i = this.idle.length - 1; i >= 0; i--) {
      const d = this.idle[i];
      if (d.w === w && d.h === h) {
        this.idle.splice(i, 1);
        this.idleBytes -= w * h * 4;
        d.canvas.clear(this.Skia.Color('transparent'));
        d.canvas.save();
        return d;
      }
    }
    const surface = this.Skia.Surface.Make(w, h);
    if (!surface) throw new Error(`could not make a ${w}×${h} drawing surface`);
    this.made++;
    const canvas = surface.getCanvas();
    canvas.save();
    return { surface, canvas, w, h };
  }

  /** What was drawn, as a picture (the caller disposes it); the surface goes back. */
  snapshot(d: Drawable): SkImage {
    d.surface.flush();
    const img = d.surface.makeImageSnapshot();
    this.give(d);
    return img;
  }

  /** The surface back, for the next drawing of its size. */
  give(d: Drawable): void {
    d.canvas.restoreToCount(1);
    this.idle.push(d);
    this.idleBytes += d.w * d.h * 4;
    const sameSize = this.idle.filter((x) => x.w === d.w && x.h === d.h).length;
    if (sameSize > this.perSize) this.drop(this.idle.findIndex((x) => x.w === d.w && x.h === d.h));
    while (this.idleBytes > this.maxIdleBytes && this.idle.length) this.drop(0);
  }

  private drop(i: number): void {
    const [d] = this.idle.splice(i, 1);
    this.idleBytes -= d.w * d.h * 4;
    releaseSurface(d.surface);
  }

  /** Let go of every idle surface. */
  dispose(): void {
    this.idle.forEach((d) => releaseSurface(d.surface));
    this.idle.length = 0;
    this.idleBytes = 0;
  }
}
