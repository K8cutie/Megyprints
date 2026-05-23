import type { PageTemplate, TemplateSlot } from './types';

let slotCounter = 0;
function s(x: number, y: number, w: number, h: number, opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {}): TemplateSlot {
  slotCounter += 1;
  return { id: `s${slotCounter}`, x, y, width: w, height: h, shape: 'rectangle', ...opts };
}

function t(id: string, name: string, category: PageTemplate['category'], slots: TemplateSlot[]): PageTemplate {
  return { id, name, category, slotCount: slots.length, slots };
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE LIBRARY — 100+ Designs
   All coordinates are percentages (0-100) of page dimensions
   ═══════════════════════════════════════════════════════════ */

const PADDING = 3;
const GAP = 2.5;

/* ── SINGLE (1 photo) ── */
const SINGLE: PageTemplate[] = [
  t('s1',  'Full Page',        'single', [s(0, 0, 100, 100)]),
  t('s2',  'Centered',         'single', [s(10, 10, 80, 80, { shape: 'rounded', borderRadius: 8 })]),
  t('s3',  'Portrait Frame',   'single', [s(15, 5, 70, 90, { shape: 'rounded', borderRadius: 6 })]),
  t('s4',  'Landscape Wide',   'single', [s(5, 15, 90, 70)]),
  t('s5',  'Circle Hero',      'single', [s(10, 5, 80, 90, { shape: 'circle' })]),
];

/* ── DUO (2 photos) ── */
const DUO: PageTemplate[] = [
  t('d1',  'Side by Side',     'duo', [s(PADDING, PADDING, 50-GAP/2-PADDING, 100-PADDING*2), s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 100-PADDING*2)]),
  t('d2',  'Stacked',          'duo', [s(PADDING, PADDING, 100-PADDING*2, 50-GAP/2-PADDING), s(PADDING, 50+GAP/2, 100-PADDING*2, 50-GAP/2-PADDING)]),
  t('d3',  'Left Tall + Right','duo', [s(PADDING, PADDING, 45, 100-PADDING*2), s(50, PADDING, 50-PADDING, 100-PADDING*2)]),
  t('d4',  'Right Tall + Left','duo', [s(PADDING, PADDING, 50-PADDING, 100-PADDING*2), s(55, PADDING, 45, 100-PADDING*2)]),
  t('d5',  'Top Wide + Bottom','duo', [s(PADDING, PADDING, 100-PADDING*2, 45), s(PADDING, 55, 100-PADDING*2, 45)]),
  t('d6',  'Bottom Wide + Top','duo', [s(PADDING, PADDING, 100-PADDING*2, 45), s(PADDING, 55, 100-PADDING*2, 45)]),
  t('d7',  'Overlapping Duo',  'duo', [s(5, 5, 60, 85, { shape: 'rounded', borderRadius: 6 }), s(35, 10, 60, 85, { shape: 'rounded', borderRadius: 6 })]),
  t('d8',  'Diagonal',         'duo', [s(5, 5, 55, 55, { rotation: -5 }), s(40, 40, 55, 55, { rotation: 5 })]),
  t('d9',  'Circle + Square',  'duo', [s(5, 10, 45, 80, { shape: 'circle' }), s(55, 10, 40, 80)]),
  t('d10', 'Oval Pair',        'duo', [s(5, 15, 42, 70, { shape: 'oval' }), s(53, 15, 42, 70, { shape: 'oval' })]),
];

