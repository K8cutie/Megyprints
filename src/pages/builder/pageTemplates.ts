import type { PageTemplate, TemplateSlot, TemplateMargin } from './types';

/** ═══════════════════════════════════════════════════════════
 *  22 PREMIUM TEMPLATES — Margin-aware, responsive layout system
 *
 *  Each template defines:
 *    • margin:  page margins as 0–1 proportions (photos NEVER enter margins)
 *    • slots:   proportions of the SAFE AREA (0–1, not 0–100 of canvas)
 *
 *  Render pipeline:
 *    safeArea = pageSize - margins
 *    slotPixels = safeAreaOrigin + slotProportion * safeAreaSize
 *
 *  This makes templates automatically responsive to ANY paper size
 *  and orientation without distortion or eaten margins.
 *  ═══════════════════════════════════════════════════════════ */

let slotCounter = 0;

/** Standard margin measured from PDF wireframes: ~4% on all sides */
const STD_MARGIN: TemplateMargin = { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 };

/** Generous margin for featured/specialty layouts */
const WIDE_MARGIN: TemplateMargin = { top: 0.06, bottom: 0.06, left: 0.06, right: 0.06 };

/** Cinematic margin: wide top/bottom for panoramic feel */
const CINE_MARGIN: TemplateMargin = { top: 0.12, bottom: 0.12, left: 0.04, right: 0.04 };

/** Gutter between slots (proportion of safe area) */
const G = 0.03;

/** Helper: create a slot with proportions of safe area (0–1). */
function s(
  x: number, y: number,
  w: number, h: number,
  opts: Partial<Omit<TemplateSlot, 'id' | 'x' | 'y' | 'width' | 'height'>> = {},
): TemplateSlot {
  slotCounter += 1;
  // Round to 4 decimal places to keep file clean
  return {
    id: `s${slotCounter}`,
    x: Math.round(x * 10000) / 10000,
    y: Math.round(y * 10000) / 10000,
    width: Math.round(w * 10000) / 10000,
    height: Math.round(h * 10000) / 10000,
    ...opts,
  };
}

/** Helper: create a template. */
function t(
  id: string, name: string, category: PageTemplate['category'],
  margin: TemplateMargin, orientation: PageTemplate['orientation'],
  slots: TemplateSlot[],
): PageTemplate {
  return { id, name, category, slotCount: slots.length, margin, orientation, slots };
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATES 01–22
   All slots are proportions of the SAFE AREA (0–1).
   ═══════════════════════════════════════════════════════════ */

/* ── 01: FULL PAGE (1) ────────────────────────────────────── */
const T01 = t('t01', 'Full Page', 'single', STD_MARGIN, 'landscape', [
  s(0, 0, 1, 1),
]);

/* ── 02: ROUNDED FULL PAGE (1) ────────────────────────────── */
const T02 = t('t02', 'Rounded Full', 'single', STD_MARGIN, 'landscape', [
  s(0, 0, 1, 1, { shape: 'rounded', borderRadius: 12 }),
]);

/* ── 03: CLASSIC DUO (2) ────────────────────────────────────
   Two equal columns */
const T03 = t('t03', 'Classic Duo', 'duo', STD_MARGIN, 'landscape', [
  s(0, 0, 0.485, 1),
  s(0.515, 0, 0.485, 1),
]);

/* ── 04: HERO LEFT + STACKED RIGHT (3) ──────────────────────
   Tall hero left + two stacked right */
const T04 = t('t04', 'Hero Left Stack', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, 0.48, 1),
  s(0.51, 0, 0.49, 0.485),
  s(0.51, 0.515, 0.49, 0.485),
]);

/* ── 05: TWO TALL + WIDE BOTTOM (3) ─────────────────────────
   Two tall columns + wide bottom spanning full width */
const T05 = t('t05', 'Tall Duo + Wide', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, 0.485, 0.58),
  s(0.515, 0, 0.485, 0.58),
  s(0, 0.61, 1, 0.39),
]);

/* ── 06: CENTERED FULL (1) ──────────────────────────────────
   Single photo with breathing room inside safe area */
const T06 = t('t06', 'Centered Full', 'single', WIDE_MARGIN, 'landscape', [
  s(0.04, 0.04, 0.92, 0.92),
]);

/* ── 07: THREE COLUMNS (3) ──────────────────────────────────
   Three equal vertical strips */
const w3 = (1 - G * 2) / 3; // 0.3133
const T07 = t('t07', 'Triple Column', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, w3, 1),
  s(w3 + G, 0, w3, 1),
  s(w3 * 2 + G * 2, 0, w3, 1),
]);

