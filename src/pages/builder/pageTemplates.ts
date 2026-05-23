import type { PageTemplate, TemplateSlot } from './types';

/** ═══════════════════════════════════════════════════════════
 *  ASPECT-RATIO-CONSTRAINED TEMPLATES
 *
 *  Box-shaped slots use standard photo ratios so photos fit
 *  without stretching. Round slots ignore aspect ratio.
 *
 *  Portrait pages → portrait-oriented photo slots
 *  Landscape pages → landscape-oriented photo slots
 *  ═══════════════════════════════════════════════════════════ */

let slotCounter = 0;

/** Create a template slot. For rectangle/rounded shapes, the height is
 *  auto-computed from width × aspectRatio to preserve photo proportions.
 *
 *  aspectRatio = height / width  (so portrait > 1, landscape < 1)
 *    portrait ratios:  '4:5' (1.25) | '3:4' (1.33) | '2:3' (1.50)
 *    landscape ratios: '5:4' (0.80) | '4:3' (0.75) | '3:2' (0.67)
 *    square:           '1:1' (1.00)
 *    panorama:         '16:9' (0.56) | '2:1' (0.50)
 *    free:             'free' (use raw height, no constraint)
 */
const RATIOS: Record<string, number> = {
  '4:5': 5 / 4,   // portrait  (1.25)
  '3:4': 4 / 3,   // portrait  (1.33)
  '2:3': 3 / 2,   // portrait  (1.50)
  '1:1': 1,       // square    (1.00)
  '3:2': 2 / 3,   // landscape (0.67)
  '4:3': 3 / 4,   // landscape (0.75)
  '5:4': 4 / 5,   // landscape (0.80)
  '16:9': 9 / 16, // wide      (0.56)
  '2:1': 1 / 2,   // very wide (0.50)
};

function s(
  x: number, y: number,
  w: number, hOrRatio: number | string,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  const { aspectRatio: ar, ...restOpts } = opts as any;

  let height: number;

  if (typeof hOrRatio === 'string' && RATIOS[hOrRatio]) {
    // hOrRatio is an aspect-ratio label, height = width × ratio
    const ratio = RATIOS[hOrRatio];
    height = w * ratio;
  } else if (typeof hOrRatio === 'number') {
    height = hOrRatio;
  } else {
    height = w; // default square
  }

  return { id: `s${slotCounter}`, x, y, width: w, height, shape: 'rectangle', ...restOpts };
}

function t(id: string, name: string, category: PageTemplate['category'], slots: TemplateSlot[]): PageTemplate {
  return { id, name, category, slotCount: slots.length, slots };
}

const P = 3;    // padding
const G = 2.5;  // gap

/* ── SINGLE (1 photo) — aspect ratio adapts to page orientation ── */
const SINGLE: PageTemplate[] = [
  t('s1',  'Full Page',        'single', [s(0, 0, 100, 'free')]),
  t('s2',  'Centered Square',  'single', [s(20, 5, 60, '1:1', { shape: 'rounded', borderRadius: 8 })]),
  t('s3',  'Portrait Frame',   'single', [s(15, 5, 70, '3:4', { shape: 'rounded', borderRadius: 6 })]),
  t('s4',  'Landscape Wide',   'single', [s(5, 15, 90, '4:3')]),
  t('s5',  'Circle Hero',      'single', [s(10, 5, 80, '1:1', { shape: 'circle' })]),
];

