/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S PAGE RENDERER, HEADLESS IN NODE.

   react-native-skia ships a web build of Skia (CanvasKit, WebAssembly) with
   the same API the phone's native Skia has. LoadSkiaWeb loads it and
   JsiSkApi wraps it as the `Skia` object the app's code takes, so the very
   drawing code that runs on the phone (src/render) runs here with no phone,
   no emulator and no browser. Surfaces are CPU (Node has no GPU canvas).

   Pictures are read and written with Skia too (PNG decode/encode in
   WebAssembly): pure-JavaScript pixel work runs dozens of times slower
   inside jest than in plain Node.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ColorType, ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { BUNDLED_FONTS } from '../../src/render/fontTable';
import type { FontFile } from '../../src/render/pageText';

export const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
export const REPO_ROOT = path.resolve(MOBILE_ROOT, '..');

let skia: Skia | null = null;

export async function headlessSkia(): Promise<Skia> {
  if (skia) return skia;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb') as { LoadSkiaWeb: () => Promise<void> };
  await LoadSkiaWeb();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { JsiSkApi } = require('@shopify/react-native-skia/lib/commonjs/skia/web') as { JsiSkApi: (ck: unknown) => Skia };
  skia = JsiSkApi((globalThis as unknown as { CanvasKit: unknown }).CanvasKit);
  return skia;
}

export function fontPath(file: string): string {
  return path.join(MOBILE_ROOT, 'node_modules', file);
}

/** The bundled font files, read from the app's node_modules. */
export function fontFiles(): FontFile[] {
  return BUNDLED_FONTS.map((font) => ({ font, bytes: new Uint8Array(fs.readFileSync(fontPath(font.file))) }));
}

/** A picture file decoded by Skia, as a photo file is on the phone. */
export function imageFromFile(Sk: Skia, file: string): SkImage {
  const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(new Uint8Array(fs.readFileSync(file))));
  if (!img) throw new Error(`Skia could not decode ${file}`);
  return img;
}

/** An SkImage's pixels, RGBA, not premultiplied. */
export function pixelsOf(img: SkImage): Uint8Array {
  const px = img.readPixels(0, 0, { width: img.width(), height: img.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(px instanceof Uint8Array)) throw new Error('could not read the picture back');
  return px;
}

export function readPng(Sk: Skia, file: string): { width: number; height: number; data: Uint8Array } {
  const img = imageFromFile(Sk, file);
  const out = { width: img.width(), height: img.height(), data: pixelsOf(img) };
  img.dispose();
  return out;
}

export function writeImage(file: string, img: SkImage): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, img.encodeToBytes(ImageFormat.PNG, 100));
}

export function writeRgba(Sk: Skia, file: string, width: number, height: number, rgba: Uint8Array): void {
  const img = Sk.Image.MakeImage(
    { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Sk.Data.fromBytes(rgba), width * 4,
  );
  if (!img) throw new Error('could not make a picture of the diff');
  writeImage(file, img);
  img.dispose();
}