/* ── GRID (3-16 photos in grid patterns) ── */
const GRID: PageTemplate[] = [
  // 3-photo grids
  t('g3a', '3 — Row',          'grid', [
    s(PADDING, PADDING, 33.3-GAP, 100-PADDING*2),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 100-PADDING*2),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 100-PADDING*2),
  ]),
  t('g3b', '3 — L-Shape',      'grid', [
    s(PADDING, PADDING, 60, 60),
    s(65, PADDING, 35-PADDING, 60),
    s(PADDING, 65, 100-PADDING*2, 35-PADDING),
  ]),
  t('g3c', '3 — Tall Center',  'grid', [
    s(PADDING, PADDING, 30, 100-PADDING*2),
    s(35, PADDING, 30, 100-PADDING*2),
    s(70, PADDING, 30, 100-PADDING*2),
  ]),
  t('g3d', '3 — Two Top One Bottom','grid', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(PADDING, 50+GAP/2, 100-PADDING*2, 50-GAP/2-PADDING),
  ]),
  t('g3e', '3 — One Top Two Bottom','grid', [
    s(PADDING, PADDING, 100-PADDING*2, 50-GAP/2),
    s(PADDING, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING),
    s(50+GAP/2, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING),
  ]),

  // 4-photo grids
  t('g4a', '4 — 2x2 Grid',     'grid', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(PADDING, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING),
    s(50+GAP/2, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING),
  ]),
  t('g4b', '4 — 2x2 Rounded',  'grid', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 50-GAP/2, { shape: 'rounded', borderRadius: 8 }),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 50-GAP/2, { shape: 'rounded', borderRadius: 8 }),
    s(PADDING, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING, { shape: 'rounded', borderRadius: 8 }),
    s(50+GAP/2, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING, { shape: 'rounded', borderRadius: 8 }),
  ]),
  t('g4c', '4 — 2x2 Circles',  'grid', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 50-GAP/2, { shape: 'circle' }),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 50-GAP/2, { shape: 'circle' }),
    s(PADDING, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING, { shape: 'circle' }),
    s(50+GAP/2, 50+GAP/2, 50-GAP/2-PADDING, 50-GAP/2-PADDING, { shape: 'circle' }),
  ]),
  t('g4d', '4 — Left Tall + 3 Right','grid', [
    s(PADDING, PADDING, 48, 100-PADDING*2),
    s(52, PADDING, 48-PADDING, 31.5),
    s(52, 34.3, 48-PADDING, 31.5),
    s(52, 68.5, 48-PADDING, 31.5),
  ]),
  t('g4e', '4 — Right Tall + 3 Left','grid', [
    s(PADDING, PADDING, 48-PADDING, 31.5),
    s(PADDING, 34.3, 48-PADDING, 31.5),
    s(PADDING, 68.5, 48-PADDING, 31.5),
    s(52, PADDING, 48, 100-PADDING*2),
  ]),
  t('g4f', '4 — Top Wide + 3 Bottom','grid', [
    s(PADDING, PADDING, 100-PADDING*2, 48),
    s(PADDING, 52, 31.5, 48-PADDING),
    s(34.3, 52, 31.5, 48-PADDING),
    s(68.5, 52, 31.5, 48-PADDING),
  ]),
  t('g4g', '4 — 4 Columns',    'grid', [
    s(PADDING, PADDING, 25-GAP, 100-PADDING*2),
    s(25+GAP/2, PADDING, 25-GAP, 100-PADDING*2),
    s(50+GAP/2, PADDING, 25-GAP, 100-PADDING*2),
    s(75+GAP/2, PADDING, 25-GAP, 100-PADDING*2),
  ]),
  t('g4h', '4 — 4 Rows',       'grid', [
    s(PADDING, PADDING, 100-PADDING*2, 25-GAP),
    s(PADDING, 25+GAP/2, 100-PADDING*2, 25-GAP),
    s(PADDING, 50+GAP/2, 100-PADDING*2, 25-GAP),
    s(PADDING, 75+GAP/2, 100-PADDING*2, 25-GAP),
  ]),

  // 6-photo grids
  t('g6a', '6 — 2x3 Grid',     'grid', [
    s(PADDING, PADDING, 33.3-GAP, 50-GAP/2),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 50-GAP/2),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 50-GAP/2),
    s(PADDING, 50+GAP/2, 33.3-GAP, 50-GAP/2-PADDING),
    s(33.3+GAP/2, 50+GAP/2, 33.3-GAP, 50-GAP/2-PADDING),
    s(66.6+GAP/2, 50+GAP/2, 33.4-GAP, 50-GAP/2-PADDING),
  ]),
  t('g6b', '6 — 3x2 Grid',     'grid', [
    s(PADDING, PADDING, 50-GAP/2, 33.3-GAP),
    s(50+GAP/2, PADDING, 50-GAP/2, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 50-GAP/2, 33.3-GAP),
    s(50+GAP/2, 33.3+GAP/2, 50-GAP/2, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 50-GAP/2, 33.4-GAP),
    s(50+GAP/2, 66.6+GAP/2, 50-GAP/2, 33.4-GAP),
  ]),
  t('g6c', '6 — Left Large + 5 Small','grid', [
    s(PADDING, PADDING, 48, 100-PADDING*2),
    s(52, PADDING, 48-PADDING, 18.5),
    s(52, 20.3, 48-PADDING, 18.5),
    s(52, 40.6, 48-PADDING, 18.5),
    s(52, 60.9, 48-PADDING, 18.5),
    s(52, 81.2, 48-PADDING, 18.8),
  ]),

  // 9-photo grid
  t('g9a', '9 — 3x3 Grid',     'grid', [
    s(PADDING, PADDING, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(66.6+GAP/2, 66.6+GAP/2, 33.4-GAP, 33.4-GAP),
  ]),

  // 12-photo grid
  t('g12', '12 — 3x4 Grid',    'grid', [
    s(PADDING, PADDING, 33.3-GAP, 25-GAP),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 25-GAP),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 25-GAP),
    s(PADDING, 25+GAP/2, 33.3-GAP, 25-GAP),
    s(33.3+GAP/2, 25+GAP/2, 33.3-GAP, 25-GAP),
    s(66.6+GAP/2, 25+GAP/2, 33.4-GAP, 25-GAP),
    s(PADDING, 50+GAP/2, 33.3-GAP, 25-GAP),
    s(33.3+GAP/2, 50+GAP/2, 33.3-GAP, 25-GAP),
    s(66.6+GAP/2, 50+GAP/2, 33.4-GAP, 25-GAP),
    s(PADDING, 75+GAP/2, 33.3-GAP, 25-GAP),
    s(33.3+GAP/2, 75+GAP/2, 33.3-GAP, 25-GAP),
    s(66.6+GAP/2, 75+GAP/2, 33.4-GAP, 25-GAP),
  ]),
];

