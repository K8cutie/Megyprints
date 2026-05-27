import type { PageTemplate, TemplateSlot } from './types';

/** ═══════════════════════════════════════════════════════════
 *  20 PREMIUM TEMPLATES — max 5 slots each
 *
 *  Overlapping templates use borderWidth + borderColor so
 *  each photo shows a crisp edge where it overlaps another.
 *  ═══════════════════════════════════════════════════════════ */

let slotCounter = 0;

/** Helper: create a slot. */
function s(
  x: number, y: number,
  w: number, h: number,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  return { id: `s${slotCounter}`, x, y, width: w, height: h, ...opts };
}

/** Helper: create a template. */
function t(id: string, name: string, category: PageTemplate['category'], slots: TemplateSlot[]): PageTemplate {
  return { id, name, category, slotCount: slots.length, slots };
}

/** White overlap border — used on all intentionally overlapping templates */
const OB = { borderWidth: 4, borderColor: '#FFFFFF' };

/* ── 01: FULL PAGE (1) ────────────────────────────────────── */
const T01 = t('t01', 'Full Page', 'single', [
  s(0, 0, 100, 100),
]);

/* ── 02: POLAROID DUO (2) ───────────────────────────────────
   Two polaroid-style frames, slightly angled, with white borders */
const T02 = t('t02', 'Polaroid Duo', 'duo', [
  s(5, 8, 42, 52, { rotation: -4, ...OB }),
  s(35, 22, 42, 52, { rotation: 5, ...OB }),
]);

/* ── 03: POLAROID TRIO (3) ──────────────────────────────────
   Three polaroids overlapping scrapbook-style */
const T03 = t('t03', 'Polaroid Trio', 'duo', [
  s(5, 5, 38, 48, { rotation: -6, ...OB }),
  s(30, 18, 38, 48, { rotation: 3, ...OB }),
  s(18, 48, 38, 48, { rotation: -2, ...OB }),
]);

/* ── 04: OVERLAPPING DUO (2) ────────────────────────────────
   Two large photos with dramatic diagonal overlap */
const T04 = t('t04', 'Overlapping Duo', 'duo', [
  s(3, 3, 65, 70, { rotation: -2, ...OB }),
  s(32, 28, 65, 70, { rotation: 3, ...OB }),
]);

/* ── 05: CASCADE TRIO (3) ───────────────────────────────────
   Three photos cascading down-right with visible borders */
const T05 = t('t05', 'Cascade Trio', 'collage', [
  s(3, 3, 55, 38, { ...OB }),
  s(30, 32, 55, 38, { ...OB }),
  s(8, 60, 55, 38, { ...OB }),
]);

/* ── 06: HERO + 2 ACCENT (3) ────────────────────────────────
   One large hero + two small overlapping accents */
const T06 = t('t06', 'Hero + Accents', 'hero', [
  s(3, 3, 94, 60),
  s(55, 55, 40, 30, { ...OB }),
  s(3, 68, 35, 28, { ...OB }),
]);

/* ── 07: CIRCLE HERO (3) ────────────────────────────────────
   Large centered circle + two side rectangles */
const T07 = t('t07', 'Circle Hero', 'special', [
  s(15, 5, 70, 70, { shape: 'circle' }),
  s(3, 78, 45, 20),
  s(52, 78, 45, 20),
]);

/* ── 08: HEART FRAME (3) ────────────────────────────────────
   Heart-shaped center photo + two side portraits */
const T08 = t('t08', 'Heart Frame', 'special', [
  s(20, 8, 60, 55, { shape: 'heart', ...OB }),
  s(3, 68, 45, 28),
  s(52, 68, 45, 28),
]);

/* ── 09: STAR BURST (5) ─────────────────────────────────────
   Central star + 4 tiny corner accents */
const T09 = t('t09', 'Star Burst', 'special', [
  s(25, 20, 50, 50, { shape: 'star', ...OB }),
  s(3, 3, 18, 18),
  s(79, 3, 18, 18),
  s(3, 79, 18, 18),
  s(79, 79, 18, 18),
]);

/* ── 10: EDITORIAL SPLIT (2) ────────────────────────────────
   Tall + short editorial columns */
const T10 = t('t10', 'Editorial Split', 'duo', [
  s(3, 3, 46, 94),
  s(51, 3, 46, 94),
]);

/* ── 11: SCRAPBOOK CLUSTER (4) ──────────────────────────────
   4 photos clustered with slight rotations & borders */