/* ── DUO (2 photos) ── */
const DUO: PageTemplate[] = [
  t('d1',  'Side by Side',     'duo', [
    s(P, P, 50-G/2-P, '3:4'),
    s(50+G/2, P, 50-G/2-P, '3:4'),
  ]),
  t('d2',  'Stacked',          'duo', [
    s(P, P, 100-P*2, '4:3'),
    s(P, 50+G/2, 100-P*2, '4:3'),
  ]),
  t('d3',  'Left Tall + Right','duo', [
    s(P, P, 45, '2:3'),
    s(50, P, 50-P, '2:3'),
  ]),
  t('d4',  'Right Tall + Left','duo', [
    s(P, P, 50-P, '2:3'),
    s(55, P, 45, '2:3'),
  ]),
  t('d5',  'Top Wide + Bottom','duo', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 100-P*2, '4:3'),
  ]),
  t('d6',  'Left Wide + Tall', 'duo', [
    s(P, P, 55, '3:2'),
    s(60, P, 40-P, '3:4'),
  ]),
  t('d7',  'Overlapping Duo',  'duo', [
    s(5, 5, 55, '3:4', { shape: 'rounded', borderRadius: 6 }),
    s(35, 10, 60, '3:4', { shape: 'rounded', borderRadius: 6 }),
  ]),
  t('d8',  'Circle + Square',  'duo', [
    s(5, 10, 45, '1:1', { shape: 'circle' }),
    s(55, 10, 40, '4:3'),
  ]),
  t('d9',  'Oval Pair',        'duo', [
    s(5, 15, 42, '3:4', { shape: 'oval' }),
    s(53, 15, 42, '3:4', { shape: 'oval' }),
  ]),
  t('d10', 'Wide + Square',    'duo', [
    s(P, P, 60, '16:9'),
    s(65, P, 35-P, '1:1'),
  ]),
];

/* ── GRID (3–12 photos) ── */
const GRID: PageTemplate[] = [
  // 3-photo grids
  t('g3a', '3 — Row of Portraits', 'grid', [
    s(P, P, 33.3-G, '3:4'),
    s(33.3+G/2, P, 33.3-G, '3:4'),
    s(66.6+G/2, P, 33.4-G, '3:4'),
  ]),
  t('g3b', '3 — L-Shape',      'grid', [
    s(P, P, 60, '4:3'),
    s(65, P, 35-P, '3:4'),
    s(P, 65, 100-P*2, '16:9'),
  ]),
  t('g3c', '3 — Two Top One Bottom','grid', [
    s(P, P, 50-G/2-P, '1:1'),
    s(50+G/2, P, 50-G/2-P, '1:1'),
    s(P, 52, 100-P*2, '16:9'),
  ]),

  // 4-photo grids
  t('g4a', '4 — 2x2 Portraits', 'grid', [
    s(P, P, 50-G/2-P, '3:4'),
    s(50+G/2, P, 50-G/2-P, '3:4'),
    s(P, 50+G/2, 50-G/2-P, '3:4'),
    s(50+G/2, 50+G/2, 50-G/2-P, '3:4'),
  ]),
  t('g4b', '4 — 2x2 Squares',  'grid', [
    s(P, P, 50-G/2-P, '1:1'),
    s(50+G/2, P, 50-G/2-P, '1:1'),
    s(P, 50+G/2, 50-G/2-P, '1:1'),
    s(50+G/2, 50+G/2, 50-G/2-P, '1:1'),
  ]),
  t('g4c', '4 — 2x2 Circles',  'grid', [
    s(P, P, 50-G/2-P, '1:1', { shape: 'circle' }),
    s(50+G/2, P, 50-G/2-P, '1:1', { shape: 'circle' }),
    s(P, 50+G/2, 50-G/2-P, '1:1', { shape: 'circle' }),
    s(50+G/2, 50+G/2, 50-G/2-P, '1:1', { shape: 'circle' }),
  ]),
  t('g4d', '4 — Left Portrait + 3 Right','grid', [
    s(P, P, 48, '2:3'),
    s(52, P, 48-P, '4:3'),
    s(52, 34, 48-P, '4:3'),
    s(52, 68, 48-P, '4:3'),
  ]),
  t('g4e', '4 — Top Landscape + 3 Bottom','grid', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 31.5, '1:1'),
    s(34, 52, 31.5, '1:1'),
    s(68, 52, 31.5, '1:1'),
  ]),

  // 6-photo grids
  t('g6a', '6 — 2x3 Portraits', 'grid', [
    s(P, P, 33.3-G, '3:4'),
    s(33.3+G/2, P, 33.3-G, '3:4'),
    s(66.6+G/2, P, 33.4-G, '3:4'),
    s(P, 50+G/2, 33.3-G, '3:4'),
    s(33.3+G/2, 50+G/2, 33.3-G, '3:4'),
    s(66.6+G/2, 50+G/2, 33.4-G, '3:4'),
  ]),
  t('g6b', '6 — 3x2 Squares',  'grid', [
    s(P, P, 33.3-G, '1:1'),
    s(33.3+G/2, P, 33.3-G, '1:1'),
    s(66.6+G/2, P, 33.4-G, '1:1'),
    s(P, 50+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 50+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 50+G/2, 33.4-G, '1:1'),
  ]),
  t('g6c', '6 — Left Portrait + 5 Small','grid', [
    s(P, P, 48, '2:3'),
    s(52, P, 48-P, '4:3'),
    s(52, 34, 48-P, '4:3'),
    s(52, 52, 48-P, '4:3'),
    s(52, 70, 48-P, '4:3'),
    s(52, 88, 48-P, '4:3'),
  ]),

  // 9-photo grid
  t('g9a', '9 — 3x3 Squares',  'grid', [
    s(P, P, 33.3-G, '1:1'),
    s(33.3+G/2, P, 33.3-G, '1:1'),
    s(66.6+G/2, P, 33.4-G, '1:1'),
    s(P, 33.3+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 33.3+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 33.3+G/2, 33.4-G, '1:1'),
    s(P, 66.6+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 66.6+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 66.6+G/2, 33.4-G, '1:1'),
  ]),

  // 12-photo grid
  t('g12', '12 — 3x4 Squares',  'grid', [
    s(P, P, 33.3-G, '1:1'),
    s(33.3+G/2, P, 33.3-G, '1:1'),
    s(66.6+G/2, P, 33.4-G, '1:1'),
    s(P, 25+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 25+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 25+G/2, 33.4-G, '1:1'),
    s(P, 50+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 50+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 50+G/2, 33.4-G, '1:1'),
    s(P, 75+G/2, 33.3-G, '1:1'),
    s(33.3+G/2, 75+G/2, 33.3-G, '1:1'),
    s(66.6+G/2, 75+G/2, 33.4-G, '1:1'),
  ]),
];