/* ── HERO (1 large + supporting small) ── */
const HERO: PageTemplate[] = [
  t('h1',  'Hero Left + 2 Right',  'hero', [
    s(PADDING, PADDING, 55, 100-PADDING*2),
    s(60, PADDING, 40-PADDING, 48),
    s(60, 52, 40-PADDING, 48),
  ]),
  t('h2',  'Hero Right + 2 Left',  'hero', [
    s(PADDING, PADDING, 40-PADDING, 48),
    s(PADDING, 52, 40-PADDING, 48),
    s(45, PADDING, 55, 100-PADDING*2),
  ]),
  t('h3',  'Hero Top + 3 Bottom',   'hero', [
    s(PADDING, PADDING, 100-PADDING*2, 55),
    s(PADDING, 58, 33.3-GAP, 42-PADDING),
    s(33.3+GAP/2, 58, 33.3-GAP, 42-PADDING),
    s(66.6+GAP/2, 58, 33.4-GAP, 42-PADDING),
  ]),
  t('h4',  'Hero Bottom + 3 Top',   'hero', [
    s(PADDING, PADDING, 33.3-GAP, 42),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 42),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 42),
    s(PADDING, 45, 100-PADDING*2, 55-PADDING),
  ]),
  t('h5',  'Hero Center + 4 Around','hero', [
    s(PADDING, PADDING, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(66.6+GAP/2, 66.6+GAP/2, 33.4-GAP, 33.4-GAP),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
  ]),
  t('h6',  'Hero Left + 4 Right Grid','hero', [
    s(PADDING, PADDING, 45, 100-PADDING*2),
    s(50, PADDING, 25-GAP/2, 25-GAP),
    s(75+GAP/2, PADDING, 25-GAP, 25-GAP),
    s(50, 25+GAP/2, 25-GAP/2, 25-GAP),
    s(75+GAP/2, 25+GAP/2, 25-GAP, 25-GAP),
    s(50, 50+GAP/2, 25-GAP/2, 25-GAP),
    s(75+GAP/2, 50+GAP/2, 25-GAP, 25-GAP),
    s(50, 75+GAP/2, 25-GAP/2, 25-GAP),
    s(75+GAP/2, 75+GAP/2, 25-GAP, 25-GAP),
  ]),
  t('h7',  'Hero Right + 4 Left Grid','hero', [
    s(PADDING, PADDING, 25-GAP/2, 25-GAP),
    s(25+GAP/2, PADDING, 25-GAP, 25-GAP),
    s(PADDING, 25+GAP/2, 25-GAP/2, 25-GAP),
    s(25+GAP/2, 25+GAP/2, 25-GAP, 25-GAP),
    s(PADDING, 50+GAP/2, 25-GAP/2, 25-GAP),
    s(25+GAP/2, 50+GAP/2, 25-GAP, 25-GAP),
    s(PADDING, 75+GAP/2, 25-GAP/2, 25-GAP),
    s(25+GAP/2, 75+GAP/2, 25-GAP, 25-GAP),
    s(50+GAP/2, PADDING, 50-PADDING, 100-PADDING*2),
  ]),
  t('h8',  'Hero Top + 2 Bottom Wide','hero', [
    s(PADDING, PADDING, 100-PADDING*2, 60),
    s(PADDING, 62, 50-GAP/2-PADDING, 38-PADDING),
    s(50+GAP/2, 62, 50-GAP/2-PADDING, 38-PADDING),
  ]),
  t('h9',  'Hero Top + 4 Bottom',    'hero', [
    s(PADDING, PADDING, 100-PADDING*2, 50),
    s(PADDING, 52, 25-GAP, 48-PADDING),
    s(25+GAP/2, 52, 25-GAP, 48-PADDING),
    s(50+GAP/2, 52, 25-GAP, 48-PADDING),
    s(75+GAP/2, 52, 25-GAP, 48-PADDING),
  ]),
  t('h10', 'Hero Bottom + 4 Top',    'hero', [
    s(PADDING, PADDING, 25-GAP, 48),
    s(25+GAP/2, PADDING, 25-GAP, 48),
    s(50+GAP/2, PADDING, 25-GAP, 48),
    s(75+GAP/2, PADDING, 25-GAP, 48),
    s(PADDING, 50, 100-PADDING*2, 50-PADDING),
  ]),
  t('h11', 'Hero Center + 6 Around', 'hero', [
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(PADDING, PADDING, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(66.6+GAP/2, 66.6+GAP/2, 33.4-GAP, 33.4-GAP),
  ]),
  t('h12', 'Hero Top Wide + 5 Bottom','hero', [
    s(PADDING, PADDING, 100-PADDING*2, 45),
    s(PADDING, 47, 33.3-GAP, 53-PADDING),
    s(33.3+GAP/2, 47, 33.3-GAP, 53-PADDING),
    s(66.6+GAP/2, 47, 33.4-GAP, 53-PADDING),
  ]),
];

/* ── MASONRY (uneven grid, Pinterest-style) ── */
const MASONRY: PageTemplate[] = [
  t('m1',  'Masonry 2-Column',       'masonry', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 30),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 45),
    s(PADDING, 32, 50-GAP/2-PADDING, 45),
    s(50+GAP/2, 47, 50-GAP/2-PADDING, 30),
    s(PADDING, 79, 50-GAP/2-PADDING, 21-PADDING),
    s(50+GAP/2, 79, 50-GAP/2-PADDING, 21-PADDING),
  ]),
  t('m2',  'Masonry 3-Column',       'masonry', [
    s(PADDING, PADDING, 33.3-GAP, 35),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 25),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 40),
    s(PADDING, 37, 33.3-GAP, 40),
    s(33.3+GAP/2, 27, 33.3-GAP, 35),
    s(66.6+GAP/2, 42, 33.4-GAP, 30),
    s(PADDING, 79, 33.3-GAP, 21-PADDING),
    s(33.3+GAP/2, 64, 33.3-GAP, 36-PADDING),
    s(66.6+GAP/2, 74, 33.4-GAP, 26-PADDING),
  ]),
  t('m3',  'Masonry Mixed Heights',  'masonry', [
    s(PADDING, PADDING, 48, 35),
    s(52, PADDING, 48-PADDING, 20),
    s(52, 22, 48-PADDING, 40),
    s(PADDING, 37, 48, 35),
    s(52, 64, 48-PADDING, 36-PADDING),
    s(PADDING, 74, 48, 26-PADDING),
  ]),
  t('m4',  'Masonry Cascade',        'masonry', [
    s(PADDING, PADDING, 30, 30),
    s(33, PADDING, 34, 45),
    s(68, PADDING, 32-PADDING, 30),
    s(PADDING, 32, 30, 45),
    s(33, 47, 34, 30),
    s(68, 32, 32-PADDING, 45),
    s(PADDING, 79, 30, 21-PADDING),
    s(33, 79, 34, 21-PADDING),
    s(68, 79, 32-PADDING, 21-PADDING),
  ]),
  t('m5',  'Masonry Waterfall',      'masonry', [
    s(PADDING, PADDING, 100-PADDING*2, 25),
    s(PADDING, 26, 33.3-GAP, 35),
    s(33.3+GAP/2, 26, 33.3-GAP, 50),
    s(66.6+GAP/2, 26, 33.4-GAP, 35),
    s(PADDING, 63, 33.3-GAP, 37-PADDING),
    s(66.6+GAP/2, 63, 33.4-GAP, 37-PADDING),
  ]),
  t('m6',  'Masonry Zigzag',         'masonry', [
    s(PADDING, PADDING, 48, 22),
    s(52, PADDING, 48-PADDING, 35),
    s(PADDING, 24, 48, 35),
    s(52, 37, 48-PADDING, 22),
    s(PADDING, 61, 48, 22),
    s(52, 61, 48-PADDING, 39-PADDING),
    s(PADDING, 85, 48, 15-PADDING),
  ]),
  t('m7',  'Masonry Big Small',      'masonry', [
    s(PADDING, PADDING, 65, 65),
    s(68, PADDING, 32-PADDING, 32),
    s(68, 34, 32-PADDING, 32),
    s(PADDING, 68, 32, 32-PADDING),
    s(34, 68, 32, 32-PADDING),
    s(68, 68, 32-PADDING, 32-PADDING),
  ]),
  t('m8',  'Masonry 3 Tall',         'masonry', [
    s(PADDING, PADDING, 33.3-GAP, 100-PADDING*2),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 100-PADDING*2),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 100-PADDING*2),
  ]),
  t('m9',  'Masonry Stairs',         'masonry', [
    s(PADDING, PADDING, 100-PADDING*2, 20),
    s(PADDING, 21, 48, 25),
    s(52, 21, 48-PADDING, 40),
    s(PADDING, 47, 48, 40),
    s(52, 62, 48-PADDING, 25),
    s(PADDING, 88, 100-PADDING*2, 12-PADDING),
  ]),
  t('m10', 'Masonry Offset',         'masonry', [
    s(PADDING, PADDING, 45, 35),
    s(50, 10, 50-PADDING, 25),
    s(50, 37, 50-PADDING, 30),
    s(PADDING, 37, 45, 30),
    s(PADDING, 69, 45, 31-PADDING),
    s(50, 69, 50-PADDING, 31-PADDING),
  ]),
];

