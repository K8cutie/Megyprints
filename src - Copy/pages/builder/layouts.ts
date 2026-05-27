import type { LayoutStyle, PhotoSlot, TemplateType } from './types';

export interface LayoutDefinition {
  style: LayoutStyle;
  name: string;
  description: string;
  slotCount: number;
  /** Generate slots given canvas dimensions and margin (px) */
  generateSlots: (canvasW: number, canvasH: number, margin: number) => Omit<PhotoSlot, 'id' | 'photoIndex'>[];
}

/* ───────── Helper: generate slot IDs ───────── */
const idSlots = (slots: Omit<PhotoSlot, 'id' | 'photoIndex'>[]): PhotoSlot[] =>
  slots.map((s, i) => ({ ...s, id: `slot-${i}`, photoIndex: null }));

/* ───────── Layout generators (pixel-perfect with margins & whitespace) ───────── */

const LAYOUTS: Record<LayoutStyle, LayoutDefinition> = {
  fullBleed: {
    style: 'fullBleed', name: 'Full Bleed', description: 'One photo fills the entire page edge-to-edge',
    slotCount: 1,
    generateSlots: (W, H) => [{ x: 0, y: 0, width: W, height: H }],
  },

  portraitSingle: {
    style: 'portraitSingle', name: 'Portrait Single', description: 'One large portrait with generous breathing room',
    slotCount: 1,
    generateSlots: (W, H, m) => {
      const contentW = W - m * 2;
      const contentH = H - m * 2;
      // Portrait 2:3 ratio, centered, only ~70% of content height
      const pw = contentW * 0.55;
      const ph = pw * (3 / 2); // portrait 2:3
      const x = m + (contentW - pw) / 2;
      const y = m + (contentH - ph) * 0.45; // slight top bias
      return [{ x, y, width: pw, height: ph }];
    },
  },

  duoPortrait: {
    style: 'duoPortrait', name: 'Duo Portrait', description: 'Two portraits side by side with a gap',
    slotCount: 2,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 16;
      // Each portrait 3:4 ratio, centered vertically
      const pw = (cw - gap) * 0.46;
      const ph = pw * (4 / 3);
      const y = m + (ch - ph) / 2;
      return [
        { x: m + (cw - pw * 2 - gap) / 2, y, width: pw, height: ph },
        { x: m + (cw - pw * 2 - gap) / 2 + pw + gap, y, width: pw, height: ph },
      ];
    },
  },

  duoLandscape: {
    style: 'duoLandscape', name: 'Duo Landscape', description: 'Two photos stacked with space around them',
    slotCount: 2,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 16;
      // Each landscape 4:3 ratio, centered horizontally
      const ph = (ch - gap) * 0.40;
      const pw = ph * (4 / 3);
      const x = m + (cw - pw) / 2;
      const topY = m + (ch - ph * 2 - gap) * 0.4;
      return [
        { x, y: topY, width: pw, height: ph },
        { x, y: topY + ph + gap, width: pw, height: ph },
      ];
    },
  },

  asymDuo: {
    style: 'asymDuo', name: 'Asymmetric Duo', description: 'Hero photo with a smaller companion',
    slotCount: 2,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 14;
      // Left: large portrait ~60% width
      const pw1 = cw * 0.58;
      const pw2 = cw - pw1 - gap;
      const ph1 = pw1 * 0.75; // 4:3-ish landscape
      const ph2 = pw2 * 1.2;  // portrait-ish
      const y1 = m + (ch - ph1) * 0.35;
      const y2 = m + (ch - ph2) * 0.55;
      return [
        { x: m, y: y1, width: pw1, height: ph1 },
        { x: m + pw1 + gap, y: y2, width: pw2, height: ph2 },
      ];
    },
  },

  fourGrid: {
    style: 'fourGrid', name: 'Four Grid', description: 'Clean 2×2 grid with consistent spacing',
    slotCount: 4,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 12;
      // Square-ish cells, but not filling entire area
      const cellW = (cw - gap) * 0.46;
      const cellH = cellW; // square
      const usedW = cellW * 2 + gap;
      const usedH = cellH * 2 + gap;
      const x0 = m + (cw - usedW) / 2;
      const y0 = m + (ch - usedH) * 0.45;
      return [
        { x: x0, y: y0, width: cellW, height: cellH },
        { x: x0 + cellW + gap, y: y0, width: cellW, height: cellH },
        { x: x0, y: y0 + cellH + gap, width: cellW, height: cellH },
        { x: x0 + cellW + gap, y: y0 + cellH + gap, width: cellW, height: cellH },
      ];
    },
  },

  heroSupporting: {
    style: 'heroSupporting', name: 'Hero + Supporting', description: 'One large photo with two smaller supporting photos',
    slotCount: 3,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 12;
      // Left: hero landscape 4:3
      const pw1 = cw * 0.55;
      const ph1 = pw1 * 0.72;
      // Right: two stacked portraits
      const pw2 = cw - pw1 - gap;
      const ph2 = (ph1 - gap) / 2;
      const y1 = m + (ch - ph1) / 2;
      const y2 = y1 + (ph1 - ph2 * 2 - gap) / 2;
      return [
        { x: m, y: y1, width: pw1, height: ph1 },
        { x: m + pw1 + gap, y: y2, width: pw2, height: ph2 },
        { x: m + pw1 + gap, y: y2 + ph2 + gap, width: pw2, height: ph2 },
      ];
    },
  },

  trio: {
    style: 'trio', name: 'Trio Row', description: 'Three equal photos in a horizontal row',
    slotCount: 3,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 14;
      // Each square-ish, not filling full width
      const pw = (cw - gap * 2) * 0.30;
      const ph = pw * 1.15; // slightly taller
      const usedW = pw * 3 + gap * 2;
      const x0 = m + (cw - usedW) / 2;
      const y = m + (ch - ph) / 2;
      return [
        { x: x0, y, width: pw, height: ph },
        { x: x0 + pw + gap, y, width: pw, height: ph },
        { x: x0 + pw * 2 + gap * 2, y, width: pw, height: ph },
      ];
    },
  },

  collage3: {
    style: 'collage3', name: 'Editorial Three', description: 'Magazine-style asymmetrical three photo arrangement',
    slotCount: 3,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 12;
      // Large landscape on left
      const pw1 = cw * 0.58;
      const ph1 = pw1 * 0.7;
      // Two stacked on right, offset vertically for visual interest
      const pw2 = cw - pw1 - gap;
      const ph2top = ph1 * 0.42;
      const ph2bot = ph1 * 0.52;
      const y1 = m + (ch - ph1) * 0.4;
      return [
        { x: m, y: y1, width: pw1, height: ph1 },
        { x: m + pw1 + gap, y: y1, width: pw2, height: ph2top },
        { x: m + pw1 + gap, y: y1 + ph2top + gap, width: pw2, height: ph2bot },
      ];
    },
  },

  collage: {
    style: 'collage', name: 'Mosaic Five', description: 'Dynamic 5-photo mosaic with varied sizes',
    slotCount: 5,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2, ch = H - m * 2;
      const gap = 10;
      // Left column: 2 stacked
      const pwL = cw * 0.30;
      const phLT = (ch - gap) * 0.42;
      const phLB = ch - phLT - gap;
      // Middle: 1 tall
      const pwM = cw * 0.35;
      const phM = ch;
      // Right column: 2 stacked
      const pwR = cw - pwL - pwM - gap * 2;
      const phRT = ch * 0.55;
      const phRB = ch - phRT - gap;
      return [
        { x: m, y: m, width: pwL, height: phLT },
        { x: m, y: m + phLT + gap, width: pwL, height: phLB },
        { x: m + pwL + gap, y: m, width: pwM, height: phM },
        { x: m + pwL + pwM + gap * 2, y: m, width: pwR, height: phRT },
        { x: m + pwL + pwM + gap * 2, y: m + phRT + gap, width: pwR, height: phRB },
      ];
    },
  },

  panorama: {
    style: 'panorama', name: 'Panorama', description: 'Wide panoramic photo with generous white space',
    slotCount: 1,
    generateSlots: (W, H, m) => {
      const cw = W - m * 2;
      const pw = cw * 0.78;
      const ph = pw * 0.42; // ~2.4:1 panoramic
      const x = m + (cw - pw) / 2;
      const y = m + (H - m * 2 - ph) * 0.42;
      return [{ x, y, width: pw, height: ph }];
    },
  },

  freeform: {
    style: 'freeform', name: 'Freeform', description: 'Place photos anywhere on the canvas',
    slotCount: 0,
    generateSlots: () => [],
  },
};

