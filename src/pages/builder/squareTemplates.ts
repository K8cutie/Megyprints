import type { PageTemplate, TemplateMargin, AlbumSizePreset } from './types';
import type { PhotoRatio } from './photoAnalyzer';
import { fill, rsBox, STD, ALBUM_INCHES, gutterFrac } from './templateKit';

/** ══════════════════════════════════════════════════════════════════════════
 *  SQUARE ALBUM LAYOUTS — one builder for every square size (6×6, 8×8, 9×9).
 *
 *  A square page's layouts are pure FRACTIONS, so the same composition is valid
 *  at every square size — only the physical inches change (a 2/3 hero column is
 *  4" on a 6×6 but 6" on a 9×9). The bigger sizes are strictly SAFER on the 2"
 *  print floor: the tightest frame here is the 6×6's 1/3 column at exactly 2.00",
 *  which becomes 2.67" on 8×8 and 3.00" on 9×9.
 *
 *  Two things are genuinely size-dependent, and only two:
 *   • the id prefix (t66 / t88 / t99) so ids stay unique across the registry;
 *   • the 1mm gutter, taken as a fraction of THIS size's page inches so it
 *     prints 1mm physical on every size, not a fixed fraction.
 *  Everything else — the fill() fractions, ratios, names — is shared verbatim.
 *
 *  Each square size lists itself in PER_SIZE_AUTHORED, so its legacy hand-made
 *  block + generated gap-fillers + tiled templates all emit nothing and this
 *  builder is the whole supply. Customer-facing NAMES are size-agnostic ("Hero
 *  Left") because the composition is identical at every size.
 *
 *  ── House rules (see the per-size print floor above) ─────────────────────
 *  • Ratio-true slots (rsBox/rsBoxExact) so a slot's printed aspect equals its
 *    declared targetRatio; a lying slot crops silently.
 *  • Orientation strict, ratio loose (≤16% crop budget within an orientation).
 *  • Coordinates are fractions of the SAFE AREA, except on fullBleed templates
 *    where they are fractions of the whole trimmed page.
 *  • NEVER a full-bleed off-ratio single, nor a half-and-half 2-up — both crop
 *    a third off the photo (beheading). cropSafe gates the former by geometry.
 *  ══════════════════════════════════════════════════════════════════════════ */

const ZERO: TemplateMargin = { top: 0, bottom: 0, left: 0, right: 0 };

const PREFIX: Record<string, string> = { '6x6': 't66', '8x8': 't88', '9x9': 't99' };

