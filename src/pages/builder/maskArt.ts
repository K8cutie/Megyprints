import type { ArtMask } from './maskShapes';
import type { AlbumSizePreset } from './types';
import { wordsSafeArea } from './freeWords';
import { getCanvasDimensions } from './layouts';
import { getPrintDimensions } from './printSize';

/* ══════════════════════════════════════════════════════════════════════════
   THE MASKS THAT PAINT (owner, 2026-11-08: a film strip, "lots of other
   masks", then all 20 from the numbered sheet). Each one is ONE description,
   in the frame's own units, that every renderer draws as it is:
     • photo  — the box the photo is cover-fitted to (zoom and pan work in it).
                A window (film, instant photo, slide, tape, old print) fits
                the photo to the window, so the paint never hides a face;
     • clip   — where the photo shows (SVG path data);
     • under  — painted before the photo (a white card and its shadow);
     • inside — painted over the photo, inside the clip (window bars, a tear
                line, dark corners, a balloon's shine);
     • over   — painted over everything (the film, tape, stitches, a ring).
   Paths are SVG path data: Path2D on the website (print, the desktop
   editor's bake), Skia's MakeFromSVGString in the app, <path d> in the DOM
   preview, fabric.Path in the desktop editor. Every size is a fraction of
   the frame (its shorter side, `u`), so a big frame and a small one, on
   screen or at 300 DPI, look the same.

   Even patterns (film holes, scallops of the old print) are counted in
   whole numbers per side from the frame's real size, so they never stretch
   out of round on a wide frame (maskShapes EDGE_PATTERN says the same).

   A full-page photo (a full-bleed layout) keeps its mask inside the safe
   print area, the dotted line words stop at (freeWords.wordsSafeArea): holes,
   notches and edges never land where the page is trimmed. Every other layout
   already keeps its frames inside the margins.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ArtBox { x: number; y: number; w: number; h: number }
export interface ArtShadow { color: string; blur: number; dy: number }
export interface ArtStop { offset: number; color: string }
export type ArtPaint =
  | { kind: 'fill'; d: string; color: string; evenOdd?: boolean; shadow?: ArtShadow }
  | { kind: 'stroke'; d: string; color: string; width: number; dash?: [number, number]; round?: boolean; shadow?: ArtShadow }
  /** `d` filled with a circular gradient around (cx, cy) out to `r`. */
  | { kind: 'radial'; d: string; cx: number; cy: number; r: number; stops: ArtStop[] };
export interface MaskArt {
  photo: ArtBox;
  clip: string;
  under: ArtPaint[];
  inside: ArtPaint[];
  over: ArtPaint[];
}

/** Where a page's renderer is drawing: to keep a full-page photo's mask in
 *  the safe area. `kx`, `ky`: the renderer's px per design px; `ox`, `oy`:
 *  where the page's corner is in its px. */
export interface ArtPage {
  albumSize: AlbumSizePreset;
  pageIndex: number;
  coverMode: boolean;
  fullBleed: boolean;
  kx: number;
  ky: number;
  ox?: number;
  oy?: number;
}

/** A box to draw a mask in, and (`ref`) the same box's size in PRINT px.
 *  Whole-number choices (how many film holes, which way the film runs) are
 *  made from `ref`, so every renderer makes the same ones: each renderer's
 *  own px come from a rounded page size (the editor's canvas, the preview's
 *  width), and a count of 10.4996 in one is 10.5185 in another. */
export type ArtFrame = ArtBox & { ref?: { w: number; h: number } };

/** The box a mask is drawn in: the frame, inside the safe print area on a
 *  full-page layout, with its size in print px (`ref`). */
