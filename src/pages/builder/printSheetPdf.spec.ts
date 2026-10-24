import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFDict, PDFName, PDFString, StandardFonts, degrees, rgb } from 'pdf-lib';
import jsPDF from 'jspdf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumSizePreset, CoverType } from './types';
import { trimInches, sheetPlan } from './printSheet';
import { coverWrapGeometry } from './coverGeometry';
import { imposeAlbumSheets, imposeCoverSheet, pressTestSheet, printFilePageOne, cleanPrintFile, MAX_PRINT_PAGES, MAX_PRINT_FILE_BYTES, PIECE_NUMBER, type TextPainter } from './printSheetPdf';
import { PAGE_ONE_RIGHT_MARK } from './binding';

/** Words as pictures, as the console draws them (canvasTextPainter needs a
 *  browser): a 1 × 1 PNG, half a point wide per letter. */
const PNG_1x1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const drawn: string[] = [];
const T: TextPainter = {
  width: (t, s) => t.length * s * 0.5,
  png: (t, s) => { drawn.push(t); return { bytes: PNG_1x1, wPt: t.length * s * 0.5, hPt: s * 1.2, descentPt: s * 0.2 }; },
};

/** Font objects anywhere in the file, and pages that list fonts. */
async function fontsIn(bytes: Uint8Array | ArrayBuffer): Promise<{ objects: number; pagesListing: number }> {
  const doc = await PDFDocument.load(bytes);
  const objects = doc.context.enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFDict && o.get(PDFName.of('Type')) === PDFName.of('Font')).length;
  const pagesListing = doc.getPages().filter((p) => p.node.Resources()?.get(PDFName.of('Font'))).length;
  return { objects, pagesListing };
}

/** A print file made the way the checkout makes one: jsPDF, one picture a
 *  page (a filled box stands in), page-1 mark. jsPDF lists its 14 standard
 *  fonts on every page whether or not anything is written. */
function jsPdfAlbum(size: AlbumSizePreset, n: number): ArrayBuffer {
  const { trimW, trimH } = trimInches(size);
  const w = trimW + 0.25, h = trimH + 0.25;
  const doc = new jsPDF({ unit: 'in', format: [w, h], orientation: w >= h ? 'landscape' : 'portrait', compress: true });
  doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });
  for (let i = 0; i < n; i++) {
    if (i > 0) doc.addPage([w, h], w >= h ? 'landscape' : 'portrait');
    doc.setFillColor(40 + i * 4, 120, 160);
    doc.rect(0, 0, w, h, 'F');
  }
  return doc.output('arraybuffer');
}
function jsPdfCover(size: AlbumSizePreset, cover: CoverType, pages: number): ArrayBuffer {
  const g = coverWrapGeometry(size, pages, cover);
  const doc = new jsPDF({ unit: 'in', format: [g.wrap.wIn, g.wrap.hIn], orientation: 'landscape', compress: true });
  doc.setFillColor(180, 100, 80);
  doc.rect(0, 0, g.wrap.wIn, g.wrap.hIn, 'F');
  return doc.output('arraybuffer');
}

/** A stand-in for the checkout's print file: `n` pages of trim + `bleed`.
 *  `marked` = made since page 1 became a right-hand page (the checkout's mark). */
async function albumPdf(size: AlbumSizePreset, n: number, bleed = 0.125, marked = false): Promise<Uint8Array> {
  const { trimW, trimH } = trimInches(size);
  const doc = await PDFDocument.create();
  if (marked) doc.setKeywords([PAGE_ONE_RIGHT_MARK]);
  for (let i = 0; i < n; i++) {
    const p = doc.addPage([(trimW + 2 * bleed) * 72, (trimH + 2 * bleed) * 72]);
    p.drawRectangle({ x: 0, y: 0, width: p.getWidth(), height: p.getHeight(), color: rgb((i % 7) / 7, 0.5, 0.5) });
  }
  return doc.save();
}

async function coverPdf(size: AlbumSizePreset, cover: CoverType, pages: number): Promise<Uint8Array> {
  const g = coverWrapGeometry(size, pages, cover);
  const doc = await PDFDocument.create();
  const p = doc.addPage([g.wrap.wIn * 72, g.wrap.hIn * 72]);
  p.drawRectangle({ x: 0, y: 0, width: p.getWidth(), height: p.getHeight(), color: rgb(0.7, 0.4, 0.3) });
  return doc.save();
}