/* ── HERO (1 large + supporting) ── */
const HERO: PageTemplate[] = [
  t('h1',  'Hero Left + 2 Right',  'hero', [
    s(P, P, 55, '3:4'),
    s(60, P, 40-P, '1:1'),
    s(60, 50+G/2, 40-P, '1:1'),
  ]),
  t('h2',  'Hero Right + 2 Left',  'hero', [
    s(P, P, 40-P, '1:1'),
    s(P, 50+G/2, 40-P, '1:1'),
    s(45, P, 55, '3:4'),
  ]),
  t('h3',  'Hero Top + 3 Bottom',   'hero', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 33.3-G, '1:1'),
    s(33.3+G/2, 52, 33.3-G, '1:1'),
    s(66.6+G/2, 52, 33.4-G, '1:1'),
  ]),
  t('h4',  'Hero Bottom + 3 Top',   'hero', [
    s(P, P, 33.3-G, '1:1'),
    s(33.3+G/2, P, 33.3-G, '1:1'),
    s(66.6+G/2, P, 33.4-G, '1:1'),
    s(P, 45, 100-P*2, '16:9'),
  ]),
  t('h5',  'Hero Left + 4 Right',   'hero', [
    s(P, P, 45, '3:4'),
    s(50, P, 50-G/2, '1:1'),
    s(75+G/2, P, 25-G, '1:1'),
    s(50, 50+G/2, 50-G/2, '1:1'),
    s(75+G/2, 50+G/2, 25-G, '1:1'),
  ]),
  t('h6',  'Hero Top Wide + 4',     'hero', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 25-G, '4:3'),
    s(25+G/2, 52, 25-G, '4:3'),
    s(50+G/2, 52, 25-G, '4:3'),
    s(75+G/2, 52, 25-G, '4:3'),
  ]),
  t('h7',  'Hero Top + 2 Bottom Wide','hero', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 50-G/2-P, '3:2'),
    s(50+G/2, 52, 50-G/2-P, '3:2'),
  ]),
];

