/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES: a fixed set of album pages that the website's print
   renderer and the 2.0 app's page renderer must draw the same.

   Part A comes from the website's own album generator (generateAlbum), seeded
   so it deals the same album every time (mulberry32, the seed the generator
   specs use), on all five album sizes. Part B is made by hand for what the
   generator doesn't do on its own: pans and zooms, every mask shape print
   draws, page colours, washes and faded backgrounds, every frame style
   (round slots too), the template's turned slot, a moved frame, captions in
   every style of the bundled fonts, a quote in a photo frame, free titles
   (outlined; turned and stretched with a shadow; see-through), a photo in a
   caption box, and a photo saved with a Display P3 colour profile.

   Part C covers what a page can hold besides photos and words, each on at
   least three pages across 8x8 and 6x4: page textures (tinted, faded),
   washes, memory QR codes (the corner chip at its printed size, in a caption
   box, moved and turned), graphics (in a photo frame, in a caption box,
   moved and turned), stickers, colour looks, soft and textured photo edges,
   corner art and photo backgrounds. And the COVERS: the cover file (back,
   spine, front) of cover pages and of the old cover form, softcover and
   hardcover, matte and glossy.

   A QR code or a graphic is stored in the album as the PNG the website made
   when it was added (qrMemory generateQrPngDataUrl, ornaments
   rasterizeOrnamentPng). Here it is written as a placeholder
   ('golden:qr:<link>', 'golden:ornament:<pack>/<id>'), and renderWeb.mjs has
   the website make the real PNG in Chromium before anything is drawn.

   renderWeb.mjs writes the result to tools/golden/web/pages.json once, with
   the website's pictures of it. The app's test reads that file, never this
   one, so a change to the generator can't quietly change what is compared.
   ══════════════════════════════════════════════════════════════════════════ */

import { generateAlbum } from '../../src/pages/builder/generateAlbum';
import type { AlbumPage, AlbumSizePreset, TextElement, SlotText, CoverDesign, CoverType, MaterialType, QrFill, OrnamentFill, OrnamentTransform } from '../../src/pages/builder/types';
import { COVERS } from '../../src/pages/builder/types';
import { NEW_WORDS_LOOK } from '../../src/pages/builder/freeWords';
import { mulberry32 } from '../../src/test/mulberry32';
import { PHOTO_SIZES, P3_PHOTO, P3_PHOTO_IMAGE, BIG_PHOTO, BIG_PHOTO_IMAGE, CORNER_BASE } from './syntheticPhotos';

/** Strict: a page with photos and no words. Text: a page with words. */
export type GoldenKind = 'photos' | 'text';

export interface GoldenCase {
  name: string;
  albumSize: AlbumSizePreset;
  pageIndex: number;
  kind: GoldenKind;
  /** What the page is there to check, in a few words. */
  checks: string;
  page: AlbumPage;
}

export interface GoldenPhoto {
  id: string;
  /** Which synthetic photo (PHOTO_SIZES index). */
  image: number;
  width: number;
  height: number;
}

/** A cover file: the input renderCoverWrapForPrint takes (photos aside). */
export interface GoldenCover {
  name: string;
  albumSize: AlbumSizePreset;
  pageCount: number;
  cover: CoverType;
  material: MaterialType;
  checks: string;
  /** The front cover page; without it the old cover form (coverDesign) prints. */
  coverFront?: AlbumPage;
  coverDesign?: CoverDesign;
}

export interface GoldenSet {
  seed: number;
  photos: GoldenPhoto[];
  cases: GoldenCase[];
  covers: GoldenCover[];
}

/** A memory QR as the album keeps it; renderWeb.mjs has the website make its PNG. */
export const goldenQr = (code: string): QrFill => ({
  code, destination: 'https://youtu.be/golden', memoryUrl: `https://megyprints.app/m/${code}`,
  qrPngDataUrl: `golden:qr:https://megyprints.app/m/${code}`, createdAt: Date.UTC(2026, 4, 1), kind: 'link',
} as QrFill);

/** A graphic as the album keeps it; renderWeb.mjs has the website rasterise it. */
export const goldenOrnament = (pack: string, id: string): OrnamentFill => ({ pack, id, pngDataUrl: `golden:ornament:${pack}/${id}` });

/** The seed the generator specs start from (src/test/seededRandom TEST_SEED). */
export const GOLDEN_SEED = 0x5eed;

/** 48 photos, cycling through the 8 synthetic ones, a minute apart. */
export function goldenPhotos(): GoldenPhoto[] {
  return Array.from({ length: 48 }, (_, i) => {
    const image = i % PHOTO_SIZES.length;
    return { id: `p${i}`, image, width: PHOTO_SIZES[image].width, height: PHOTO_SIZES[image].height };
  });
}

const PLAYFAIR = '"Playfair Display", serif';
const DM_SANS = '"DM Sans", sans-serif';
const DANCING = '"Dancing Script", cursive';

const style = (over: Partial<SlotText> & { text: string }): SlotText => ({
  fontSize: 28, fontFamily: PLAYFAIR, color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center',
  ...over,
});

let textId = 0;
const caption = (boxIndex: number, over: Partial<TextElement> & { text: string }): TextElement => ({
  ...style(over), id: `t${++textId}`, x: 0, y: 0, rotation: 0, opacity: 100, boxIndex, ...over,
});

const page = (size: AlbumSizePreset, templateId: string, slotFills: (number | null)[], extra: Partial<AlbumPage> = {}): AlbumPage => ({
  id: `golden-${templateId}-${slotFills.join('-')}`,
  layout: 'freeform',
  templateId,
  size,
  slotFills,
  background: { type: 'solid', solid: '#FFFFFF' },
  photos: [],
  textElements: [],
  ...extra,
});

const hasWords = (p: AlbumPage) =>
  (p.textElements ?? []).some((t) => !!t.text?.trim()) || (p.slotTexts ?? []).some((t) => !!t?.text?.trim());