/* ── STRIP (horizontal/vertical strips) ── */
const STRIP: PageTemplate[] = [
  t('st1', '2 Horizontal Strips',    'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 50-GAP/2),
    s(PADDING, 50+GAP/2, 100-PADDING*2, 50-GAP/2-PADDING),
  ]),
  t('st2', '3 Horizontal Strips',    'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 100-PADDING*2, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 100-PADDING*2, 33.4-GAP),
  ]),
  t('st3', '4 Horizontal Strips',    'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 25-GAP),
    s(PADDING, 25+GAP/2, 100-PADDING*2, 25-GAP),
    s(PADDING, 50+GAP/2, 100-PADDING*2, 25-GAP),
    s(PADDING, 75+GAP/2, 100-PADDING*2, 25-GAP),
  ]),
  t('st4', '5 Horizontal Strips',    'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 20-GAP),
    s(PADDING, 20+GAP/2, 100-PADDING*2, 20-GAP),
    s(PADDING, 40+GAP/2, 100-PADDING*2, 20-GAP),
    s(PADDING, 60+GAP/2, 100-PADDING*2, 20-GAP),
    s(PADDING, 80+GAP/2, 100-PADDING*2, 20-GAP),
  ]),
  t('st5', '2 Vertical Strips',      'strip', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 100-PADDING*2),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 100-PADDING*2),
  ]),
  t('st6', '3 Vertical Strips',      'strip', [
    s(PADDING, PADDING, 33.3-GAP, 100-PADDING*2),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 100-PADDING*2),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 100-PADDING*2),
  ]),
  t('st7', 'Panorama + 2',           'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 55),
    s(PADDING, 57, 50-GAP/2-PADDING, 43-PADDING),
    s(50+GAP/2, 57, 50-GAP/2-PADDING, 43-PADDING),
  ]),
  t('st8', '2 + Panorama',           'strip', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 43),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 43),
    s(PADDING, 45, 100-PADDING*2, 55-PADDING),
  ]),
  t('st9', 'Filmstrip 5',            'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 60),
    s(PADDING, 62, 20-GAP, 38-PADDING),
    s(20+GAP/2, 62, 20-GAP, 38-PADDING),
    s(40+GAP/2, 62, 20-GAP, 38-PADDING),
    s(60+GAP/2, 62, 20-GAP, 38-PADDING),
    s(80+GAP/2, 62, 20-GAP, 38-PADDING),
  ]),
  t('st10','Panorama Stack',         'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 30-GAP),
    s(PADDING, 30+GAP/2, 100-PADDING*2, 35-GAP),
    s(PADDING, 65+GAP/2, 100-PADDING*2, 35-GAP),
  ]),
  t('st11','Vertical Filmstrip',     'strip', [
    s(PADDING, PADDING, 60, 100-PADDING*2),
    s(62, PADDING, 38-PADDING, 20-GAP),
    s(62, 20+GAP/2, 38-PADDING, 20-GAP),
    s(62, 40+GAP/2, 38-PADDING, 20-GAP),
    s(62, 60+GAP/2, 38-PADDING, 20-GAP),
    s(62, 80+GAP/2, 38-PADDING, 20-GAP),
  ]),
  t('st12','3 Panoramas',            'strip', [
    s(PADDING, PADDING, 100-PADDING*2, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 100-PADDING*2, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 100-PADDING*2, 33.4-GAP),
  ]),
];

