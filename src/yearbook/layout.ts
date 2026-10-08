/* ── The yearbook layout engine ──────────────────────────────────────────────
   Turns a class section (names, photos, face geometry, chosen portrait size)
   into finished pages: plain lists of photos, text, QR codes and boxes placed
   in inches on an 8.5 × 11 trim. The painter draws these lists for the screen
   and for the 300 dpi print file, so preview and print can never disagree.

   Rules it enforces (layout reference + build plan):
   • class group photo on its own page, full width; the class QR in the upper
     right of the photo when no face is under it, otherwise in a strip below;
   • the class adviser leads the first portrait page in a larger frame;
   • every portrait 4:5, same head size and eye line (portraitFit);
   • QR rule (a), owner-approved: the QR sits in the photo's upper-right
     corner when it clears every face in the section; otherwise the whole
     section puts it beside the name, so the page stays uniform;
   • names under the photo, never on it; shrink, then two lines;
   • a short last row is centred; students without a photo go in a
     "Not pictured" list, never a blank box;
   • nothing within 0.5 in of the spine; page numbers in the outside corner. */
import { GRID, HEADER_H, NAME_MIN_PT, NAME_PT, PORTRAIT_ASPECT, QR_BADGE_IN, QR_BADGE_INSET, CLASS_QR_IN, TRIM, isRecto, liveArea, ptToIn, type Density } from './geometry';
import { displayName, sortForPage } from './classList';
import { badgeHitsHead, fitPortrait, mainFace, type Crop, type PortraitFit } from './portraitFit';
import type { Person, PhotoMeta, Section } from './types';

export type FontRole = 'display' | 'body';

export type El =
  | { kind: 'photo'; photoId: string; x: number; y: number; w: number; h: number; crop: Crop; personId?: string }
  | { kind: 'text'; lines: string[]; x: number; y: number; w: number; pt: number; font: FontRole; weight: number; align: 'left' | 'center' | 'right'; color: string; italic?: boolean; lineGap?: number }
  | { kind: 'qr'; data: string; x: number; y: number; size: number; ec?: 'L' | 'M' | 'Q' | 'H' }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string };

export type PageKind = 'group' | 'portraits' | 'looks' | 'list';

export interface YbPage {
  number: number;
  sectionId: string;
  kind: PageKind;
  elements: El[];
}

export type QrMode = 'corner' | 'name';

export interface SectionLayoutResult {
  pages: YbPage[];
  qrMode: QrMode;
  /** Portrait size on the page, inches. */
  portrait: { w: number; h: number };
  notPictured: string[];
  tight: string[];
}

/** Text width in inches at a size. The painter passes canvas measureText;
 *  tests pass an approximation. */
export type Measure = (text: string, pt: number, font: FontRole, weight: number) => number;

export const approxMeasure: Measure = (text, pt) => text.length * ptToIn(pt) * 0.52;

export interface LayoutCtx {
  photos: Record<string, PhotoMeta>;
  measure: Measure;
  /** URL a printed code opens: `${base}/Y/${CODE}` (uppercase → compact QR). */
  qrData: (memoryCode: string) => string;
  firstPage: number;
  schoolYear: string;
}

const INK = '#1d1f22';
const MUTED = '#5b6168';

/** The head of a standard fitted portrait, for photos with no face data. */
const STANDARD_HEAD = { x0: 0.26, x1: 0.74, y0: 0.08, y1: 0.62 };

function portraitFitFor(photo: PhotoMeta | undefined, aspect = PORTRAIT_ASPECT): PortraitFit | null {
  if (!photo) return null;
  return fitPortrait(photo.width, photo.height, mainFace(photo.faces), aspect);
}

function cornerBadge(frameW: number, frameH: number, size = QR_BADGE_IN) {
  const x1 = 1 - QR_BADGE_INSET / frameW, x0 = x1 - size / frameW;
  const y0 = QR_BADGE_INSET / frameH, y1 = y0 + size / frameH;
  return { x0, y0, x1, y1 };
}

