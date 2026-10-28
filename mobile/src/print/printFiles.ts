/* ══════════════════════════════════════════════════════════════════════════
   THE PRINT FILES, MADE BY THE APP (Phase 5 of docs/mobile-port-plan.md).

   What the website makes for an order, made on the phone from the album:
     • "<order>.pdf"        the checkout's interior file (website:
                            generateAlbumPdf at checkout, on the customer's
                            phone): pagePicture.ts + printPdf.ts, with the
                            website's numbers and budget rule (printFileSpec);
     • "<order>-cover.pdf"  the checkout's flat cover (website:
                            generateCoverWrapPdf, also at checkout):
                            coverWrap.ts;
     • the press sheets     what the console makes from those two files on
                            the operator's click (printSheetPdf.ts, the very
                            same code, shared): the album's sheets and the
                            cover sheet, with no fonts;
     • "Sheets as JPEG"     the console's zip (pressSheetZip.ts, shared): the
                            sheets drawn by sheetRaster.ts (Skia) where the
                            console uses pdf.js.
   Nothing is uploaded here (saveFiles.ts writes them to the app's folder).

   One page at a time: a page's photos are opened full size just before it
   is drawn and let go right after, so a 100-page album needs no more memory
   than its biggest page. A page holding something the app does not draw yet
   (PagePlan.notDrawn), or a photo that can't be opened, stops it with the
   page named: the app never prints a page without a part the customer put
   on it.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverType, MaterialType } from '@web/pages/builder/types';
import { bindingInchesFor } from '@web/pages/builder/binding';
import { PRINT_FILE_BUDGET_BYTES } from '@web/pages/builder/printFileSpec';
import { imposeAlbumSheets, imposeCoverSheet } from '@web/pages/builder/printSheetPdf';
import { makeSheetsJpegZip, SHEET_JPEG_DPI, SHEET_JPEG_QUALITY, type SheetTools } from '@web/lib/pressSheetZip';
import { sheetsNote, coverSheetNote, type PressOrder } from '@web/lib/pressSheetWords';
import { planPage, type PagePlan } from '../render/pagePlan';
import type { PageDrawer, PhotoSource } from '../render/drawPage';
import type { PageText } from '../render/pageText';
import { PagePictures } from './pagePicture';
import { PrintPdf, interiorPageInches } from './printPdf';
import { SheetRaster } from './sheetRaster';
import { skiaTextPainter } from './textPainter';
import { coverFrontPlan, makeCoverPdf, type CoverInput } from './coverWrap';

export interface PrintAlbum {
  albumSize: AlbumSizePreset;
  pages: AlbumPage[];
  /** How many photos the album has (a page's photo index is below it). */
  photoCount: number;
  /** The front cover page (cover-as-pages). Without it there is no cover file. */
  coverFront?: AlbumPage | null;
}

export interface PrintOrderSpecs {
  orderNumber: string;
  cover: CoverType;
  material: MaterialType;
}

/** Opens one of the album's photos, full size, for printing (the caller of
 *  makePrintFiles decides how: a file on the phone, a test picture). Null:
 *  it can't be read. Every picture it gives is disposed by makePrintFiles. */
export type OpenPhoto = (photoIndex: number) => Promise<SkImage | null>;

export interface PrintTools {
  Skia: Skia;
  drawer: PageDrawer;
  text: PageText;
  /** Arimo regular and bold (textPainter.LABEL_FONT_FILES). */
  labelFonts: { regular: Uint8Array; bold: Uint8Array };
}

export type PrintStep =
  | { step: 'cover' }
  | { step: 'pages'; done: number; total: number; smaller: boolean }
  | { step: 'sheets' }
  | { step: 'jpeg'; line: string };

export interface PrintFiles {
  interiorPdf: Uint8Array;
  /** Null when the album has no front cover page (coverMissing says why). */
  coverPdf: Uint8Array | null;
  coverMissing: string | null;
  sheetsPdf: Uint8Array;
  /** Null when the cover isn't there or doesn't fit one sheet (coverSheetMissing says why). */
  coverSheetPdf: Uint8Array | null;
  coverSheetMissing: string | null;
  jpegZip: Uint8Array;
  /** The words were drawn into the page pictures: sharp words would have passed the budget. */
  bakedWords: boolean;
  notes: { sheets: string; coverSheet: string | null; jpeg: string };
  /** Milliseconds for each part. */
  ms: { cover: number; interior: number; sheets: number; jpeg: number; total: number };
}