/* ── MASONRY (uneven, artistic) ── */
const MASONRY: PageTemplate[] = [
  t('m1',  'Masonry 2-Column',       'masonry', [
    s(P, P, 50-G/2-P, '4:3'),
    s(50+G/2, P, 50-G/2-P, '3:4'),
    s(P, 50+G/2, 50-G/2-P, '3:4'),
    s(50+G/2, 50+G/2, 50-G/2-P, '4:3'),
  ]),
  t('m2',  'Masonry 3-Column',       'masonry', [
    s(P, P, 33.3-G, '3:4'),
    s(33.3+G/2, P, 33.3-G, '4:3'),
    s(66.6+G/2, P, 33.4-G, '3:4'),
    s(P, 50+G/2, 33.3-G, '4:3'),
    s(33.3+G/2, 50+G/2, 33.3-G, '3:4'),
    s(66.6+G/2, 50+G/2, 33.4-G, '4:3'),
  ]),
  t('m3',  'Masonry Big Small',      'masonry', [
    s(P, P, 65, '4:3'),
    s(68, P, 32-P, '1:1'),
    s(68, 34, 32-P, '1:1'),
    s(P, 68, 32, '1:1'),
    s(34, 68, 32, '1:1'),
    s(68, 68, 32-P, '1:1'),
  ]),
  t('m4',  'Masonry Cascade',        'masonry', [
    s(P, P, 30, '3:4'),
    s(33, P, 34, '4:3'),
    s(68, P, 32-P, '3:4'),
    s(P, 34, 30, '4:3'),
    s(33, 47, 34, '3:4'),
    s(68, 34, 32-P, '4:3'),
    s(P, 68, 30, '3:4'),
    s(33, 68, 34, '4:3'),
    s(68, 68, 32-P, '3:4'),
  ]),
];

/* ── STRIP (horizontal/vertical) ── */
const STRIP: PageTemplate[] = [
  t('st1', '2 Panoramas',            'strip', [
    s(P, P, 100-P*2, '2:1'),
    s(P, 50+G/2, 100-P*2, '2:1'),
  ]),
  t('st2', '3 Panoramas',            'strip', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 33.3+G/2, 100-P*2, '16:9'),
    s(P, 66.6+G/2, 100-P*2, '16:9'),
  ]),
  t('st3', '3 Landscapes',           'strip', [
    s(P, P, 100-P*2, '3:2'),
    s(P, 33.3+G/2, 100-P*2, '3:2'),
    s(P, 66.6+G/2, 100-P*2, '3:2'),
  ]),
  t('st4', '2 Vertical Strips',      'strip', [
    s(P, P, 50-G/2-P, '3:4'),
    s(50+G/2, P, 50-G/2-P, '3:4'),
  ]),
  t('st5', 'Filmstrip 5',            'strip', [
    s(P, P, 100-P*2, '3:2'),
    s(P, 34, 20-G, '4:3'),
    s(20+G/2, 34, 20-G, '4:3'),
    s(40+G/2, 34, 20-G, '4:3'),
    s(60+G/2, 34, 20-G, '4:3'),
    s(80+G/2, 34, 20-G, '4:3'),
  ]),
];

