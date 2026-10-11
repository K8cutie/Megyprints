import { describe, it, expect } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import type { AlbumSizePreset, CoverType } from './types';
import { trimInches, sheetPlan } from './printSheet';
import { coverWrapGeometry } from './coverGeometry';
import { imposeAlbumSheets, imposeCoverSheet, pressTestSheet, MAX_PRINT_PAGES } from './printSheetPdf';

/** A stand-in for the checkout's print file: `n` pages of trim + `bleed`. */
async function albumPdf(size: AlbumSizePreset, n: number, bleed = 0.125): Promise<Uint8Array> {
  const { trimW, trimH } = trimInches(size);
  const doc = await PDFDocument.create();
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
    expect(plan).toEqual(sheetPlan('8x8', 40));
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