/* ── 08: 3x2 GRID TOP-HEAVY (5) ─────────────────────────────
   Three top + two bottom */
const w3g = (1 - G * 2) / 3; // 0.3133
const w2g = (1 - G) / 2;     // 0.485
const T08 = t('t08', 'Grid 3+2', 'quint', STD_MARGIN, 'landscape', [
  s(0, 0, w3g, 0.46),
  s(w3g + G, 0, w3g, 0.46),
  s(w3g * 2 + G * 2, 0, w3g, 0.46),
  s(0, 0.49, w2g, 0.51),
  s(w2g + G, 0.49, w2g, 0.51),
]);

/* ── 09: ASYMMETRIC L (4) ───────────────────────────────────
   Tall left + three stacked right */
const T09 = t('t09', 'Asymmetric L', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 0.48, 1),
  s(0.51, 0, 0.49, 0.3133),
  s(0.51, 0.3433, 0.49, 0.3133),
  s(0.51, 0.6867, 0.49, 0.3133),
]);

/* ── 10: 3x2 GRID FULL (6) ──────────────────────────────────
   Three top + three bottom */
const w3c = (1 - G * 2) / 3;  // 0.3133
const h2r = (1 - G) / 2;      // 0.485
const T10 = t('t10', 'Grid 3x2', 'sextet', STD_MARGIN, 'landscape', [
  s(0, 0, w3c, h2r),
  s(w3c + G, 0, w3c, h2r),
  s(w3c * 2 + G * 2, 0, w3c, h2r),
  s(0, h2r + G, w3c, h2r),
  s(w3c + G, h2r + G, w3c, h2r),
  s(w3c * 2 + G * 2, h2r + G, w3c, h2r),
]);

/* ── 11: MAGAZINE SPREAD (4) ─────────────────────────────────
   Tall left + wide top-right + two bottom-right */
const T11 = t('t11', 'Magazine Spread', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 0.35, 1),
  s(0.38, 0, 0.62, 0.46),
  s(0.38, 0.49, 0.295, 0.51),
  s(0.705, 0.49, 0.295, 0.51),
]);

/* ── 12: PORTRAIT DUO (2) ───────────────────────────────────
   Two equal columns, portrait-optimized */
const T12 = t('t12', 'Portrait Duo', 'duo', STD_MARGIN, 'portrait', [
  s(0, 0, 0.485, 1),
  s(0.515, 0, 0.485, 1),
]);

/* ── 13: L-SHAPE TRIO (3) ───────────────────────────────────
   Tall left + two stacked right (alternate) */
const T13 = t('t13', 'L-Shape Trio', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, 0.48, 1),
  s(0.51, 0, 0.49, 0.485),
  s(0.51, 0.515, 0.49, 0.485),
]);

/* ── 14: HERO TOP + DUO BOTTOM (3) ──────────────────────────
   Wide hero top + two equal bottom */
const T14 = t('t14', 'Hero Top Duo', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, 1, 0.46),
  s(0, 0.49, 0.485, 0.51),
  s(0.515, 0.49, 0.485, 0.51),
]);

/* ── 15: MAGAZINE TIGHT (4) ─────────────────────────────────
   Narrow tall left + wide top-right + two bottom-right */
const T15 = t('t15', 'Magazine Tight', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 0.30, 1),
  s(0.33, 0, 0.67, 0.46),
  s(0.33, 0.49, 0.32, 0.51),
  s(0.68, 0.49, 0.32, 0.51),
]);

/* ── 16: THREE STRIPS (3) ───────────────────────────────────
   Three equal vertical columns */
const w3s = (1 - G * 2) / 3; // 0.3133
const T16 = t('t16', 'Triple Strip', 'trio', STD_MARGIN, 'landscape', [
  s(0, 0, w3s, 1),
  s(w3s + G, 0, w3s, 1),
  s(w3s * 2 + G * 2, 0, w3s, 1),
]);

/* ── 17: HERO TOP + TRIO BOTTOM (4) ─────────────────────────
   Wide hero top + three equal bottom */
const w3b = (1 - G * 2) / 3; // 0.3133
const T17 = t('t17', 'Hero Top Trio', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 1, 0.46),
  s(0, 0.49, w3b, 0.51),
  s(w3b + G, 0.49, w3b, 0.51),
  s(w3b * 2 + G * 2, 0.49, w3b, 0.51),
]);

/* ── 18: TRIO TOP + HERO BOTTOM (4) ─────────────────────────
   Three equal top + wide hero bottom */
