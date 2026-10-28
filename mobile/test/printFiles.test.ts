/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the app makes an order's print files on the phone (Phase 5,
   src/print). The shop's printer refused files with fonts in them, a page
   box off by a hair cuts into a photo, a missing picture name in the zip
   leaves the press operator guessing, and a phone holds one page's photos at
   a time or runs out of memory. Each of those is held here, on a small album
   made headless with the very code the phone runs. (The whole-album check
   against the website's own files, pixel by pixel: printFiles.check.ts,
   npm run print:compare.)
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib';
import type { AlbumPage } from '@web/pages/builder/types';
import { PAGE_ONE_RIGHT_MARK } from '@web/pages/builder/binding';
import { pageSizeWithBleedIn } from '@web/pages/builder/bleedGeometry';
import { coverWrapGeometry } from '@web/pages/builder/coverGeometry';
import { sheetPlan } from '@web/pages/builder/printSheet';
import { sideJpegName, coverJpegName } from '@web/lib/pressSheetWords';
import { jpegDpi } from '@web/lib/jpegZip';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { makePrintFiles, NotDrawnError, PhotoNotOpenedError, type OpenPhoto, type PrintTools, type PrintAlbum } from '../src/print/printFiles';
import { SheetRaster } from '../src/print/sheetRaster';
import { savePrintFiles, printFileNames } from '../src/print/saveFiles';
import { headlessPrintTools, readStoredZip } from './print/headlessPrint';

let Sk: Skia;
let tools: PrintTools;

/** A plain test photo (no real photos): a colour field with a ring, drawn by Skia. */
function testPhoto(i: number, w = 900, h = 600): SkImage {
  const surface = Sk.Surface.Make(w, h)!;
  const c = surface.getCanvas();
  const p = Sk.Paint();
  p.setColor(Sk.Color(['#B85C38', '#1F75FE', '#3B7A57', '#926EAE'][i % 4]));
  c.drawRect(Sk.XYWHRect(0, 0, w, h), p);
  p.setColor(Sk.Color('#FFFBF7'));
  c.drawCircle(w / 2, h / 2, Math.min(w, h) / 4, p);
  surface.flush();
  const img = surface.makeImageSnapshot();
  surface.dispose();
  return img;
}

/** Opens photo i as a fresh picture, and counts what is still open. */
function opener(): OpenPhoto & { live: Set<SkImage>; opened: number } {
  const live = new Set<SkImage>();
  const open = (async (i: number) => {
    const img = testPhoto(i);
    const dispose = img.dispose.bind(img);
    img.dispose = () => { live.delete(img); dispose(); };
    live.add(img);
    open.opened++;
    return img;
  }) as OpenPhoto & { live: Set<SkImage>; opened: number };
  open.live = live;
  open.opened = 0;
  return open;
}

const page = (templateId: string, slotFills: number[], extra: Partial<AlbumPage> = {}): AlbumPage => ({
  id: `p-${templateId}-${slotFills.join('-')}`, layout: 'freeform', templateId, size: '6x4', slotFills, photos: [],
  background: { type: 'solid', solid: '#FFFFFF' }, textElements: [], ...extra,
});

const COVER: AlbumPage = {
  id: 'cover', layout: 'freeform', templateId: 'cover-hero', size: '6x4', slotFills: [1], photos: [],
  background: { type: 'solid', solid: '#1F3A5F' },
  textElements: [{
    id: 't', text: 'Lola turns 80', boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 1, fontSize: 32,
    fontFamily: '"Cinzel", Georgia, serif', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center',
  }],
};

function album(): PrintAlbum {
  // Two squares and a caption band below them.
  const captioned = 't64-fb-duo-sq-band-b';
  if (!getTemplateById(captioned)?.textSlots?.length) throw new Error(`${captioned} has no caption box any more: pick another`);
  return {
    albumSize: '6x4', photoCount: 4, coverFront: COVER,
    pages: [
      page('t64-fb-duo-tall-gap', [0, 1]),
      page(captioned, [2, 3], {
        textElements: [{
          id: 'c', text: 'Happy birthday, Lola!', boxIndex: 0, x: 0, y: 0, rotation: 0, opacity: 100, fontSize: 26,
          fontFamily: '"DM Sans", sans-serif', color: '#2D2D2D', bold: true, italic: false, underline: false, alignment: 'center',
        }],
      }),
      page('t64-duo-tall-framed', [1, 0]),
    ],
  };
}

const ORDER = { orderNumber: 'MP-UNIT-1', cover: 'softcover' as const, material: 'matte' as const };
const WHEN = new Date('2026-10-29T08:00:00');

/** Every page's font list (none, on a file with no fonts). */
async function fontLists(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().filter((p) => p.node.Resources()?.lookup(PDFName.of('Font')) instanceof PDFDict).length;
}

