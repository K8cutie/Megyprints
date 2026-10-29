/**
 * @jest-environment node
 */
/* How the renderer samples a picture the way Chrome's canvas does
   (src/render/sampling.ts): the halving level Chrome picks, the halving
   itself, and the older 1/16-pixel bilinear. The golden check holds whole
   pages to the website's; these pin the pieces. */
import { AlphaType, ColorType } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ChromeSampling, halve, mipLevelFor } from '../src/render/sampling';
import { PageDrawer } from '../src/render/drawPage';
import type { PageText } from '../src/render/pageText';
import { headlessSkia, pixelsOf } from './golden/headless';

const premul = (w: number, h: number) => ({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul });

/** Premultiplied pixels a halving can tell apart: every channel different, see-through ones too. */
function noisyPremul(w: number, h: number, seed: number): Uint8Array {
  const px = new Uint8Array(w * h * 4);
  let x = seed >>> 0;
  const next = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x >>> 24; };
  for (let i = 0; i < w * h; i++) {
    const a = i % 7 === 0 ? 255 : next();
    px.set([next() % (a + 1), next() % (a + 1), next() % (a + 1), a], i * 4);
  }
  return px;
}

const readPremul = (img: SkImage): Uint8Array => {
  const px = img.readPixels(0, 0, premul(img.width(), img.height()));
  if (!(px instanceof Uint8Array)) throw new Error('no pixels');
  return px;
};

describe("Chrome's halving level (cc MipMapUtil::GetLevelForSize)", () => {
  it('halves only while the next halving still covers the drawn size both ways', () => {
    expect(mipLevelFor(900, 900, 451, 451)).toBe(0);
    expect(mipLevelFor(900, 900, 450, 450)).toBe(1); // exactly half: halved
    expect(mipLevelFor(900, 900, 270, 270)).toBe(1);
    expect(mipLevelFor(900, 900, 225, 225)).toBe(2);
    expect(mipLevelFor(1024, 1024, 200, 200)).toBe(2);
    // Stretched: under half one way only is not halved.
    expect(mipLevelFor(1024, 1024, 720, 336)).toBe(0);
    expect(mipLevelFor(3200, 2400, 1600, 1200)).toBe(1);
    expect(mipLevelFor(3200, 2400, 1588, 1191)).toBe(1);
    expect(mipLevelFor(1, 1, 1, 1)).toBe(0);
  });
});

describe('one halving (Skia mip step, premultiplied, truncated)', () => {
  it('averages 2 x 2 on even sides, truncating', () => {
    const px = new Uint8Array([10, 20, 30, 255, 11, 21, 31, 255, 12, 22, 32, 255, 14, 24, 34, 255]);
    const out = halve(px, 2, 2);
    expect([out.w, out.h]).toEqual([1, 1]);
    expect(Array.from(out.px)).toEqual([11, 21, 31, 255]); // (10+11+12+14)/4 = 11.75 → 11
  });
  it('takes 1-2-1 across an odd side', () => {
    const row = [0, 100, 200].flatMap((v) => [v, v, v, 255]);
    const out = halve(new Uint8Array([...row, ...row]), 3, 2);
    expect([out.w, out.h]).toEqual([1, 1]);
    expect(out.px[0]).toBe(100); // (0 + 2·100 + 200)·2 / 8
  });
});

describe("the renderer's halving, drawn by Skia, is the JavaScript halving byte for byte", () => {
  let Sk: Skia;
  beforeAll(async () => { Sk = await headlessSkia(); }, 60_000);

  it.each([[8, 6], [7, 5], [9, 9], [1, 9], [9, 1], [2, 1], [3, 3], [1, 1], [64, 33], [33, 64], [255, 17]])('%i x %i, see-through pixels included', (w, h) => {
    const px = noisyPremul(w, h, w * 1000 + h);
    const img = Sk.Image.MakeImage(premul(w, h), Sk.Data.fromBytes(px), w * 4);
    if (!img) throw new Error('no image');
    const sampling = new ChromeSampling(Sk);
    const out = sampling.halveOnce(img);
    const ref = halve(px, w, h);
    expect([out.width(), out.height()]).toEqual([ref.w, ref.h]);
    expect(Buffer.compare(Buffer.from(readPremul(out)), Buffer.from(ref.px))).toBe(0);
    // Premultiplied, or Skia filters its see-through edges unpremultiplied
    // (CanvasKit's surfaces are unpremultiplied: the first version drew
    // sticker edges up to 51 levels off from that).
    expect(out.getImageInfo().alphaType).toBe(AlphaType.Premul);
    out.dispose();
    img.dispose();
  });

  it('three halvings in a row (a picture drawn at an eighth of its size), opaque', () => {
    const w = 203, h = 150;
    const px = noisyPremul(w, h, 7).map((v, i) => (i % 4 === 3 ? 255 : v));
    const img = Sk.Image.MakeImage({ ...premul(w, h), alphaType: AlphaType.Opaque }, Sk.Data.fromBytes(px), w * 4);
    if (!img) throw new Error('no image');
    const sampling = new ChromeSampling(Sk);
    let ref: { px: Uint8Array; w: number; h: number } = { px, w, h };
    for (let k = 0; k < 3; k++) ref = halve(ref.px, ref.w, ref.h);
    const out = sampling.decoded(img, 3);
    expect([out.width(), out.height()]).toEqual([ref.w, ref.h]);
    expect(Buffer.compare(Buffer.from(readPremul(out)), Buffer.from(ref.px))).toBe(0);
    sampling.dispose();
    img.dispose();
  });
});