function hits(fit: PortraitFit | null, frameW: number, frameH: number): boolean {
  const badge = cornerBadge(frameW, frameH);
  if (fit && fit.head) return badgeHitsHead(fit, badge);
  const h = STANDARD_HEAD;
  return badge.x0 < h.x1 && badge.x1 > h.x0 && badge.y0 < h.y1 && badge.y1 > h.y0;
}

/** Fit a name into a width: shrink in ¼ pt steps, then split into two lines. */
export function fitName(p: Pick<Person, 'first' | 'last' | 'middle' | 'suffix'>, width: number, startPt: number, measure: Measure): { lines: string[]; pt: number } {
  const full = displayName(p);
  for (let pt = startPt; pt >= NAME_MIN_PT - 1e-9; pt -= 0.25) {
    if (measure(full, pt, 'body', 600) <= width) return { lines: [full], pt };
  }
  const a = [p.first, p.middle].filter(Boolean).join(' ');
  const b = [p.last, p.suffix].filter(Boolean).join(' ');
  for (let pt = startPt; pt >= NAME_MIN_PT - 1e-9; pt -= 0.25) {
    if (Math.max(measure(a, pt, 'body', 600), measure(b, pt, 'body', 600)) <= width) return { lines: [a, b], pt };
  }
  return { lines: [a, b], pt: NAME_MIN_PT };
}

function header(page: number, title: string, subtitle: string | null): El[] {
  const L = liveArea(page);
  const els: El[] = [{ kind: 'text', lines: [title], x: L.x0, y: L.y0, w: L.x1 - L.x0, pt: 15, font: 'display', weight: 600, align: isRecto(page) ? 'left' : 'right', color: INK }];
  if (subtitle) els.push({ kind: 'text', lines: [subtitle], x: L.x0, y: L.y0 + ptToIn(15) * 1.25, w: L.x1 - L.x0, pt: 8, font: 'body', weight: 500, align: isRecto(page) ? 'left' : 'right', color: MUTED });
  return els;
}

function folio(page: number): El {
  const recto = isRecto(page);
  const L = liveArea(page);
  return { kind: 'text', lines: [String(page)], x: L.x0, y: TRIM.h - 0.45, w: L.x1 - L.x0, pt: 8, font: 'body', weight: 500, align: recto ? 'right' : 'left', color: MUTED };
}

/* ── Group photo page ─────────────────────────────────────────────────────── */