/* ── SPECIAL (shapes, creative) ── */
const SPECIAL: PageTemplate[] = [
  t('sp1', 'Heart Trio',             'special', [
    s(15, 5, 70, 60, { shape: 'heart' }),
    s(5, 65, 42.5, 35-PADDING),
    s(52.5, 65, 42.5, 35-PADDING),
  ]),
  t('sp2', 'Circle Grid',            'special', [
    s(PADDING, PADDING, 33.3-GAP, 33.3-GAP, { shape: 'circle' }),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP, { shape: 'circle' }),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP, { shape: 'circle' }),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP, { shape: 'circle' }),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP, { shape: 'circle' }),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP, { shape: 'circle' }),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP, { shape: 'circle' }),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP, { shape: 'circle' }),
    s(66.6+GAP/2, 66.6+GAP/2, 33.4-GAP, 33.4-GAP, { shape: 'circle' }),
  ]),
  t('sp3', 'Oval Duo',               'special', [
    s(5, 10, 42, 80, { shape: 'oval' }),
    s(53, 10, 42, 80, { shape: 'oval' }),
  ]),
  t('sp4', 'Rounded 2x3',            'special', [
    s(PADDING, PADDING, 33.3-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP, { shape: 'rounded', borderRadius: 12 }),
    s(66.6+GAP/2, 66.6+GAP/2, 33.4-GAP, 33.4-GAP, { shape: 'rounded', borderRadius: 12 }),
  ]),
  t('sp5', 'Circle Hero + Grid',     'special', [
    s(5, 5, 50, 50, { shape: 'circle' }),
    s(55, PADDING, 45-PADDING, 23),
    s(55, 26, 45-PADDING, 23),
    s(55, 51, 45-PADDING, 23),
    s(55, 76, 45-PADDING, 24-PADDING),
  ]),
  t('sp6', 'Heart + 4 Around',       'special', [
    s(25, 20, 50, 50, { shape: 'heart' }),
    s(PADDING, PADDING, 23, 18),
    s(77, PADDING, 23, 18),
    s(PADDING, 72, 23, 28-PADDING),
    s(77, 72, 23, 28-PADDING),
  ]),
  t('sp7', 'Overlapping Rounded',    'special', [
    s(5, 5, 50, 50, { shape: 'rounded', borderRadius: 15 }),
    s(35, 25, 60, 50, { shape: 'rounded', borderRadius: 15 }),
    s(15, 55, 50, 40, { shape: 'rounded', borderRadius: 15 }),
  ]),
  t('sp8', 'Scattered Circles',      'special', [
    s(10, 10, 35, 35, { shape: 'circle' }),
    s(50, 5, 30, 30, { shape: 'circle' }),
    s(5, 50, 40, 40, { shape: 'circle' }),
    s(50, 40, 45, 45, { shape: 'circle' }),
    s(15, 80, 25, 20, { shape: 'circle' }),
  ]),
  t('sp9', 'Diamond Grid',           'special', [
    s(30, 5, 40, 25, { rotation: 0 }),
    s(5, 25, 35, 25),
    s(60, 25, 35, 25),
    s(30, 50, 40, 25),
    s(5, 70, 35, 25),
    s(60, 70, 35, 25),
    s(30, 75, 40, 25),
  ]),
  t('sp10','Polaroid Grid',          'special', [
    s(PADDING, PADDING, 30, 35, { shape: 'rounded', borderRadius: 4 }),
    s(35, PADDING, 30, 45, { shape: 'rounded', borderRadius: 4 }),
    s(68, PADDING, 32-PADDING, 30, { shape: 'rounded', borderRadius: 4 }),
    s(PADDING, 38, 30, 30, { shape: 'rounded', borderRadius: 4 }),
    s(35, 48, 30, 35, { shape: 'rounded', borderRadius: 4 }),
    s(68, 33, 32-PADDING, 32, { shape: 'rounded', borderRadius: 4 }),
    s(PADDING, 70, 30, 30-PADDING, { shape: 'rounded', borderRadius: 4 }),
    s(35, 85, 30, 15-PADDING, { shape: 'rounded', borderRadius: 4 }),
    s(68, 67, 32-PADDING, 33-PADDING, { shape: 'rounded', borderRadius: 4 }),
  ]),
];