export function artBox(box: ArtBox, page: ArtPage): ArtFrame {
  const { width: W, height: H } = getPrintDimensions(page.albumSize);
  const { width: uiW, height: uiH } = getCanvasDimensions(page.albumSize);
  const withRef = (b: ArtBox): ArtFrame => ({ ...b, ref: { w: (b.w * W) / uiW / page.kx, h: (b.h * H) / uiH / page.ky } });
  if (!page.fullBleed) return withRef(box);
  const a = wordsSafeArea(page.albumSize, page.pageIndex, page.coverMode);
  const ox = page.ox ?? 0, oy = page.oy ?? 0;
  const x0 = Math.max(box.x, ox + a.x * page.kx), y0 = Math.max(box.y, oy + a.y * page.ky);
  const x1 = Math.min(box.x + box.w, ox + (a.x + a.w) * page.kx), y1 = Math.min(box.y + box.h, oy + (a.y + a.h) * page.ky);
  return withRef(x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : box);
}

/* ── Path data ───────────────────────────────────────────────────────────── */
type Pt = [number, number];
type Size = { w: number; h: number };
/** 3-decimal coordinates, as maskShapes writes them. */
const n = (v: number) => String(Math.round(v * 1000) / 1000);
const p = (x: number, y: number) => `${n(x)} ${n(y)}`;
const polyD = (pts: Pt[]) => 'M ' + pts.map(([x, y]) => p(x, y)).join(' L ') + ' Z';
const rectD = (b: ArtBox) => polyD([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]);
/** A rounded rectangle, clockwise, its corners quadratic curves. */
function rrD(b: ArtBox, r: number): string {
  const { x, y, w, h } = b;
  r = Math.min(r, w / 2, h / 2);
  return `M ${p(x + r, y)} L ${p(x + w - r, y)} Q ${p(x + w, y)} ${p(x + w, y + r)} L ${p(x + w, y + h - r)} Q ${p(x + w, y + h)} ${p(x + w - r, y + h)}`
    + ` L ${p(x + r, y + h)} Q ${p(x, y + h)} ${p(x, y + h - r)} L ${p(x, y + r)} Q ${p(x, y)} ${p(x + r, y)} Z`;
}
/** An ellipse turned `rot` radians, clockwise, as two half arcs. */
function ellipseD(cx: number, cy: number, rx: number, ry: number, rot = 0): string {
  const c = Math.cos(rot), s = Math.sin(rot), deg = n((rot * 180) / Math.PI);
  const a = p(cx + rx * c, cy + rx * s), b = p(cx - rx * c, cy - rx * s);
  return `M ${a} A ${n(rx)} ${n(ry)} ${deg} 1 1 ${b} A ${n(rx)} ${n(ry)} ${deg} 1 1 ${a} Z`;
}
const inset = (b: ArtBox, d: number): ArtBox => ({ x: b.x + d, y: b.y + d, w: b.w - 2 * d, h: b.h - 2 * d });
/** The biggest box of `aspect` (w / h) centred in `b`. */
function fitted(b: ArtBox, aspect: number): ArtBox {
  const w = Math.min(b.w, b.h * aspect), h = w / aspect;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
}

/* ── The colours ─────────────────────────────────────────────────────────── */
const FILM_BLACK = '#141414';
const CORNER_BLACK = '#1C1C1C';
const WHITE = '#FFFFFF';
const CARD_WHITE = '#FFFFFF';
const OLD_PAPER = '#FFFDF8';
const SLIDE_CREAM = '#EFE9DD';
const TAPE = 'rgba(238,228,198,0.8)';
const GOLD = '#B48A35';
const GOLD_LIGHT = '#E8CF87';
const STRING_GREY = '#8A8A8A';
/** A white card's shadow, so it shows on a white page. */
const cardShadow = (u: number): ArtShadow => ({ color: 'rgba(0,0,0,0.22)', blur: 0.035 * u, dy: 0.01 * u });
/** White lines over a photo keep a thin dark edge, so they read on a bright one. */
const lineShadow = (u: number): ArtShadow => ({ color: 'rgba(0,0,0,0.4)', blur: 0.008 * u, dy: 0.003 * u });

const art = (photo: ArtBox, clip: string, more: Partial<Omit<MaskArt, 'photo' | 'clip'>> = {}): MaskArt =>
  ({ photo, clip, under: more.under ?? [], inside: more.inside ?? [], over: more.over ?? [] });

