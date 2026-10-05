import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mirrorOps, bleedPx, pageSizeWithBleedIn } from './printBleed';
import { PRINTER_SPEC } from './coverGeometry';
import { BINDING_INCHES } from './binding';

/* ══════════════════════════════════════════════════════════════════════════
   BLEED (1-star testers round 2, the print inspector): interior pages were
   exactly 8.00 × 8.00 in with photos touching the trim (PI-2), and a photo
   cover stopped at the panel, leaving the hardcover turn-in cream (PI-3).
   The page is drawn as approved and its edge MIRRORED outward — the real
   pixels are proven in Chrome (see the PR); this is the geometry.
   ══════════════════════════════════════════════════════════════════════════ */

describe('the settled measures', () => {
  it('bleed 0.125" (3 mm), hardcover turn-in 0.625" (16 mm), the 0.5" spine keep-out untouched', () => {
    expect(PRINTER_SPEC.bleedIn).toBe(0.125);
    expect(PRINTER_SPEC.wrapTurnIn).toBe(0.625);
    expect(BINDING_INCHES).toBe(0.5);
  });
  it('an 8×8 page file is 8.25 × 8.25 in; every size gets 0.125" on every edge', () => {
    expect(pageSizeWithBleedIn(8, 8)).toEqual({ wIn: 8.25, hIn: 8.25 });
    expect(pageSizeWithBleedIn(6, 4)).toEqual({ wIn: 6.25, hIn: 4.25 });
    expect(pageSizeWithBleedIn(8.5, 11)).toEqual({ wIn: 8.75, hIn: 11.25 });
    expect(bleedPx(300)).toBe(38); // 37.5 rounds up: never short of the bleed
  });
});

describe('mirrorOps: the picture continues outward as its own mirror image', () => {
  const box = { x: 38, y: 38, w: 2400, h: 2400 };
  it('all four edges: 4 sides + 4 corners, each reading the strip it sits against, flipped', () => {
    const ops = mirrorOps(2400, 2400, box, { top: 38, right: 38, bottom: 38, left: 38 });
    expect(ops).toHaveLength(8);
    const at = (dx: number, dy: number) => ops.find((o) => o.dx === dx && o.dy === dy)!;
    // Left strip: the image's first 38 columns, flipped across the left edge.
    expect(at(0, 38)).toMatchObject({ sx: 0, sw: 38, sy: 0, sh: 2400, dw: 38, dh: 2400, flipX: true, flipY: false });
    // Right strip: its last 38 columns.
    expect(at(2438, 38)).toMatchObject({ sx: 2362, sw: 38, dw: 38, flipX: true, flipY: false });
    // Top strip: its first 38 rows, flipped across the top edge.
    expect(at(38, 0)).toMatchObject({ sy: 0, sh: 38, sx: 0, sw: 2400, flipY: true, flipX: false });
    // Bottom strip: its last 38 rows.
    expect(at(38, 2438)).toMatchObject({ sy: 2362, sh: 38, flipY: true });
    // Corners: flipped both ways, from the matching corner of the picture.
    expect(at(0, 0)).toMatchObject({ sx: 0, sy: 0, sw: 38, sh: 38, flipX: true, flipY: true });
    expect(at(2438, 2438)).toMatchObject({ sx: 2362, sy: 2362, flipX: true, flipY: true });
    // Together they exactly ring the box: nothing over the picture, no gap.
    const area = ops.reduce((a, o) => a + o.dw * o.dh, 0);
    expect(area).toBe(2476 * 2476 - 2400 * 2400);
    for (const o of ops) {
      const inside = o.dx >= box.x && o.dx + o.dw <= box.x + box.w && o.dy >= box.y && o.dy + o.dh <= box.y + box.h;
      expect(inside).toBe(false);
    }
  });
  it('the cover front: top, bottom and the outer edge only — never over the hinge', () => {
    const front = { x: 3000, y: 188, w: 2400, h: 2400 };
    const ops = mirrorOps(2400, 2400, front, { top: 188, bottom: 188, right: 188, left: 0 });
    expect(ops).toHaveLength(5); // top, bottom, right + 2 right corners
    expect(ops.every((o) => o.dx >= front.x)).toBe(true);
  });
  it('an image drawn scaled reads the right source span', () => {
    const ops = mirrorOps(1200, 1200, { x: 10, y: 10, w: 2400, h: 2400 }, { top: 0, right: 0, bottom: 0, left: 40 });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ sx: 0, sw: 20, dw: 40, dx: -30 });
  });
  it('a margin wider than the picture reads only the picture', () => {
    const [op] = mirrorOps(100, 100, { x: 500, y: 0, w: 100, h: 100 }, { top: 0, right: 0, bottom: 0, left: 300 });
    expect(op.sw).toBe(100);
  });
});

describe('it is what prints (source guards)', () => {
  const pipeline = readFileSync(resolve(__dirname, 'printPipeline.ts'), 'utf8');
  const pdf = readFileSync(resolve(__dirname, 'generateAlbumPdf.ts'), 'utf8');
  it('every interior page goes out with its bleed; a cover panel does not (the wrap handles it)', () => {
    expect(pipeline).toMatch(/const page300: HTMLCanvasElement = coverMode \? canvas : withBleed\(canvas, bleedPx\(PRINT_DPI\)\);/);
  });
  it('the PDF pages are the trim plus the bleed', () => {
    expect(pdf).toMatch(/const \{ wIn, hIn \} = pageSizeWithBleedIn\(/);
  });
  it('the cover front runs into the turn-in on three sides, not the hinge', () => {
    expect(pipeline).toMatch(/\{ top: front\.y, bottom: H - \(front\.y \+ front\.height\), right: W - \(front\.x \+ front\.width\), left: 0 \}/);
  });
});
