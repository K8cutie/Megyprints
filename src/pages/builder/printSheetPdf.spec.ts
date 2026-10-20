import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFDict, PDFName, PDFString, degrees, rgb } from 'pdf-lib';
import jsPDF from 'jspdf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumSizePreset, CoverType } from './types';
import { trimInches, sheetPlan } from './printSheet';
import { coverWrapGeometry } from './coverGeometry';
import { imposeAlbumSheets, imposeCoverSheet, pressTestSheet, printFilePageOne, MAX_PRINT_PAGES, MAX_PRINT_FILE_BYTES } from './printSheetPdf';
import { PAGE_ONE_RIGHT_MARK } from './binding';

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
  it('lays a 40-page 6x6 album on 7 sheets: 14 pages of 12.5 × 19 in, front then back', async () => {
    const { bytes, plan, sourceBleedIn } = await imposeAlbumSheets(await albumPdf('6x6', 40), '6x6', 'MP-TEST');
    expect(sourceBleedIn).toBe(0.125);
    expect(plan.sheets).toBe(7);
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(14);
    for (const p of out.getPages()) {
      expect(p.getWidth()).toBeCloseTo(12.5 * 72, 6);
      expect(p.getHeight()).toBeCloseTo(19 * 72, 6);
    }
  });

  it('takes an older print file with no trim edge', async () => {
    const { sourceBleedIn, plan } = await imposeAlbumSheets(await albumPdf('8x8', 40, 0), '8x8', 'MP-OLD');
    expect(sourceBleedIn).toBe(0);
    expect(plan).toEqual(sheetPlan('8x8', 40, 'left'));
  });

  it('a file the checkout marked puts page 1 on the first leaf\'s front; an unmarked (older) file keeps its blank first side', async () => {
    const marked = await imposeAlbumSheets(await albumPdf('8x8', 40, 0.125, true), '8x8', 'MP-NEW');
    expect(marked.pageOne).toBe('right');
    expect(marked.plan).toEqual(sheetPlan('8x8', 40, 'right'));
    expect(marked.plan.sides[0].placements[0].page).toBe(0);
    expect(marked.plan.sheets).toBe(10);
    const old = await imposeAlbumSheets(await albumPdf('8x8', 40), '8x8', 'MP-OLD');
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
    // …and the checkout's print file really writes it, before any page goes in.
    const src = readFileSync(resolve(__dirname, 'generateAlbumPdf.ts'), 'utf8');
    const album = src.slice(src.indexOf('export async function generateAlbumPdf('), src.indexOf('export async function generateCoverWrapPdf('));
    const mark = album.indexOf('doc.setProperties({ keywords: PAGE_ONE_RIGHT_MARK });');
    expect(mark).toBeGreaterThan(album.indexOf('new jsPDF('));
    expect(mark).toBeLessThan(album.indexOf('doc.addImage('));
  });

  it('turns pages for the sizes that fit more sideways (6x4: 12 a sheet)', async () => {
    const { plan, bytes } = await imposeAlbumSheets(await albumPdf('6x4', 40), '6x4', 'MP-TURN');
    expect(plan.layout.rotated).toBe(true);
    expect(plan.layout.pagesPerSheet).toBe(12);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2 * plan.sheets);
  });

  it('refuses a print file with more pages than any album (it comes from the customer\'s device)', async () => {
    await expect(imposeAlbumSheets(await albumPdf('6x6', MAX_PRINT_PAGES + 1), '6x6', 'MP-BIG')).rejects.toThrow(/more than any album/);
  });

  it('refuses a file bigger than any album before reading it', async () => {
    const huge = new Uint8Array(8);
    Object.defineProperty(huge, 'byteLength', { value: MAX_PRINT_FILE_BYTES + 1 });
    await expect(imposeAlbumSheets(huge, '6x6', 'MP-HUGE')).rejects.toThrow(/bigger than any album/);
  });

  it('refuses pages our checkout never makes: turned, or with a shifted page box', async () => {
    const turned = await PDFDocument.load(await albumPdf('8x8', 40));
    turned.getPage(3).setRotation(degrees(90));
    await expect(imposeAlbumSheets(await turned.save(), '8x8', 'MP-T')).rejects.toThrow(/turned or shifted/);
    const shifted = await PDFDocument.load(await albumPdf('8x8', 40));
    shifted.getPage(0).setMediaBox(36, 36, 8.25 * 72, 8.25 * 72);
    await expect(imposeAlbumSheets(await shifted.save(), '8x8', 'MP-S')).rejects.toThrow(/turned or shifted/);
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
    const { bytes } = await imposeAlbumSheets(await doc.save(), '8x8', 'MP-JS');
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
    const { bytes } = await imposeAlbumSheets(src, '8x8', 'MP-SHARED');
    expect(bytes.byteLength).toBeLessThan(src.byteLength * 2);
  });

  it('refuses a print file that is not the order\'s album size, in words', async () => {
    await expect(imposeAlbumSheets(await albumPdf('8x8', 40), '6x6', 'MP-X')).rejects.toThrow(/not 6x6 pages/);
  });

  it('puts a fitting cover on one sheet and refuses a 9x9 hardbound one', async () => {
    const soft = await imposeCoverSheet(await coverPdf('8x8', 'softcover', 40), '8x8', 'softcover', 40, 'MP-C');
    const doc = await PDFDocument.load(soft.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(12.5 * 72, 6);
    await expect(imposeCoverSheet(await coverPdf('9x9', 'hardboundLeather', 40), '9x9', 'hardboundLeather', 40, 'MP-9'))
      .rejects.toThrow(/longer than the 19 in paper/);
  });

  it('says when the cover file was made for a different page count', async () => {
    await expect(imposeCoverSheet(await coverPdf('8x8', 'hardboundLeather', 200), '8x8', 'hardboundLeather', 40, 'MP-S'))
      .rejects.toThrow(/Check the page count/);
  });

  it('makes a two-sided test sheet', async () => {
    const doc = await PDFDocument.load(await pressTestSheet());
    expect(doc.getPageCount()).toBe(2);
  });
});
