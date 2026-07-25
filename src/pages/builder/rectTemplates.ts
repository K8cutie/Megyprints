import type { PageTemplate, TemplateMargin, TextSlot, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, ALBUM_INCHES, gutterFrac } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  8×6 / 6×8 — CLEARED, being re-authored from scratch.
 *
 *  ── Why the first set was scrapped ────────────────────────────────────────
 *  It chased TILINGS instead of PHOTOS. To make three columns or two rows fit
 *  the sheet I reached for 16:9 and 9:16 slots — ratios that are arithmetically
 *  tidy but that almost no real photo has. A phone shoots 4:3 / 3:4; dropping
 *  one of those into a 16:9 frame throws away a QUARTER of the picture, which
 *  is why generated pages came back as wide strips of cropped faces and legs.
 *  Filling the page is worthless if the photos in it are butchered.
 *
 *  ── The rule for the redo ─────────────────────────────────────────────────
 *  Only ratios real cameras actually produce:
 *        4:3 / 3:4   phone (the overwhelming majority)
 *        3:2 / 2:3   DSLR
 *        1:1         square
 *  16:9 and 9:16 are BANNED as slot ratios here. If a tiling only works by
 *  introducing one, the tiling is wrong for this page — drop it rather than
 *  crop every photo that lands in it.
 *
 *  Plus the standing house rules: full bleed, the shared 1mm-class gutter
 *  between adjacent photos (PHOTO_GUTTER_MM), max 3 photos, every frame's short
 *  side ≥ 2.00", and 6×8 stays the transpose of 8×6.
 *
 *  While the live set is EMPTY both sizes are not offered in any size picker
 *  (albumSizeOptions drops a size with zero layouts) — the same state 6×6 sat in
 *  during its rebuild.
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };
const PREFIX: Record<string, string> = { '8x6': 't86', '6x8': 't68' };

const FLIP: Record<PhotoRatio, PhotoRatio> = {
  '4:3': '3:4', '3:4': '4:3', '3:2': '2:3', '2:3': '3:2', '16:9': '9:16', '9:16': '16:9', '1:1': '1:1',
};
const orientOf = (r: PhotoRatio): PageTemplate['orientation'] =>
  r === '3:2' || r === '4:3' || r === '16:9' ? 'landscape' : r === '1:1' ? 'square' : 'portrait';

/** RETIRED — the scrapped first set. Still BUILT so that albums already saved
 *  against these ids keep resolving and rendering (one album carries 97 such
 *  pages), but with NO album sizes, so they can never be selected or dealt
 *  again. Delete only once nothing references them. */