/* ── 1. Film strip: 35 mm film (measured: the band is 5.5 of its 35 mm, a
   hole 2.79 mm across and 1.98 mm along, holes 4.75 mm apart). The film runs
   along the frame's LONGER side, so one mask turns itself. ────────────────── */
export const FILM = { band: 0.157, holeAcross: 0.08, holeAlong: 0.0566, pitch: 0.136, end: 0.045 };
function film(b: ArtBox, r: Size): MaskArt {
  const across = r.w >= r.h;
  const L = across ? b.w : b.h, S = across ? b.h : b.w;
  const band = FILM.band * S, holeA = FILM.holeAcross * S, holeL = FILM.holeAlong * S, end = FILM.end * S;
  const count = Math.max(3, Math.round((across ? r.w : r.h) / (FILM.pitch * (across ? r.h : r.w)))), step = L / count;
  const at = (a: number, c: number, la: number, lc: number): ArtBox =>
    (across ? { x: b.x + a, y: b.y + c, w: la, h: lc } : { x: b.x + c, y: b.y + a, w: lc, h: la });
  const win = at(end, band, L - 2 * end, S - 2 * band);
  const winD = rrD(win, 0.012 * S);
  let d = `${rectD(b)} ${winD}`;
  for (let k = 0; k < count; k++) {
    const a = (k + 0.5) * step - holeL / 2;
    for (const c of [(band - holeA) / 2, S - band + (band - holeA) / 2]) d += ` ${rrD(at(a, c, holeL, holeA), holeL * 0.22)}`;
  }
  return art(win, winD, { over: [{ kind: 'fill', d, color: FILM_BLACK, evenOdd: true }] });
}

/* ── 2. Instant photo: a white card, wider at the bottom. ────────────────── */
function instant(b: ArtBox, u: number): MaskArt {
  const m = 0.065 * u;
  const win = { x: b.x + m, y: b.y + m, w: b.w - 2 * m, h: b.h - m - 0.2 * b.h };
  return art(win, rectD(win), { under: [{ kind: 'fill', d: rectD(b), color: CARD_WHITE, shadow: cardShadow(u) }] });
}

/* ── 3. Photo slide: a cream mount with a rounded window (wide or tall,
   with the frame). ─────────────────────────────────────────────────────── */
function slide(b: ArtBox, u: number, r: Size): MaskArt {
  const wide = r.w >= r.h;
  const ix = (wide ? 0.1 : 0.22) * b.w, iy = (wide ? 0.22 : 0.1) * b.h;
  const win = { x: b.x + ix, y: b.y + iy, w: b.w - 2 * ix, h: b.h - 2 * iy };
  const winD = rrD(win, 0.05 * u);
  return art(win, winD, { under: [{ kind: 'fill', d: rrD(b, 0.04 * u), color: SLIDE_CREAM, shadow: cardShadow(u) }] });
}

/* ── 4. Photo corners: four black paper corners, like an old album. ─────── */
function photoCorners(b: ArtBox, u: number): MaskArt {
  const L = 0.2 * u, lw = 0.006 * u, { x, y, w, h } = b;
  const tris: Pt[][] = [
    [[x, y], [x + L, y], [x, y + L]],
    [[x + w, y], [x + w, y + L], [x + w - L, y]],
    [[x + w, y + h], [x + w - L, y + h], [x + w, y + h - L]],
    [[x, y + h], [x, y + h - L], [x + L, y + h]],
  ];
  // the light edge along each long side, its ends pulled in by its width so
  // its square ends stay inside the frame
  const t = lw / (L * Math.SQRT2);
  const edges = tris.map(([, a, c]) =>
    `M ${p(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t)} L ${p(c[0] + (a[0] - c[0]) * t, c[1] + (a[1] - c[1]) * t)}`).join(' ');
  return art(b, rectD(b), {
    over: [
      { kind: 'fill', d: tris.map(polyD).join(' '), color: CORNER_BLACK },
      { kind: 'stroke', d: edges, color: 'rgba(255,255,255,0.22)', width: lw },
    ],
  });
}

