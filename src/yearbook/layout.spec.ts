import { describe, expect, it } from 'vitest';
import { approxMeasure, layoutSection, fitName, type El, type LayoutCtx } from './layout';
import { SPINE_KEEPOUT, TRIM, isRecto, type Density } from './geometry';
import type { FaceGeom, Person, PhotoMeta, Section } from './types';

const W = 2000, H = 2500;
function face(cx: number, ey: number, gap: number): FaceGeom {
  const boxH = gap / 0.4, boxW = boxH * 0.85;
  return {
    box: { x: (cx - boxW / 2) / W, y: (ey - boxH * 0.3) / H, w: boxW / W, h: boxH / H },
    leftEye: { x: (cx - gap / 2) / W, y: ey / H }, rightEye: { x: (cx + gap / 2) / W, y: ey / H }, source: 'sample',
  };
}
const SURNAMES = ['Abad', 'Bautista', 'Castillo', 'Dela Cruz', 'Escobar', 'Flores', 'Garcia', 'Hernandez', 'Ignacio', 'Jimenez', 'Katigbak', 'Lim', 'Mendoza', 'Navarro', 'Ocampo', 'Pascual', 'Quiambao', 'Ramos', 'Santos', 'Tolentino', 'Uy', 'Villanueva', 'Wong', 'Yap', 'Zamora', 'Aquino', 'Bernardo', 'Cruz', 'Diaz', 'Estrada'];

function makeSection(n: number, opts: Partial<Section> = {}, missing: number[] = []): { section: Section; ctx: LayoutCtx } {
  const photos: Record<string, PhotoMeta> = {};
  const people: Person[] = [];
  const assignments: Record<string, string[]> = {};
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    people.push({ id, last: SURNAMES[i % SURNAMES.length], first: i % 3 ? 'Maria Theresa' : 'Juan', role: 'student', rosterOrder: i, memoryCode: `code${i}` });
    if (missing.includes(i)) continue;
    // Photographer variance: head size and position differ per file.
    const f = face(900 + (i % 5) * 40, 950 + (i % 4) * 60, 140 + (i % 6) * 15);
    photos[`f${i}`] = { id: `f${i}`, fileName: `${i}.jpg`, width: W, height: H, order: i, faces: [f], flags: [], scanned: true };
    assignments[id] = [`f${i}`];
  }
  people.push({ id: 'adv', last: 'Reyes', first: 'Ana', title: 'Ms.', role: 'class_adviser', rosterOrder: -1, memoryCode: 'advcode' });
  photos.fa = { id: 'fa', fileName: 'adviser.jpg', width: W, height: H, order: 99, faces: [face(1000, 1000, 160)], flags: [], scanned: true };
  assignments.adv = ['fa'];
  const section: Section = { id: 's1', title: 'Grade 12 · St. Joseph', people, assignments, confidence: {}, checked: {}, classMemoryCode: 'classcode', layout: 'portraits', density: 12, looksPerPage: 3, ...opts };
  return { section, ctx: { photos, measure: approxMeasure, qrData: (c) => `HTTPS://X.APP/Y/${c.toUpperCase()}`, firstPage: 1, schoolYear: '2027' } };
}

const box = (e: El) => (e.kind === 'qr' ? { x0: e.x, y0: e.y, x1: e.x + e.size, y1: e.y + e.size } : e.kind === 'text' ? { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + 0.1 } : { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h });

