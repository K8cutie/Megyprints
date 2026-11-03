/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S MASK PICTURES, IN THE APP (src/builder/siteFiles.ts).

   Owner's phone test, 2026-11-03: Place order said "The app can't make this
   album's print file yet: page 1 has picture file /masks/deckle.png." A
   photo with a textured edge (Mask: deckle, torn, brushed, frost, paint,
   watercolor) names a picture the website serves from public/masks; the app
   had none of them, so the order stopped, and the Preview drew the photo
   without its edge.
     • every mask picture a page can name is in the app, the website's file
       byte for byte (as base64 in the app's code: an Android resource step
       may re-encode a PNG; the golden phone build does the same);
     • an album with textured edges makes its print files; without the
       pictures it still stops, naming the page and the file;
     • Place order and the Preview both use them.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage } from '@web/pages/builder/types';
import { maskOverlayUrl, maskTextureUrl, TEXTURE_MASKS } from '@web/pages/builder/maskShapes';
import { siteFile, SITE_FILE_NAMES } from '../src/builder/siteFiles';
import { checkoutFiles, NotDrawnError, type OpenPhoto, type PrintAlbum, type PrintTools } from '../src/print/printFiles';
import { headlessPrintTools } from './print/headlessPrint';

const REPO = path.resolve(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const MASKS = path.join(REPO, 'public', 'masks');

describe('the mask pictures in the app', () => {
  it('every edge and overlay a page can name: the website\'s file, byte for byte', () => {
    const named = TEXTURE_MASKS.flatMap((m) => [maskTextureUrl(m), maskOverlayUrl(m)]).filter((s): s is string => !!s);
    expect(named.length).toBeGreaterThanOrEqual(TEXTURE_MASKS.length + 1);
    for (const src of named) {
      const bytes = siteFile(src);
      expect(bytes).not.toBeNull();
      expect(Buffer.from(bytes!).equals(fs.readFileSync(path.join(REPO, 'public', src)))).toBe(true);
    }
  });

  it('exactly the website\'s public/masks folder: a picture added there must come in too', () => {
    const web = fs.readdirSync(MASKS).filter((f) => f.endsWith('.png')).map((f) => `/masks/${f}`).sort();
    expect([...SITE_FILE_NAMES].sort()).toEqual(web);
  });

  it('anything else is not the app\'s to give', () => {
    for (const src of ['/themes/wedding/pages/wedding1_tl.png', '/masks/none.png', '/masks/../masks/deckle.png', 'masks/deckle.png', 'data:image/png;base64,AAAA']) {
      expect(siteFile(src)).toBeNull();
    }
  });

  it('opened once, then kept', () => {
    expect(siteFile('/masks/torn.png')).toBe(siteFile('/masks/torn.png'));
  });
});

describe('an album with textured edges', () => {
  let Sk: Skia;
  let tools: PrintTools;
  beforeAll(async () => { ({ Sk, tools } = await headlessPrintTools()); }, 600_000);

  const photo = (): SkImage => {
    const s = Sk.Surface.Make(300, 200)!;
    s.getCanvas().clear(Sk.Color('#B85C38'));
    s.flush();
    const img = s.makeImageSnapshot();
    s.dispose();
    return img;
  };
  const open: OpenPhoto = async () => photo();
  const page = (id: string, slotMasks: string[]): AlbumPage => ({
    id, layout: 'freeform', templateId: 't64-fb-duo-tall-gap', size: '6x4', slotFills: [0, 1], slotMasks, photos: [],
    background: { type: 'solid', solid: '#FFFFFF' }, textElements: [],
  } as unknown as AlbumPage);
  const album = (): PrintAlbum => ({
    albumSize: '6x4', photoCount: 2, coverFront: null,
    pages: [page('a', ['deckle', 'torn']), page('b', ['watercolor', 'brushed']), page('c', ['frost', 'paint'])],
  });
  const ORDER = { cover: 'softcover' as const, material: 'matte' as const };

  it('Place order makes its print files (the owner\'s "page 1 has picture file /masks/deckle.png")', async () => {
    const files = checkoutFiles(album(), ORDER, open, { Skia: tools.Skia, drawer: tools.drawer, text: tools.text, files: siteFile });
    try {
      const pdf = await files.makePages(() => {});
      expect(pdf.byteLength).toBeGreaterThan(1000);
    } finally {
      files.dispose();
    }
  }, 600_000);

  it('without the pictures it still stops, naming the page and the file', () => {
    expect(() => checkoutFiles(album(), ORDER, open, { Skia: tools.Skia, drawer: tools.drawer, text: tools.text })).toThrow(NotDrawnError);
    expect(() => checkoutFiles(album(), ORDER, open, { Skia: tools.Skia, drawer: tools.drawer, text: tools.text })).toThrow(/page 1 has picture file \/masks\/deckle\.png, picture file \/masks\/torn\.png/);
  });
});

describe('Place order and the Preview use them', () => {
  it('the order\'s print files', () => {
    expect(read('mobile/src/lib/checkout/phoneSend.ts')).toContain('{ Skia, drawer, text: o.text, files: siteFile },');
  });

  it('the Preview\'s and the editor\'s page pictures', () => {
    expect(read('mobile/src/builder/pageImages.ts')).toContain('const assets = new AssetCache(Sk, siteFile);');
  });
});