/* ── 5. Taped on: the photo held by two pieces of tape across its top
   corners. The photo sits in from the frame so the tape's ends stay inside
   the frame (sized so they do: see the spec). ─────────────────────────────── */
export const TAPE_SIZE = { margin: 0.1, half: 0.1, width: 0.08, into: 0.01, teeth: 5, zig: 0.012 };
function taped(b: ArtBox, u: number): MaskArt {
  const T = TAPE_SIZE;
  const ph = inset(b, T.margin * u);
  const a = T.half * u, tw = T.width * u, zig = T.zig * u;
  const piece = (cx: number, cy: number, ang: number): string => {
    // the tape's outline along its own axis, zigzag ends, then turned and placed
    const pts: Pt[] = [[-a, -tw / 2], [a, -tw / 2]];
    for (let i = 1; i <= T.teeth; i++) pts.push([a + (i % 2 ? zig : 0), -tw / 2 + (tw * i) / T.teeth]);
    pts.push([-a, tw / 2]);
    for (let i = T.teeth - 1; i >= 0; i--) pts.push([-a - (i % 2 ? zig : 0), -tw / 2 + (tw * i) / T.teeth]);
    const c = Math.cos(ang), s = Math.sin(ang);
    return polyD(pts.map(([px, py]) => [cx + px * c - py * s, cy + px * s + py * c]));
  };
  const into = T.into * u;
  const d = `${piece(ph.x + into, ph.y + into, -Math.PI / 4)} ${piece(ph.x + ph.w - into, ph.y + into, Math.PI / 4)}`;
  return art(ph, rectD(ph), { over: [{ kind: 'fill', d, color: TAPE }] });
}

/* ── 6. Old print: a white border with a wavy edge. ──────────────────────── */
function oldPrint(b: ArtBox, u: number, r: Size): MaskArt {
  const amp = 0.012 * u, STEPS = 8, waves = (len: number) => Math.max(2, Math.round(len / (0.035 * Math.min(r.w, r.h))));
  const sides = [
    { sx: b.x, sy: b.y, dx: 1, dy: 0, nx: 0, ny: 1, len: b.w, waves: waves(r.w) },
    { sx: b.x + b.w, sy: b.y, dx: 0, dy: 1, nx: -1, ny: 0, len: b.h, waves: waves(r.h) },
    { sx: b.x + b.w, sy: b.y + b.h, dx: -1, dy: 0, nx: 0, ny: -1, len: b.w, waves: waves(r.w) },
    { sx: b.x, sy: b.y + b.h, dx: 0, dy: -1, nx: 1, ny: 0, len: b.h, waves: waves(r.h) },
  ];
  const pts: Pt[] = [];
  for (const s of sides) {
    const count = STEPS * s.waves;
    for (let k = 0; k < count; k++) {
      const a = (s.len * k) / count, dIn = (amp * (1 - Math.cos((2 * Math.PI * k) / STEPS))) / 2;
      pts.push([s.sx + s.dx * a + s.nx * dIn, s.sy + s.dy * a + s.ny * dIn]);
    }
  }
  const ph = inset(b, 0.09 * u);
  return art(ph, rectD(ph), { under: [{ kind: 'fill', d: polyD(pts), color: OLD_PAPER, shadow: cardShadow(u) }] });
}

/* ── 7. Stitched: white stitches just inside the edge. ───────────────────── */
function stitched(b: ArtBox, u: number): MaskArt {
  return art(b, rectD(b), {
    over: [{ kind: 'stroke', d: rrD(inset(b, 0.055 * u), 0.03 * u), color: WHITE, width: 0.011 * u, dash: [0.04 * u, 0.025 * u], round: true, shadow: lineShadow(u) }],
  });
}

/* ── 8. Gold oval: an oval photo in a thin gold ring (prints as gold-brown
   ink: not foil). ──────────────────────────────────────────────────────── */
function goldOval(b: ArtBox, u: number): MaskArt {
  const i = 0.03 * u;
  const d = ellipseD(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 - i, b.h / 2 - i);
  return art(b, d, {
    over: [
      { kind: 'stroke', d, color: GOLD, width: 0.045 * u },
      { kind: 'stroke', d, color: GOLD_LIGHT, width: 0.012 * u },
    ],
  });
}