function groupPage(section: Section, adviser: Person | undefined, students: Person[], ctx: LayoutCtx, page: number): YbPage {
  const L = liveArea(page);
  const els: El[] = [...header(page, section.title, `Class of ${ctx.schoolYear}`)];
  const top = L.y0 + HEADER_H + 0.05;
  const w = L.x1 - L.x0;
  const photo = section.groupPhotoId ? ctx.photos[section.groupPhotoId] : undefined;
  let bottom = top;
  if (photo) {
    const aspect = Math.min(Math.max(photo.width / photo.height, 1.25), 1.9);
    let h = w / aspect;
    const crop = coverCrop(photo.width, photo.height, aspect);
    // Badge on the photo unless a face (grown by 30%) is under it, or the face
    // AI found fewer than 90% of the class (it could be missing the one under it).
    const bSize = CLASS_QR_IN;
    const bx = L.x1 - bSize - 0.08, by = top + 0.08;
    const facesOk = photo.scanned && photo.faces.length >= Math.ceil(students.length * 0.9) && students.length > 0;
    const blocked = !facesOk || photo.faces.some((f) => {
      const fx0 = L.x0 + ((f.box.x - f.box.w * 0.15 - crop.x / photo.width) / (crop.w / photo.width)) * w;
      const fx1 = L.x0 + ((f.box.x + f.box.w * 1.15 - crop.x / photo.width) / (crop.w / photo.width)) * w;
      const fy0 = top + ((f.box.y - f.box.h * 0.3 - crop.y / photo.height) / (crop.h / photo.height)) * h;
      const fy1 = top + ((f.box.y + f.box.h * 1.15 - crop.y / photo.height) / (crop.h / photo.height)) * h;
      return fx0 < bx + bSize && fx1 > bx && fy0 < by + bSize && fy1 > by;
    });
    if (!blocked) {
      els.push({ kind: 'photo', photoId: photo.id, x: L.x0, y: top, w, h, crop });
      els.push({ kind: 'qr', data: ctx.qrData(section.classMemoryCode), x: bx, y: by, size: bSize });
      bottom = top + h;
    } else {
      h = Math.min(h, 5.4);
      const c2 = coverCrop(photo.width, photo.height, w / h);
      els.push({ kind: 'photo', photoId: photo.id, x: L.x0, y: top, w, h, crop: c2 });
      const sy = top + h + 0.12, sh = 0.8;
      els.push({ kind: 'rect', x: L.x0, y: sy, w, h: sh, fill: '#f3f0ea' });
      els.push({ kind: 'qr', data: ctx.qrData(section.classMemoryCode), x: L.x1 - sh + 0.06, y: sy + 0.06, size: sh - 0.12 });
      els.push({ kind: 'text', lines: ['Scan for our class video'], x: L.x0 + 0.18, y: sy + 0.2, w: w - sh - 0.3, pt: 12, font: 'display', weight: 600, align: 'left', color: INK });
      els.push({ kind: 'text', lines: ['Point your phone camera at the code'], x: L.x0 + 0.18, y: sy + 0.45, w: w - sh - 0.3, pt: 8, font: 'body', weight: 400, align: 'left', color: MUTED });
      bottom = sy + sh;
    }
  } else {
    bottom = top;
  }

  let y = bottom + 0.25;
  if (adviser) {
    els.push({ kind: 'text', lines: [`Class adviser: ${adviserLabel(adviser)}`], x: L.x0, y, w, pt: 10, font: 'body', weight: 600, align: 'left', color: INK });
    y += 0.3;
  }
  const names = sortForPage(students).map(displayName);
  const cols = 3, colW = (w - 0.3) / cols, pt = 8, lh = ptToIn(pt) * 1.45;
  const perCol = Math.ceil(names.length / cols);
  for (let c = 0; c < cols; c++) {
    const chunk = names.slice(c * perCol, (c + 1) * perCol);
    if (chunk.length) els.push({ kind: 'text', lines: chunk, x: L.x0 + c * (colW + 0.15), y, w: colW, pt, font: 'body', weight: 400, align: 'left', color: INK, lineGap: lh });
  }
  els.push(folio(page));
  return { number: page, sectionId: section.id, kind: 'group', elements: els };
}

export function adviserLabel(p: Person): string {
  return [p.title, displayName(p)].filter(Boolean).join(' ');
}

export function coverCrop(W: number, H: number, aspect: number): Crop {
  let cw = W, ch = W / aspect;
  if (ch > H) { ch = H; cw = H * aspect; }
  return { x: (W - cw) / 2, y: (H - ch) / 2, w: cw, h: ch };
}

/* ── Portrait pages ───────────────────────────────────────────────────────── */

interface Cell { person: Person; photo?: PhotoMeta; fit: PortraitFit | null; feature?: boolean }

function gridGeometry(page: number, density: Density, band: number) {
  const L = liveArea(page);
  const { cols, rows } = GRID[density];
  const liveW = L.x1 - L.x0, top = L.y0 + HEADER_H, liveH = L.y1 - top;
  const g = cols >= 5 ? 0.125 : 0.167, rg = 0.1;
  const cellW = (liveW - (cols - 1) * g) / cols;
  const cellH = (liveH - (rows - 1) * rg) / rows;
  const ph = Math.min(cellH - band, cellW / PORTRAIT_ASPECT), pw = ph * PORTRAIT_ASPECT;
  const gridW = cols * pw + (cols - 1) * g;
  const sx = L.x0 + (liveW - gridW) / 2;
  return { L, cols, rows, g, rg, cellH, pw, ph, sx, top };
}

