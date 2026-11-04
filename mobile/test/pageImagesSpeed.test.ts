/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   A PAGE ON SCREEN IS DRAWN WITH SKIA'S OWN SAMPLING; THE PRINT FILE KEEPS
   CHROME'S (owner, 2026-11-04: "most importantly performance issue").

   Timed on the emulator with a 150-photo album of 12 MP photos: drawing a
   page picture for the Preview took 33-100 ms of the JavaScript thread,
   about 35 ms a photo, and a tap waited behind it. The time went into
   Chrome's sampling (render/sampling.ts): a halving and an older bilinear,
   both runtime shaders, which the phone's Skia runs interpreted on its CPU.
   The print file needs them (a pixel there matches the website's); a
   picture on a phone's screen does not, so screen pictures (pageImages
   drawPageImage: the Preview, the editor, a layout's picture) draw photos
   with Skia's native smooth sampling, and look the same.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, UploadedPhoto } from '@web/pages/builder/types';
import { drawPageImage, planFor, type PageRequest } from '../src/builder/pageImages';
import { PageDrawer } from '../src/render/drawPage';
import { PageText } from '../src/render/pageText';
import { ChromeSampling } from '../src/render/sampling';
import { headlessSkia, fontFiles, pixelsOf } from './golden/headless';

let Sk: Skia;
let text: PageText;
let photo: SkImage;
beforeAll(async () => {
  Sk = await headlessSkia();
  text = new PageText(Sk, fontFiles());
  // A photo-like picture, 1280 x 960 (the app's small copy of a phone photo):
  // a smooth sky, a sun and a hill with hard edges.
  const s = Sk.Surface.Make(1280, 960)!;
  const c = s.getCanvas();
  const sky = Sk.Paint();
  sky.setShader(Sk.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: 960 }, [Sk.Color('#6FA8DC'), Sk.Color('#F6E3C0')], null, 0));
  c.drawRect(Sk.XYWHRect(0, 0, 1280, 960), sky);
  const sun = Sk.Paint();
  sun.setColor(Sk.Color('#F2B233'));
  sun.setAntiAlias(true);
  c.drawCircle(900, 260, 120, sun);
  const hill = Sk.Paint();
  hill.setColor(Sk.Color('#3E7A3A'));
  hill.setAntiAlias(true);
  c.drawCircle(400, 1300, 700, hill);
  photo = s.makeImageSnapshot();
  s.dispose();
}, 60_000);

const thePhoto: UploadedPhoto = { id: 'ph1', name: 'IMG_1.jpg', previewUrl: 'file:///photos/IMG_1.jpg', type: 'image/jpeg', size: 1, width: 1280, height: 960 } as UploadedPhoto;
const page = {
  id: 'p', layout: 'freeform', size: '8x8', photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFFFF', opacity: 100 },
  templateId: 't88-fb-solo', slotFills: [0],
} as unknown as AlbumPage;
const req: PageRequest = { page, pageIndex: 1, albumSize: '8x8', photos: [thePhoto], width: 600 };
const images = { image: async () => photo };

/** The page drawn the print file's way (the default PageDrawer), as drawPageImage draws it. */
function drawnForPrint(): SkImage {
  const plan = planFor(req);
  const scale = req.width / plan.width;
  const s = Sk.Surface.Make(req.width, Math.round(plan.height * scale))!;
  const canvas = s.getCanvas();
  canvas.scale(scale, scale);
  const drawer = new PageDrawer(Sk, text);
  try {
    drawer.draw(canvas, plan, () => photo);
  } finally {
    drawer.dispose();
  }
  s.flush();
  const img = s.makeImageSnapshot();
  s.dispose();
  return img;
}

afterEach(() => { jest.restoreAllMocks(); });

describe('a page picture on screen', () => {
  it("draws its photo with Skia's own sampling, never the print file's Chrome shaders", async () => {
    const level = jest.spyOn(ChromeSampling.prototype, 'levelShader');
    const halved = jest.spyOn(ChromeSampling.prototype, 'decoded');
    const d = await drawPageImage(Sk, text, req, images);
    expect(level).not.toHaveBeenCalled();
    expect(halved).not.toHaveBeenCalled();
    d.image.dispose();
  });

  it('the print drawing still samples the way Chrome does (unchanged)', () => {
    const level = jest.spyOn(ChromeSampling.prototype, 'levelShader');
    drawnForPrint().dispose();
    expect(level).toHaveBeenCalled();
  });

  it('looks the same as the print drawing at screen size: the same photo in the same place', async () => {
    const d = await drawPageImage(Sk, text, req, images);
    const print = drawnForPrint();
    const a = pixelsOf(d.image);
    const b = pixelsOf(print);
    expect(a.length).toBe(b.length);
    let sum = 0;
    let n = 0;
    let far = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const diff = Math.abs(a[i + k] - b[i + k]);
        sum += diff;
        n++;
        if (diff > 24) far++;
      }
    }
    // Only the sampling differs: a level or two on average, a handful of
    // edge pixels more. A photo moved, scaled or recoloured would be tens.
    expect(sum / n).toBeLessThan(1.5);
    expect(far / n).toBeLessThan(0.01);
    d.image.dispose();
    print.dispose();
  });
});