/** Build the set. Deterministic: same pages on every machine. */
export function buildGoldenSet(): GoldenSet {
  textId = 0;
  const photos = goldenPhotos();
  const roll = photos.map((p, i) => ({
    id: p.id, previewUrl: '', name: `${p.id}.png`, type: 'image/png', size: 1000,
    width: p.width, height: p.height, capturedAt: Date.UTC(2026, 4, 1) + i * 60_000,
  }));

  // ── Part A: the generator's own pages, seeded. The first two sizes are
  //    dealt one after the other from one seed (as they always were, so their
  //    pages stay the same); the other sizes each from a fresh seed. ──
  const real = Math.random;
  let album88: AlbumPage[];
  let album64: AlbumPage[];
  Math.random = mulberry32(GOLDEN_SEED);
  try {
    album88 = generateAlbum(roll, '8x8');
    album64 = generateAlbum(roll, '6x4');
  } finally {
    Math.random = real;
  }
  const deal = (size: AlbumSizePreset): AlbumPage[] => {
    Math.random = mulberry32(GOLDEN_SEED);
    try {
      return generateAlbum(roll, size);
    } finally {
      Math.random = real;
    }
  };
  const album66 = deal('6x6');
  const album86 = deal('8x6');
  const album68 = deal('6x8');
  const fromAlbum = (album: AlbumPage[], size: AlbumSizePreset, templateId: string, checks: string): GoldenCase => {
    const pageIndex = album.findIndex((p) => p.templateId === templateId);
    if (pageIndex < 0) throw new Error(`the seeded ${size} album has no ${templateId} page any more: pick another`);
    return { name: `gen-${size}-p${pageIndex}-${templateId}`, albumSize: size, pageIndex, kind: 'photos', checks, page: album[pageIndex] };
  };
  const partA: GoldenCase[] = [
    fromAlbum(album88, '8x8', 't88-fb-solo', 'full-bleed single, page 1 (right-hand page)'),
    fromAlbum(album88, '8x8', 't88-fb-duo-exact-h-gap', 'two photos stacked'),
    fromAlbum(album88, '8x8', 't88-fb-duo-exact-v-gap', 'two photos side by side'),
    fromAlbum(album88, '8x8', 't88-fb-solo-ls-twobox-above', 'single with two empty caption boxes'),
    fromAlbum(album64, '6x4', 't64-duo-tall-framed', '6x4 framed duo'),
    fromAlbum(album64, '6x4', 't64-fb-duo-tall-gap', '6x4 full-bleed duo'),
    fromAlbum(album64, '6x4', 't64-fb-duo-sq-band-b', '6x4 square duo with an empty band'),
    fromAlbum(album66, '6x6', 't66-fb-duo-exact-v-gap', '6x6 two photos side by side'),
    fromAlbum(album86, '8x6', 't86-duo-34-framed', '8x6 framed duo'),
    fromAlbum(album68, '6x8', 't68-trio-34-cols-b', '6x8 three photos in columns'),
  ];

  // The Display P3 photo goes after the generator's roll (it never saw it).
  const p3Index = photos.length;
  photos.push({ id: 'p3', image: P3_PHOTO_IMAGE, width: P3_PHOTO.width, height: P3_PHOTO.height });
  // So does the big photo (Part C), after it.
  const bigIndex = photos.length;
  photos.push({ id: 'pbig', image: BIG_PHOTO_IMAGE, width: BIG_PHOTO.width, height: BIG_PHOTO.height });

  // ── Part B: by hand ──
  const b = (name: string, albumSize: AlbumSizePreset, pageIndex: number, checks: string, p: AlbumPage): GoldenCase =>
    ({ name, albumSize, pageIndex, kind: hasWords(p) ? 'text' : 'photos', checks, page: p });

  const partB: GoldenCase[] = [
    b('pan-zoom-portrait', '8x8', 4, 'zoom 1.35 and a pan, left-hand page', page('8x8', 't88-solo-portrait', [1], {
      slotScales: [1.35], slotOffsetsX: [40], slotOffsetsY: [-60],
    })),
    b('pan-held-at-edge', '8x8', 9, 'a pan bigger than the photo allows is held at its edge', page('8x8', 't88-solo-landscape', [5], {
      slotOffsetsX: [-5000], slotOffsetsY: [0],
    })),
    b('masks-circle-heart-star', '8x8', 5, 'circle, heart and star masks', page('8x8', 't88-fb-trio-hero-left-gap', [3, 0, 2], {
      slotMasks: ['circle', 'heart', 'star'],
    })),
    b('masks-paths', '8x8', 6, 'hexagon, arch, scallop and cut-corner masks with pans', page('8x8', 't88-fb-quad-grid-gap', [0, 1, 2, 7], {
      slotMasks: ['hexagon', 'arch', 'scallop', 'ticket'],
      slotScales: [1, 1.2, 1, 1.5], slotOffsetsX: [0, 20, 0, -30], slotOffsetsY: [0, 0, 0, 25],
    })),
    b('masks-edges', '8x8', 10, 'pinking, stamp, wavy and leaf masks', page('8x8', 't88-fb-quad-hero-top-gap', [5, 3, 0, 2], {
      slotMasks: ['wavy', 'pinking', 'stamp', 'leaf'],
    })),
    b('gradient-duo-caption', '8x8', 7, 'linear wash 135°, a left-aligned caption', page('8x8', 't88-fb-duo-exact-v-gap', [1, 4], {
      background: { type: 'gradient', gradient: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#FCE883' }, { offset: 1, color: '#FF7538' }] } },
      textElements: [caption(0, { text: 'Our first beach day', fontFamily: DM_SANS, fontSize: 28, alignment: 'left' })],
    })),
    b('caption-wraps-underlined', '8x8', 8, 'a long caption wrapping to several lines, underlined, italic', page('8x8', 't88-fb-quad-43-box-below-gap', [0, 3, 5, 7], {
      textElements: [caption(0, {
        text: 'The castle lights came on and none of us wanted this happy day to end so we stayed a little longer',
        fontSize: 26, italic: true, underline: true,
      })],
    })),
    b('quote-in-photo-frame', '8x8', 11, 'a quote in a photo frame (script font) and a bold caption', page('8x8', 't88-fb-sq-box-tr-gap', [2, null, 0], {
      slotTexts: [null, style({ text: 'Home is wherever we are together', fontFamily: DANCING, fontSize: 40, color: '#B85C38' }), null],
      textElements: [caption(0, { text: 'Sunday lunch', fontFamily: DM_SANS, fontSize: 30, bold: true })],
    })),
    b('free-title-outline', '8x8', 12, 'blue page, a free title with an outline', page('8x8', 't88-solo-square', [2], {
      background: { type: 'solid', solid: '#1F75FE' },
      textElements: [{ ...caption(0, { text: 'Summer 2026', fontSize: 56, bold: true, color: '#FFFFFF', outlineColor: '#2D2D2D', outlineWidth: 3 }), boxIndex: undefined, x: 60, y: 24, width: 630 }],
    })),
    b('two-captions-shadow', '8x8', 13, 'two captions, one with a shadow, one right-aligned', page('8x8', 't88-fb-solo-pt-twobox-right', [1], {
      textElements: [
        caption(0, { text: "Grandma's garden", fontSize: 36, shadow: true }),
        caption(1, { text: 'May 2026', fontFamily: DM_SANS, fontSize: 24, alignment: 'right' }),
      ],
    })),
    b('frame-polaroid', '8x8', 14, 'polaroid frame with its shadow, terracotta border', page('8x8', 't88-solo-landscape', [0], {
      background: { type: 'solid', solid: '#FFFBF7' }, frameStyle: 'polaroid', photoBorderWidth: 4, photoBorderColor: '#B85C38',
    })),
    b('frame-double-dashed-radial', '8x8', 15, 'radial wash, double frame, dashed border', page('8x8', 't88-solo-portrait', [4], {
      background: { type: 'gradient', gradient: { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#926EAE' }] } },
      frameStyle: 'double', photoBorderWidth: 3, photoBorderColor: '#2D2D2D', photoBorderStyle: 'dashed',
    })),
    b('photo-in-caption-box', '8x8', 16, 'a photo in a caption box', page('8x8', 't88-fb-sq-box-bl-gap', [3, 6, 1], {
      textSlotFills: [5],
    })),
    b('64-caption-yellow', '6x4', 3, '6x4, yellow page, a caption', page('6x4', 't64-fb-sq-box-left', [2], {
      background: { type: 'solid', solid: '#FCE883' },
      textElements: [caption(0, { text: 'Our trip to the hills', fontFamily: DM_SANS, fontSize: 22 })],
    })),
    b('64-pans', '6x4', 4, '6x4, two pans and a zoom', page('6x4', 't64-fb-duo-tall-gap', [4, 6], {
      slotScales: [1.25, 1], slotOffsetsX: [-25, 0], slotOffsetsY: [30, -80],
    })),
    b('64-rounded-frame-black', '6x4', 5, '6x4, black page, rounded frame, white border', page('6x4', 't64-solo-portrait', [1], {
      background: { type: 'solid', solid: '#232323' }, frameStyle: 'rounded', photoBorderWidth: 2, photoBorderColor: '#FFFFFF',
    })),
    b('64-script-caption', '6x4', 6, '6x4, a bold script caption', page('6x4', 't64-fb-duo-ls-band-b', [0, 3], {
      textElements: [caption(0, { text: 'A day we will remember', fontFamily: DANCING, fontSize: 30, bold: true })],
    })),

    // ── Every frame style print draws, round slots, a turned slot, a moved frame ──
    b('frame-matte', '8x8', 17, 'matte frame with its soft shadow, a thin dark border', page('8x8', 't88-solo-landscape', [3], {
      background: { type: 'solid', solid: '#EFE7DD' }, frameStyle: 'matte', photoBorderWidth: 1, photoBorderColor: '#2D2D2D',
    })),
    b('frame-shadowbox', '8x8', 18, 'shadow box frame', page('8x8', 't88-solo-portrait', [6], {
      background: { type: 'solid', solid: '#FFFBF7' }, frameStyle: 'shadowbox',
    })),
    b('frame-thin-dotted', '8x8', 19, 'thin inset line, dotted terracotta border', page('8x8', 't88-solo-square', [5], {
      frameStyle: 'thin', photoBorderWidth: 3, photoBorderColor: '#B85C38', photoBorderStyle: 'dotted',
    })),
    b('frame-round-matte', '8x8', 20, 'a round template slot with a matte (oval mat), a square one beside it', page('8x8', 't8x8-18', [2, 4], {
      background: { type: 'solid', solid: '#F3EDE4' }, frameStyle: 'matte',
    })),
    b('frame-round-double', '8x8', 21, 'double inset lines on a round slot (ovals) and four square ones', page('8x8', 't8x8-19', [0, 1, 3, 5, 2], {
      background: { type: 'solid', solid: '#232323' }, frameStyle: 'double', photoBorderColor: '#FFFFFF',
    })),
    b('frame-round-shadowbox', '8x8', 22, 'shadow box on a round slot (an oval backing)', page('8x8', 't8x8-18', [6, 1], {
      frameStyle: 'shadowbox',
    })),
    b('slot-turned', '8x8', 23, "the template's turned slot (15 degrees) over a bigger photo", page('8x8', 't8x8-07', [0, 3])),
    b('frame-moved', '8x8', 24, 'a frame the customer moved and resized, with a border', page('8x8', 't88-solo-landscape', [7], {
      background: { type: 'solid', solid: '#2D2D2D' }, photoBorderWidth: 2, photoBorderColor: '#FFFFFF',
      slotGeometries: [{ x: 0.08, y: 0.22, width: 0.6, height: 0.5 }],
    })),

    // ── The rest of the masks print draws (oval and rounded print as plain
    //    rectangles today: see the plan's "Found on the way") ──
    b('masks-more-paths', '8x8', 25, 'octagon, diamond, cloud and halftone masks', page('8x8', 't88-fb-quad-grid-gap', [4, 6, 1, 3], {
      slotMasks: ['octagon', 'diamond', 'cloud', 'halftone'],
    })),
    b('masks-oval-rounded', '8x8', 26, 'oval and rounded masks (rectangles in print today)', page('8x8', 't88-fb-duo-exact-v-gap', [2, 5], {
      slotMasks: ['oval', 'rounded'],
    })),

    // ── Faded backgrounds: the paper-coloured wash over the page colour ──
    b('faded-background', '8x8', 27, 'a faded page colour (opacity 55)', page('8x8', 't88-solo-portrait', [0], {
      background: { type: 'solid', solid: '#1F75FE', opacity: 55 },
    })),
    b('faded-gradient', '6x4', 7, '6x4, a faded 90 degree wash (opacity 70)', page('6x4', 't64-solo-portrait', [3], {
      background: { type: 'gradient', opacity: 70, gradient: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#FF7538' }, { offset: 1, color: '#926EAE' }] } },
    })),

    // ── Free titles: turned and stretched with a shadow, see-through ──
    b('title-turned-shadow', '8x8', 28, 'a free title turned 12 degrees and stretched 1.3 times tall, with a shadow', page('8x8', 't88-solo-square', [1], {
      background: { type: 'solid', solid: '#FCE883' },
      textElements: [{ ...caption(0, { text: 'Best day ever', fontSize: 50, bold: true, color: '#2D2D2D', shadow: true }), boxIndex: undefined, x: 120, y: 40, width: 520, rotation: 12, scaleY: 1.3 }],
    })),
    b('title-shadow-alone', '8x8', 32, 'only the shadow of a title turned 12 degrees and stretched 1.3 times (white words on white paper)', page('8x8', 't88-solo-square', [], {
      textElements: [{ ...caption(0, { text: 'Our summer', fontSize: 60, bold: true, color: '#FFFFFF', shadow: true }), boxIndex: undefined, x: 110, y: 200, width: 460, rotation: 12, scaleY: 1.3 }],
    })),
    b('title-see-through', '8x8', 29, 'a see-through (60%) free title turned -8 degrees, over a photo', page('8x8', 't88-fb-solo', [4], {
      textElements: [{ ...caption(0, { text: 'Hello sunshine', fontFamily: DM_SANS, fontSize: 64, bold: true, color: '#FFFFFF' }), boxIndex: undefined, x: 90, y: 300, width: 560, rotation: -8, opacity: 60 }],
    })),

    // ── Every style of the bundled fonts ──
    b('captions-italics', '8x8', 30, 'DM Sans italic and Playfair Display bold italic captions', page('8x8', 't88-fb-solo-pt-twobox-right', [5], {
      textElements: [
        caption(0, { text: 'The castle lights came on at last', fontFamily: DM_SANS, fontSize: 26, italic: true }),
        caption(1, { text: 'Summer of 2026', fontSize: 30, bold: true, italic: true, alignment: 'right' }),
      ],
    })),
    b('86-caption-bold-italic', '8x6', 8, '8x6, a DM Sans bold italic caption', page('8x6', 't86-solo-34-box-l', [2], {
      textElements: [caption(0, { text: 'We walked all the way to the lighthouse', fontFamily: DM_SANS, fontSize: 24, bold: true, italic: true })],
    })),

    // ── A photo saved with a Display P3 profile (the app must draw it as Chrome does) ──
    b('photo-display-p3', '8x8', 31, 'a photo with a Display P3 colour profile', page('8x8', 't88-solo-landscape', [p3Index])),
  ];

  // ── Part C: everything else a page can hold (see the top of this file) ──
  const sticker = (uid: string, pack: string, id: string, geom: OrnamentTransform) => ({ ...goldenOrnament(pack, id), uid, geom });
  const partC: GoldenCase[] = [
    // Page textures: the tile at its print size (256 px on an 8x8, 192 on a 6x4), tint, opacity.
    b('texture-leather', '8x8', 33, 'leather texture in its own colour, a framed photo', page('8x8', 't88-solo-portrait', [2], {
      background: { type: 'texture', texture: 'leather' },
    })),
    b('texture-linen-sage', '6x4', 9, '6x4, linen texture tinted sage', page('6x4', 't64-solo-portrait', [5], {
      background: { type: 'texture', texture: 'linen', textureColor: '#8a9a7a' },
    })),
    b('texture-marble-faded', '8x8', 34, 'marble texture tinted blush at opacity 60, two photos', page('8x8', 't88-fb-duo-exact-v-gap', [1, 6], {
      background: { type: 'texture', texture: 'marble', textureColor: '#cf9d92', opacity: 60 },
    })),
    b('texture-denim-86', '8x6', 10, '8x6, denim texture', page('8x6', 't86-solo-34-box-l', [3], {
      background: { type: 'texture', texture: 'denim' },
    })),
    b('texture-walnut-clay', '6x4', 11, '6x4, walnut texture tinted clay, a caption', page('6x4', 't64-fb-sq-box-left', [4], {
      background: { type: 'texture', texture: 'walnut', textureColor: '#a9553f' },
      textElements: [caption(0, { text: 'Our little house', fontSize: 24, color: '#FFFBF7' })],
    })),

    // Washes (gradients) beyond Part B's three.
    b('gradient-64-radial-3', '6x4', 12, '6x4, a three-colour radial wash', page('6x4', 't64-solo-portrait', [0], {
      background: { type: 'gradient', gradient: { type: 'radial', angle: 0, stops: [{ offset: 0, color: '#FFFBF7' }, { offset: 0.5, color: '#FCE883' }, { offset: 1, color: '#B85C38' }] } },
    })),
    b('gradient-88-linear-3', '8x8', 35, 'a three-colour 45 degree wash', page('8x8', 't88-solo-landscape', [3], {
      background: { type: 'gradient', gradient: { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#1F75FE' }, { offset: 0.4, color: '#FFFFFF' }, { offset: 1, color: '#FF7538' }] } },
    })),

    // Memory QR codes: the corner chip (1.2" page width on an 8x8, 0.9" on a
    // 6x4), a code fitted in a caption box, a code moved and turned there.
    b('qr-chip-88', '8x8', 1, 'the memory QR chip, bottom right, over a full-bleed photo (right-hand page)', page('8x8', 'qr-badge-8x8-br', [0, null], {
      qrFills: [null, goldenQr('GOLD88BR')],
    })),
    b('qr-chip-64', '6x4', 2, '6x4, the memory QR chip at 0.9", top left (left-hand page)', page('6x4', 'qr-badge-6x4-tl', [5, null], {
      qrFills: [null, goldenQr('GOLD64TL')],
    })),
    b('qr-in-caption-box', '8x8', 36, 'a memory QR fitted in a caption box, a caption beside it', page('8x8', 't88-fb-solo-ls-twobox-above', [2], {
      textSlotQr: [goldenQr('GOLDBOX1'), null],
      textElements: [caption(1, { text: 'Scan to watch', fontFamily: DM_SANS, fontSize: 26 })],
    })),
    b('qr-moved-turned-64', '6x4', 13, '6x4, a memory QR moved, made bigger and turned 15 degrees in its box', page('6x4', 't64-fb-duo-ls-band-b', [1, 4], {
      textSlotQr: [goldenQr('GOLD64MV')],
      textSlotQrGeom: [{ cx: 0.7, cy: 0.74, w: 1.3 / 6, h: 1.3 / 4, rot: 15 }],
    })),

    // Graphics: in a photo frame, fitted in a caption box, moved and turned.
    b('graphic-in-frame', '8x8', 37, 'a graphic (a compass) in a photo frame, two photos', page('8x8', 't88-fb-sq-box-tr-gap', [3, null, 5], {
      ornamentFills: [null, goldenOrnament('travel', 'compass'), null],
    })),
    b('graphic-in-caption-box-64', '6x4', 14, '6x4, a graphic (a palm tree) fitted in a caption box', page('6x4', 't64-fb-sq-box-left', [6], {
      textSlotOrnament: [goldenOrnament('travel', 'palm')],
    })),
    b('graphic-moved-turned', '8x8', 38, 'a graphic (two hearts) moved over the photo and turned -20 degrees, a quote in the other box', page('8x8', 't88-fb-solo-pt-twobox-right', [0], {
      textSlotOrnament: [goldenOrnament('love', 'hearts'), null],
      textSlotOrnamentGeom: [{ cx: 0.42, cy: 0.3, w: 0.22, h: 0.22, rot: -20 }, null],
      textElements: [caption(1, { text: 'Love is patient, love is kind', fontFamily: DANCING, fontSize: 34, color: '#B85C38', quote: true })],
    })),
    b('graphic-and-quote-64', '6x4', 15, '6x4, a quote box and a graphic (a star) in a photo frame', page('6x4', 't64-fb-duo-ls-band-b', [2, null], {
      ornamentFills: [null, goldenOrnament('kids', 'star')],
      textElements: [caption(0, { text: 'Little moments, big memories', fontSize: 26, italic: true, quote: true })],
    })),

    // Stickers: free graphics at their own spot, size and turn.
    b('stickers-88', '8x8', 39, 'two stickers, one turned 25 degrees, over the photos', page('8x8', 't88-fb-duo-exact-h-gap', [4, 1], {
      stickers: [
        sticker('s1', 'birthday', 'cake', { cx: 0.25, cy: 0.3, w: 0.18, h: 0.18, rot: 25 }),
        sticker('s2', 'love', 'heart', { cx: 0.72, cy: 0.78, w: 0.12, h: 0.12, rot: 0 }),
      ],
    })),
    b('stickers-64', '6x4', 16, '6x4, a sticker turned -35 degrees (square on paper: its fractions differ)', page('6x4', 't64-fb-duo-tall-gap', [0, 3], {
      stickers: [sticker('s3', 'travel', 'plane', { cx: 0.5, cy: 0.5, w: 1 / 6, h: 1 / 4, rot: -35 })],
    })),
    b('sticker-stretched', '8x8', 40, 'a sticker drawn wider than tall (a stretched graphic), on a wash', page('8x8', 't88-solo-portrait', [5], {
      background: { type: 'gradient', gradient: { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#FFFBF7' }, { offset: 1, color: '#EFE7DD' }] } },
      stickers: [sticker('s4', 'religion', 'dove', { cx: 0.5, cy: 0.12, w: 0.3, h: 0.14, rot: 0 })],
    })),

    // Colour looks, soft edges and textured edges (each baked into the photo as print bakes it).
    b('looks-four', '8x8', 41, 'black & white, sepia, faded and warm looks', page('8x8', 't88-fb-quad-grid-gap', [0, 1, 2, 3], {
      slotLooks: ['bw', 'sepia', 'faded', 'warm'],
    })),
    b('looks-64', '6x4', 17, '6x4, black & white with a zoom, warm with a pan', page('6x4', 't64-fb-duo-tall-gap', [5, 6], {
      slotLooks: ['bw', 'warm'], slotScales: [1.3, 1], slotOffsetsX: [0, 30], slotOffsetsY: [0, -40],
    })),
    b('soft-edges', '8x8', 42, 'a soft edge and a fade-down edge, on a coloured page', page('8x8', 't88-fb-duo-exact-v-gap', [4, 7], {
      background: { type: 'solid', solid: '#EFE7DD' }, slotMasks: ['soft', 'fade-bottom'],
    })),
    b('soft-edge-look-64', '6x4', 18, '6x4, a soft edge with a sepia look, a fade-down edge', page('6x4', 't64-fb-duo-tall-gap', [2, 0], {
      background: { type: 'solid', solid: '#232323' }, slotMasks: ['soft', 'fade-bottom'], slotLooks: ['sepia', null],
    })),
    b('textured-edges', '8x8', 43, 'torn paper (with its white rim), deckle, watercolor and brushed edges', page('8x8', 't88-fb-quad-grid-gap', [5, 6, 0, 1], {
      background: { type: 'solid', solid: '#A9C7DF' }, slotMasks: ['torn', 'deckle', 'watercolor', 'brushed'],
    })),
    b('textured-edges-64', '6x4', 19, '6x4, frost and paint edges, a black & white look on one', page('6x4', 't64-fb-duo-tall-gap', [3, 4], {
      background: { type: 'solid', solid: '#FCE883' }, slotMasks: ['frost', 'paint'], slotLooks: [null, 'bw'],
    })),

    // A big photo (3200 x 2400) drawn at under half its size: Chrome draws it from a halved copy.
    b('big-photo-small-frames', '8x8', 46, 'a 3200 x 2400 photo in four frames, two at under half its size (zoom 1 and 1.2), two above (zoom 1.6 and 2)', page('8x8', 't88-fb-quad-grid-gap', [bigIndex, bigIndex, bigIndex, bigIndex], {
      slotScales: [1, 1.2, 1.6, 2], slotOffsetsX: [0, 15, -20, 0], slotOffsetsY: [0, 0, 10, -15],
    })),
    b('big-photo-64', '6x4', 22, '6x4, the 3200 x 2400 photo in two frames at under half its size, one with a black & white look', page('6x4', 't64-fb-duo-tall-gap', [bigIndex, bigIndex], {
      slotLooks: [null, 'bw'], slotOffsetsX: [0, 40],
    })),

    // Corner art and photo backgrounds.
    b('corners-88', '8x8', 44, 'corner art in all four corners, a framed photo', page('8x8', 't88-solo-portrait', [1], {
      cornerBase: CORNER_BASE,
    })),
    b('corners-64', '6x4', 20, '6x4, corner art over a texture', page('6x4', 't64-solo-portrait', [2], {
      background: { type: 'texture', texture: 'kraft' }, cornerBase: CORNER_BASE,
    })),
    b('photo-background', '8x8', 45, 'a photo as the page background (stretched, as print draws it), a framed photo', page('8x8', 't88-solo-portrait', [3], {
      background: { type: 'image', photoId: 'p5' },
    })),
    b('photo-background-faded-64', '6x4', 21, '6x4, a photo background at opacity 40', page('6x4', 't64-solo-portrait', [0], {
      background: { type: 'image', photoId: 'p2', opacity: 40 },
    })),
  ];

  // ── Part D: words placed by hand on a photo, with WordArt (owner,
  //    2026-11-07: "Add text" on a photo, the cover title's effects on every
  //    word). websiteSame.mjs skips these: print code from before draws a
  //    curve or a second colour outside a caption box plain, as it should. ──
  const placedWords = (text: string, x: number, y: number, width: number, over: Partial<TextElement> = {}): TextElement => ({
    ...caption(0, { ...NEW_WORDS_LOOK, text }), boxIndex: undefined, placed: true, x, y, width, ...over,
  });
  const partD: GoldenCase[] = [
    b('wordart-placed-new-look', '8x8', 0, 'words placed on a full-bleed photo in the new-words look: white, a thin dark outline, the small shadow', page('8x8', 't88-fb-solo', [4], {
      textElements: [placedWords('Our beach day', 230, 340, 330)],
    })),
    b('wordart-placed-two-colour-thick', '8x8', 2, 'two lines placed on a photo: a two-colour fill and a thick outline in its own colour, left-aligned', page('8x8', 't88-fb-solo', [1], {
      textElements: [placedWords('Lola and Lolo\nfifty years', 80, 120, 420, { fontFamily: PLAYFAIR, fontSize: 52, color: '#FFE9A8', fillTo: '#E8772E', outlineColor: '#5A2A0C', outlineWidth: 8, shadow: undefined, alignment: 'left' })],
    })),
    b('wordart-placed-glow-64', '6x4', 1, '6x4, words placed on a framed photo with a glow in its own colour (left-hand page)', page('6x4', 't64-solo-landscape', [2], {
      textElements: [placedWords('Bohol 2026', 220, 210, 300, { color: '#FFFFFF', glow: '#FF8A3D', outlineWidth: undefined, outlineColor: undefined, shadow: undefined, fontSize: 44 })],
    })),
    b('wordart-placed-arch', '8x8', 4, 'words placed on an arch over a photo: a two-colour fill and an outline, the shadow cast by the outline', page('8x8', 't88-fb-solo', [0], {
      textElements: [placedWords('Our Beach Days', 180, 300, 420, { fontFamily: PLAYFAIR, fontSize: 56, color: '#FFE9A8', fillTo: '#E8772E', outlineColor: '#5A2A0C', outlineWidth: 3, curve: 'arch' })],
    })),
    b('wordart-placed-wave-smile', '8x8', 6, 'two placed words on one photo: a wave with a glow, a smile left-aligned with the shadow', page('8x8', 't88-fb-solo', [3], {
      textElements: [
        placedWords('Summer in Siargao', 140, 160, 470, { color: '#FFFFFF', glow: '#6FA8DC', outlineWidth: undefined, outlineColor: undefined, shadow: undefined, fontSize: 40, curve: 'wave' }),
        placedWords('Bohol 2026', 120, 520, 300, { fontFamily: PLAYFAIR, fontSize: 46, color: '#FFFBF7', outlineWidth: undefined, outlineColor: undefined, alignment: 'left', curve: 'smile' }),
      ],
    })),
    b('wordart-frame-and-box', '8x8', 8, 'words in a photo frame on a smile with two colours (not clipped to the frame), a caption with a glow', page('8x8', 't88-fb-sq-box-tr-gap', [2, null, 0], {
      slotTexts: [null, style({ text: 'Home is wherever we are', fontFamily: DANCING, fontSize: 36, color: '#B85C38', fillTo: '#5A2A0C', curve: 'smile' }), null],
      textElements: [caption(0, { text: 'Sunday lunch', fontFamily: DM_SANS, fontSize: 30, bold: true, color: '#FFFFFF', glow: '#B85C38' })],
    })),
  ];

  // ── The covers ──
  const title = (text: string, over: Partial<TextElement> = {}): TextElement => ({
    ...caption(0, { text, fontFamily: 'Cinzel, serif', fontSize: 32, bold: true }), opacity: 1, ...over,
  });
  const coverPage = (size: AlbumSizePreset, templateId: string, extra: Partial<AlbumPage>): AlbumPage => ({
    ...page(size, templateId, [], extra), id: `golden-cover-${templateId}`,
  });
  const covers: GoldenCover[] = [
    {
      name: 'cover-88-hard-photo', albumSize: '8x8', pageCount: 60, cover: 'hardboundLeather', material: 'matte',
      checks: '8x8 hardcover: a photo cover (zoom 1.2, off-centre focus) carried round the turn-in, a white floating title, the spine in dark ink, the back lockup',
      coverFront: coverPage('8x8', 'cover-hero', {
        slotFills: [],
        background: { type: 'image', photoId: 'p0', zoom: 1.2, focusX: 0.3, focusY: 0.6 },
        textElements: [title('Our Summer in Siargao', { color: '#FFFFFF', fontSize: 40 })],
      }),
    },
    {
      name: 'cover-64-soft-plain', albumSize: '6x4', pageCount: 40, cover: 'softcover', material: 'glossy',
      checks: '6x4 softcover, glossy: a terracotta title-only cover, title and subtitle, the thin spine, the back lockup in light ink',
      coverFront: coverPage('6x4', 'cover-plain', {
        background: { type: 'solid', solid: '#B85C38' },
        textElements: [
          title('The Garcia Family', { color: '#FFFBF7', fontFamily: PLAYFAIR, fontSize: 30 }),
          { ...caption(1, { text: 'Christmas 2026', fontFamily: DM_SANS, fontSize: 18, color: '#FFFBF7' }), opacity: 1 },
        ],
      }),
    },
    {
      name: 'cover-88-soft-texture', albumSize: '8x8', pageCount: 120, cover: 'softcover', material: 'matte',
      checks: '8x8 softcover, 120 pages: a linen texture cover, an outlined title with its float switched off, a wide spine with the outlined title',
      coverFront: coverPage('8x8', 'cover-plain', {
        background: { type: 'texture', texture: 'linen', textureColor: '#efe9df', solid: '#efe9df' },
        textElements: [
          title('Grandma Rosa at 90', { color: '#2D2D2D', outlineColor: '#FFFFFF', outlineWidth: 3, shadow: false }),
          { ...caption(1, { text: 'A life of love', fontSize: 20, italic: true }), opacity: 1 },
        ],
      }),
    },
    {
      name: 'cover-64-hard-long-title', albumSize: '6x4', pageCount: 48, cover: 'hardboundLeather', material: 'matte',
      checks: '6x4 hardcover: a photo in the hero frame, a long title (shortened on the spine with "…"), a shadowed caption title',
      coverFront: coverPage('6x4', 'cover-hero', {
        slotFills: [4],
        background: { type: 'solid', solid: '#1F3A5F' },
        textElements: [title('Our Wonderful Year Travelling Around the Philippine Islands Together with Lola, Lolo and All the Cousins', { color: '#FFFFFF', fontSize: 26, shadow: true })],
      }),
    },
    // WordArt on the cover title (owner, 2026-11-05). websiteSame.mjs skips these:
    // the website's print code from before WordArt draws them plain.
    {
      name: 'cover-wordart-outline', albumSize: '8x8', pageCount: 60, cover: 'softcover', material: 'matte',
      checks: 'WordArt: a thick outline in its own colour on a photo cover, the float shadow cast by the outline; the spine keeps a thin one',
      coverFront: coverPage('8x8', 'cover-hero', {
        slotFills: [],
        background: { type: 'image', photoId: 'p0', zoom: 1, focusX: 0.5, focusY: 0.5 },
        textElements: [title('Our Beach Days', { color: '#FFFFFF', fontFamily: PLAYFAIR, fontSize: 56, outlineColor: '#7A2E12', outlineWidth: 8 })],
      }),
    },
    {
      name: 'cover-wordart-two-colour', albumSize: '8x8', pageCount: 60, cover: 'softcover', material: 'matte',
      checks: 'WordArt: a two-colour fill on two wrapped lines with a thin outline, on a plain colour',
      coverFront: coverPage('8x8', 'cover-plain', {
        background: { type: 'solid', solid: '#1F3A5F' },
        textElements: [title('Our Wonderful Year Together', { color: '#FFE9A8', fillTo: '#E8772E', fontFamily: PLAYFAIR, fontSize: 52, outlineColor: '#FFFFFF', outlineWidth: 2 })],
      }),
    },
    {
      name: 'cover-wordart-two-colour-shadow', albumSize: '8x8', pageCount: 40, cover: 'softcover', material: 'matte',
      checks: 'WordArt: a two-colour fill with the float shadow and no outline, left-aligned, on a photo',
      coverFront: coverPage('8x8', 'cover-hero', {
        slotFills: [],
        background: { type: 'image', photoId: 'p3', zoom: 1, focusX: 0.5, focusY: 0.5 },
        textElements: [title('Bohol 2026', { color: '#FFFFFF', fillTo: '#F48FB1', fontFamily: PLAYFAIR, fontSize: 44, alignment: 'left' })],
      }),
    },
    {
      name: 'cover-wordart-glow', albumSize: '8x8', pageCount: 60, cover: 'softcover', material: 'matte',
      checks: 'WordArt: a glow in its own colour on a dark plain cover, in the float shadow\'s place',
      coverFront: coverPage('8x8', 'cover-plain', {
        background: { type: 'solid', solid: '#232323' },
        textElements: [title('The Garcia Family', { color: '#FFFFFF', glow: '#FF8A3D', fontFamily: PLAYFAIR, fontSize: 48 })],
      }),
    },
    {
      name: 'cover-wordart-arch', albumSize: '8x8', pageCount: 60, cover: 'softcover', material: 'matte',
      checks: 'WordArt: the words on an arch, with a two-colour fill and an outline, the shadow cast by the outline, not clipped to the box',
      coverFront: coverPage('8x8', 'cover-hero', {
        slotFills: [],
        background: { type: 'image', photoId: 'p0', zoom: 1, focusX: 0.5, focusY: 0.5 },
        textElements: [title('Our Beach Days', { color: '#FFE9A8', fillTo: '#E8772E', fontFamily: PLAYFAIR, fontSize: 64, outlineColor: '#5A2A0C', outlineWidth: 3, curve: 'arch' })],
      }),
    },
    {
      name: 'cover-wordart-smile', albumSize: '6x4', pageCount: 40, cover: 'softcover', material: 'matte',
      checks: 'WordArt: the words on a smile with the float shadow and no outline, left-aligned on a wide album',
      coverFront: coverPage('6x4', 'cover-plain', {
        background: { type: 'solid', solid: '#B85C38' },
        textElements: [title('Bohol 2026', { color: '#FFFBF7', fontFamily: PLAYFAIR, fontSize: 48, alignment: 'left', curve: 'smile' })],
      }),
    },
    {
      name: 'cover-wordart-placed-words', albumSize: '8x8', pageCount: 60, cover: 'hardboundLeather', material: 'matte',
      checks: 'words placed by hand on a photo cover beside the title (owner, 2026-11-07): one on an arch floating on the cover\'s shadow, one with its shadow off and an outline; the spine follows the title',
      coverFront: coverPage('8x8', 'cover-hero', {
        slotFills: [],
        background: { type: 'image', photoId: 'p0', zoom: 1, focusX: 0.5, focusY: 0.5 },
        textElements: [
          title('The Garcia Family', { color: '#FFFFFF', fontFamily: PLAYFAIR, fontSize: 48 }),
          placedWords('Est. 2026', 280, 90, 190, { fontSize: 36, curve: 'arch', shadow: undefined, outlineWidth: undefined, outlineColor: undefined }),
          placedWords('Cebu · Bohol', 240, 650, 270, { fontFamily: DM_SANS, fontSize: 28, shadow: false, outlineColor: '#7A2E12', outlineWidth: 4 }),
        ],
      }),
    },
    {
      name: 'cover-wordart-wave', albumSize: '8x8', pageCount: 60, cover: 'softcover', material: 'matte',
      checks: 'WordArt: the words on a wave with a glow, on a plain colour',
      coverFront: coverPage('8x8', 'cover-plain', {
        background: { type: 'solid', solid: '#1F3A5F' },
        textElements: [title('Summer in Siargao', { color: '#FFFFFF', glow: '#6FA8DC', fontSize: 44, curve: 'wave' })],
      }),
    },
    {
      name: 'cover-88-hard-edge-words', albumSize: '8x8', pageCount: 80, cover: 'hardboundLeather', material: 'glossy',
      checks: '8x8 hardcover, glossy: a photo background, words right at the top and bottom edges (never repeated in the turn-in: print mirrors the front under its words), a sticker at the corner (mirrored with the front), a bold title in its box',
      coverFront: coverPage('8x8', 'cover-plain', {
        background: { type: 'image', photoId: 'p4', zoom: 1, focusX: 0.5, focusY: 0.5 },
        stickers: [sticker('c1', 'love', 'heart', { cx: 0.94, cy: 0.06, w: 0.1, h: 0.1, rot: 10 })],
        textElements: [
          title('Mendoza Family', { color: '#FFFFFF', fontFamily: PLAYFAIR, fontSize: 44 }),
          { ...caption(0, { text: 'MAY 2026', fontFamily: DM_SANS, fontSize: 22, bold: true, color: '#FFFFFF' }), boxIndex: undefined, x: 25, y: 4, width: 700 },
          { ...caption(0, { text: 'Cebu, Bohol, Siargao', fontFamily: DM_SANS, fontSize: 20, color: '#FFFFFF', alignment: 'right' }), boxIndex: undefined, x: 13, y: 712, width: 712 },
        ],
      }),
    },
    {
      name: 'cover-86-old-form', albumSize: '8x6', pageCount: 40, cover: 'hardboundLeather', material: 'matte',
      checks: 'the old cover form (a draft from before cover pages): a front photo with an outlined title and subtitle, the spine line, a back photo with a blurb, the opt-in mark',
      coverDesign: {
        front: {
          photoId: 'p3', background: '#FFFBF7',
          title: { text: 'Bohol 2025', fontSize: 150, fontFamily: 'Cinzel, Georgia, serif', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center' },
          subtitle: { text: 'Four days by the sea', fontSize: 70, fontFamily: PLAYFAIR, color: '#FFFFFF', bold: false, italic: true, underline: false, alignment: 'center' },
        },
        spine: { text: { text: 'Bohol 2025', fontSize: 40, fontFamily: 'Cinzel, Georgia, serif', color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' } },
        back: {
          photoId: 'p6', background: '#EFE7DD', brandMark: true,
          blurb: { text: 'Made with love for the people in these pages', fontSize: 55, fontFamily: DM_SANS, color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center' },
        },
      } as CoverDesign,
    },
  ];

  // This file is bundled, never type-checked: a cover type an order can't
  // carry (the first version had 'hardcover') would still print, as
  // isHardcover() takes anything but 'softcover' as hard. So check here.
  const coverTypes = new Set<string>(COVERS.map((c) => c.type));
  for (const c of covers) if (!coverTypes.has(c.cover)) throw new Error(`golden cover ${c.name}: '${c.cover}' is not a cover type an order stores (${[...coverTypes].join(', ')})`);
  return { seed: GOLDEN_SEED, photos, cases: [...partA, ...partB, ...partC, ...partD], covers };

}