/* ── 9. Inside line: a thin white line inside the edge. ─────────────────── */
function insideLine(b: ArtBox, u: number): MaskArt {
  return art(b, rectD(b), { over: [{ kind: 'stroke', d: rectD(inset(b, 0.06 * u)), color: WHITE, width: 0.008 * u }] });
}

/* ── 10. Dark corners: the photo fades to dark at its corners. ──────────── */
function darkCorners(b: ArtBox): MaskArt {
  const d = rectD(b);
  return art(b, d, {
    inside: [{
      kind: 'radial', d, cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: Math.hypot(b.w, b.h) / 2,
      stops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 0.55, color: 'rgba(0,0,0,0)' }, { offset: 1, color: 'rgba(0,0,0,0.65)' }],
    }],
  });
}

/* ── 11. Ticket: rounded corners, two half-round notches and a dashed tear
   line across the frame's longer side. ──────────────────────────────────── */
function ticketStub(b: ArtBox, u: number, ref: Size): MaskArt {
  const { x, y, w, h } = b, r = 0.05 * u, nr = 0.08 * u, gap = 0.035 * u;
  const across = ref.w >= ref.h;
  const cut = (across ? w : h) * 0.73;
  let d: string, line: string;
  // the notches bite INTO the ticket: clockwise walk, sweep 0
  if (across) {
    const nx = x + cut;
    d = `M ${p(x + r, y)} L ${p(nx - nr, y)} A ${n(nr)} ${n(nr)} 0 0 0 ${p(nx + nr, y)} L ${p(x + w - r, y)} Q ${p(x + w, y)} ${p(x + w, y + r)}`
      + ` L ${p(x + w, y + h - r)} Q ${p(x + w, y + h)} ${p(x + w - r, y + h)} L ${p(nx + nr, y + h)} A ${n(nr)} ${n(nr)} 0 0 0 ${p(nx - nr, y + h)}`
      + ` L ${p(x + r, y + h)} Q ${p(x, y + h)} ${p(x, y + h - r)} L ${p(x, y + r)} Q ${p(x, y)} ${p(x + r, y)} Z`;
    line = `M ${p(nx, y + nr + gap)} L ${p(nx, y + h - nr - gap)}`;
  } else {
    const ny = y + cut;
    d = `M ${p(x + r, y)} L ${p(x + w - r, y)} Q ${p(x + w, y)} ${p(x + w, y + r)} L ${p(x + w, ny - nr)} A ${n(nr)} ${n(nr)} 0 0 0 ${p(x + w, ny + nr)}`
      + ` L ${p(x + w, y + h - r)} Q ${p(x + w, y + h)} ${p(x + w - r, y + h)} L ${p(x + r, y + h)} Q ${p(x, y + h)} ${p(x, y + h - r)}`
      + ` L ${p(x, ny + nr)} A ${n(nr)} ${n(nr)} 0 0 0 ${p(x, ny - nr)} L ${p(x, y + r)} Q ${p(x, y)} ${p(x + r, y)} Z`;
    line = `M ${p(x + nr + gap, ny)} L ${p(x + w - nr - gap, ny)}`;
  }
  return art(b, d, {
    inside: [{ kind: 'stroke', d: line, color: WHITE, width: 0.013 * u, dash: [0.033 * u, 0.03 * u], shadow: lineShadow(u) }],
  });
}

/* ── 12. Speech bubble: a rounded box with a tail at the bottom left. ───── */
function bubble(b: ArtBox): MaskArt {
  const { x, y, w, h } = b;
  const body = { x, y, w, h: 0.8 * h };
  const tail = polyD([[x + 0.2 * w, y + 0.78 * h], [x + 0.42 * w, y + 0.78 * h], [x + 0.1 * w, y + h]]);
  return art(b, `${rrD(body, 0.12 * Math.min(w, body.h))} ${tail}`);
}

/* ── 13–15, 17, 19: shapes drawn in the square in the middle of the frame,
   the photo fitted to that square. ─────────────────────────────────────── */