function nameBand(density: Density, qrMode: QrMode): number {
  const pt = NAME_PT[density];
  const lines = ptToIn(pt) * 1.2 * 2 + 0.07;
  return qrMode === 'name' ? Math.max(lines, QR_BADGE_IN + 0.09) : lines;
}

function portraitPages(section: Section, adviser: Person | undefined, cells: Cell[], ctx: LayoutCtx, startPage: number, qrMode: QrMode): YbPage[] {
  const density = section.density;
  const pages: YbPage[] = [];
  const band = nameBand(density, qrMode);
  let idx = 0, page = startPage, first = true;
  while (idx < cells.length || (first && adviser)) {
    const G = gridGeometry(page, density, band);
    const els: El[] = [...header(page, section.title, first ? `Class of ${ctx.schoolYear}` : null)];
    // Slots on this page, row-major; the adviser takes a 2×2 block on page one.
    const taken = new Set<string>();
    const slots: { r: number; c: number }[] = [];
    if (first && adviser) {
      const span = G.cols >= 4 ? 2 : 1;
      for (let r = 0; r < span; r++) for (let c = 0; c < span; c++) taken.add(`${r},${c}`);
      const fw = span * G.pw + (span - 1) * G.g;
      const fhMax = span * G.cellH + (span - 1) * G.rg - band;
      const fh = Math.min(fhMax, fw / PORTRAIT_ASPECT), fwAdj = fh * PORTRAIT_ASPECT;
      const fx = G.sx + (fw - fwAdj) / 2, fy = G.top;
      const aPhoto = section.assignments[adviser.id]?.[0];
      const meta = aPhoto ? ctx.photos[aPhoto] : undefined;
      els.push(...portraitEls({ person: adviser, photo: meta, fit: portraitFitFor(meta), feature: true }, fx, fy, fwAdj, fh, density, qrMode, ctx));
    }
    for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) if (!taken.has(`${r},${c}`)) slots.push({ r, c });
    const onPage = cells.slice(idx, idx + slots.length);
    idx += onPage.length;
    // Centre a short last row.
    const lastRowStart = onPage.length ? slots[onPage.length - 1].r : 0;
    const inLastRow = slots.slice(0, onPage.length).filter((s) => s.r === lastRowStart);
    const fullRow = slots.filter((s) => s.r === lastRowStart);
    const shift = inLastRow.length < fullRow.length ? ((fullRow.length - inLastRow.length) * (G.pw + G.g)) / 2 : 0;
    onPage.forEach((cell, i) => {
      const s = slots[i];
      const x = G.sx + s.c * (G.pw + G.g) + (s.r === lastRowStart ? shift : 0);
      const y = G.top + s.r * (G.cellH + G.rg);
      els.push(...portraitEls(cell, x, y, G.pw, G.ph, density, qrMode, ctx));
    });
    els.push(folio(page));
    pages.push({ number: page, sectionId: section.id, kind: 'portraits', elements: els });
    page++;
    first = false;
  }
  return pages;
}