/** The see-through pictures in a file (the words and the labels). */
async function seeThrough(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  let n = 0;
  for (const [, o] of doc.context.enumerateIndirectObjects()) {
    if (o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') && o.dict.get(PDFName.of('SMask'))) n++;
  }
  return n;
}

let made: Awaited<ReturnType<typeof makePrintFiles>>;
let open: ReturnType<typeof opener>;

beforeAll(async () => {
  ({ Sk, tools } = await headlessPrintTools());
  open = opener();
  made = await makePrintFiles(album(), ORDER, open, tools, undefined, { when: WHEN });
}, 600_000);

describe('the print files the app makes', () => {
  it('opens each page’s photos just before it is drawn and lets every one go', () => {
    expect(open.opened).toBeGreaterThanOrEqual(7); // the cover's 1 and each page's own
    expect(open.live.size).toBe(0);
  });

  it('"<order>.pdf": one page per album page, trim plus bleed, page 1 marked as a right-hand page', async () => {
    const doc = await PDFDocument.load(made.interiorPdf);
    const { wIn, hIn } = pageSizeWithBleedIn(6, 4);
    expect(doc.getPageCount()).toBe(3);
    for (const p of doc.getPages()) {
      expect(p.getWidth()).toBeCloseTo(wIn * 72, 3);
      expect(p.getHeight()).toBeCloseTo(hIn * 72, 3);
    }
    expect(doc.getKeywords()).toContain(PAGE_ONE_RIGHT_MARK);
    expect(made.bakedWords).toBe(false);
    expect(await seeThrough(made.interiorPdf)).toBeGreaterThan(0); // the caption as a sharp 300 DPI picture
  });

  it('"<order>-cover.pdf": one page the size of the flat cover, with the back’s mark, the spine and the title on top', async () => {
    const doc = await PDFDocument.load(made.coverPdf!);
    const g = coverWrapGeometry('6x4', 3, 'softcover', { material: 'matte' });
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBeCloseTo(g.wrap.wIn * 72, 3);
    expect(doc.getPage(0).getHeight()).toBeCloseTo(g.wrap.hIn * 72, 3);
    // "Megy Prints", "megyprints.com", the front title, the spine title.
    expect(await seeThrough(made.coverPdf!)).toBe(4);
  });

  it('no file has a font in it (the shop’s printer refuses those)', async () => {
    for (const f of [made.interiorPdf, made.coverPdf!, made.sheetsPdf, made.coverSheetPdf!]) expect(await fontLists(f)).toBe(0);
  });

  it('the press sheets: the sheets the plan has, 12.5 × 19 in, and the cover sheet', async () => {
    const plan = sheetPlan('6x4', 3);
    const sheets = await PDFDocument.load(made.sheetsPdf);
    expect(sheets.getPageCount()).toBe(plan.sides.length);
    for (const p of sheets.getPages()) expect([p.getWidth(), p.getHeight()]).toEqual([12.5 * 72, 19 * 72]);
    expect((await PDFDocument.load(made.coverSheetPdf!)).getPageCount()).toBe(1);
    expect(made.notes.sheets).toMatch(/^1 sheets, both sides/);
  });

  it('"Sheets as JPEG": the sides in print order, then the cover, then the words; 300 DPI pictures', () => {
    const entries = readStoredZip(made.jpegZip);
    const plan = sheetPlan('6x4', 3);
    expect(entries.map((e) => e.name)).toEqual([
      ...plan.sides.map((s, i) => sideJpegName(ORDER.orderNumber, i + 1, plan.sides.length, s)),
      coverJpegName(ORDER.orderNumber),
      'HOW-TO-PRINT.txt',
    ]);
    for (const e of entries.filter((x) => x.name.endsWith('.jpg'))) {
      expect(jpegDpi(e.data)).toBe(300);
      const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(e.data))!;
      expect([img.width(), img.height()]).toEqual([3750, 5700]);
      img.dispose();
    }
    expect(made.notes.jpeg).toMatch(/^JPEG: 2 sheet sides and the cover sheet, 300 DPI/);
  });

  it('are written under the console’s names; a missing cover is left out', async () => {
    const folder = new Map<string, number>();
    const written = await savePrintFiles({ write: async (n, b) => { folder.set(n, b.length); } }, ORDER.orderNumber, { ...made, coverPdf: null, coverSheetPdf: null });
    const names = printFileNames(ORDER.orderNumber);
    expect(Object.keys(written)).toEqual([names.interior, names.sheets, names.jpegZip]);
    expect(names.interior).toBe('megyprints-MP-UNIT-1.pdf');
    expect([...folder.keys()]).toEqual(Object.keys(written));
  });
});

describe('when the app can’t make a file the website’s way', () => {
  it('past the upload budget, the words go into the page pictures (the website’s second pass)', async () => {
    const small = await makePrintFiles({ ...album(), coverFront: null }, ORDER, opener(), tools, undefined, { when: WHEN, budgetBytes: 1 });
    expect(small.bakedWords).toBe(true);
    expect(await seeThrough(small.interiorPdf)).toBe(0);
    expect(small.coverPdf).toBeNull();
    expect(small.coverMissing).toBe('This album has no front cover page.');
  }, 600_000);

  it('a page with something the app does not draw stops it, naming the page', async () => {
    const a = album();
    a.pages[2] = { ...a.pages[2], stickers: [{ uid: 's', geom: { cx: 0.5, cy: 0.5, w: 0.2, h: 0.2 } }] } as unknown as AlbumPage;
    await expect(makePrintFiles(a, ORDER, opener(), tools)).rejects.toThrow(NotDrawnError);
    await expect(makePrintFiles(a, ORDER, opener(), tools)).rejects.toThrow(/page 3 has stickers/);
  });

  it('a photo that can’t be opened stops it, naming the photo and the page', async () => {
    const none: OpenPhoto = async () => null;
    await expect(makePrintFiles({ ...album(), coverFront: null }, ORDER, none, tools)).rejects.toThrow(PhotoNotOpenedError);
    await expect(makePrintFiles({ ...album(), coverFront: null }, ORDER, none, tools)).rejects.toThrow('Photo 1 on page 1 can\'t be opened on this phone.');
  });

  it('the sheet drawer refuses a PDF with something it does not draw (written text) instead of leaving it out', async () => {
    const doc = await PDFDocument.create();
    const pg = doc.addPage([200, 200]);
    pg.drawText('hello', { x: 10, y: 10, font: await doc.embedFont(StandardFonts.Helvetica) });
    await expect(new SheetRaster(Sk).toJpegs(await doc.save(), { dpi: 72, quality: 90 })).rejects.toThrow(/sheetRaster/);
  });
});