function flower(sq: ArtBox): MaskArt {
  const R = sq.w / 2, cx = sq.x + R, cy = sq.y + R;
  let d = ellipseD(cx, cy, 0.55 * R, 0.55 * R);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    d += ` ${ellipseD(cx + 0.61 * R * Math.cos(a), cy + 0.61 * R * Math.sin(a), 0.38 * R, 0.38 * R)}`;
  }
  return art(sq, d);
}
function badge(sq: ArtBox): MaskArt {
  const R = sq.w / 2, cx = sq.x + R, cy = sq.y + R, POINTS = 28;
  const pts: Pt[] = [];
  for (let i = 0; i < POINTS * 2; i++) {
    const r = i % 2 ? 0.87 * R : R, a = (i * Math.PI) / POINTS - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return art(sq, polyD(pts));
}
/** Knobs out on the top and right, holes in on the bottom and left. */
function puzzle(sq: ArtBox): MaskArt {
  const s = sq.w / 1.21, x = sq.x, y = sq.y + 0.21 * s, kr = n(Math.hypot(0.1, 0.08) * s);
  const A = (sweep: 0 | 1, to: string) => `A ${kr} ${kr} 0 1 ${sweep} ${to}`;
  const d = `M ${p(x, y)} L ${p(x + 0.4 * s, y)} ${A(1, p(x + 0.6 * s, y))} L ${p(x + s, y)}`
    + ` L ${p(x + s, y + 0.4 * s)} ${A(1, p(x + s, y + 0.6 * s))} L ${p(x + s, y + s)}`
    + ` L ${p(x + 0.6 * s, y + s)} ${A(0, p(x + 0.4 * s, y + s))} L ${p(x, y + s)}`
    + ` L ${p(x, y + 0.6 * s)} ${A(0, p(x, y + 0.4 * s))} Z`;
  return art(sq, d);
}
function pebble(sq: ArtBox): MaskArt {
  const R = sq.w / 2, cx = sq.x + R, cy = sq.y + R, RS = [0.95, 0.8, 0.98, 0.84, 0.93, 0.78];
  const pts: Pt[] = RS.map((r, i) => { const a = (i * Math.PI) / 3 - Math.PI / 2; return [cx + r * R * Math.cos(a), cy + r * R * Math.sin(a)]; });
  // a smooth closed curve through the six points (Catmull-Rom as cubics)
  let d = `M ${p(...pts[0])}`;
  const N = pts.length;
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    d += ` C ${p(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${p(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${p(...p2)}`;
  }
  return art(sq, d + ' Z');
}
function paw(sq: ArtBox): MaskArt {
  const u = sq.w, E = (cx: number, cy: number, rx: number, ry: number, rot = 0) => ellipseD(sq.x + cx * u, sq.y + cy * u, rx * u, ry * u, rot);
  return art(sq, [E(0.5, 0.68, 0.3, 0.27), E(0.13, 0.4, 0.1, 0.13, -0.35), E(0.35, 0.18, 0.11, 0.14, -0.12), E(0.65, 0.18, 0.11, 0.14, 0.12), E(0.87, 0.4, 0.1, 0.13, 0.35)].join(' '));
}

/* ── 16. Window: an arch with white bars and a white frame inside. ──────── */
function windowArch(b: ArtBox): MaskArt {
  const { x, y, w, h } = b, ry = Math.min(w / 2, h * 0.6), bar = 0.028 * w;
  const d = `M ${p(x, y + h)} L ${p(x, y + ry)} A ${n(w / 2)} ${n(ry)} 0 0 1 ${p(x + w, y + ry)} L ${p(x + w, y + h)} Z`;
  const bars = `${rectD({ x: x + w / 2 - bar / 2, y, w: bar, h })} ${rectD({ x, y: y + 0.56 * h - bar / 2, w, h: bar })}`;
  return art(b, d, {
    inside: [
      { kind: 'fill', d: bars, color: WHITE, shadow: { color: 'rgba(0,0,0,0.35)', blur: 0.012 * w, dy: 0 } },
      // centred on the clip's edge: the clip keeps its inner half
      { kind: 'stroke', d, color: WHITE, width: 0.08 * w },
    ],
  });
}

