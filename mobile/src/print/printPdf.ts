/* ══════════════════════════════════════════════════════════════════════════
   THE CHECKOUT'S TWO PRINT FILES, WRITTEN BY THE APP.

   The website writes them with jsPDF (generateAlbumPdf.ts); the app writes
   the same files with pdf-lib, the PDF library the console already lays them
   out on sheets with (printSheetPdf.ts, shared). Same files means:
     • "<order>.pdf": one page per album page, each the trim plus its 0.125"
       bleed (bleedGeometry.pageSizeWithBleedIn: an 8×8 page is 8.25 × 8.25
       in), the page's JPEG over the whole page and its words on top as
       see-through 300 DPI PNGs at the same spots (WordPatch fractions);
       PAGE_ONE_RIGHT_MARK in the keywords, which the console reads;
     • "<order>-cover.pdf": ONE page the size of the flat cover
       (coverWrapGeometry), its JPEG and its words the same way.
   A picture that is already in the file (a page drawn exactly like another,
   a blank page, the same word twice) is put in once and drawn again, as
   jsPDF does (its addImage names a picture by its bytes).
   Both files have NO fonts at all (the shop's printer, 2026-10-21: "the font
   is not available"): the pages are pictures, and the empty font list
   pdf-lib gives a new page is taken off (as printSheetPdf's saveNoFonts).
   jsPDF lists 14 fonts on every page; the console drops them on opening.
   ══════════════════════════════════════════════════════════════════════════ */

import { PDFDict, PDFDocument, PDFName, type PDFImage } from 'pdf-lib';
import { ALBUM_SIZES, type AlbumSizePreset } from '@web/pages/builder/types';
import { pageSizeWithBleedIn } from '@web/pages/builder/bleedGeometry';
import { PAGE_ONE_RIGHT_MARK } from '@web/pages/builder/binding';
import type { WordPatch } from '@web/pages/builder/wordPatches';
import { crc32 } from '@web/lib/jpegZip';

const PT = 72;

/** A page (or the cover) as it goes in a print file: its JPEG, then its words. */
export interface PrintPicture { jpeg: Uint8Array; words: WordPatch[] }

/** An interior page's size in the print file, inches, its bleed included. */
export function interiorPageInches(albumSize: AlbumSizePreset): { wIn: number; hIn: number } {
  const config = ALBUM_SIZES.find((s) => s.preset === albumSize);
  return pageSizeWithBleedIn((config?.width ?? 2400) / 300, (config?.height ?? 2400) / 300);
}

/** One print file being written: pages go in one at a time, so a page's
 *  pixels can be let go before the next page is drawn. */
export class PrintPdf {
  /** The pictures already in the file, by length and CRC-32 (bytes compared on a match). */
  private readonly embedded = new Map<string, { bytes: Uint8Array; image: Promise<PDFImage> }[]>();

  private constructor(private readonly doc: PDFDocument) {}

  /** The picture as a PDF image, put in the file the first time only. */
  private picture(bytes: Uint8Array, kind: 'jpg' | 'png'): Promise<PDFImage> {
    const key = `${kind}:${bytes.length}:${crc32(bytes)}`;
    const same = this.embedded.get(key) ?? [];
    const hit = same.find((e) => e.bytes.length === bytes.length && e.bytes.every((b, i) => b === bytes[i]));
    if (hit) return hit.image;
    const image = kind === 'jpg' ? this.doc.embedJpg(bytes) : this.doc.embedPng(bytes);
    same.push({ bytes, image });
    this.embedded.set(key, same);
    return image;
  }

  static async create(opts: { pageOneRight?: boolean; title?: string } = {}): Promise<PrintPdf> {
    const doc = await PDFDocument.create();
    doc.setProducer('Megy Prints app');
    doc.setCreator('Megy Prints app');
    if (opts.title) doc.setTitle(opts.title);
    // Page 1 is drawn as a right-hand page (spine margin on its left): the
    // console's press-sheet layout reads this to put it on the first leaf's front.
    if (opts.pageOneRight) doc.setKeywords([PAGE_ONE_RIGHT_MARK]);
    return new PrintPdf(doc);
  }

  get pageCount(): number {
    return this.doc.getPageCount();
  }

  /** A page `wIn` × `hIn` inches: the picture over all of it, the words on top. */
  async addPage(picture: PrintPicture, wIn: number, hIn: number): Promise<void> {
    const pw = wIn * PT;
    const ph = hIn * PT;
    const page = this.doc.addPage([pw, ph]);
    const jpg = await this.picture(picture.jpeg, 'jpg');
    page.drawImage(jpg, { x: 0, y: 0, width: pw, height: ph });
    for (const w of picture.words) {
      const png = await this.picture(w.png, 'png');
      // WordPatch is measured from the top-left; a PDF page from the bottom-left.
      page.drawImage(png, { x: w.x * pw, y: (1 - w.y - w.h) * ph, width: w.w * pw, height: w.h * ph });
    }
  }

  /** The file's bytes, with no font list on any page. */
  async save(): Promise<Uint8Array> {
    for (const p of this.doc.getPages()) {
      const res = p.node.Resources();
      const fonts = res?.lookup(PDFName.of('Font'));
      if (res && fonts instanceof PDFDict && fonts.keys().length === 0) res.delete(PDFName.of('Font'));
    }
    return this.doc.save();
  }
}
