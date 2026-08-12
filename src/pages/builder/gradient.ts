/** ──────────────────────────────────────────────────────────────────────────
 * Gradient backgrounds — ONE resolver for ALL THREE renderers (BuilderPreview
 * DOM, useCanvasEngine Fabric, printPipeline canvas). Saved albums carry two
 * historical gradient shapes; every renderer must normalize through here so
 * the same album paints the same wash on screen, in the editor and on paper.
 *
 * Canonical geometry = CSS `linear-gradient(<angle>deg, …)`:
 *   0° points up, angles run clockwise, 135° sweeps toward bottom-right.
 *   Radial = a centered circle reaching the farthest corner (the CSS default).
 * ────────────────────────────────────────────────────────────────────────── */

export interface GradientStop { offset: number; color: string }

export interface NormalizedGradient {
  type: 'linear' | 'radial';
  /** CSS convention, degrees. Ignored for radial. */
  angle: number;
  stops: GradientStop[];
}

/** Legacy sidebar `direction` keywords → CSS angle (deg). */
const DIRECTION_ANGLE: Record<string, number> = {
  'to top': 0,
  'to top right': 45,
  'to right': 90,
  'to bottom right': 135,
  'to bottom': 180,
  'to bottom left': 225,
  'to left': 270,
  'to top left': 315,
};

const clamp01 = (n: unknown) => Math.max(0, Math.min(1, Number(n) || 0));

/** Accepts BOTH stored formats and returns one normalized shape (or null):
 *    Wizard:  { type: 'linear'|'radial', angle, stops: [{ offset, color }] }
 *    Sidebar: { colors: [{ color, position }], direction: 'radial'|'to bottom'|… }
 *  The sidebar format used to CRASH the Fabric and print renderers (`stops`
 *  was read unguarded) — normalizing here is what lets old drafts print. */
export function normalizeGradient(raw: any): NormalizedGradient | null {
  if (!raw) return null;
  if (Array.isArray(raw.stops) && raw.stops.length) {
    return {
      type: raw.type === 'radial' ? 'radial' : 'linear',
      angle: typeof raw.angle === 'number' ? raw.angle : 135,
      stops: raw.stops.map((s: any) => ({ offset: clamp01(s?.offset), color: String(s?.color ?? '#FFFBF7') })),
    };
  }
  if (Array.isArray(raw.colors) && raw.colors.length) {
    return {
      type: raw.direction === 'radial' ? 'radial' : 'linear',
      angle: DIRECTION_ANGLE[raw.direction] ?? 180,
      stops: raw.colors.map((c: any) => ({ offset: clamp01((c?.position ?? 0) / 100), color: String(c?.color ?? '#FFFBF7') })),
    };
  }
  return null;
}

/** CSS string for the DOM renderer. */
export function gradientToCss(g: NormalizedGradient): string {
  const stops = g.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ');
  return g.type === 'radial'
    ? `radial-gradient(circle, ${stops})`
    : `linear-gradient(${g.angle}deg, ${stops})`;
}

/** Endpoints of the CSS gradient line for a W×H box (absolute px, y-down).
 *  CSS: the line passes through the center with direction (sin θ, −cos θ) and
 *  half-length (|W·sin θ| + |H·cos θ|) / 2, so the first/last stops land on the
 *  box corners. Fabric and print both build from these exact endpoints — this
 *  is what stops a 135° wash sweeping bottom-right on screen and bottom-left
 *  on paper. */
export function linearGradientEndpoints(angleDeg: number, W: number, H: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(W * dx) + Math.abs(H * dy)) / 2;
  const cx = W / 2;
  const cy = H / 2;
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

/** Centered farthest-corner circle (the CSS radial default). */
export function radialGradientGeom(W: number, H: number) {
  return { cx: W / 2, cy: H / 2, r: Math.hypot(W / 2, H / 2) };
}
