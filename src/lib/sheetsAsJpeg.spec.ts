// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { PAGE_ONE_RIGHT_MARK } from '../pages/builder/binding';
import { coverWrapGeometry } from '../pages/builder/coverGeometry';
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

import { blankSidesNote, downloadSheetsAsJpeg, jpegHowTo } from './pressSheetFiles';

function album(n: number): ArrayBuffer {
  const doc = new jsPDF({ unit: 'in', format: [8.25, 8.25], compress: true });
  doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });
  for (let i = 0; i < n; i++) { if (i) doc.addPage([8.25, 8.25]); doc.setFillColor(90, 120, 150); doc.rect(0, 0, 8.25, 8.25, 'F'); }
  return doc.output('arraybuffer');
}
function cover(pages: number): ArrayBuffer {
  const g = coverWrapGeometry('8x8', pages, 'softcover');
  const doc = new jsPDF({ unit: 'in', format: [g.wrap.wIn, g.wrap.hIn], orientation: 'landscape', compress: true });
  doc.rect(0, 0, g.wrap.wIn, g.wrap.hIn, 'F');
  return doc.output('arraybuffer');
}

const order = { id: 'o-45', copy_of_order_id: null, order_number: 'MP-2026-0045', album_size: '8x8', cover: 'softcover', page_count: 45 } as const;
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
    const sides = entries.filter((e) => /-sheet-\d\d-(front|back)\.jpg$/.test(e.name));
    expect(sides).toHaveLength(24);
    expect(sides.slice(0, 3).map((e) => e.name)).toEqual(['MP-2026-0045-sheet-01-front.jpg', 'MP-2026-0045-sheet-01-back.jpg', 'MP-2026-0045-sheet-02-front.jpg']);
    expect(entries.at(-2)!.name).toBe('MP-2026-0045-cover.jpg');
    expect(entries.at(-1)!.name).toBe('HOW-TO-PRINT.txt');
    for (const e of entries.filter((x) => x.name.endsWith('.jpg'))) expect(jpegDpi(e.data)).toBe(300);
    // The sheet PDF drawn is the press-sheet file (24 sides), then the cover sheet (1).
    expect(files.drawnPages).toEqual([24, 1]);
    expect(new TextDecoder().decode(entries.at(-1)!.data)).toBe(jpegHowTo(order, 12, 2, true, 'Page 1 is the first side; the last side is blank'));
    expect(note).toBe('JPEG: 24 sheet sides and the cover sheet, 300 DPI · 12 sheets, both sides · cut into 2 piles, then stack pile 1 on top · Page 1 is the first side; the last side is blank');
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
    expect(note).toMatch(/No cover picture: The cover file isn't in storage for this order yet\.$/);
  });

  it('no print file: says so, and nothing is saved', async () => {
    await expect(downloadSheetsAsJpeg(order)).rejects.toThrow("The print file isn't in storage for this order yet.");
    expect(saved).toHaveLength(0);
  });

  it('the how-to says actual size, 300 DPI, the long-edge flip and the piles', () => {
    const t = jpegHowTo(order, 12, 4, true, blankSidesNote(45, 'right'));
    expect(t).toContain('12.5 x 19 in sheet at 300 DPI (3750 x 5700 pixels)');
    expect(t).toContain('Print at actual size (100%). Do not use "fit to page".');
    expect(t).toContain('flipping on the long edge');
    expect(t).toContain('into 4 piles');
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
    expect(jpegHowTo(order, 12, 2, true, blankSidesNote(45, 'right'))).toContain('Page 1 is the first side; the last side is blank.');
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