function portraitEls(cell: Cell, x: number, y: number, w: number, h: number, density: Density, qrMode: QrMode, ctx: LayoutCtx): El[] {
  const els: El[] = [];
  if (cell.photo && cell.fit) els.push({ kind: 'photo', photoId: cell.photo.id, x, y, w, h, crop: cell.fit.crop, personId: cell.person.id });
  else els.push({ kind: 'rect', x, y, w, h, fill: '#e9ecef' });
  const qr = ctx.qrData(cell.person.memoryCode);
  const startPt = cell.feature ? Math.min(NAME_PT[density] + 1.5, 13) : NAME_PT[density];
  if (qrMode === 'corner') {
    els.push({ kind: 'qr', data: qr, x: x + w - QR_BADGE_IN - QR_BADGE_INSET, y: y + QR_BADGE_INSET, size: QR_BADGE_IN });
    const n = fitName(cell.person, w, startPt, ctx.measure);
    els.push({ kind: 'text', lines: n.lines, x, y: y + h + 0.05, w, pt: n.pt, font: 'body', weight: 600, align: 'center', color: INK });
    if (cell.feature) els.push({ kind: 'text', lines: ['Class Adviser'], x, y: y + h + 0.05 + ptToIn(n.pt) * 1.25 * n.lines.length, w, pt: Math.max(7, n.pt - 1.5), font: 'body', weight: 400, align: 'center', color: MUTED, italic: true });
  } else {
    const qx = x + w - QR_BADGE_IN, qy = y + h + 0.05;
    els.push({ kind: 'qr', data: qr, x: qx, y: qy, size: QR_BADGE_IN });
    const tw = w - QR_BADGE_IN - 0.06;
    const n = fitName(cell.person, tw, startPt, ctx.measure);
    els.push({ kind: 'text', lines: n.lines, x, y: qy + 0.02, w: tw, pt: n.pt, font: 'body', weight: 600, align: 'left', color: INK });
    if (cell.feature) els.push({ kind: 'text', lines: ['Class Adviser'], x, y: qy + 0.02 + ptToIn(n.pt) * 1.25 * n.lines.length, w: tw, pt: Math.max(7, n.pt - 1.5), font: 'body', weight: 400, align: 'left', color: MUTED, italic: true });
  }
  return els;
}

/* ── Three looks per graduate ─────────────────────────────────────────────── */

function looksPages(section: Section, cells: { person: Person; photos: PhotoMeta[] }[], ctx: LayoutCtx, startPage: number): { pages: YbPage[]; qrMode: QrMode } {
  const n = section.looksPerPage;
  const pages: YbPage[] = [];
  // Decide the QR spot once for the section from the main (toga) photos.
  const L0 = liveArea(startPage);
  const geo = looksGeometry(n, L0);
  const anyHit = cells.some((c) => hits(portraitFitFor(c.photos[0]), geo.mainW, geo.mainH));
  const qrMode: QrMode = n === 4 || anyHit ? 'name' : 'corner';
  for (let i = 0, page = startPage; i < cells.length; i += n, page++) {
    const L = liveArea(page);
    const G = looksGeometry(n, L);
    const els: El[] = [...header(page, section.title, i === 0 ? `Class of ${ctx.schoolYear}` : null)];
    cells.slice(i, i + n).forEach((cell, k) => {
      const by = L.y0 + HEADER_H + k * (G.blockH + G.rg);
      const [main, ...more] = cell.photos;
      const fitMain = portraitFitFor(main);
      const mx = G.mainX, my = by;
      els.push({ kind: 'photo', photoId: main.id, x: mx, y: my, w: G.mainW, h: G.mainH, crop: fitMain!.crop, personId: cell.person.id });
      G.small.forEach((s, j) => {
        const ph = more[j];
        if (!ph) return;
        const f = portraitFitFor(ph, s.w / s.h);
        els.push({ kind: 'photo', photoId: ph.id, x: s.x, y: by + s.dy, w: s.w, h: s.h, crop: f!.crop, personId: cell.person.id });
      });
      const qr = ctx.qrData(cell.person.memoryCode);
      const nm = fitName(cell.person, G.nameW - (qrMode === 'name' && G.nameUnder ? QR_BADGE_IN + 0.08 : 0), n === 2 ? 14 : 11, ctx.measure);
      if (G.nameUnder) {
        const ny = by + G.mainH + 0.06;
        els.push({ kind: 'text', lines: [nm.lines.join(' ')], x: G.nameX, y: ny, w: G.nameW, pt: nm.pt, font: 'display', weight: 600, align: 'center', color: INK });
        if (qrMode === 'corner') els.push({ kind: 'qr', data: qr, x: mx + G.mainW - QR_BADGE_IN - QR_BADGE_INSET, y: my + QR_BADGE_INSET, size: QR_BADGE_IN });
        else els.push({ kind: 'qr', data: qr, x: G.nameX + G.nameW - QR_BADGE_IN, y: ny - 0.02, size: QR_BADGE_IN });
      } else {
        els.push({ kind: 'text', lines: nm.lines, x: G.nameX, y: by + 0.05, w: G.nameW, pt: nm.pt, font: 'display', weight: 600, align: 'left', color: INK });
        els.push({ kind: 'text', lines: [section.title], x: G.nameX, y: by + 0.12 + ptToIn(nm.pt) * 1.25 * nm.lines.length, w: G.nameW, pt: 8, font: 'body', weight: 400, align: 'left', color: MUTED });
        if (qrMode === 'corner') els.push({ kind: 'qr', data: qr, x: mx + G.mainW - QR_BADGE_IN - QR_BADGE_INSET, y: my + QR_BADGE_INSET, size: QR_BADGE_IN });
        else els.push({ kind: 'qr', data: qr, x: G.nameX, y: by + G.blockH - QR_BADGE_IN - 0.02, size: QR_BADGE_IN });
      }
    });
    els.push(folio(page));
    pages.push({ number: page, sectionId: section.id, kind: 'looks', elements: els });
  }
  return { pages, qrMode };
}