function retiredFirstSet(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const id = (s: string) => `${idp}-${s}`;
  const landscape = ALBUM_INCHES[size].w > ALBUM_INCHES[size].h;
  const long = Math.max(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);
  const short = Math.min(ALBUM_INCHES[size].w, ALBUM_INCHES[size].h);
  const gA = gutterFrac(long), gB = gutterFrac(short);
  const R = (r: PhotoRatio) => (landscape ? r : FLIP[r]);
  const rect = (a: number, b: number, aL: number, bL: number, r: PhotoRatio) =>
    (landscape ? fill(a, b, aL, bL, R(r)) : fill(b, a, bL, aL, R(r)));
  const box = (a: number, b: number, aL: number, bL: number): TextSlot => ({
    id: 'combo', x: landscape ? a : b, y: landscape ? b : a,
    width: landscape ? aL : bL, height: landscape ? bL : aL,
    align: 'center', placeholder: 'Tap to add',
  });
  const t = (s: string, name: string, cat: PageTemplate['category'], tr: PhotoRatio,
             slots: PageTemplate['slots'], textSlots?: TextSlot[]): PageTemplate => ({
    id: id(s), name, category: cat, slotCount: slots.length, margin: ZERO,
    orientation: orientOf(R(tr)), targetRatio: R(tr),
    albumSizes: [], // ← retired: resolvable, never selectable
    fullBleed: true, slots, ...(textSlots ? { textSlots } : {}),
  });

  const halfA = 1 / 2 - gA / 2, secondA = 1 / 2 + gA / 2;
  const halfB = 1 / 2 - gB / 2, secondB = 1 / 2 + gB / 2;
  const BIG = 4.5 / 8, BOX_BAND = 1.5 / 6, PHOTO_BAND = 1 - BOX_BAND, THIRD = 2 / 3;
  const col3 = (1 - 2 * gA) / 3;

  return [
    t('fb-solo', 'Full Page', 'single', '4:3', [rect(0, 0, 1, 1, '4:3')]),
    t('fb-solo-box-second', 'Portrait + Box Right', 'single', '3:4', [rect(0, 0, BIG, 1, '3:4')], [box(BIG, 0, 1 - BIG, 1)]),
    t('fb-solo-box-first', 'Portrait + Box Left', 'single', '3:4', [rect(1 - BIG, 0, BIG, 1, '3:4')], [box(0, 0, 1 - BIG, 1)]),
    t('fb-wide-box-below', 'Wide + Box Below', 'single', '16:9', [rect(0, 0, 1, PHOTO_BAND, '16:9')], [box(0, PHOTO_BAND, 1, BOX_BAND)]),
    t('fb-wide-box-above', 'Wide + Box Above', 'single', '16:9', [rect(0, BOX_BAND, 1, PHOTO_BAND, '16:9')], [box(0, 0, 1, BOX_BAND)]),
    t('fb-duo', 'Two Portraits', 'duo', '2:3', [rect(0, 0, halfA, 1, '2:3'), rect(secondA, 0, halfA, 1, '2:3')]),
    t('fb-duo-big-first', 'Big Left', 'duo', '3:4', [rect(0, 0, BIG, 1, '3:4'), rect(BIG + gA, 0, 1 - BIG - gA, 1, '9:16')]),
    t('fb-duo-big-second', 'Big Right', 'duo', '3:4', [rect(1 - BIG, 0, BIG, 1, '3:4'), rect(0, 0, 1 - BIG - gA, 1, '9:16')]),
    t('fb-duo-wide-box-second', 'Two Wide + Box Right', 'duo', '16:9',
      [rect(0, 0, THIRD, halfB, '16:9'), rect(0, secondB, THIRD, halfB, '16:9')], [box(THIRD, 0, 1 - THIRD, 1)]),
    t('fb-duo-wide-box-first', 'Two Wide + Box Left', 'duo', '16:9',
      [rect(1 - THIRD, 0, THIRD, halfB, '16:9'), rect(1 - THIRD, secondB, THIRD, halfB, '16:9')], [box(0, 0, 1 - THIRD, 1)]),
    t('fb-trio-hero-first', 'Hero Left', 'trio', '2:3',
      [rect(0, 0, halfA, 1, '2:3'), rect(secondA, 0, halfA, halfB, '4:3'), rect(secondA, secondB, halfA, halfB, '4:3')]),
    t('fb-trio-hero-second', 'Hero Right', 'trio', '2:3',
      [rect(secondA, 0, halfA, 1, '2:3'), rect(0, 0, halfA, halfB, '4:3'), rect(0, secondB, halfA, halfB, '4:3')]),
    t('fb-trio-cols-box-below', 'Three Tall + Box Below', 'trio', '9:16',
      [rect(0, 0, col3, PHOTO_BAND, '9:16'), rect(col3 + gA, 0, col3, PHOTO_BAND, '9:16'), rect(2 * (col3 + gA), 0, col3, PHOTO_BAND, '9:16')],
      [box(0, PHOTO_BAND, 1, BOX_BAND)]),
    t('fb-trio-cols-box-above', 'Three Tall + Box Above', 'trio', '9:16',
      [rect(0, BOX_BAND, col3, PHOTO_BAND, '9:16'), rect(col3 + gA, BOX_BAND, col3, PHOTO_BAND, '9:16'), rect(2 * (col3 + gA), BOX_BAND, col3, PHOTO_BAND, '9:16')],
      [box(0, 0, 1, BOX_BAND)]),
  ];
}

/** The LIVE set — empty while 8×6 / 6×8 are re-authored. New layouts go here. */
export function buildRectTemplates(size: AlbumSizePreset): PageTemplate[] {
  return [...retiredFirstSet(size)];
}