const T11 = t('t11', 'Scrapbook Cluster', 'collage', [
  s(3, 3, 48, 45, { rotation: -2, ...OB }),
  s(49, 5, 48, 45, { rotation: 3, ...OB }),
  s(5, 50, 48, 45, { rotation: 2, ...OB }),
  s(49, 50, 48, 45, { rotation: -3, ...OB }),
]);

/* ── 12: FILM STRIP (3) ─────────────────────────────────────
   3 horizontal panoramic slots with gaps */
const T12 = t('t12', 'Film Strip', 'strip', [
  s(3, 5, 94, 28),
  s(3, 36, 94, 28),
  s(3, 67, 94, 28),
]);

/* ── 13: ASYMMETRIC TRIO (3) ────────────────────────────────
   3 photos of different sizes — artistic magazine layout */
const T13 = t('t13', 'Asymmetric Trio', 'mixed', [
  s(3, 3, 55, 55, { ...OB }),
  s(60, 3, 37, 40, { ...OB }),
  s(60, 46, 37, 51, { ...OB }),
]);

/* ── 14: DIAMOND CENTER (3) ─────────────────────────────────
   Rotated square (diamond) center + 2 side rectangles */
const T14 = t('t14', 'Diamond Center', 'special', [
  s(25, 10, 50, 50, { rotation: 45, ...OB }),
  s(3, 65, 45, 30),
  s(52, 65, 45, 30),
]);

/* ── 15: DUO VERTICAL + CIRCLE (3) ──────────────────────────
   2 vertical photos + 1 circle accent overlapping */
const T15 = t('t15', 'Duo + Circle Accent', 'mixed', [
  s(3, 3, 46, 94),
  s(51, 3, 46, 94),
  s(35, 38, 30, 30, { shape: 'circle', ...OB }),
]);

/* ── 16: OVERLAPPING WIDE (2) ───────────────────────────────
   2 wide landscape photos with dramatic overlap */
const T16 = t('t16', 'Overlapping Wide', 'duo', [
  s(3, 10, 94, 38, { ...OB }),
  s(3, 48, 94, 38, { ...OB }),
]);

/* ── 17: CIRCLE CLUSTER (3) ─────────────────────────────────
   3 circles arranged in a triangle with slight overlap */
const T17 = t('t17', 'Circle Cluster', 'special', [
  s(25, 3, 50, 50, { shape: 'circle', ...OB }),
  s(3, 48, 50, 50, { shape: 'circle', ...OB }),
  s(47, 48, 50, 50, { shape: 'circle', ...OB }),
]);

/* ── 18: HEART DUO (3) ──────────────────────────────────────
   2 hearts side by side + 1 base rectangle */
const T18 = t('t18', 'Heart Duo', 'special', [
  s(5, 5, 44, 48, { shape: 'heart', ...OB }),
  s(51, 5, 44, 48, { shape: 'heart', ...OB }),
  s(15, 58, 70, 38),
]);

/* ── 19: CARD STACK (3) ─────────────────────────────────────
   3 photos stacked like a deck of cards with rotation */
const T19 = t('t19', 'Card Stack', 'collage', [
  s(10, 8, 80, 50, { rotation: -3, ...OB }),
  s(13, 18, 80, 50, { rotation: 1, ...OB }),
  s(7, 28, 80, 50, { rotation: 4, ...OB }),
]);

/* ── 20: MAGAZINE COVER (3) ─────────────────────────────────
   1 large + 2 small — asymmetric editorial layout */
const T20 = t('t20', 'Magazine Cover', 'hero', [
  s(3, 3, 62, 70, { ...OB }),
  s(67, 3, 30, 33),
  s(67, 40, 30, 33, { ...OB }),
]);

/* ═══════════════════════════════════════════════════════════
   ASSEMBLE
   ═══════════════════════════════════════════════════════════ */

export const PAGE_TEMPLATES: PageTemplate[] = [
  T01, T02, T03, T04, T05,
  T06, T07, T08, T09, T10,
  T11, T12, T13, T14, T15,
  T16, T17, T18, T19, T20,
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
  { id: 'hero', label: 'Hero' },
  { id: 'collage', label: 'Collage' },
  { id: 'strip', label: 'Strip' },
  { id: 'mixed', label: 'Mixed' },
  { id: 'special', label: 'Shapes' },
];

console.log(`[Megy Prints] Loaded ${TEMPLATE_COUNT} premium templates`);