const w3t = (1 - G * 2) / 3; // 0.3133
const T18 = t('t18', 'Trio Top Hero', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, w3t, 0.46),
  s(w3t + G, 0, w3t, 0.46),
  s(w3t * 2 + G * 2, 0, w3t, 0.46),
  s(0, 0.49, 1, 0.51),
]);

/* ── 19: GRID 3+2 ALT (5) ───────────────────────────────────
   Three top + two bottom (wider gaps variant) */
const w3a = (1 - G * 2) / 3; // 0.3133
const w2a = (1 - G) / 2;     // 0.485
const T19 = t('t19', 'Grid Wide 3+2', 'quint', STD_MARGIN, 'landscape', [
  s(0, 0, w3a, 0.46),
  s(w3a + G, 0, w3a, 0.46),
  s(w3a * 2 + G * 2, 0, w3a, 0.46),
  s(0, 0.49, w2a, 0.51),
  s(w2a + G, 0.49, w2a, 0.51),
]);

/* ── 20: ASYMMETRIC L ALT (4) ───────────────────────────────
   Tall left (~38%) + three stacked on right */
const T20 = t('t20', 'Balanced L', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 0.38, 1),
  s(0.41, 0, 0.59, 0.3133),
  s(0.41, 0.3433, 0.59, 0.3133),
  s(0.41, 0.6867, 0.59, 0.3133),
]);

/* ── 21: MAGAZINE LANDSCAPE (4) ─────────────────────────────
   Narrow tall left + wide top-right + two bottom-right */
const T21 = t('t21', 'Magazine Wide', 'quad', STD_MARGIN, 'landscape', [
  s(0, 0, 0.28, 1),
  s(0.31, 0, 0.69, 0.46),
  s(0.31, 0.49, 0.33, 0.51),
  s(0.67, 0.49, 0.33, 0.51),
]);

/* ── 22: CINEMATIC WIDE (1) ─────────────────────────────────
   Ultra-wide panoramic photo centered vertically */
const T22 = t('t22', 'Cinematic Wide', 'single', CINE_MARGIN, 'landscape', [
  s(0, 0, 1, 1),
]);

/* ═══════════════════════════════════════════════════════════
   ASSEMBLE
   ═══════════════════════════════════════════════════════════ */

export const PAGE_TEMPLATES: PageTemplate[] = [
  T01, T02, T03, T04, T05,
  T06, T07, T08, T09, T10,
  T11, T12, T13, T14, T15,
  T16, T17, T18, T19, T20,
  T21, T22,
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
  { id: 'trio', label: 'Trio' },
  { id: 'quad', label: 'Quad' },
  { id: 'quint', label: 'Quint' },
  { id: 'sextet', label: 'Sextet' },
];

/** Adapt a template to the canvas orientation.
 *  When template orientation differs from canvas, rotates slots 90°
 *  and swaps margins accordingly. */
export function adaptTemplateToOrientation(
  template: PageTemplate,
  canvasW: number,
  canvasH: number,
): PageTemplate {
  const isLandscapeTemplate = template.orientation === 'landscape';
  const isLandscapeCanvas = canvasW > canvasH;
  const needsRotation = isLandscapeTemplate !== isLandscapeCanvas;

  if (!needsRotation) return template;

  // Rotate slots 90° clockwise: swap x↔y, w↔h
  const rotatedSlots = template.slots.map((slot) => ({
    ...slot,
    x: slot.y,
    y: slot.x,
    width: slot.height,
    height: slot.width,
  }));

  // Swap margins: left↔top, right↔bottom
  return {
    ...template,
    margin: {
      top: template.margin.left,
      bottom: template.margin.right,
      left: template.margin.top,
      right: template.margin.bottom,
    },
    slots: rotatedSlots,
  };
}

/** Compute pixel coordinates for all slots in a template.
 *  Two-phase pipeline: safe area from margins → slot proportions → pixels. */
export function computeSlotPixels(
  template: PageTemplate,
  canvasW: number,
  canvasH: number,
): Array<{ x: number; y: number; width: number; height: number }> {
  // Phase 1: compute safe area from template margins
  const safeX = canvasW * template.margin.left;
  const safeY = canvasH * template.margin.top;
  const safeW = canvasW * (1 - template.margin.left - template.margin.right);
  const safeH = canvasH * (1 - template.margin.top - template.margin.bottom);

  // Phase 2: map each slot (proportions of safe area) → pixels
  return template.slots.map((slot) => ({
    x: safeX + slot.x * safeW,
    y: safeY + slot.y * safeH,
    width: slot.width * safeW,
    height: slot.height * safeH,
  }));
}

console.log(`[Megy Prints] Loaded ${TEMPLATE_COUNT} margin-aware premium templates`);
