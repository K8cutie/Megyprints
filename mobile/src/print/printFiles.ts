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
   (PagePlan.notDrawn), a picture it names that the app can't have (a QR
   code, a sticker, a website file: PagePlan.assets), or a photo that can't
   be opened, stops it with the page named: the app never prints a page
   without a part the customer put on it.
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
import { AssetCache, dataUrlBytes } from '../render/assets';
import { photosDrawn, pictureNotDrawn } from '../builder/pageImages';
import { PagePictures } from './pagePicture';
import { PrintPdf, interiorPageInches } from './printPdf';
import { SheetRaster } from './sheetRaster';
import { skiaTextPainter } from './textPainter';
import { coverPhotos, coverPlanFor, makeCoverPdf, type CoverInput } from './coverWrap';

export interface PrintAlbum {
  albumSize: AlbumSizePreset;
  pages: AlbumPage[];
  /** How many photos the album has (a page's photo index is below it). */
  photoCount: number;
  /** The album's photo ids, in order (a picture background names its photo by id). */
  photoIds?: readonly string[];
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
  /** The bytes of a picture a page names that is not inside the album (a
   *  data: URL is): a website file such as a mask edge or a theme's corner
   *  art. Null when the app doesn't have it (the page is then not printed). */
  files?: (src: string) => Uint8Array | null;
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

/** An album page's plan for its print file. */
export function printPlan(album: PrintAlbum, i: number, bindingIn: number): PagePlan {
  return planPage({ page: album.pages[i], albumSize: album.albumSize, pageIndex: i, photoCount: album.photoCount, photoIds: album.photoIds, bindingIn });
}

/** What the app cannot draw on a page or the cover: what its plan lists,
 *  and each picture it names that the app can't have. */
function cannotDraw(plan: { notDrawn: string[]; assets: string[] }, files: (src: string) => Uint8Array | null): string[] {
  const out = [...plan.notDrawn];
  for (const src of plan.assets) {
    const has = typeof src === 'string' && !!src && (!!dataUrlBytes(src) || !!files(src));
    if (!has) out.push(pictureNotDrawn(src));
  }
  return out;
}

/** What the app cannot draw in this album: its pages, and its front cover. */
export function notDrawnPages(album: PrintAlbum, cover: CoverType, tools: Pick<PrintTools, 'text' | 'files'>, material: MaterialType = 'matte'): { page: string; notDrawn: string[] }[] {
  const files = tools.files ?? (() => null);
  const bindingIn = bindingInchesFor(cover);
  const out = album.pages
    .map((_, i) => ({ page: `page ${i + 1}`, notDrawn: cannotDraw(printPlan(album, i, bindingIn), files) }))
    .filter((p) => p.notDrawn.length > 0);
  if (album.coverFront) {
    const plan = coverPlanFor({ albumSize: album.albumSize, pageCount: album.pages.length, cover, material, coverFront: album.coverFront, photoCount: album.photoCount, photoIds: album.photoIds }, tools.text);
    const notDrawn = cannotDraw(plan, files);
    if (notDrawn.length) out.unshift({ page: 'the cover', notDrawn });
  }
  return out;
}

/** The photos a planned page draws (its photo background too). */
export function photosOf(plan: PagePlan): number[] {
  return photosDrawn(plan);
}

/** Run `draw` with photos `list` open, and let them all go after it. */
async function withPhotos<T>(list: readonly number[], open: OpenPhoto, page: string, draw: (photos: PhotoSource) => T | Promise<T>): Promise<T> {
  const opened = new Map<number, SkImage>();
  try {
    for (const i of list) {
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
  const missing = notDrawnPages(album, order.cover, tools, order.material);
  if (missing.length) throw new NotDrawnError(missing);
  const pictures = new PagePictures(Skia, tools.drawer);
  const bindingIn = bindingInchesFor(order.cover);
  // The pictures pages name (a QR code, a sticker): kept for the whole album
  // (they are small), let go at the end. One that can't be opened after all
  // stops the files, the page named, as above.
  const assets = new AssetCache(Skia, tools.files ?? (() => null));
  const drawn = <T>(page: string, draw: (onMissing: (src: string) => void) => T): T => {
    const unavailable = new Set<string>();
    const out = draw((src) => { unavailable.add(src); });
    if (unavailable.size) throw new NotDrawnError([{ page, notDrawn: [...unavailable].map(pictureNotDrawn) }]);
    return out;
  };
  try {

    // 1. The cover first, as at checkout: while the phone has the most memory free.
    onStep({ step: 'cover' });
    let coverPdf: Uint8Array | null = null;
    let coverMissing: string | null = null;
    if (album.coverFront) {
      const input: CoverInput = {
        albumSize: album.albumSize, pageCount: album.pages.length, cover: order.cover, material: order.material,
        coverFront: album.coverFront, photoCount: album.photoCount, photoIds: album.photoIds,
      };
      const plan = coverPlanFor(input, tools.text);
      coverPdf = await withPhotos(coverPhotos(plan), open, 'the cover', (photos) => {
        const unavailable = new Set<string>();
        const made = makeCoverPdf(plan, photos, tools, pictures, { assets: assets.get, onMissing: (src) => { unavailable.add(src); } });
        return made.then((bytes) => {
          if (unavailable.size) throw new NotDrawnError([{ page: 'the cover', notDrawn: [...unavailable].map(pictureNotDrawn) }]);
          return bytes;
        });
      });
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
        const plan = printPlan(album, i, bindingIn);
        const page = `page ${i + 1}`;
        const pic = await withPhotos(photosOf(plan), open, page, (photos) => drawn(page, (onMissing) => pictures.interiorPage(plan, photos, { bakeWords: bake, assets: assets.get, onMissing })));
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
  } finally {
    assets.dispose();
  }
}