type TrioVariant = 'left' | 'right' | 'top' | 'bottom';
type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Build the full square layout set for one album size. */
export function buildSquareTemplates(size: AlbumSizePreset): PageTemplate[] {
  const idp = PREFIX[size] ?? 't' + size.replace(/\D/g, '');
  const id = (suffix: string) => `${idp}-${suffix}`;
  // The shared photo gutter as a fraction of THIS page, so it prints at the
  // same physical width on every square size (see PHOTO_GUTTER_MM).
  const GAP = gutterFrac(ALBUM_INCHES[size].w);

  /* ── 3 photos, full bleed — hero column + stacked pair ──────────────────
     A 2/3 column and two 1/3 half-height blocks on a square page are FORCED to
     2:3 (portrait) or, rotated, 3:2 (landscape), so every slot is an exact
     ratio at zero crop. The narrow 1/3 column is the floor-critical frame, so
     the gutter is taken out of the HERO, never the column (see trioSlots). */
  const trioSlots = (v: TrioVariant, gap: number): PageTemplate['slots'] => {
    const r: PhotoRatio = v === 'left' || v === 'right' ? '2:3' : '3:2';
    const heroLong = 2 / 3 - gap;
    const pairShort = 1 / 3;
    const pairLong = 1 / 2 - gap / 2;
    const pairOff = 1 / 2 + gap / 2;
    switch (v) {
      case 'left': return [
        fill(0, 0, heroLong, 1, r),
        fill(2 / 3, 0, pairShort, pairLong, r),
        fill(2 / 3, pairOff, pairShort, pairLong, r),
      ];
      case 'right': return [
        fill(1 / 3 + gap, 0, heroLong, 1, r),
        fill(0, 0, pairShort, pairLong, r),
        fill(0, pairOff, pairShort, pairLong, r),
      ];
      case 'top': return [
        fill(0, 0, 1, heroLong, r),
        fill(0, 2 / 3, pairLong, pairShort, r),
        fill(pairOff, 2 / 3, pairLong, pairShort, r),
      ];
      case 'bottom': return [
        fill(0, 1 / 3 + gap, 1, heroLong, r),
        fill(0, 0, pairLong, pairShort, r),
        fill(pairOff, 0, pairLong, pairShort, r),
      ];
    }
  };
  const fbTrio = (suffix: string, name: string, v: TrioVariant, gap: number): PageTemplate => ({
    id: id(suffix), name, category: 'trio', slotCount: 3, margin: ZERO, orientation: 'square',
    targetRatio: v === 'left' || v === 'right' ? '2:3' : '3:2',
    albumSizes: [size], fullBleed: true, slots: trioSlots(v, gap),
  });

  /* ── 3 SQUARE photos + a combo box, full bleed 2×2 grid ─────────────────
     Three squares cannot tile a square, so the fourth cell is the combo box.
     The gutter is split evenly on both axes, keeping cells exactly 1:1. */
  const fbSquareTrio = (suffix: string, name: string, boxCorner: Corner, gap: number): PageTemplate => {
    const far = 1 / 2 + gap / 2, sideLen = 1 / 2 - gap / 2;
    const cells: Record<Corner, [number, number]> = {
      tl: [0, 0], tr: [far, 0], bl: [0, far], br: [far, far],
    };
    const order: Corner[] = ['tl', 'tr', 'bl', 'br'];
    const [bx, by] = cells[boxCorner];
    return {
      id: id(suffix), name, category: 'trio', slotCount: 3, margin: ZERO,
      orientation: 'square', targetRatio: '1:1', albumSizes: [size], fullBleed: true,
      slots: order.filter((c) => c !== boxCorner).map((c) => fill(cells[c][0], cells[c][1], sideLen, sideLen, '1:1')),
      textSlots: [{ id: 'combo', x: bx, y: by, width: sideLen, height: sideLen, align: 'center', placeholder: 'Tap to add' }],
    };
  };

  /* ── 2 photos, exact ratio, combo box takes the remainder ───────────────
     Two ratio-true photos at the largest size that stays exact; the box
     absorbs the leftover band. (No half-and-half 2-up — it beheads.) */
  const fbDuoExact = (suffix: string, name: string, axis: 'v' | 'h', gap = 0): PageTemplate => {
    const r: PhotoRatio = axis === 'v' ? '2:3' : '3:2';
    const band = 1 / 4;
    const photo = 1 - band;
    // The gutter is taken from BETWEEN THE TWO PHOTOS only (each gives up half),
    // so the pair still spans edge to edge and the combo box keeps its full band.
    // Like the hero trios, this drifts the printed aspect off the declared ratio
    // by <1% (1mm out of a ~3" frame) — far inside the crop budget.
    const half = 1 / 2 - gap / 2;
    const second = 1 / 2 + gap / 2;
    return {
      id: id(suffix), name, category: 'duo', slotCount: 2, margin: ZERO, orientation: 'square',
      targetRatio: r, albumSizes: [size], fullBleed: true,
      slots: axis === 'v'
        ? [fill(0, 0, half, photo, r), fill(second, 0, half, photo, r)]
        : [fill(0, 0, photo, half, r), fill(0, second, photo, half, r)],
      textSlots: axis === 'v'
        ? [{ id: 'combo', x: 0, y: photo, width: 1, height: band, align: 'center', placeholder: 'Tap to add' }]
        : [{ id: 'combo', x: photo, y: 0, width: band, height: 1, align: 'center', placeholder: 'Tap to add' }],
    };
  };

  /* ── 1 photo full bleed, off-ratio photo + combo box(es) ────────────────
     The photo takes the 2/3 that matches its ratio and bleeds off three edges;
     the remaining 1/3 strip becomes one box, or two independent boxes. */
  const fbSoloBox = (suffix: string, name: string, axis: 'landscape' | 'portrait', boxFirst: boolean): PageTemplate => {
    const r: PhotoRatio = axis === 'landscape' ? '3:2' : '2:3';
    const photo = 2 / 3, box = 1 / 3;
    const photoAt = boxFirst ? box : 0;
    const boxAt = boxFirst ? 0 : photo;
    return {
      id: id(suffix), name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'square',
      targetRatio: r, albumSizes: [size], fullBleed: true,
      slots: [axis === 'landscape' ? fill(0, photoAt, 1, photo, r) : fill(photoAt, 0, photo, 1, r)],
      textSlots: [axis === 'landscape'
        ? { id: 'combo', x: 0, y: boxAt, width: 1, height: box, align: 'center', placeholder: 'Tap to add' }
        : { id: 'combo', x: boxAt, y: 0, width: box, height: 1, align: 'center', placeholder: 'Tap to add' }],
    };
  };
  const fbSoloTwoBox = (suffix: string, name: string, axis: 'landscape' | 'portrait', boxFirst: boolean): PageTemplate => {
    const r: PhotoRatio = axis === 'landscape' ? '3:2' : '2:3';
    const photo = 2 / 3, strip = 1 / 3, half = 1 / 2;
    const photoAt = boxFirst ? strip : 0;
    const stripAt = boxFirst ? 0 : photo;
    const cell = (i: number, x: number, y: number, w: number, h: number) =>
      ({ id: `combo-${i}`, x, y, width: w, height: h, align: 'center' as const, placeholder: 'Tap to add' });
    return {
      id: id(suffix), name, category: 'single', slotCount: 1, margin: ZERO, orientation: 'square',
      targetRatio: r, albumSizes: [size], fullBleed: true,
      slots: [axis === 'landscape' ? fill(0, photoAt, 1, photo, r) : fill(photoAt, 0, photo, 1, r)],
      textSlots: axis === 'landscape'
        ? [cell(0, 0, stripAt, half, strip), cell(1, half, stripAt, half, strip)]
        : [cell(0, stripAt, 0, strip, half), cell(1, stripAt, half, strip, half)],
    };
  };

  /* ── 1 photo, full bleed (square only) and MARGINED singles ─────────────
     A full-bleed single must be 1:1 (cropSafe rejects an off-ratio one — it
     would behead). Off-orientation photos get a MARGINED single at their true
     ratio inside the safe area; square gets a margined framed print too, as the
     SECOND square single so a square album can alternate full-bleed / framed. */
  const fbSolo: PageTemplate = {
    id: id('fb-solo'), name: 'Full Page', category: 'single', slotCount: 1, margin: ZERO,
    orientation: 'square', targetRatio: '1:1', albumSizes: [size], fullBleed: true,
    slots: [fill(0, 0, 1, 1, '1:1')],
  };
  const marginedSingle = (suffix: string, name: string, r: PhotoRatio): PageTemplate => ({
    id: id(suffix), name, category: 'single', slotCount: 1, margin: STD,
    orientation: 'square', targetRatio: r, albumSizes: [size], slots: [rsBox(0, 0, r, 1, 1, size)],
  });

  /** RETIRED — every layout with 2+ photos now carries the 1mm gutter, so the
   *  edge-to-edge versions are no longer offered. They are still BUILT (with no
   *  album sizes) purely so albums already saved against these ids keep
   *  resolving and rendering; `getTemplatesForAlbum` filters them out, so they
   *  can never be selected or dealt again. Do NOT delete these outright —
   *  customer albums reference them. */
  const retired = (t: PageTemplate): PageTemplate => ({ ...t, albumSizes: [] });

  return [
    fbSolo,
    marginedSingle('solo-portrait', 'Single Portrait', '2:3'),
    marginedSingle('solo-landscape', 'Single Landscape', '3:2'),
    marginedSingle('solo-square', 'Single Square', '1:1'),
    fbSoloBox('fb-solo-ls-box-below', 'Landscape + Box Below', 'landscape', false),
    fbSoloBox('fb-solo-ls-box-above', 'Landscape + Box Above', 'landscape', true),
    fbSoloBox('fb-solo-pt-box-right', 'Portrait + Box Right', 'portrait', false),
    fbSoloBox('fb-solo-pt-box-left', 'Portrait + Box Left', 'portrait', true),
    fbSoloTwoBox('fb-solo-ls-twobox-below', 'Landscape + Two Boxes Below', 'landscape', false),
    fbSoloTwoBox('fb-solo-ls-twobox-above', 'Landscape + Two Boxes Above', 'landscape', true),
    fbSoloTwoBox('fb-solo-pt-twobox-right', 'Portrait + Two Boxes Right', 'portrait', false),
    fbSoloTwoBox('fb-solo-pt-twobox-left', 'Portrait + Two Boxes Left', 'portrait', true),
    // ── Live set: every multi-photo layout carries the 1mm gutter ──────────
    // (ids keep their `-gap` suffix — they are persisted in saved albums — but
    //  the customer-facing names drop "· Thin Gap": there is no longer a
    //  gutterless counterpart to distinguish them from.)
    fbDuoExact('fb-duo-exact-v-gap', 'Two Portraits + Box', 'v', GAP),
    fbDuoExact('fb-duo-exact-h-gap', 'Two Landscapes + Box', 'h', GAP),
    fbTrio('fb-trio-hero-left-gap', 'Hero Left', 'left', GAP),
    fbTrio('fb-trio-hero-right-gap', 'Hero Right', 'right', GAP),
    fbTrio('fb-trio-hero-top-gap', 'Hero Top', 'top', GAP),
    fbTrio('fb-trio-hero-bottom-gap', 'Hero Bottom', 'bottom', GAP),
    fbSquareTrio('fb-sq-box-tl-gap', 'Three Squares, Box Top Left', 'tl', GAP),
    fbSquareTrio('fb-sq-box-tr-gap', 'Three Squares, Box Top Right', 'tr', GAP),
    fbSquareTrio('fb-sq-box-bl-gap', 'Three Squares, Box Bottom Left', 'bl', GAP),
    fbSquareTrio('fb-sq-box-br-gap', 'Three Squares, Box Bottom Right', 'br', GAP),

    // ── Retired (resolvable, never selectable) — the gutterless originals ──
    retired(fbDuoExact('fb-duo-exact-v', 'Two Portraits + Box', 'v')),
    retired(fbDuoExact('fb-duo-exact-h', 'Two Landscapes + Box', 'h')),
    retired(fbTrio('fb-trio-hero-left', 'Hero Left', 'left', 0)),
    retired(fbTrio('fb-trio-hero-right', 'Hero Right', 'right', 0)),
    retired(fbTrio('fb-trio-hero-top', 'Hero Top', 'top', 0)),
    retired(fbTrio('fb-trio-hero-bottom', 'Hero Bottom', 'bottom', 0)),
    retired(fbSquareTrio('fb-sq-box-tl', 'Three Squares, Box Top Left', 'tl', 0)),
    retired(fbSquareTrio('fb-sq-box-tr', 'Three Squares, Box Top Right', 'tr', 0)),
    retired(fbSquareTrio('fb-sq-box-bl', 'Three Squares, Box Bottom Left', 'bl', 0)),
    retired(fbSquareTrio('fb-sq-box-br', 'Three Squares, Box Bottom Right', 'br', 0)),
  ];
}