/** Pages that hold something the app does not draw yet. */
export class NotDrawnError extends Error {
  constructor(readonly pages: { page: string; notDrawn: string[] }[]) {
    super(`The app can't make this album's print file yet: ${pages.map((p) => `${p.page} has ${p.notDrawn.join(', ')}`).join('; ')}.`);
    this.name = 'NotDrawnError';
  }
}

/** A photo a page needs could not be opened. */
export class PhotoNotOpenedError extends Error {
  constructor(readonly page: string, readonly photoIndex: number) {
    super(`Photo ${photoIndex + 1} on ${page} can't be opened on this phone.`);
    this.name = 'PhotoNotOpenedError';
  }
}

/** What the app cannot draw in this album: its pages, and its front cover. */
export function notDrawnPages(album: PrintAlbum, cover: CoverType): { page: string; notDrawn: string[] }[] {
  const bindingIn = bindingInchesFor(cover);
  const out = album.pages
    .map((page, i) => ({ page: `page ${i + 1}`, notDrawn: planPage({ page, albumSize: album.albumSize, pageIndex: i, photoCount: album.photoCount, bindingIn }).notDrawn }))
    .filter((p) => p.notDrawn.length > 0);
  if (album.coverFront) {
    const notDrawn = coverFrontPlan({ albumSize: album.albumSize, coverFront: album.coverFront, photoCount: album.photoCount }).notDrawn;
    if (notDrawn.length) out.unshift({ page: 'the cover', notDrawn });
  }
  return out;
}

/** The photos a planned page draws. */
export function photosOf(plan: PagePlan): number[] {
  const set = new Set<number>();
  for (const it of plan.items) if (it.kind === 'photo' || it.kind === 'boxPhoto') set.add(it.photoIndex);
  return [...set];
}

/** Run `draw` with the page's photos open, and let them all go after it. */
async function withPhotos<T>(plan: PagePlan, open: OpenPhoto, page: string, draw: (photos: PhotoSource) => T | Promise<T>): Promise<T> {
  const opened = new Map<number, SkImage>();
  try {
    for (const i of photosOf(plan)) {
      const img = await open(i);
      if (!img) throw new PhotoNotOpenedError(page, i);
      opened.set(i, img);
    }
    return await draw((i) => opened.get(i) ?? null);
  } finally {
    opened.forEach((img) => img.dispose());
  }
}

/** Lets the phone breathe (and a progress bar move) between pages. */
const breathe = () => new Promise((r) => setTimeout(r, 0));

