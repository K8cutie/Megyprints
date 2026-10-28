/**
 * @jest-environment node
 */
/* How the renderer samples a picture the way Chrome's canvas does
   (src/render/sampling.ts): the halving level Chrome picks, the halving
   itself, and the older 1/16-pixel bilinear. The golden check holds whole
   pages to the website's; these pin the pieces. */
import { AlphaType, ColorType } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ChromeSampling, halve, mipLevelFor } from '../src/render/sampling';
import { headlessSkia, pixelsOf } from './golden/headless';

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