/* ── SPECIAL (shapes, creative) ── */
const SPECIAL: PageTemplate[] = [
  t('sp1', 'Circle Grid',            'special', [
    s(P, P, 33.3-G, '1:1', { shape: 'circle' }),
    s(33.3+G/2, P, 33.3-G, '1:1', { shape: 'circle' }),
    s(66.6+G/2, P, 33.4-G, '1:1', { shape: 'circle' }),
    s(P, 33.3+G/2, 33.3-G, '1:1', { shape: 'circle' }),
    s(33.3+G/2, 33.3+G/2, 33.3-G, '1:1', { shape: 'circle' }),
    s(66.6+G/2, 33.3+G/2, 33.4-G, '1:1', { shape: 'circle' }),
    s(P, 66.6+G/2, 33.3-G, '1:1', { shape: 'circle' }),
    s(33.3+G/2, 66.6+G/2, 33.3-G, '1:1', { shape: 'circle' }),
    s(66.6+G/2, 66.6+G/2, 33.4-G, '1:1', { shape: 'circle' }),
  ]),
  t('sp2', 'Oval Duo',               'special', [
    s(5, 10, 42, '3:4', { shape: 'oval' }),
    s(53, 10, 42, '3:4', { shape: 'oval' }),
  ]),
  t('sp3', 'Rounded 2x3',            'special', [
    s(P, P, 33.3-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
    s(33.3+G/2, P, 33.3-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
    s(66.6+G/2, P, 33.4-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
    s(P, 33.3+G/2, 33.3-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
    s(33.3+G/2, 33.3+G/2, 33.3-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
    s(66.6+G/2, 33.3+G/2, 33.4-G, '1:1', { shape: 'rounded', borderRadius: 12 }),
  ]),
  t('sp4', 'Circle Hero + Grid',     'special', [
    s(5, 5, 50, '1:1', { shape: 'circle' }),
    s(55, P, 45-P, '1:1'),
    s(55, 33, 45-P, '1:1'),
    s(55, 61, 45-P, '1:1'),
  ]),
  t('sp5', 'Overlapping Rounded',    'special', [
    s(5, 5, 50, '4:3', { shape: 'rounded', borderRadius: 15 }),
    s(35, 25, 60, '4:3', { shape: 'rounded', borderRadius: 15 }),
    s(15, 55, 50, '4:3', { shape: 'rounded', borderRadius: 15 }),
  ]),
  t('sp6', 'Polaroid Grid',          'special', [
    s(P, P, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(35, P, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(68, P, 32-P, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(P, 35, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(35, 35, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(68, 35, 32-P, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(P, 68, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(35, 68, 30, '1:1', { shape: 'rounded', borderRadius: 4 }),
    s(68, 68, 32-P, '1:1', { shape: 'rounded', borderRadius: 4 }),
  ]),
];

/* ── COLLAGE (overlapping, artistic) ── */
const COLLAGE: PageTemplate[] = [
  t('c1',  'Collage Overlap 3',      'collage', [
    s(5, 5, 55, '4:3', { rotation: -3 }),
    s(40, 15, 55, '4:3', { rotation: 4 }),
    s(20, 45, 55, '4:3', { rotation: -2 }),
  ]),
  t('c2',  'Collage Scatter',        'collage', [
    s(5, 5, 35, '1:1', { rotation: -8 }),
    s(40, 10, 30, '1:1', { rotation: 12 }),
    s(70, 5, 28, '1:1', { rotation: -5 }),
    s(15, 45, 40, '3:4', { rotation: 6 }),
    s(55, 50, 40, '3:4', { rotation: -10 }),
  ]),
  t('c3',  'Collage Polaroids',      'collage', [
    s(5, 5, 40, '1:1', { rotation: -8, shape: 'rounded', borderRadius: 3 }),
    s(40, 10, 40, '1:1', { rotation: 5, shape: 'rounded', borderRadius: 3 }),
    s(20, 50, 40, '1:1', { rotation: 3, shape: 'rounded', borderRadius: 3 }),
    s(55, 45, 40, '1:1', { rotation: -4, shape: 'rounded', borderRadius: 3 }),
  ]),
  t('c4',  'Collage Mosaic',         'collage', [
    s(P, P, 40, '1:1'),
    s(42, P, 30, '1:1'),
    s(73, P, 27-P, '1:1'),
    s(P, 42, 30, '1:1'),
    s(32, 42, 35, '4:3'),
    s(67, 33, 33-P, '3:4'),
    s(P, 74, 40, '3:4'),
    s(42, 79, 30, '3:4'),
    s(73, 69, 27-P, '4:3'),
  ]),
  t('c5',  'Collage Scrapbook',      'collage', [
    s(5, 5, 50, '4:3', { rotation: -3 }),
    s(45, 5, 50, '4:3', { rotation: 2 }),
    s(5, 40, 33, '3:4', { rotation: 4 }),
    s(38, 45, 33, '3:4', { rotation: -5 }),
    s(71, 42, 29, '3:4', { rotation: 3 }),
    s(5, 70, 95, '3:4'),
  ]),
];

/* ── MIXED ── */
const MIXED: PageTemplate[] = [
  t('x1',  'Grid + Hero Bottom',     'mixed', [
    s(P, P, 33.3-G, '3:4'),
    s(33.3+G/2, P, 33.3-G, '3:4'),
    s(66.6+G/2, P, 33.4-G, '3:4'),
    s(P, 52, 33.3-G, '3:4'),
    s(33.3+G/2, 52, 33.3-G, '3:4'),
    s(66.6+G/2, 52, 33.4-G, '3:4'),
    s(P, 72, 100-P*2, '16:9'),
  ]),
  t('x2',  'Hero + Grid',            'mixed', [
    s(P, P, 100-P*2, '16:9'),
    s(P, 52, 33.3-G, '1:1'),
    s(33.3+G/2, 52, 33.3-G, '1:1'),
    s(66.6+G/2, 52, 33.4-G, '1:1'),
  ]),
  t('x3',  '4 Top + Hero Bottom',    'mixed', [
    s(P, P, 25-G, '4:3'),
    s(25+G/2, P, 25-G, '4:3'),
    s(50+G/2, P, 25-G, '4:3'),
    s(75+G/2, P, 25-G, '4:3'),
    s(P, 48, 100-P*2, '16:9'),
  ]),
  t('x4',  'Big + Grid Right',       'mixed', [
    s(P, P, 48, '4:3'),
    s(52, P, 48-P, '1:1'),
    s(52, 33, 48-P, '1:1'),
    s(52, 66, 48-P, '1:1'),
  ]),
  t('x5',  'Magazine Spread',        'mixed', [
    s(P, P, 60, '4:3'),
    s(65, P, 35-P, '3:4'),
    s(65, 48, 35-P, '3:4'),
    s(P, 68, 48, '3:4'),
    s(52, 68, 48-P, '4:3'),
  ]),
  t('x6',  'Photo Wall',             'mixed', [
    s(5, 5, 30, '1:1', { rotation: -3 }),
    s(35, 8, 25, '1:1', { rotation: 2 }),
    s(60, 3, 38, '1:1', { rotation: -2 }),
    s(5, 35, 35, '1:1', { rotation: 3 }),
    s(40, 38, 30, '1:1', { rotation: -4 }),
    s(70, 33, 30, '1:1', { rotation: 2 }),
    s(5, 65, 28, '1:1', { rotation: -2 }),
    s(33, 63, 35, '1:1', { rotation: 3 }),
    s(68, 65, 32, '1:1', { rotation: -3 }),
  ]),
];

/* ═══════════════════════════════════════════════════════════
   ASSEMBLE FULL LIBRARY
   ═══════════════════════════════════════════════════════════ */

export const PAGE_TEMPLATES: PageTemplate[] = [
  ...SINGLE,  // 5
  ...DUO,     // 10
  ...GRID,    // 16
  ...HERO,    // 7
  ...MASONRY, // 4
  ...STRIP,   // 5
  ...SPECIAL, // 6
  ...COLLAGE, // 5
  ...MIXED,   // 6
];

export const TEMPLATE_COUNT = PAGE_TEMPLATES.length;

export function getTemplatesByCategory(category: PageTemplate['category']): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplateById(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

export const TEMPLATE_CATEGORIES: { id: PageTemplate['category']; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'duo', label: 'Duo' },
  { id: 'grid', label: 'Grid' },
  { id: 'hero', label: 'Hero' },
  { id: 'masonry', label: 'Masonry' },
  { id: 'strip', label: 'Strip' },
  { id: 'collage', label: 'Collage' },
  { id: 'special', label: 'Shapes' },
  { id: 'mixed', label: 'Mixed' },
];

console.log(`[Megy Prints] Loaded ${TEMPLATE_COUNT} aspect-ratio templates`);