function looksGeometry(n: 2 | 3 | 4, L: { x0: number; x1: number; y0: number; y1: number }) {
  const liveW = L.x1 - L.x0, liveH = L.y1 - L.y0 - HEADER_H, g = 0.125;
  if (n === 2) {
    const rg = 0.167, blockH = (liveH - rg) / 2;
    const H = Math.min(blockH, (liveW - 2 * g - 2.0 + 0.4 * g) / 1.2), W = H * PORTRAIT_ASPECT;
    const sh = (H - g) / 2, sw = sh * PORTRAIT_ASPECT;
    const nameX = L.x0 + W + g + sw + g;
    return { rg, blockH, mainX: L.x0, mainW: W, mainH: H, small: [{ x: L.x0 + W + g, dy: 0, w: sw, h: sh }, { x: L.x0 + W + g, dy: sh + g, w: sw, h: sh }], nameX, nameW: L.x1 - nameX, nameUnder: false };
  }
  if (n === 3) {
    const rg = 0.1, blockH = (liveH - 2 * rg) / 3, h = blockH - 0.36, w = h * PORTRAIT_ASPECT, tw = 3 * w + 2 * g;
    const sx = L.x0 + (liveW - tw) / 2;
    return { rg, blockH, mainX: sx, mainW: w, mainH: h, small: [{ x: sx + w + g, dy: 0, w, h }, { x: sx + 2 * (w + g), dy: 0, w, h }], nameX: sx, nameW: tw, nameUnder: true };
  }
  const rg = 0.1, blockH = (liveH - 3 * rg) / 4, h = blockH, w = h * PORTRAIT_ASPECT;
  const nameX = L.x0 + 3 * (w + g);
  return { rg, blockH, mainX: L.x0, mainW: w, mainH: h, small: [{ x: L.x0 + w + g, dy: 0, w, h }, { x: L.x0 + 2 * (w + g), dy: 0, w, h }], nameX, nameW: L.x1 - nameX, nameUnder: false };
}

/* ── Not pictured ─────────────────────────────────────────────────────────── */

