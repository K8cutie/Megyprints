/* The app's print-file code, headless in Node (CanvasKit: see
   test/golden/headless.ts): the tools makePrintFiles takes, and photos opened
   from picture files the way the phone opens a photo file. */
import fs from 'node:fs';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { PageDrawer } from '../../src/render/drawPage';
import { PageText } from '../../src/render/pageText';
import { LABEL_FONT_FILES } from '../../src/print/textPainter';
import type { OpenPhoto, PrintTools } from '../../src/print/printFiles';
import { fontFiles, fontPath, headlessSkia } from '../golden/headless';

export async function headlessPrintTools(): Promise<{ Sk: Skia; tools: PrintTools }> {
  const Sk = await headlessSkia();
  const files = fontFiles();
  PageText.expectAll(files);
  const text = new PageText(Sk, files);
  const drawer = new PageDrawer(Sk, text);
  const read = (f: string) => new Uint8Array(fs.readFileSync(fontPath(f)));
  return { Sk, tools: { Skia: Sk, drawer, text, labelFonts: { regular: read(LABEL_FONT_FILES.regular), bold: read(LABEL_FONT_FILES.bold) } } };
}

/** Photo `i` of the album is the picture file `files[image(i)]`, decoded
 *  afresh every time it is opened (as the phone decodes a photo file), and
 *  every picture handed out is counted, so a test can check each was let go. */
export function fileOpener(Sk: Skia, files: string[], imageOf: (photoIndex: number) => number | null): OpenPhoto & { open: number; live: () => number } {
  const bytes = files.map((f) => new Uint8Array(fs.readFileSync(f)));
  const handed: SkImage[] = [];
  const open = (async (i: number) => {
    const k = imageOf(i);
    if (k == null || !bytes[k]) return null;
    const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(bytes[k]));
    if (!img) return null;
    // Count it, and notice when it is disposed.
    const dispose = img.dispose.bind(img);
    let gone = false;
    img.dispose = () => { gone = true; dispose(); };
    (img as unknown as { gone: () => boolean }).gone = () => gone;
    handed.push(img);
    open.open++;
    return img;
  }) as OpenPhoto & { open: number; live: () => number };
  open.open = 0;
  open.live = () => handed.filter((h) => !(h as unknown as { gone: () => boolean }).gone()).length;
  return open;
}

/** A copy of a PDF with every see-through picture (words, labels) blanked:
 *  the file as it would print without its words. The pixel comparison takes
 *  the difference between the two as each side's ink. */
export async function barePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const ctx = doc.context;
  const blanks = new Map<string, ReturnType<typeof ctx.register>>();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(PDFName.of('Subtype')) !== PDFName.of('Image') || !d.get(PDFName.of('SMask'))) continue;
    const w = (d.lookup(PDFName.of('Width')) as unknown as { asNumber(): number }).asNumber();
    const h = (d.lookup(PDFName.of('Height')) as unknown as { asNumber(): number }).asNumber();
    const key = `${w}x${h}`;
    let ref = blanks.get(key);
    if (!ref) {
      const mask = ctx.flateStream(new Uint8Array(w * h), { Type: 'XObject', Subtype: 'Image', Width: w, Height: h, ColorSpace: 'DeviceGray', BitsPerComponent: 8 });
      ref = ctx.register(mask);
      blanks.set(key, ref);
    }
    d.set(PDFName.of('SMask'), ref);
  }
  return doc.save({ useObjectStreams: false });
}

/** The entries of a zip with stored (uncompressed) files, as jpegZip writes them. */
export function readStoredZip(zip: Uint8Array): { name: string; data: Uint8Array }[] {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: { name: string; data: Uint8Array }[] = [];
  let at = 0;
  while (at + 30 <= zip.length && v.getUint32(at, true) === 0x04034b50) {
    if (v.getUint16(at + 8, true) !== 0) throw new Error('a compressed zip entry');
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const extra = v.getUint16(at + 28, true);
    const name = new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out.push({ name, data: zip.subarray(start, start + size) });
    at = start + size;
  }
  return out;
}
