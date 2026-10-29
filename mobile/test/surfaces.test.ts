/**
 * @jest-environment node
 */
/* The renderer's surfaces are kept for reuse (src/render/surfaces.ts): a
   surface's canvas keeps it alive until the garbage collector runs, so a new
   surface per drawing piled up on the phone (1.9 GB after two golden runs).
   These pin what reuse must keep: a reused surface is as a new one
   (transparent, its canvas at its first state), a picture taken from it
   before stays as it was, the idle ones are capped, and drawing the same
   page again makes no new surface and the very same pixels. */
import type { SkImage } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { SurfacePool } from '../src/render/surfaces';
import { PageDrawer } from '../src/render/drawPage';
import { PageText } from '../src/render/pageText';
import { planPage } from '../src/render/pagePlan';
import { headlessSkia, fontFiles, pixelsOf } from './golden/headless';
import type { AlbumPage } from '@web/pages/builder/types';

describe('surfaces kept for reuse', () => {
  it('a reused surface is transparent, its canvas back at its first state; a picture taken before keeps its pixels', async () => {
    const Sk = await headlessSkia();
    const pool = new SurfacePool(Sk);
    const red = Sk.Paint();
    red.setColor(Sk.Color('#ff0000'));
    const a = pool.take(8, 8);
    a.canvas.translate(4, 4); // left on the canvas on purpose
    a.canvas.drawRect(Sk.XYWHRect(0, 0, 2, 2), red);
    const first: SkImage = pool.snapshot(a);
    const b = pool.take(8, 8);
    expect(b.surface).toBe(a.surface);
    expect(pool.made).toBe(1);
    const blue = Sk.Paint();
    blue.setColor(Sk.Color('#0000ff'));
    b.canvas.drawRect(Sk.XYWHRect(0, 0, 1, 1), blue); // at 0,0: the translate is gone
    const second = pool.snapshot(b);
    const px = pixelsOf(second);
    expect(Array.from(px.slice(0, 4))).toEqual([0, 0, 255, 255]);
    expect(px[(4 * 8 + 4) * 4 + 3]).toBe(0); // the red square was cleared away
    const old = pixelsOf(first);
    expect(Array.from(old.slice((4 * 8 + 4) * 4, (4 * 8 + 4) * 4 + 4))).toEqual([255, 0, 0, 255]);
    expect(old[3]).toBe(0);
    first.dispose();
    second.dispose();
    pool.dispose();
  }, 60_000);

  it('keeps at most two idle surfaces of a size, and no more idle bytes than its cap', async () => {
    const Sk = await headlessSkia();
    const pool = new SurfacePool(Sk, 64 * 64 * 4 * 3, 2);
    const three = [pool.take(64, 64), pool.take(64, 64), pool.take(64, 64)];
    three.forEach((d) => pool.give(d));
    const idle = (pool as unknown as { idle: unknown[] }).idle;
    expect(idle.length).toBe(2);
    pool.give(pool.take(128, 64)); // 2 + 2 units: over the cap of 3, the oldest goes
    expect(idle.length).toBe(2);
    expect((pool as unknown as { idleBytes: number }).idleBytes).toBeLessThanOrEqual(64 * 64 * 4 * 3);
    pool.dispose();
    expect(idle.length).toBe(0);
  }, 60_000);

  it('drawing the same page again makes no new surface, and the same pixels', async () => {
    const Sk = await headlessSkia();
    const drawer = new PageDrawer(Sk, new PageText(Sk, fontFiles()));
    // A 6x4 page with two framed photos drawn at under half the photo's size
    // (a halved copy each), its page and its bleed: surfaces of three sizes.
    const page: AlbumPage = {
      id: 'reuse', layout: 'freeform', templateId: 't64-duo-tall-framed', size: '6x4', slotFills: [0, 1],
      background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
    };
    const plan = planPage({ page, albumSize: '6x4', pageIndex: 2, photoCount: 2 });
    expect(plan.items.filter((it) => it.kind === 'photo').length).toBeGreaterThan(0);
    const photo = Sk.Surface.Make(4000, 3000);
    if (!photo) throw new Error('setup');
    const g = Sk.Paint();
    g.setColor(Sk.Color('#3E7CB1'));
    photo.getCanvas().drawCircle(2000, 1500, 1200, g);
    const img = photo.makeImageSnapshot();
    const once = drawer.renderPrintPage(plan, () => img);
    const made = drawer.surfaces.made;
    const twice = drawer.renderPrintPage(plan, () => img);
    expect(drawer.surfaces.made).toBe(made);
    expect(Buffer.compare(Buffer.from(pixelsOf(once)), Buffer.from(pixelsOf(twice)))).toBe(0);
    once.dispose();
    twice.dispose();
    drawer.dispose();
  }, 120_000);
});
