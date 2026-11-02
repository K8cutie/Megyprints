/* ══════════════════════════════════════════════════════════════════════════
   THE MEMORY QR'S PICTURE, made on the phone as the website makes it
   (src/lib/qrMemory.ts generateQrPngDataUrl): the code for the memory's
   address (https://megyprints.vercel.app/m/<code>), error level Q, a
   4-square quiet zone, 900 pixels wide, pure black on white, as a PNG data:
   URL. That picture is what the album keeps (QrFill.qrPngDataUrl) and what
   is printed, so it must be the website's, square for square.

   The same library (qrcode 1.5.4) works out the squares and fills the pixels
   (its own qrToImageData, the step the website's browser and Node both
   use); only the last step, writing the pixels as a PNG, is the phone's
   Skia instead of the browser's canvas. test/qrPicture.test.ts holds every
   pixel to the website's.
   ══════════════════════════════════════════════════════════════════════════ */
import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import QRCode from 'qrcode';

/** generateQrPngDataUrl's options, word for word. */
export const QR_OPTIONS = {
  errorCorrectionLevel: 'Q',
  margin: 4,
  width: 900,
  color: { dark: '#000000', light: '#ffffff' },
} as const;

interface QrRendererUtils {
  getOptions(o: unknown): unknown;
  getImageWidth(size: number, opts: unknown): number;
  qrToImageData(data: Uint8Array | Uint8ClampedArray, qr: unknown, opts: unknown): void;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Utils = require('qrcode/lib/renderer/utils') as QrRendererUtils;

/** The picture's pixels (RGBA), exactly as the website's canvas gets them. */
export function qrPixels(text: string, targetPx = QR_OPTIONS.width): { width: number; rgba: Uint8Array } {
  const qr = QRCode.create(text, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const opts = Utils.getOptions({ ...QR_OPTIONS, width: targetPx });
  const width = Utils.getImageWidth(qr.modules.size, opts);
  const rgba = new Uint8Array(width * width * 4);
  Utils.qrToImageData(rgba, qr, opts);
  return { width, rgba };
}

/** generateQrPngDataUrl for the phone: the PNG data: URL the album keeps. */
export function qrPngDataUrl(Sk: Skia, memUrl: string, targetPx = QR_OPTIONS.width): string {
  const { width, rgba } = qrPixels(memUrl, targetPx);
  // AlphaType.Unpremul = 3, ColorType.RGBA_8888 = 4, ImageFormat.PNG = 4
  // (react-native-skia's enums, numbers so this file needs no native import).
  const img = Sk.Image.MakeImage({ width, height: width, alphaType: 3, colorType: 4 }, Sk.Data.fromBytes(rgba), width * 4);
  if (!img) throw new Error('Could not make the QR code picture.');
  return `data:image/png;base64,${img.encodeToBase64(4 as never, 100)}`;
}