function notPicturedEls(names: string[], page: YbPage, yFrom: number): El[] | null {
  const L = liveArea(page.number);
  const pt = 8, lh = ptToIn(pt) * 1.4;
  const text = `Not pictured: ${names.join(', ')}`;
  const charsPerLine = Math.floor((L.x1 - L.x0) / (ptToIn(pt) * 0.5));
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    if ((cur + ' ' + word).trim().length > charsPerLine) { lines.push(cur.trim()); cur = word; } else cur += ' ' + word;
  }
  if (cur.trim()) lines.push(cur.trim());
  const need = lines.length * lh;
  if (yFrom + need > L.y1) return null;
  return [{ kind: 'text', lines, x: L.x0, y: L.y1 - need, w: L.x1 - L.x0, pt, font: 'body', weight: 400, align: 'left', color: MUTED, italic: true, lineGap: lh }];
}

function lowestY(page: YbPage): number {
  return Math.max(0, ...page.elements.filter((e) => e.kind === 'photo' || e.kind === 'rect' || e.kind === 'qr').map((e) => ('h' in e ? e.y + e.h : e.y + (e as { size: number }).size)));
}

/* ── A whole section ──────────────────────────────────────────────────────── */

export function layoutSection(section: Section, ctx: LayoutCtx): SectionLayoutResult {
  const adviser = section.people.find((p) => p.role === 'class_adviser');
  const students = sortForPage(section.people.filter((p) => p.role === 'student'));
  const withPhoto = students.filter((p) => section.assignments[p.id]?.length && ctx.photos[section.assignments[p.id][0]]);
  const notPictured = students.filter((p) => !withPhoto.includes(p)).map(displayName);
  const pages: YbPage[] = [];
  let page = ctx.firstPage;
  const tight: string[] = [];

  if (section.groupPhotoId && ctx.photos[section.groupPhotoId]) pages.push(groupPage(section, adviser, students, ctx, page++));

  let qrMode: QrMode = 'corner';
  let portrait = { w: 0, h: 0 };
  if (section.layout === 'looks3') {
    const cells = withPhoto.map((person) => ({ person, photos: section.assignments[person.id].map((id) => ctx.photos[id]).filter((p): p is PhotoMeta => !!p) }));
    if (cells.length) {
      const r = looksPages(section, cells, ctx, page);
      pages.push(...r.pages); qrMode = r.qrMode; page += r.pages.length;
      const G = looksGeometry(section.looksPerPage, liveArea(ctx.firstPage));
      portrait = { w: G.mainW, h: G.mainH };
    }
  } else {
    const cells: Cell[] = withPhoto.map((person) => {
      const photo = ctx.photos[section.assignments[person.id][0]];
      const fit = portraitFitFor(photo);
      if (fit?.tight) tight.push(displayName(person));
      return { person, photo, fit };
    });
    // QR rule (a): corner when it clears every face at this size, else beside the name.
    const G = gridGeometry(page, section.density, nameBand(section.density, 'corner'));
    const anyHit = cells.length === 0 ? hits(null, G.pw, G.ph) : cells.some((c) => hits(c.fit, G.pw, G.ph));
    qrMode = anyHit ? 'name' : 'corner';
    const G2 = gridGeometry(page, section.density, nameBand(section.density, qrMode));
    portrait = { w: G2.pw, h: G2.ph };
    if (cells.length || adviser) {
      const ps = portraitPages(section, adviser, cells, ctx, page, qrMode);
      pages.push(...ps); page += ps.length;
    }
  }

  if (notPictured.length) {
    const last = pages[pages.length - 1];
    const els = last ? notPicturedEls(notPictured, last, lowestY(last) + 0.25) : null;
    if (last && els) last.elements.push(...els);
    else {
      const p: YbPage = { number: page, sectionId: section.id, kind: 'list', elements: [...header(page, section.title, null), folio(page)] };
      p.elements.push(...(notPicturedEls(notPictured, p, liveArea(page).y0 + HEADER_H) ?? []));
      pages.push(p);
    }
  }
  return { pages, qrMode, portrait, notPictured, tight };
}

/** Pages a section would take at a given portrait size (for the budget tool). */
export function sectionPageCount(section: Section, ctx: LayoutCtx, density: Density): number {
  return layoutSection({ ...section, density }, { ...ctx, firstPage: 1 }).pages.length;
}
