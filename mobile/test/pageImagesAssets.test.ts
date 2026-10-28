/**
 * @jest-environment node
 */
/* The app's page pictures (builder/pageImages.ts, the Preview and the cover
   step) draw the pictures the album keeps inside it (a sticker, a memory QR
   code, a graphic: PNG data: URLs) and list, never fake, a picture file the
   app does not have yet (a background stored by address, a textured edge's
   /masks pictures, a theme's corner art): print draws such a page without
   it, and so does the app, but the page's notDrawn names it, so the screen
   says the page looks simpler here than in print. */
import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage } from '@web/pages/builder/types';
import { drawPageImage } from '../src/builder/pageImages';
import { PageText } from '../src/render/pageText';
import { headlessSkia, fontFiles, pixelsOf } from './golden/headless';

let Sk: Skia;
let text: PageText;
beforeAll(async () => {
  Sk = await headlessSkia();
  text = new PageText(Sk, fontFiles());
}, 60_000);

/** A red square as a PNG data: URL (a sticker the website rasterised). */
function redSquarePng(): string {
  const s = Sk.Surface.Make(64, 64);
  if (!s) throw new Error('no surface');
  s.getCanvas().clear(Sk.Color('#D02020'));
  const img = s.makeImageSnapshot();
  const bytes = img.encodeToBytes(ImageFormat.PNG, 100);
  img.dispose();
  s.dispose();
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

const page = (over: Partial<AlbumPage>): AlbumPage => ({
  id: 'p', layout: 'freeform', size: '8x8', slotFills: [], photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFBF7', opacity: 100 },
  ...over,
} as AlbumPage);

const noPhotos = { image: async () => null };

describe("the app's page pictures draw the album's own pictures and list the files it lacks", () => {
  it('a sticker kept in the album is drawn where it sits, and nothing is listed', async () => {
    const p = page({ stickers: [{ uid: 's1', pack: 'test', id: 'red', appliedAt: 0, pngDataUrl: redSquarePng(), geom: { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rot: 0 } }] });
    const d = await drawPageImage(Sk, text, { page: p, pageIndex: 1, albumSize: '8x8', photos: [], width: 200 }, noPhotos);
    expect(d.plan.notDrawn).toEqual([]);
    const px = pixelsOf(d.image);
    const at = (x: number, y: number) => Array.from(px.slice((y * 200 + x) * 4, (y * 200 + x) * 4 + 3));
    expect(at(100, 100)).toEqual([208, 32, 32]); // the sticker's red at the page's centre
    expect(at(10, 10)).toEqual([255, 251, 247]); // the paper colour outside it
    d.image.dispose();
  });

  it('a background stored by address (not an album photo) is drawn as paper and named in notDrawn', async () => {
    const src = 'content://media/external/images/media/9';
    const p = page({ background: { type: 'image', image: src, photoId: 'elsewhere', opacity: 100 } as AlbumPage['background'] });
    const d = await drawPageImage(Sk, text, { page: p, pageIndex: 1, albumSize: '8x8', photos: [], width: 200 }, noPhotos);
    expect(d.plan.assets).toEqual([src]);
    expect(d.plan.notDrawn).toEqual([`picture file ${src}`]);
    const px = pixelsOf(d.image);
    expect(Array.from(px.slice((100 * 200 + 100) * 4, (100 * 200 + 100) * 4 + 3))).toEqual([255, 251, 247]);
    d.image.dispose();
  });

  it('a picture kept in the album that will not open is named too, not drawn as something else', async () => {
    const p = page({ stickers: [{ uid: 's1', pack: 'test', id: 'broken', appliedAt: 0, pngDataUrl: 'data:image/png;base64,AAAA', geom: { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rot: 0 } }] });
    const d = await drawPageImage(Sk, text, { page: p, pageIndex: 1, albumSize: '8x8', photos: [], width: 200 }, noPhotos);
    expect(d.plan.notDrawn).toEqual(['a picture kept in the album that could not be opened']);
    d.image.dispose();
  });
});