describe('halved copies live only while one drawing lasts (never across an album)', () => {
  it('a page or picture drawn on its own lets go of them at its end; drawings inside one share them', async () => {
    const Sk = await headlessSkia();
    const drawer = new PageDrawer(Sk, {} as PageText);
    const inner = drawer as unknown as { sampling: { halveOnce: (img: SkImage) => SkImage; ready: Map<unknown, unknown> } };
    let halvings = 0;
    const real = inner.sampling.halveOnce.bind(inner.sampling);
    inner.sampling.halveOnce = (img) => { halvings++; return real(img); };
    const w = 400, h = 300;
    const big = Sk.Image.MakeImage({ ...premul(w, h), alphaType: AlphaType.Opaque }, Sk.Data.fromBytes(noisyPremul(w, h, 3).map((v, i) => (i % 4 === 3 ? 255 : v))), w * 4);
    const surface = Sk.Surface.Make(200, 200);
    if (!big || !surface) throw new Error('setup');
    const c = surface.getCanvas();
    // 400 x 300 drawn at 90 x 60: two halvings.
    drawer.drawPicture(c, big, { x: 10, y: 10, w: 90, h: 60 }, true);
    expect(halvings).toBe(2);
    expect(inner.sampling.ready.size).toBe(0);
    halvings = 0;
    drawer.drawing(() => {
      drawer.drawPicture(c, big, { x: 10, y: 10, w: 90, h: 60 }, true);
      drawer.drawPicture(c, big, { x: 100, y: 100, w: 90, h: 60 }, true);
      expect(inner.sampling.ready.size).toBe(1); // kept while the drawing lasts
    });
    expect(halvings).toBe(2); // made once, used twice
    expect(inner.sampling.ready.size).toBe(0);
    surface.dispose();
    big.dispose();
    drawer.dispose();
  }, 60_000);
});

describe('the older bilinear (1/16 pixel, whole-number weights)', () => {
  it('copies a picture drawn 1:1 on whole pixels exactly, and cuts a fractional spot to 1/16', async () => {
    const Sk = await headlessSkia();
    const sampling = new ChromeSampling(Sk);
    // A sharp edge: 20 columns of 255, 20 of 35.
    const w = 40, h = 4;
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { const v = i % w < 20 ? 255 : 35; px.set([v, v, v, 255], i * 4); }
    const info = { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul };
    const img = Sk.Image.MakeImage(info, Sk.Data.fromBytes(px), w * 4);
    if (!img) throw new Error('no image');
    const draw = (x: number) => {
      const s = Sk.Surface.Make(60, 4);
      if (!s) throw new Error('no surface');
      const p = Sk.Paint();
      p.setShader(sampling.levelShader(img, { x: 0, y: 0, w, h }, { x, y: 0, w, h }));
      s.getCanvas().drawRect(Sk.XYWHRect(x, 0, w, h), p);
      s.flush();
      const snap = s.makeImageSnapshot();
      const row = Array.from(pixelsOf(snap)).filter((_, i) => i % 4 === 0).slice(0, 60);
      snap.dispose();
      s.dispose();
      return row;
    };
    expect(draw(10).slice(28, 32)).toEqual([255, 255, 35, 35]);
    // Chrome (measured): at x + 0.193 the edge pixel is 90 (12/16 of the way), not 77 (exact).
    expect(draw(10.193)[30]).toBe(90);
    expect(draw(10.3)[30]).toBe(103);
    expect(draw(10.55)[30]).toBe(158);
    img.dispose();
    sampling.dispose();
  }, 60_000);
});