describe('layoutSection — portraits', () => {
  it('fills pages: adviser block + 30 students at 12 per page = 3 pages', () => {
    const { section, ctx } = makeSection(30);
    const r = layoutSection(section, ctx);
    expect(r.pages.map((p) => p.kind)).toEqual(['portraits', 'portraits', 'portraits']);
    const photosPerPage = r.pages.map((p) => p.elements.filter((e) => e.kind === 'photo').length);
    expect(photosPerPage).toEqual([9, 12, 10]); // adviser + 8, then 12, then 10
  });

  it('keeps everything inside the trim and out of the spine band', () => {
    for (const d of [4, 9, 12, 16, 20, 30] as Density[]) {
      const { section, ctx } = makeSection(30, { density: d });
      for (const page of layoutSection(section, ctx).pages) {
        for (const e of page.elements) {
          const b = box(e);
          expect(b.x0).toBeGreaterThanOrEqual(0);
          expect(b.x1).toBeLessThanOrEqual(TRIM.w + 1e-9);
          expect(b.y1).toBeLessThanOrEqual(TRIM.h + 1e-9);
          if (e.kind === 'photo' || e.kind === 'qr') {
            if (isRecto(page.number)) expect(b.x0).toBeGreaterThanOrEqual(SPINE_KEEPOUT);
            else expect(b.x1).toBeLessThanOrEqual(TRIM.w - SPINE_KEEPOUT);
          }
        }
      }
    }
  });

  it('QR rule (a): corner at 4 and 9 per page, beside the name from 12 per page', () => {
    const modes = ([4, 9, 12, 20, 30] as Density[]).map((d) => layoutSection(makeSection(30, { density: d }).section, makeSection(30).ctx).qrMode);
    expect(modes).toEqual(['corner', 'corner', 'name', 'name', 'name']);
  });

  it('never puts a corner QR over a head, and names are never on a photo', () => {
    const { section, ctx } = makeSection(30, { density: 9 });
    const r = layoutSection(section, ctx);
    expect(r.qrMode).toBe('corner');
    for (const page of r.pages) {
      const photos = page.elements.filter((e) => e.kind === 'photo') as Extract<El, { kind: 'photo' }>[];
      const texts = page.elements.filter((e) => e.kind === 'text') as Extract<El, { kind: 'text' }>[];
      for (const ph of photos) {
        // Name text that starts inside the photo's column must start below it.
        const inside = texts.filter((t) => t.x < ph.x + ph.w && t.x + t.w > ph.x && t.y >= ph.y && t.y < ph.y + ph.h);
        expect(inside).toEqual([]);
      }
    }
  });

  it('centres a short last row', () => {
    const { section, ctx } = makeSection(14, { density: 9 }); // adviser + 8, then 6 = 3 + 3 rows of 3 → last row full? use 13
    const r = layoutSection({ ...section, people: section.people.filter((p) => p.id !== 'p13') }, ctx);
    const last = r.pages[r.pages.length - 1];
    const photos = last.elements.filter((e) => e.kind === 'photo') as Extract<El, { kind: 'photo' }>[];
    const rows = new Map<number, number[]>();
    for (const p of photos) rows.set(Math.round(p.y * 100), [...(rows.get(Math.round(p.y * 100)) ?? []), p.x + p.w / 2]);
    const lastRow = [...rows.entries()].sort((a, b) => b[0] - a[0])[0][1];
    const full = [...rows.values()][0];
    const mid = (xs: number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;
    expect(mid(lastRow)).toBeCloseTo(mid(full), 6);
  });

  it('lists students without a photo instead of leaving blank boxes', () => {
    const { section, ctx } = makeSection(20, { density: 12 }, [3, 7]);
    const r = layoutSection(section, ctx);
    expect(r.notPictured).toEqual(['Juan Dela Cruz', 'Maria Theresa Hernandez']);
    const allText = r.pages.flatMap((p) => p.elements).filter((e) => e.kind === 'text').flatMap((e) => (e as Extract<El, { kind: 'text' }>).lines).join(' ');
    expect(allText).toContain('Not pictured:');
    expect(r.pages.flatMap((p) => p.elements).filter((e) => e.kind === 'rect')).toHaveLength(0);
  });

  it('opens with the class group photo page when there is one', () => {
    const { section, ctx } = makeSection(30);
    ctx.photos.group = { id: 'group', fileName: 'group.jpg', width: 3000, height: 2000, order: 0, faces: [], flags: [], scanned: true };
    const r = layoutSection({ ...section, groupPhotoId: 'group' }, ctx);
    expect(r.pages[0].kind).toBe('group');
    // No faces found → can't prove the corner is clear → the class QR goes in the strip.
    const texts = r.pages[0].elements.filter((e) => e.kind === 'text').flatMap((e) => (e as Extract<El, { kind: 'text' }>).lines);
    expect(texts).toContain('Scan for our class video');
  });
});

describe('layoutSection — three looks', () => {
  it('puts 3 graduates per page with all three looks', () => {
    const { section, ctx } = makeSection(9, { layout: 'looks3', looksPerPage: 3 });
    for (let i = 0; i < 9; i++) {
      for (const k of [1, 2]) ctx.photos[`f${i}_${k}`] = { ...ctx.photos[`f${i}`], id: `f${i}_${k}` };
      section.assignments[`p${i}`] = [`f${i}`, `f${i}_1`, `f${i}_2`];
    }
    const r = layoutSection(section, ctx);
    expect(r.pages).toHaveLength(3);
    expect(r.pages.every((p) => p.elements.filter((e) => e.kind === 'photo').length === 9)).toBe(true);
  });
});

describe('fitName', () => {
  it('shrinks, then splits long names onto two lines', () => {
    const short = fitName({ first: 'Ana', last: 'Uy' }, 1.2, 9, approxMeasure);
    expect(short.lines).toHaveLength(1);
    const long = fitName({ first: 'Maria Theresa', middle: 'P.', last: 'Dela Cruz-Villanueva', suffix: 'Jr.' }, 1.2, 9, approxMeasure);
    expect(long.lines).toEqual(['Maria Theresa P.', 'Dela Cruz-Villanueva Jr.']);
  });
});
