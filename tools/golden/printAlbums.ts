/* ══════════════════════════════════════════════════════════════════════════
   THE PRINT-FILE ALBUMS: three whole albums, dealt by the website's own album
   generator from the synthetic test photos (no real photos, ever), seeded so
   they are the same on every run, each with a front cover page the way the
   website makes one (useBuilderState createCoverPage + withNameTitle):
     • 8x8, 40 pages, hardbound, matte: a photo cover with its Cinzel title;
     • 6x4 softcover, glossy: a title-only cover on a dark colour (the back's
       mark turns light) with a subtitle;
     • 11.5x8 hardbound, matte: a photo cover, a long title in Playfair
       Display (the spine shrinks it to fit).
   The website (printWeb.mjs) and the app (mobile/test/printFiles.check.ts)
   make their print files from tools/golden/print-web/albums.json, written
   once from this, never from this file directly.
   ══════════════════════════════════════════════════════════════════════════ */

import { generateAlbum } from '../../src/pages/builder/generateAlbum';
import { getTemplateById } from '../../src/pages/builder/pageTemplates';
import type { AlbumPage, AlbumSizePreset, CoverType, MaterialType, TextElement } from '../../src/pages/builder/types';
import { mulberry32 } from '../../src/test/mulberry32';
import { PHOTO_SIZES } from './syntheticPhotos';
import { GOLDEN_SEED, type GoldenPhoto } from './goldenPages';

export interface PrintAlbumCase {
  name: string;
  orderNumber: string;
  albumSize: AlbumSizePreset;
  cover: CoverType;
  material: MaterialType;
  pages: AlbumPage[];
  coverFront: AlbumPage;
  photos: GoldenPhoto[];
}

const CINZEL = '"Cinzel", Georgia, "Times New Roman", serif';
const PLAYFAIR = '"Playfair Display", serif';
const DM_SANS = '"DM Sans", sans-serif';

/** `count` photos cycling through the 8 synthetic ones. */
function photosFor(count: number): GoldenPhoto[] {
  return Array.from({ length: count }, (_, i) => {
    const image = i % PHOTO_SIZES.length;
    return { id: `p${i}`, image, width: PHOTO_SIZES[image].width, height: PHOTO_SIZES[image].height };
  });
}

function deal(size: AlbumSizePreset, photos: GoldenPhoto[], seed: number): AlbumPage[] {
  const roll = photos.map((p, i) => ({
    id: p.id, previewUrl: '', name: `${p.id}.png`, type: 'image/png', size: 1000,
    width: p.width, height: p.height, capturedAt: Date.UTC(2026, 4, 1) + i * 60_000,
  }));
  const real = Math.random;
  Math.random = mulberry32(seed);
  try {
    return generateAlbum(roll, size);
  } finally {
    Math.random = real;
  }
}

const title = (text: string, over: Partial<TextElement> = {}): TextElement => ({
  // The cover editor's title defaults (useBuilderState withNameTitle).
  id: `cover-ft-${text.length}`, text, boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1,
  fontSize: 32, fontFamily: CINZEL, color: '#2D2D2D', bold: true, italic: false, underline: false,
  alignment: 'center', fromAlbumName: true, ...over,
});

const coverPage = (size: AlbumSizePreset, templateId: 'cover-hero' | 'cover-plain', extra: Partial<AlbumPage>): AlbumPage => ({
  id: `cover-front-${size}`, layout: 'freeform', templateId, size, photos: [],
  slotFills: templateId === 'cover-hero' ? [null] : [],
  background: { type: 'solid', solid: '#FFFBF7' },
  textElements: [],
  ...extra,
});

/** The smallest roll (from `from` photos up) whose seeded album has `pages` pages. */
function albumWith(size: AlbumSizePreset, pages: number | null, seed: number, from = 40): { photos: GoldenPhoto[]; album: AlbumPage[] } {
  for (let n = from; n <= 160; n++) {
    const photos = photosFor(n);
    const album = deal(size, photos, seed);
    if (pages == null || album.length === pages) return { photos, album };
  }
  throw new Error(`no roll from ${from} to 160 photos deals a ${size} album of ${pages} pages`);
}

