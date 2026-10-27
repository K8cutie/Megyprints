/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES: a fixed set of album pages that the website's print
   renderer and the 2.0 app's page renderer must draw the same.

   Part A comes from the website's own album generator (generateAlbum), seeded
   so it deals the same album every time (mulberry32, the seed the generator
   specs use). Part B is made by hand for what the generator doesn't do on
   its own: pans and zooms, masks, page colours and washes, frames, captions,
   a quote in a photo frame, a free title with an outline, a photo in a
   caption box.

   renderWeb.mjs writes the result to tools/golden/web/pages.json once, with
   the website's pictures of it. The app's test reads that file, never this
   one, so a change to the generator can't quietly change what is compared.
   ══════════════════════════════════════════════════════════════════════════ */

import { generateAlbum } from '../../src/pages/builder/generateAlbum';
import type { AlbumPage, AlbumSizePreset, TextElement, SlotText } from '../../src/pages/builder/types';
import { mulberry32 } from '../../src/test/mulberry32';
import { PHOTO_SIZES } from './syntheticPhotos';

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

  // ── Part A: the generator's own pages, seeded ──
  const real = Math.random;
  Math.random = mulberry32(GOLDEN_SEED);
  let album88: AlbumPage[];
  let album64: AlbumPage[];
  try {
    album88 = generateAlbum(roll, '8x8');
    album64 = generateAlbum(roll, '6x4');
  } finally {
    Math.random = real;
  }
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
  ];

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
  ];

  return { seed: GOLDEN_SEED, photos, cases: [...partA, ...partB] };
}
