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

   renderWeb.mjs writes the result to tools/golden/web/pages.json once, with
   the website's pictures of it. The app's test reads that file, never this
   one, so a change to the generator can't quietly change what is compared.
   ══════════════════════════════════════════════════════════════════════════ */

import { generateAlbum } from '../../src/pages/builder/generateAlbum';
import type { AlbumPage, AlbumSizePreset, TextElement, SlotText } from '../../src/pages/builder/types';
import { mulberry32 } from '../../src/test/mulberry32';
import { PHOTO_SIZES, P3_PHOTO, P3_PHOTO_IMAGE } from './syntheticPhotos';

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

export interface GoldenSet {
  seed: number;
  photos: GoldenPhoto[];
  cases: GoldenCase[];
}

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

  return { seed: GOLDEN_SEED, photos, cases: [...partA, ...partB] };
}