/* ───────── Exports ───────── */

export const ALL_LAYOUT_STYLES: LayoutStyle[] = Object.keys(LAYOUTS) as LayoutStyle[];
export const LAYOUT_DEFINITIONS = LAYOUTS;

export function getLayoutDefinition(style: LayoutStyle): LayoutDefinition {
  return LAYOUTS[style];
}

export function getLayoutSlots(style: LayoutStyle, canvasW: number, canvasH: number, margin = 30): PhotoSlot[] {
  const def = LAYOUTS[style];
  return idSlots(def.generateSlots(canvasW, canvasH, margin));
}

export function getLayoutName(style: LayoutStyle): string {
  return LAYOUTS[style].name;
}

/* ───────── Template layout preferences (varied, not same on every page) ───────── */

export const TEMPLATE_LAYOUT_PREFERENCES: Record<TemplateType, LayoutStyle[]> = {
  wedding: ['fullBleed', 'portraitSingle', 'duoPortrait', 'heroSupporting', 'panorama'],
  baby: ['portraitSingle', 'duoPortrait', 'fourGrid', 'collage3', 'trio'],
  birthday: ['collage3', 'fourGrid', 'trio', 'heroSupporting', 'fullBleed'],
  family: ['duoPortrait', 'portraitSingle', 'heroSupporting', 'asymDuo', 'collage3'],
  graduation: ['portraitSingle', 'duoPortrait', 'trio', 'heroSupporting', 'panorama'],
  travel: ['panorama', 'fullBleed', 'heroSupporting', 'duoLandscape', 'asymDuo'],
  minimalist: ['portraitSingle', 'duoPortrait', 'panorama', 'asymDuo'],
  kids: ['fourGrid', 'collage3', 'trio', 'duoPortrait', 'fullBleed'],
  vintage: ['portraitSingle', 'duoPortrait', 'portraitSingle', 'asymDuo', 'panorama'],
  classic: ['fullBleed', 'portraitSingle', 'heroSupporting', 'duoPortrait', 'panorama'],
};

