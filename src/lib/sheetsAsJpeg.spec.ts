// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { PAGE_ONE_RIGHT_MARK } from '../pages/builder/binding';
import { LEGACY_LEAF_IN, coverWrapGeometry, spineForLeaf, spineWidthInches, type CoverPaper } from '../pages/builder/coverGeometry';
import { jpegDpi, setJpegDpi } from './jpegZip';
import { readZip } from './jpegZip.spec';

/* ══════════════════════════════════════════════════════════════════════════
   "SHEETS AS JPEG" (the shop's printer, 2026-10-21: the fonts weren't on his
   machine, he asked for JPEG). The real download, end to end, on a print file
   made the way the checkout makes one (jsPDF): the real press sheets
   (pdf-lib) and the real zip. Only storage and the drawing are stood in: a
   sheet becomes a picture in pdf.js + a canvas, which a test can't run (the
   walk in a real browser does).
   ══════════════════════════════════════════════════════════════════════════ */

const files = vi.hoisted(() => ({ store: new Map<string, ArrayBuffer>(), drawnPages: [] as number[] }));
vi.mock('./supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        download: async (path: string) => {
          const f = files.store.get(path);
          return f ? { data: { arrayBuffer: async () => f }, error: null } : { data: null, error: { message: 'not found' } };
        },
      }),
    },
  },
}));
// The browser's part: words as pictures, and each sheet as a JPEG.
vi.mock('./canvasTextPainter', () => {
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  return { canvasTextPainter: () => ({ width: (t: string, s: number) => t.length * s * 0.5, png: (t: string, s: number) => ({ bytes: png, wPt: t.length * s * 0.5, hPt: s, descentPt: s * 0.2 }) }) };
});
vi.mock('./pressSheetJpeg', () => ({
  pdfToJpegs: async (pdf: Uint8Array, onPage?: (d: number, t: number) => void) => {
    const doc = await PDFDocument.load(pdf);
    const n = doc.getPageCount();
    files.drawnPages.push(n);
    return Array.from({ length: n }, (_, i) => {
      onPage?.(i + 1, n);
      return setJpegDpi(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, i, 0xff, 0xd9]), 300);
    });
  },
}));

import { blankSidesNote, coverJpegName, coverSheetNote, downloadCoverSheet, downloadSheetsAsJpeg, jpegHowTo, orderSpine, sideJpegName } from './pressSheetFiles';

function album(n: number): ArrayBuffer {
  const doc = new jsPDF({ unit: 'in', format: [8.25, 8.25], compress: true });
  doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });
  for (let i = 0; i < n; i++) { if (i) doc.addPage([8.25, 8.25]); doc.setFillColor(90, 120, 150); doc.rect(0, 0, 8.25, 8.25, 'F'); }
  return doc.output('arraybuffer');
}
function cover(pages: number, paper: CoverPaper = {}): ArrayBuffer {
  const g = coverWrapGeometry('8x8', pages, 'softcover', paper);
  const doc = new jsPDF({ unit: 'in', format: [g.wrap.wIn, g.wrap.hIn], orientation: 'landscape', compress: true });
  doc.rect(0, 0, g.wrap.wIn, g.wrap.hIn, 'F');
  return doc.output('arraybuffer');
}