/* ── COLLAGE (overlapping, angled, artistic) ── */
const COLLAGE: PageTemplate[] = [
  t('c1',  'Collage Overlap 3',      'collage', [
    s(5, 5, 55, 55, { rotation: -3 }),
    s(40, 15, 55, 55, { rotation: 4 }),
    s(20, 45, 55, 55, { rotation: -2 }),
  ]),
  t('c2',  'Collage Overlap 4',      'collage', [
    s(5, 5, 45, 45, { rotation: -5 }),
    s(45, 5, 50, 45, { rotation: 3 }),
    s(5, 45, 50, 45, { rotation: 4 }),
    s(45, 45, 50, 45, { rotation: -3 }),
  ]),
  t('c3',  'Collage Fan',            'collage', [
    s(30, 5, 40, 35, { rotation: -15 }),
    s(45, 20, 40, 35, { rotation: -5 }),
    s(50, 35, 40, 35, { rotation: 5 }),
    s(45, 50, 40, 35, { rotation: 15 }),
  ]),
  t('c4',  'Collage Stack',          'collage', [
    s(10, 5, 80, 50, { rotation: -2 }),
    s(8, 30, 80, 50, { rotation: 1 }),
    s(12, 50, 80, 50, { rotation: -1 }),
  ]),
  t('c5',  'Collage Scatter',        'collage', [
    s(5, 5, 35, 35, { rotation: -8 }),
    s(40, 10, 30, 30, { rotation: 12 }),
    s(70, 5, 28, 28, { rotation: -5 }),
    s(15, 45, 40, 35, { rotation: 6 }),
    s(55, 50, 40, 35, { rotation: -10 }),
  ]),
  t('c6',  'Collage Polaroids',      'collage', [
    s(5, 5, 40, 45, { rotation: -8, shape: 'rounded', borderRadius: 3 }),
    s(40, 10, 40, 45, { rotation: 5, shape: 'rounded', borderRadius: 3 }),
    s(20, 50, 40, 45, { rotation: 3, shape: 'rounded', borderRadius: 3 }),
    s(55, 45, 40, 45, { rotation: -4, shape: 'rounded', borderRadius: 3 }),
  ]),
  t('c7',  'Collage Diagonal',       'collage', [
    s(5, 5, 40, 40, { rotation: -10 }),
    s(30, 20, 40, 40, { rotation: 8 }),
    s(55, 35, 40, 40, { rotation: -6 }),
    s(10, 50, 40, 40, { rotation: 5 }),
    s(40, 65, 40, 35, { rotation: -3 }),
  ]),
  t('c8',  'Collage Layered',        'collage', [
    s(5, 5, 90, 40),
    s(5, 35, 90, 40),
    s(5, 65, 90, 35),
  ]),
  t('c9',  'Collage Mosaic',         'collage', [
    s(PADDING, PADDING, 40, 40),
    s(42, PADDING, 30, 30),
    s(73, PADDING, 27-PADDING, 30),
    s(PADDING, 42, 30, 30),
    s(32, 42, 35, 35),
    s(67, 33, 33-PADDING, 35),
    s(PADDING, 74, 40, 26-PADDING),
    s(42, 79, 30, 21-PADDING),
    s(73, 69, 27-PADDING, 31-PADDING),
  ]),
  t('c10', 'Collage Scrapbook',      'collage', [
    s(5, 5, 50, 40, { rotation: -3 }),
    s(45, 5, 50, 40, { rotation: 2 }),
    s(5, 40, 33, 30, { rotation: 4 }),
    s(38, 45, 33, 30, { rotation: -5 }),
    s(71, 42, 29, 30, { rotation: 3 }),
    s(5, 70, 95, 30-PADDING),
  ]),
];