/* ── 18. Balloon: a balloon on a string, in a tall box. ─────────────────── */
function balloon(b: ArtBox): MaskArt {
  const bb = fitted(b, 0.704);
  const cx = bb.x + bb.w / 2, ecy = bb.y + 0.38 * bb.h, rx = 0.47 * bb.w, ry = 0.38 * bb.h, bot = ecy + ry, knot = bot + 0.035 * bb.h;
  const shape = `${ellipseD(cx, ecy, rx, ry)} ${polyD([[cx, bot - 0.011 * bb.h], [cx + 0.045 * bb.w, knot], [cx - 0.045 * bb.w, knot]])}`;
  const sw = 0.008 * bb.w; // the string ends a line's width above the frame's edge
  const string = `M ${p(cx, knot)} C ${p(cx - 0.079 * bb.w, knot + 0.076 * bb.h)} ${p(cx + 0.079 * bb.w, knot + 0.131 * bb.h)} ${p(cx - 0.013 * bb.w, bb.y + bb.h - sw)}`;
  return art({ x: cx - rx, y: ecy - ry, w: 2 * rx, h: knot - (ecy - ry) }, shape, {
    inside: [{ kind: 'fill', d: ellipseD(cx - 0.22 * bb.w, ecy - 0.2 * bb.h, 0.06 * bb.w, 0.11 * bb.h, -0.5), color: 'rgba(255,255,255,0.35)' }],
    over: [{ kind: 'stroke', d: string, color: STRING_GREY, width: sw }],
  });
}

/* ── 20. House: a roof and a chimney. ──────────────────────────────────── */
function house(b: ArtBox): MaskArt {
  const hb = fitted(b, 0.917);
  const P = (u: number, v: number): Pt => [hb.x + u * hb.w, hb.y + v * hb.h];
  const d = polyD([P(0.5, 0.04), P(0.68, 0.186), P(0.68, 0.07), P(0.79, 0.07), P(0.79, 0.275), P(0.97, 0.42), P(0.86, 0.42), P(0.86, 0.97), P(0.14, 0.97), P(0.14, 0.42), P(0.03, 0.42)]);
  return art(hb, d);
}

/** What mask `id` draws in box `b` (the renderer's own px: see artBox; a
 *  box with no `ref` makes its whole-number choices from its own size). An
 *  empty frame (bad saved numbers) is a plain rectangle, never a loop
 *  without end. */
export function maskArt(id: ArtMask, b: ArtFrame): MaskArt {
  const r: Size = b.ref && b.ref.w > 0 && b.ref.h > 0 ? b.ref : b;
  if (!(b.w > 0 && b.h > 0 && Number.isFinite(b.w) && Number.isFinite(b.h))) return art(b, rectD(b));
  const u = Math.min(b.w, b.h);
  const sq = fitted(b, 1);
  switch (id) {
    case 'film': return film(b, r);
    case 'instant': return instant(b, u);
    case 'slide': return slide(b, u, r);
    case 'photo-corners': return photoCorners(b, u);
    case 'taped': return taped(b, u);
    case 'old-print': return oldPrint(b, u, r);
    case 'stitched': return stitched(b, u);
    case 'gold-oval': return goldOval(b, u);
    case 'inside-line': return insideLine(b, u);
    case 'dark-corners': return darkCorners(b);
    case 'ticket-stub': return ticketStub(b, u, r);
    case 'bubble': return bubble(b);
    case 'flower': return flower(sq);
    case 'badge': return badge(sq);
    case 'puzzle': return puzzle(sq);
    case 'window': return windowArch(b);
    case 'pebble': return pebble(sq);
    case 'balloon': return balloon(b);
    case 'paw': return paw(sq);
    case 'house': return house(b);
  }
}

/** Every paint of a mask, in the order it is drawn. */
export const allPaints = (a: MaskArt): ArtPaint[] => [...a.under, ...a.inside, ...a.over];