const order = { id: 'o-45', copy_of_order_id: null, order_number: 'MP-2026-0045', album_size: '8x8', cover: 'softcover', material: 'matte', page_count: 45 } as const;
/** The spine of that order's cover: 23 leaves of C2S 120 matte. */
const SPINE = { spineIn: spineWidthInches(45, 'softcover', 'matte') };
let saved: { name: string; type: string; bytes: Uint8Array }[];
beforeEach(() => {
  files.store.clear(); files.drawnPages.length = 0; saved = [];
  let blob: Blob | null = null;
  URL.createObjectURL = ((b: Blob) => { blob = b; return 'blob:test'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const b = blob!;
    saved.push({ name: this.download, type: b.type, bytes: new Uint8Array(0) });
    const i = saved.length - 1;
    const r = new FileReader();
    r.onload = () => { saved[i].bytes = new Uint8Array(r.result as ArrayBuffer); };
    r.readAsArrayBuffer(b);
  };
});
/** The saved zip is read back (FileReader) before the test looks inside. */
const settle = async () => {
  for (let i = 0; i < 200 && saved.some((s) => s.bytes.length === 0); i++) await new Promise((r) => setTimeout(r, 10));
};

describe('Sheets as JPEG', () => {
  it('a 45-page 8x8 order: one 300 DPI JPEG per sheet side, then the cover, then how to print, in one zip', async () => {
    files.store.set('o-45.pdf', album(45));
    files.store.set('o-45-cover.pdf', cover(45));
    const lines: string[] = [];
    const note = await downloadSheetsAsJpeg(order, (l) => lines.push(l));
    await settle();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('megyprints-MP-2026-0045-jpeg.zip');
    expect(saved[0].type).toBe('application/zip');
    const entries = readZip(saved[0].bytes);
    // 45 pages, 4 a sheet (2 leaves), page 1 on the first leaf's front → 23 leaves on 12 sheets: 24 sides.
    const sides = entries.filter((e) => /-\d\d-(front|back)-of-sheet-\d+\.jpg$/.test(e.name));
    expect(sides).toHaveLength(24);
    expect(sides.slice(0, 3).map((e) => e.name)).toEqual(['MP-2026-0045-01-front-of-sheet-1.jpg', 'MP-2026-0045-02-back-of-sheet-1.jpg', 'MP-2026-0045-03-front-of-sheet-2.jpg']);
    expect(sides.at(-1)!.name).toBe('MP-2026-0045-24-back-of-sheet-12.jpg');
    expect(entries.at(-2)!.name).toBe('MP-2026-0045-cover.jpg');
    expect(entries.at(-1)!.name).toBe('HOW-TO-PRINT.txt');
    for (const e of entries.filter((x) => x.name.endsWith('.jpg'))) expect(jpegDpi(e.data)).toBe(300);
    // The sheet PDF drawn is the press-sheet file (24 sides), then the cover sheet (1).
    expect(files.drawnPages).toEqual([24, 1]);
    expect(new TextDecoder().decode(entries.at(-1)!.data)).toBe(jpegHowTo(order, 12, 2, SPINE, 'Page 1 is the first side; the last side is blank'));
    expect(note).toBe('JPEG: 24 sheet sides and the cover sheet, 300 DPI · 12 sheets, both sides · keep sheet 1 on top, front up, cut the whole stack at once into 2 piles, then put pile 1 (top left) on pile 2, that on pile 3, left to right, top to bottom · Page 1 is the first side; the last side is blank');
    expect(lines[0]).toBe('Getting the print files…');
    expect(lines.at(-1)).toBe('Making the JPEG pictures: 25 of 25…');
  });

  it('no cover file yet: the sheets still come, and it says why the cover is missing', async () => {
    files.store.set('o-45.pdf', album(45));
    const note = await downloadSheetsAsJpeg(order);
    await settle();
    const entries = readZip(saved[0].bytes);
    expect(entries.some((e) => e.name.endsWith('-cover.jpg'))).toBe(false);
    expect(new TextDecoder().decode(entries.at(-1)!.data)).toContain('Cover: not in this zip');
    expect(note).toMatch(/No cover picture: The cover file isn't in storage for this order yet\. Ask the customer to open Your orders on the phone they made the album on and tap Send the cover\.$/);
  });

  it('no print file: says so, and nothing is saved', async () => {
    await expect(downloadSheetsAsJpeg(order)).rejects.toThrow("The print file isn't in storage for this order yet.");
    expect(saved).toHaveLength(0);
  });

  it('the how-to says actual size, 300 DPI, the long-edge flip and how to stack the pieces', () => {
    const t = jpegHowTo(order, 12, 4, SPINE, blankSidesNote(45, 'right'));
    expect(t).toContain('12.5 x 19 in sheet at 300 DPI (3750 x 5700 pixels)');
    expect(t).toContain('Print at actual size (100%). Do not use "fit to page".');
    expect(t).toContain('flipping on the long edge');
    expect(t).toContain('Keep the printed sheets in order: sheet 1 on top, front side up.');
    expect(t).toContain('Cut the whole stack at once on the marks: 4 piles, each already in page order.');
    expect(t).toContain('Put pile 1 (top left) on top of pile 2 (to its right), that on pile 3, and so on: left to right, top to bottom.');
    expect(t).toContain('the finished stack counts 1, 2, 3 from the top');
  });

  /* The owner, 2026-10-22: "I thought you arranged the pages so it prints
     front and back on 12.5x19". Unzipped, the old names listed the cover
     first and every back before its front (sheet-01-back < sheet-01-front):
     printed 2-sided in folder order, no sheet had its own two sides. */
  it('a folder lists the pictures in print order: front, back, next front… and the cover last', async () => {
    files.store.set('o-45.pdf', album(45));
    files.store.set('o-45-cover.pdf', cover(45));
    await downloadSheetsAsJpeg(order);
    await settle();
    const pictures = readZip(saved[0].bytes).map((e) => e.name).filter((n) => n.endsWith('.jpg'));
    const printOrder = [
      ...Array.from({ length: 12 }, (_, i) => [`MP-2026-0045-${String(2 * i + 1).padStart(2, '0')}-front-of-sheet-${i + 1}.jpg`, `MP-2026-0045-${String(2 * i + 2).padStart(2, '0')}-back-of-sheet-${i + 1}.jpg`]).flat(),
      'MP-2026-0045-cover.jpg',
    ];
    expect(pictures).toEqual(printOrder);
    // Sorted by name the plain way, and the way Windows / a Mac lists them (numbers by value).
    expect([...pictures].sort()).toEqual(printOrder);
    expect([...pictures].sort(new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare)).toEqual(printOrder);
    expect([...pictures].sort((a, b) => a.localeCompare(b))).toEqual(printOrder);
  });

  it('100 sides or more: three-digit numbers, so 100 still lists after 99', () => {
    const names = Array.from({ length: 120 }, (_, i) => sideJpegName('MP-1', i + 1, 120, { sheet: Math.floor(i / 2) + 1, side: i % 2 ? 'back' : 'front' }));
    expect(names[0]).toBe('MP-1-001-front-of-sheet-1.jpg');
    expect(names[99]).toBe('MP-1-100-back-of-sheet-50.jpg');
    expect([...names].sort()).toEqual(names);
    expect([...names, coverJpegName('MP-1')].sort()).toEqual([...names, 'MP-1-cover.jpg']);
  });
});

/* THE SPINE (owner, 2026-10-22: "masmaganda kung kaya nya macompute kung gano
   kalaki yung spine", the thickness of all the paper together; "the paper to
   be used is C2S140"; 2026-10-24: "our standard paper would be c2s 120"). The
   console says it on every order, on the cover sheet and in the zip. A cover
   file made before the paper was set was drawn for a 0.15 mm guess, or for
   C2S 140 from 2026-10-22 to 24: it still prints, its fold marks on ITS
   spine, and the note says what the pages will really stack to. */
describe('the spine, in the console', () => {
  it('every order says its spine: 45 pages = 23 leaves of C2S 120, matte 2.6 mm, glossy 2.4 mm', () => {
    expect(orderSpine(order)).toBe('spine 2.6 mm (0.10 in)');
    expect(orderSpine({ ...order, material: 'glossy' })).toBe('spine 2.4 mm (0.09 in)');
    // An order with no finish recorded counts as matte (the thicker sheet).
    expect(orderSpine({ ...order, material: null })).toBe('spine 2.6 mm (0.10 in)');
    // Hardbound: the two boards (2.5 mm each) on top.
    expect(orderSpine({ ...order, cover: 'hardboundLeather' })).toBe('spine 7.6 mm (0.30 in)');
  });

  it('Cover sheet: the note says the spine of the cover file', async () => {
    files.store.set('o-45-cover.pdf', cover(45, { material: 'matte' }));
    expect(await downloadCoverSheet(order)).toBe('Cover sheet: print one side only · spine 2.6 mm (0.10 in)');
    files.store.set('o-45-cover.pdf', cover(45, { material: 'glossy' }));
    expect(await downloadCoverSheet({ ...order, material: 'glossy' })).toBe('Cover sheet: print one side only · spine 2.4 mm (0.09 in)');
  });

  it('a cover file from before C2S 140 (the 0.15 mm guess): it still prints, and the note says what the pages stack to', async () => {
    files.store.set('o-45-cover.pdf', cover(45, { spineIn: spineForLeaf(45, 'softcover', LEGACY_LEAF_IN) }));
    expect(await downloadCoverSheet(order)).toBe(
      'Cover sheet: print one side only · spine 3.5 mm (0.14 in). This cover was made before the paper was set to C2S 120: the pages on C2S 120 matte stack to about 2.6 mm (0.10 in)');
    expect(coverSheetNote(order, SPINE.spineIn)).toBe('Cover sheet: print one side only · spine 2.6 mm (0.10 in)');
  });

  it('a cover file drawn for C2S 140 (2026-10-22 to 24): it still prints, and the note says C2S 120 stacks thinner', async () => {
    files.store.set('o-45-cover.pdf', cover(45, { spineIn: spineForLeaf(45, 'softcover', 0.134 / 25.4) }));
    expect(await downloadCoverSheet(order)).toBe(
      'Cover sheet: print one side only · spine 3.1 mm (0.12 in). This cover was made before the paper was set to C2S 120: the pages on C2S 120 matte stack to about 2.6 mm (0.10 in)');
    files.store.set('o-45-cover.pdf', cover(45, { spineIn: spineForLeaf(45, 'softcover', 0.12 / 25.4) }));
    expect(await downloadCoverSheet({ ...order, material: 'glossy' })).toBe(
      'Cover sheet: print one side only · spine 2.8 mm (0.11 in). This cover was made before the paper was set to C2S 120: the pages on C2S 120 glossy stack to about 2.4 mm (0.09 in)');
  });

  it('a cover file for another page count is still refused', async () => {
    files.store.set('o-45-cover.pdf', cover(120));
    await expect(downloadCoverSheet(order)).rejects.toThrow(/should be .* Check the page count\.$/);
  });

  it('the zip\'s how-to says the spine with the cover', async () => {
    files.store.set('o-45.pdf', album(45));
    files.store.set('o-45-cover.pdf', cover(45));
    await downloadSheetsAsJpeg(order);
    await settle();
    const howTo = new TextDecoder().decode(readZip(saved.at(-1)!.bytes).at(-1)!.data);
    expect(howTo).toContain('the dashed marks are the spine edges (spine 2.6 mm (0.10 in)).');
  });

  it('the console shows it on every order', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../pages/admin/OrdersPanel.tsx'), 'utf8');
    expect(src).toContain('<span data-testid="order-spine">{orderSpine(o)}</span>');
  });
});

/* BLANK SIDES (owner, 2026-10-21: the console said "the first side is blank"
   for every order, but since page 1 became a right-hand page that's only true
   for print files made before then). Each order's note says which. */
describe('which sides are blank, per order', () => {
  it('new orders start with page 1; an odd page count ends on a blank side', () => {
    expect(blankSidesNote(45, 'right')).toBe('Page 1 is the first side; the last side is blank');
    expect(blankSidesNote(40, 'right')).toBe('Page 1 is the first side');
  });
  it('older orders start with a blank side; an even page count ends on one too', () => {
    expect(blankSidesNote(40, 'left')).toBe('The first side is blank (an older order: it faces the inside of the front cover); the last side is blank too');
    expect(blankSidesNote(45, 'left')).toBe('The first side is blank (an older order: it faces the inside of the front cover)');
  });
  it('the how-to in the zip says it', () => {
    expect(jpegHowTo(order, 12, 2, SPINE, blankSidesNote(45, 'right'))).toContain('Page 1 is the first side; the last side is blank.');
  });
  it('the console\'s "How to print" no longer says every first side is blank', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../pages/admin/OrdersPanel.tsx'), 'utf8');
    expect(src).not.toContain('The first side is blank on purpose');
    expect(src).toContain('orders from 21 Oct 2026 start with page 1');
    expect(src).toContain('Older orders start with a blank side');
  });
});