describe('press sheet PDFs', () => {
  /* Owner, 2026-10-24: "once its cut the order of pages gets jumbled. Is it
     possible to put a number on the bleed or the binding side like 1, 2, 3". */
  it('numbers every piece 1, 2, 3… through the book, small and grey, once each', async () => {
    for (const [size, pages, leaves] of [['6x6', 40, 20], ['6x4', 41, 21], ['8x8', 45, 23]] as const) {
      drawn.length = 0;
      const { plan } = await imposeAlbumSheets(await albumPdf(size, pages, 0.125, true), size, 'MP-NUM', T);
      expect(plan.leaves, size).toBe(leaves);
      const numbers = drawn.filter((t) => /^\d+$/.test(t)).map(Number).sort((a, b) => a - b);
      expect(numbers, size).toEqual(Array.from({ length: leaves }, (_, i) => i + 1));
    }
    expect(PIECE_NUMBER).toEqual({ pt: 6, color: '#7A7A7A', fromSpineIn: 0.03 });
    // Inside the first 1/8" of the binding side: the strip that goes into the glue.
    expect(PIECE_NUMBER.fromSpineIn + PIECE_NUMBER.pt / 72).toBeLessThanOrEqual(0.125);
  });

  it('an older file (blank first side) numbers its pieces the same way: the blank-fronted piece is 1', async () => {
    drawn.length = 0;
    const { plan } = await imposeAlbumSheets(await albumPdf('8x8', 40), '8x8', 'MP-OLD', T);
    expect(plan.leaves).toBe(21);
    expect(drawn.filter((t) => /^\d+$/.test(t)).map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it('lays a 40-page 6x6 album on 4 sheets (12 pages a sheet): 8 pages of 12.5 × 19 in, front then back', async () => {
    const { bytes, plan, sourceBleedIn } = await imposeAlbumSheets(await albumPdf('6x6', 40), '6x6', 'MP-TEST', T);
    expect(sourceBleedIn).toBe(0.125);
    expect(plan.sheets).toBe(4);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(8);
    for (const p of out.getPages()) {
      expect(p.getWidth()).toBeCloseTo(12.5 * 72, 6);
      expect(p.getHeight()).toBeCloseTo(19 * 72, 6);
    }
  });

  it('takes an older print file with no trim edge', async () => {
    const { sourceBleedIn, plan } = await imposeAlbumSheets(await albumPdf('8x8', 40, 0), '8x8', 'MP-OLD', T);
    expect(sourceBleedIn).toBe(0);
    expect(plan).toEqual(sheetPlan('8x8', 40, 'left'));
  });

  it('a file the checkout marked puts page 1 on the first leaf\'s front; an unmarked (older) file keeps its blank first side', async () => {
    const marked = await imposeAlbumSheets(await albumPdf('8x8', 40, 0.125, true), '8x8', 'MP-NEW', T);
    expect(marked.pageOne).toBe('right');
    expect(marked.plan).toEqual(sheetPlan('8x8', 40, 'right'));
    expect(marked.plan.sides[0].placements[0].page).toBe(0);
    expect(marked.plan.sheets).toBe(10);
    const old = await imposeAlbumSheets(await albumPdf('8x8', 40), '8x8', 'MP-OLD', T);
    expect(old.pageOne).toBe('left');
    expect(old.plan.sides[0].placements[0].page).toBeNull();
    expect(old.plan.sheets).toBe(11);
  });

  it('the mark the checkout writes (jsPDF keywords) is the mark the console reads', async () => {
    const made = new jsPDF({ unit: 'in', format: [8.25, 8.25] });
    made.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });
    expect(printFilePageOne(await PDFDocument.load(made.output('arraybuffer')))).toBe('right');
    const plain = new jsPDF({ unit: 'in', format: [8.25, 8.25] });
    expect(printFilePageOne(await PDFDocument.load(plain.output('arraybuffer')))).toBe('left');
    // Keywords that aren't text (no file of ours) read as unmarked, not a crash.
    const odd = await PDFDocument.create();
    odd.addPage([8.25 * 72, 8.25 * 72]);
    odd.context.lookup(odd.context.trailerInfo.Info, PDFDict).set(PDFName.of('Keywords'), odd.context.obj(42));
    expect(printFilePageOne(odd)).toBe('left');
    // …and the checkout's print file really writes it, before any page goes in.
    const src = readFileSync(resolve(__dirname, 'generateAlbumPdf.ts'), 'utf8');
    const album = src.slice(src.indexOf('export async function generateAlbumPdf('), src.indexOf('export async function generateCoverWrapPdf('));
    const mark = album.indexOf('doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });');
    expect(mark).toBeGreaterThan(album.indexOf('new jsPDF('));
    expect(mark).toBeLessThan(album.indexOf('doc.addImage('));
  });

  it('turns pages for the sizes that fit more sideways (6x4: 18 a sheet, 3 × 3 touching)', async () => {
    const { plan, bytes } = await imposeAlbumSheets(await albumPdf('6x4', 40), '6x4', 'MP-TURN', T);
    expect(plan.layout.rotated).toBe(true);
    expect(plan.layout.pagesPerSheet).toBe(18);
    expect(plan.sheets).toBe(3);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2 * plan.sheets);
  });

  it('refuses a print file with more pages than any album (it comes from the customer\'s device)', async () => {
    await expect(imposeAlbumSheets(await albumPdf('6x6', MAX_PRINT_PAGES + 1), '6x6', 'MP-BIG', T)).rejects.toThrow(/more than any album/);
  });

  it('refuses a file bigger than any album before reading it', async () => {
    const huge = new Uint8Array(8);
    Object.defineProperty(huge, 'byteLength', { value: MAX_PRINT_FILE_BYTES + 1 });
    await expect(imposeAlbumSheets(huge, '6x6', 'MP-HUGE', T)).rejects.toThrow(/bigger than any album/);
  });

  it('refuses pages our checkout never makes: turned, or with a shifted page box', async () => {
    const turned = await PDFDocument.load(await albumPdf('8x8', 40));
    turned.getPage(3).setRotation(degrees(90));
    await expect(imposeAlbumSheets(await turned.save(), '8x8', 'MP-T', T)).rejects.toThrow(/turned or shifted/);
    const shifted = await PDFDocument.load(await albumPdf('8x8', 40));
    shifted.getPage(0).setMediaBox(36, 36, 8.25 * 72, 8.25 * 72);
    await expect(imposeAlbumSheets(await shifted.save(), '8x8', 'MP-S', T)).rejects.toThrow(/turned or shifted/);
  });

  it('carries no links or scripts from a page onto the sheets', async () => {
    const doc = await PDFDocument.load(await albumPdf('8x8', 40));
    const ctx = doc.context;
    // As real files hold them: separate objects the page points to.
    const action = ctx.register(ctx.obj({ S: 'JavaScript', JS: PDFString.of('app.alert(1)') }));
    for (const p of doc.getPages()) {
      const link = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Link', Rect: [0, 0, 50, 50], A: action, P: p.ref }));
      p.node.set(PDFName.of('Annots'), ctx.obj([link]));
      p.node.set(PDFName.of('AA'), ctx.obj({ O: action }));
    }
    const { bytes } = await imposeAlbumSheets(await doc.save(), '8x8', 'MP-JS', T);
    const out = await PDFDocument.load(bytes);
    const objects = out.context.enumerateIndirectObjects().map(([, o]) => o);
    expect(objects.some((o) => o instanceof PDFDict && o.get(PDFName.of('S'))?.toString() === '/JavaScript')).toBe(false);
    // (Every new sheet page carries an empty /Annots of its own; no link may land in one.)
    expect(objects.some((o) => o instanceof PDFDict && o.get(PDFName.of('Type'))?.toString() === '/Annot')).toBe(false);
  });

  it('copies a picture all pages share once, not once per page', async () => {
    // A hostile file: one 1 MB stream drawn on all 40 pages.
    const doc = await PDFDocument.create();
    const shared = doc.context.register(doc.context.stream(new Uint8Array(1024 * 1024).map((_, i) => (i * 7919) % 251)));
    for (let i = 0; i < 40; i++) {
      const p = doc.addPage([8.25 * 72, 8.25 * 72]);
      p.drawRectangle({ x: 0, y: 0, width: 10, height: 10, color: rgb(0.5, 0.5, 0.5) });
      p.node.normalizedEntries().Resources.set(PDFName.of('Junk'), shared);
    }
    const src = await doc.save();
    const { bytes } = await imposeAlbumSheets(src, '8x8', 'MP-SHARED', T);
    expect(bytes.byteLength).toBeLessThan(src.byteLength * 2);
  });

  it('refuses a print file that is not the order\'s album size, in words', async () => {
    await expect(imposeAlbumSheets(await albumPdf('8x8', 40), '6x6', 'MP-X', T)).rejects.toThrow(/not 6x6 pages/);
  });

  it('puts a fitting cover on one sheet and refuses an 8.5x11 hardbound one', async () => {
    const soft = await imposeCoverSheet(await coverPdf('8x8', 'softcover', 40), '8x8', 'softcover', 40, 'MP-C', T);
    const doc = await PDFDocument.load(soft.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(12.5 * 72, 6);
    await expect(imposeCoverSheet(await coverPdf('8.5x11', 'hardboundLeather', 40), '8.5x11', 'hardboundLeather', 40, 'MP-9', T))
      .rejects.toThrow(/longer than the 19 in paper/);
  });

  it('says when the cover file was made for a different page count', async () => {
    await expect(imposeCoverSheet(await coverPdf('8x8', 'hardboundLeather', 200), '8x8', 'hardboundLeather', 40, 'MP-S', T))
      .rejects.toThrow(/Check the page count/);
  });

  it('makes a two-sided test sheet', async () => {
    const doc = await PDFDocument.load(await pressTestSheet(T));
    expect(doc.getPageCount()).toBe(2);
  });
});

/* NO FONTS (the shop's printer, 2026-10-21: "the font is not available"; he
   asked for the files flat). Nothing the console hands out may name a font. */
describe('no file from the console has a font', () => {
  it('the checkout\'s kind of file really lists 14 unused fonts (the problem)', async () => {
    expect(await fontsIn(jsPdfAlbum('8x8', 3))).toEqual({ objects: 14, pagesListing: 3 });
  });

  it('Print sheets: none from the customer\'s pages, none for the labels', async () => {
    drawn.length = 0;
    const { bytes, plan } = await imposeAlbumSheets(jsPdfAlbum('8x8', 45), '8x8', 'MP-2026-0045', T);
    expect(plan.pageCount).toBe(45);
    expect(await fontsIn(bytes)).toEqual({ objects: 0, pagesListing: 0 });
    // The labels are still there, as pictures: the sheet name and each spot's pages.
    expect(drawn).toContain(`MP-2026-0045 · sheet 1 of ${plan.sheets} · front`);
    expect(drawn).toContain('pages 1–2');
    expect(drawn).toContain('page 45');
    // Each picture goes in the file once, however many sheets show it (a
    // picture with see-through edges is two objects: it and its mask).
    const doc = await PDFDocument.load(bytes);
    const pictures = doc.context.enumerateIndirectObjects().filter(([, o]) => {
      const d = (o as { dict?: PDFDict }).dict;
      return d?.get(PDFName.of('Subtype')) === PDFName.of('Image') && d.has(PDFName.of('SMask'));
    });
    expect(pictures.length).toBe(new Set(drawn).size);
  });

  it('Cover sheet and the printer test sheet: none', async () => {
    const cover = await imposeCoverSheet(jsPdfCover('8x8', 'softcover', 40), '8x8', 'softcover', 40, 'MP-C', T);
    expect(await fontsIn(cover.bytes)).toEqual({ objects: 0, pagesListing: 0 });
    expect(await fontsIn(await pressTestSheet(T))).toEqual({ objects: 0, pagesListing: 0 });
  });

  it('Print PDF / Cover PDF: the same pages, no fonts, the page-1 mark kept', async () => {
    const album = await cleanPrintFile(jsPdfAlbum('8x8', 45), 'print file');
    expect(await fontsIn(album)).toEqual({ objects: 0, pagesListing: 0 });
    const doc = await PDFDocument.load(album);
    expect(doc.getPageCount()).toBe(45);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(8.25 * 72, 6);
    expect(printFilePageOne(doc)).toBe('right');
    // The cleaned file still lays out on the sheets as before.
    const sheets = await imposeAlbumSheets(album, '8x8', 'MP-AGAIN', T);
    expect(sheets.plan).toEqual(sheetPlan('8x8', 45, 'right'));
    expect(await fontsIn(await cleanPrintFile(jsPdfCover('8x8', 'softcover', 45), 'cover file'))).toEqual({ objects: 0, pagesListing: 0 });
  });

  it('a page that writes text keeps its fonts (a file our checkout never makes)', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([8.25 * 72, 8.25 * 72]);
    p.drawText('Hello', { x: 72, y: 72, size: 24, font });
    const kept = await fontsIn(await cleanPrintFile(await doc.save(), 'print file'));
    expect(kept.objects).toBe(1);
    expect(kept.pagesListing).toBe(1);
  });
});