export async function makePrintFiles(
  album: PrintAlbum,
  order: PrintOrderSpecs,
  open: OpenPhoto,
  tools: PrintTools,
  onStep: (s: PrintStep) => void = () => {},
  opts: { when?: Date; budgetBytes?: number } = {},
): Promise<PrintFiles> {
  const t0 = Date.now();
  const { Skia } = tools;
  if (!album.pages.length) throw new Error('Album has no pages to export.');
  const missing = notDrawnPages(album, order.cover);
  if (missing.length) throw new NotDrawnError(missing);
  const pictures = new PagePictures(Skia, tools.drawer);
  const bindingIn = bindingInchesFor(order.cover);

  // 1. The cover first, as at checkout: while the phone has the most memory free.
  onStep({ step: 'cover' });
  let coverPdf: Uint8Array | null = null;
  let coverMissing: string | null = null;
  if (album.coverFront) {
    const input: CoverInput = {
      albumSize: album.albumSize, pageCount: album.pages.length, cover: order.cover, material: order.material,
      coverFront: album.coverFront, photoCount: album.photoCount,
    };
    const plan = coverFrontPlan(input);
    coverPdf = await withPhotos(plan, open, 'the cover', (photos) => makeCoverPdf(input, photos, tools, pictures));
  } else {
    coverMissing = 'This album has no front cover page.';
  }
  const tCover = Date.now();

  // 2. The interior, page by page; past the budget with sharp words, again
  //    with the words in the pictures (generateAlbumPdf's rule).
  const { wIn, hIn } = interiorPageInches(album.albumSize);
  const build = async (bake: boolean): Promise<{ bytes: Uint8Array; anyWords: boolean }> => {
    const pdf = await PrintPdf.create({ pageOneRight: true });
    let anyWords = false;
    for (let i = 0; i < album.pages.length; i++) {
      const plan = planPage({ page: album.pages[i], albumSize: album.albumSize, pageIndex: i, photoCount: album.photoCount, bindingIn });
      const pic = await withPhotos(plan, open, `page ${i + 1}`, (photos) => pictures.interiorPage(plan, photos, { bakeWords: bake }));
      anyWords = anyWords || pic.words.length > 0;
      await pdf.addPage(pic, wIn, hIn);
      onStep({ step: 'pages', done: i + 1, total: album.pages.length, smaller: bake });
      await breathe();
    }
    return { bytes: await pdf.save(), anyWords };
  };
  const budget = opts.budgetBytes ?? PRINT_FILE_BUDGET_BYTES;
  let interior = await build(false);
  let bakedWords = false;
  if (interior.bytes.length > budget && interior.anyWords) {
    interior = await build(true);
    bakedWords = true;
  }
  const tInterior = Date.now();

  // 3. The press sheets, as the console lays them out (no fonts).
  onStep({ step: 'sheets' });
  const painter = skiaTextPainter(Skia, tools.labelFonts);
  const o: PressOrder = { order_number: order.orderNumber, album_size: album.albumSize, cover: order.cover, material: order.material, page_count: album.pages.length };
  const sheets = await imposeAlbumSheets(interior.bytes, album.albumSize, order.orderNumber, painter);
  let coverSheet: Awaited<ReturnType<typeof imposeCoverSheet>> | null = null;
  let coverSheetMissing: string | null = coverMissing;
  if (coverPdf) {
    try {
      coverSheet = await imposeCoverSheet(coverPdf, album.albumSize, order.cover, album.pages.length, order.orderNumber, painter, order.material);
    } catch (e) {
      coverSheetMissing = e instanceof Error ? e.message : String(e);
    }
  }
  const tSheets = Date.now();

  // 4. "Sheets as JPEG": the console's zip, the sheets drawn by Skia. The
  //    layouts above are handed in, so they are made once.
  const raster = new SheetRaster(Skia);
  const sheetTools: SheetTools = {
    imposeAlbumSheets: async () => sheets,
    imposeCoverSheet: async () => {
      if (!coverSheet) throw new Error(coverSheetMissing ?? 'The cover file could not be read.');
      return coverSheet;
    },
    toJpegs: (pdf, onPage) => raster.toJpegs(pdf, { dpi: SHEET_JPEG_DPI, quality: Math.round(SHEET_JPEG_QUALITY * 100), onPage }),
  };
  const { zip, note } = await makeSheetsJpegZip(
    o, interior.bytes,
    async () => { if (!coverPdf) throw new Error(coverMissing ?? 'The cover file could not be read.'); return coverPdf; },
    painter, sheetTools, (line) => onStep({ step: 'jpeg', line }), opts.when,
  );
  const tJpeg = Date.now();

  return {
    interiorPdf: interior.bytes,
    coverPdf, coverMissing,
    sheetsPdf: sheets.bytes,
    coverSheetPdf: coverSheet?.bytes ?? null,
    coverSheetMissing: coverSheet ? null : coverSheetMissing,
    jpegZip: zip,
    bakedWords,
    notes: { sheets: sheetsNote(o, sheets.plan, sheets.pageOne), coverSheet: coverSheet ? coverSheetNote(o, coverSheet.spineIn) : null, jpeg: note },
    ms: { cover: tCover - t0, interior: tInterior - tCover, sheets: tSheets - tInterior, jpeg: tJpeg - tSheets, total: tJpeg - t0 },
  };
}