/** Captions the customer typed: on the first pages that have a caption box,
 *  in the fonts the app draws (the generator writes no words itself), and one
 *  free title. So the print files carry sharp words (wordPatches). */
function withWords(album: AlbumPage[], captions: Partial<TextElement>[], freeTitleOn: number): AlbumPage[] {
  let k = 0;
  const out = album.map((p, i) => {
    const t = p.templateId ? getTemplateById(p.templateId) : undefined;
    if (k >= captions.length || !t?.textSlots?.length) return p;
    const c = captions[k++];
    return { ...p, textElements: [...(p.textElements ?? []), { ...title(String(c.text)), id: `cap-${i}`, fromAlbumName: false, bold: false, fontSize: 24, color: '#2D2D2D', ...c, boxIndex: 0 }] };
  });
  if (k < captions.length) throw new Error(`only ${k} pages have a caption box`);
  const page = out[freeTitleOn];
  out[freeTitleOn] = {
    ...page,
    textElements: [...(page.textElements ?? []), {
      // opacity is a percentage on a free text (a box caption ignores it).
      ...title('Day one'), id: `free-${freeTitleOn}`, boxIndex: undefined, fromAlbumName: false, opacity: 100,
      x: 40, y: 30, width: 420, fontFamily: PLAYFAIR, fontSize: 44, color: '#FFFFFF', outlineColor: '#2D2D2D', outlineWidth: 3,
    }],
  };
  return out;
}

export function buildPrintAlbums(): PrintAlbumCase[] {
  const a = albumWith('8x8', 40, GOLDEN_SEED);
  const b = albumWith('6x4', null, GOLDEN_SEED + 1);
  const c = albumWith('11.5x8', null, GOLDEN_SEED + 2, 64);
  a.album = withWords(a.album, [
    { text: 'Our first beach day', fontFamily: PLAYFAIR, fontSize: 28 },
    { text: 'Sunday lunch at home, everyone together', fontFamily: DM_SANS, fontSize: 22, alignment: 'left' },
    { text: 'The castle lights came on', fontFamily: PLAYFAIR, italic: true, shadow: true },
  ], 6);
  b.album = withWords(b.album, [{ text: 'Happy birthday, Lola!', fontFamily: DM_SANS, bold: true, fontSize: 26 }], 3);
  c.album = withWords(c.album, [
    { text: 'Rainy afternoon', fontFamily: PLAYFAIR, fontSize: 30, underline: true },
    { text: 'Everyone came', fontFamily: DM_SANS, fontSize: 24, color: '#B85C38' },
  ], 9);
  return [
    {
      name: 'album-8x8-40p', orderNumber: 'MP-TEST-8X8', albumSize: '8x8', cover: 'hardboundLinen', material: 'matte',
      pages: a.album, photos: a.photos,
      coverFront: coverPage('8x8', 'cover-hero', { slotFills: [3], textElements: [title('Our Summer', { color: '#FFFFFF' })] }),
    },
    {
      name: 'album-6x4', orderNumber: 'MP-TEST-6X4', albumSize: '6x4', cover: 'softcover', material: 'glossy',
      pages: b.album, photos: b.photos,
      coverFront: coverPage('6x4', 'cover-plain', {
        background: { type: 'solid', solid: '#1F3A5F' },
        textElements: [
          title('Lola turns 80', { color: '#FFFBF7' }),
          { ...title('May 2026', { fontFamily: DM_SANS, fontSize: 18, bold: false, color: '#FFFBF7', fromAlbumName: false }), id: 'cover-sub', boxIndex: 1 },
        ],
      }),
    },
    {
      name: 'album-11.5x8', orderNumber: 'MP-TEST-1158', albumSize: '11.5x8', cover: 'hardboundLinen', material: 'matte',
      pages: c.album, photos: c.photos,
      coverFront: coverPage('11.5x8', 'cover-hero', {
        slotFills: [5],
        textElements: [title('A Year of Sunday Lunches with Everyone We Love', { fontFamily: PLAYFAIR, fontSize: 30, color: '#FFFFFF' })],
      }),
    },
  ];
}