export const TEMPLATE_SURPRISE_LAYOUTS: Record<TemplateType, LayoutStyle[]> = {
  wedding: ['collage3', 'panorama', 'asymDuo', 'duoLandscape'],
  baby: ['fullBleed', 'heroSupporting', 'portraitSingle', 'panorama'],
  birthday: ['collage', 'duoLandscape', 'panorama', 'portraitSingle'],
  family: ['collage', 'duoLandscape', 'panorama', 'trio'],
  graduation: ['heroSupporting', 'collage3', 'asymDuo', 'fourGrid'],
  travel: ['collage3', 'portraitSingle', 'collage', 'asymDuo'],
  minimalist: ['duoLandscape', 'heroSupporting', 'fullBleed'],
  kids: ['collage', 'heroSupporting', 'panorama', 'portraitSingle'],
  vintage: ['collage3', 'heroSupporting', 'duoLandscape', 'panorama'],
  classic: ['collage3', 'panorama', 'asymDuo', 'collage'],
};

/* ───────── Canvas dimension helper ───────── */

import { ALBUM_SIZES } from './types';
import type { AlbumSizePreset } from './types';

export function getCanvasDimensions(size: AlbumSizePreset): { width: number; height: number } {
  const config = ALBUM_SIZES.find((s) => s.preset === size);
  if (config) {
    const maxDim = 750;
    const scale = maxDim / Math.max(config.width, config.height);
    return {
      width: Math.round(config.width * scale),
      height: Math.round(config.height * scale),
    };
  }
  return { width: 600, height: 750 };
}

export function getCanvasMargin(canvasW: number, canvasH: number): number {
  return Math.max(24, Math.min(40, Math.round(Math.min(canvasW, canvasH) * 0.05)));
}