/* ── MIXED (combinations of styles) ── */
const MIXED: PageTemplate[] = [
  t('x1',  'Grid + Hero Bottom',     'mixed', [
    s(PADDING, PADDING, 33.3-GAP, 30),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 30),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 30),
    s(PADDING, 32, 33.3-GAP, 30),
    s(33.3+GAP/2, 32, 33.3-GAP, 30),
    s(66.6+GAP/2, 32, 33.4-GAP, 30),
    s(PADDING, 64, 100-PADDING*2, 36-PADDING),
  ]),
  t('x2',  'Grid + Hero Top',        'mixed', [
    s(PADDING, PADDING, 100-PADDING*2, 40),
    s(PADDING, 42, 33.3-GAP, 58-PADDING),
    s(33.3+GAP/2, 42, 33.3-GAP, 58-PADDING),
    s(66.6+GAP/2, 42, 33.4-GAP, 58-PADDING),
  ]),
  t('x3',  'Duo + Strip Bottom',     'mixed', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 55),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 55),
    s(PADDING, 57, 50-GAP/2-PADDING, 43-PADDING),
    s(50+GAP/2, 57, 50-GAP/2-PADDING, 43-PADDING),
  ]),
  t('x4',  'Circle Row + Hero',      'mixed', [
    s(PADDING, PADDING, 100-PADDING*2, 50),
    s(PADDING, 52, 25-GAP, 48-PADDING, { shape: 'circle' }),
    s(25+GAP/2, 52, 25-GAP, 48-PADDING, { shape: 'circle' }),
    s(50+GAP/2, 52, 25-GAP, 48-PADDING, { shape: 'circle' }),
    s(75+GAP/2, 52, 25-GAP, 48-PADDING, { shape: 'circle' }),
  ]),
  t('x5',  'Masonry + Strip',        'mixed', [
    s(PADDING, PADDING, 100-PADDING*2, 30),
    s(PADDING, 32, 33.3-GAP, 35),
    s(33.3+GAP/2, 32, 33.3-GAP, 68-PADDING),
    s(66.6+GAP/2, 32, 33.4-GAP, 35),
    s(PADDING, 69, 33.3-GAP, 31-PADDING),
    s(66.6+GAP/2, 69, 33.4-GAP, 31-PADDING),
  ]),
  t('x6',  'Hero + Circles',         'mixed', [
    s(PADDING, PADDING, 45, 100-PADDING*2),
    s(48, PADDING, 26, 25, { shape: 'circle' }),
    s(74, PADDING, 26-PADDING, 25, { shape: 'circle' }),
    s(48, 27, 26, 25, { shape: 'circle' }),
    s(74, 27, 26-PADDING, 25, { shape: 'circle' }),
    s(48, 52, 26, 25, { shape: 'circle' }),
    s(74, 52, 26-PADDING, 25, { shape: 'circle' }),
    s(48, 77, 26, 23-PADDING, { shape: 'circle' }),
    s(74, 77, 26-PADDING, 23-PADDING, { shape: 'circle' }),
  ]),
  t('x7',  'Rounded Grid 3x2',       'mixed', [
    s(PADDING, PADDING, 33.3-GAP, 50-GAP/2, { shape: 'rounded', borderRadius: 8 }),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 50-GAP/2, { shape: 'rounded', borderRadius: 8 }),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 50-GAP/2, { shape: 'rounded', borderRadius: 8 }),
    s(PADDING, 50+GAP/2, 33.3-GAP, 50-GAP/2-PADDING, { shape: 'rounded', borderRadius: 8 }),
    s(33.3+GAP/2, 50+GAP/2, 33.3-GAP, 50-GAP/2-PADDING, { shape: 'rounded', borderRadius: 8 }),
    s(66.6+GAP/2, 50+GAP/2, 33.4-GAP, 50-GAP/2-PADDING, { shape: 'rounded', borderRadius: 8 }),
  ]),
  t('x8',  'Scrapbook Grid',         'mixed', [
    s(PADDING, PADDING, 40, 30, { shape: 'rounded', borderRadius: 6 }),
    s(42, PADDING, 58-PADDING, 45, { shape: 'rounded', borderRadius: 6 }),
    s(PADDING, 32, 40, 30, { shape: 'rounded', borderRadius: 6 }),
    s(42, 47, 28, 25, { shape: 'rounded', borderRadius: 6 }),
    s(72, 47, 28-PADDING, 53-PADDING, { shape: 'rounded', borderRadius: 6 }),
    s(PADDING, 64, 40, 36-PADDING, { shape: 'rounded', borderRadius: 6 }),
    s(42, 74, 28, 26-PADDING, { shape: 'rounded', borderRadius: 6 }),
  ]),
  t('x9',  'Big + Grid Right',       'mixed', [
    s(PADDING, PADDING, 48, 100-PADDING*2),
    s(52, PADDING, 48-PADDING, 23.5),
    s(52, 25.5, 48-PADDING, 23.5),
    s(52, 51, 48-PADDING, 23.5),
    s(52, 76.5, 48-PADDING, 23.5),
  ]),
  t('x10', 'Grid Left + Big',        'mixed', [
    s(PADDING, PADDING, 48-PADDING, 23.5),
    s(PADDING, 25.5, 48-PADDING, 23.5),
    s(PADDING, 51, 48-PADDING, 23.5),
    s(PADDING, 76.5, 48-PADDING, 23.5),
    s(52, PADDING, 48, 100-PADDING*2),
  ]),
  t('x11', 'Strips + Center',        'mixed', [
    s(PADDING, PADDING, 100-PADDING*2, 25),
    s(PADDING, 27, 48, 46),
    s(52, 27, 48-PADDING, 46),
    s(PADDING, 75, 100-PADDING*2, 25-PADDING),
  ]),
  t('x12', 'Panorama Grid',          'mixed', [
    s(PADDING, PADDING, 100-PADDING*2, 35),
    s(PADDING, 37, 25-GAP, 30),
    s(25+GAP/2, 37, 25-GAP, 63-PADDING),
    s(50+GAP/2, 37, 25-GAP, 30),
    s(75+GAP/2, 37, 25-GAP, 63-PADDING),
  ]),
  t('x13', 'Split + 3 Bottom',       'mixed', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 55),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 55),
    s(PADDING, 57, 33.3-GAP, 43-PADDING),
    s(33.3+GAP/2, 57, 33.3-GAP, 43-PADDING),
    s(66.6+GAP/2, 57, 33.4-GAP, 43-PADDING),
  ]),
  t('x14', '4 Top + Hero Bottom',    'mixed', [
    s(PADDING, PADDING, 25-GAP, 45),
    s(25+GAP/2, PADDING, 25-GAP, 45),
    s(50+GAP/2, PADDING, 25-GAP, 45),
    s(75+GAP/2, PADDING, 25-GAP, 45),
    s(PADDING, 47, 100-PADDING*2, 53-PADDING),
  ]),
  t('x15', 'Nested Grid',            'mixed', [
    s(PADDING, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(50+GAP/2, PADDING, 50-GAP/2-PADDING, 50-GAP/2),
    s(PADDING, 50+GAP/2, 25-GAP, 50-GAP/2-PADDING),
    s(25+GAP/2, 50+GAP/2, 25-GAP, 50-GAP/2-PADDING),
    s(50+GAP/2, 50+GAP/2, 25-GAP, 50-GAP/2-PADDING),
    s(75+GAP/2, 50+GAP/2, 25-GAP, 50-GAP/2-PADDING),
  ]),
  t('x16', 'Photo Wall',             'mixed', [
    s(5, 5, 30, 25, { rotation: -3 }),
    s(35, 8, 25, 30, { rotation: 2 }),
    s(60, 3, 38, 28, { rotation: -2 }),
    s(5, 35, 35, 28, { rotation: 3 }),
    s(40, 38, 30, 25, { rotation: -4 }),
    s(70, 33, 30, 30, { rotation: 2 }),
    s(5, 65, 28, 30, { rotation: -2 }),
    s(33, 63, 35, 35, { rotation: 3 }),
    s(68, 65, 32, 35, { rotation: -3 }),
  ]),
  t('x17', 'Tetris L',               'mixed', [
    s(PADDING, PADDING, 66, 33.3-GAP),
    s(PADDING, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(PADDING, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(33.3+GAP/2, 66.6+GAP/2, 33.3-GAP, 33.4-GAP),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 66.7-PADDING),
  ]),
  t('x18', 'Tetris T',               'mixed', [
    s(PADDING, PADDING, 33.3-GAP, 66.7-GAP),
    s(33.3+GAP/2, PADDING, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, PADDING, 33.4-GAP, 33.3-GAP),
    s(33.3+GAP/2, 33.3+GAP/2, 33.3-GAP, 33.3-GAP),
    s(66.6+GAP/2, 33.3+GAP/2, 33.4-GAP, 33.3-GAP),
    s(33.3+GAP/2, 66.6+GAP/2, 66.7+GAP/2, 33.4-GAP),
  ]),
  t('x19', 'Window Pane',            'mixed', [
    s(PADDING, PADDING, 48, 30),
    s(52, PADDING, 48-PADDING, 30),
    s(PADDING, 32, 30, 36),
    s(32, 32, 36, 36),
    s(68, 32, 32-PADDING, 36),
    s(PADDING, 68, 48, 32-PADDING),
    s(52, 68, 48-PADDING, 32-PADDING),
  ]),
  t('x20', 'Magazine Spread',        'mixed', [
    s(PADDING, PADDING, 60, 65),
    s(65, PADDING, 35-PADDING, 32),
    s(65, 34, 35-PADDING, 32),
    s(PADDING, 67, 48, 33-PADDING),
    s(52, 67, 48-PADDING, 33-PADDING),
  ]),
];

/* ═══════════════════════════════════════════════════════════
   ASSEMBLE FULL LIBRARY
   ═══════════════════════════════════════════════════════════ */

export const PAGE_TEMPLATES: PageTemplate[] = [
  ...SINGLE,  // 5
  ...DUO,     // 10
  ...GRID,    // 24
  ...HERO,    // 12
  ...MASONRY, // 10
  ...STRIP,   // 12
  ...SPECIAL, // 10
  ...COLLAGE, // 10
  ...MIXED,   // 20
];

/** Total count */
export const TEMPLATE_COUNT = PAGE_TEMPLATES.length;

/** Get templates by category */
export function getTemplatesByCategory(category: PageTemplate['category']): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.category === category);
}

/** Get template by ID */
export function getTemplateById(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

/** Get templates by photo count */
export function getTemplatesByPhotoCount(count: number): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.slotCount === count);
}

/** All categories for the picker */
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

console.log(`[Megy Prints] Loaded ${TEMPLATE_COUNT} page templates`);
