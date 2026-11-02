/* ══════════════════════════════════════════════════════════════════════════
   THE MEMORY QR'S PICTURE (src/lib/memories/qrPicture.ts): what the phone
   makes is the website's picture (src/lib/qrMemory.ts generateQrPngDataUrl),
   pixel for pixel. The website's own call (QRCode.toDataURL with the
   website's options) runs here in Node; both PNGs are decoded and every
   pixel compared. The picture is printed, so a single square off would be a
   QR that might not scan.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { QR_OPTIONS, qrPixels, qrPngDataUrl } from '../src/lib/memories/qrPicture';
import { memoryUrl } from '../src/lib/memories/memories';
import { headlessSkia, pixelsOf } from './golden/headless';

const REPO = path.resolve(__dirname, '..', '..');
const WEBSITE_QR = fs.readFileSync(path.join(REPO, 'src/lib/qrMemory.ts'), 'utf8');

async function decode(dataUrl: string) {
  const Sk = await headlessSkia();
  const bytes = Uint8Array.from(Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(bytes));
  if (!img) throw new Error('not a picture');
  return { width: img.width(), height: img.height(), px: pixelsOf(img) };
}

describe('the memory QR picture is the website\'s', () => {
  it('the website\'s options, word for word', () => {
    expect(WEBSITE_QR).toContain(`errorCorrectionLevel: '${QR_OPTIONS.errorCorrectionLevel}',`);
    expect(WEBSITE_QR).toContain(`margin: ${QR_OPTIONS.margin},`);
    expect(WEBSITE_QR).toContain(`targetPx = ${QR_OPTIONS.width}`);
    expect(WEBSITE_QR).toContain(`color: { dark: '${QR_OPTIONS.color.dark}', light: '${QR_OPTIONS.color.light}' },`);
    // The same library, the same version, as the website.
    const appQr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'node_modules/qrcode/package.json'), 'utf8')).version;
    const webQr = JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules/qrcode/package.json'), 'utf8')).version;
    expect(appQr).toBe(webQr);
  });

  it.each(['abcd2345', 'wxyz6789', 'k3m9p2qz', 'a2b3c4d5e6f7g8h9'])('code %s: every pixel the same as the website\'s', async (code) => {
    const url = memoryUrl(code);
    const web = await decode(await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 900 } as QRCode.QRCodeToDataURLOptions));
    const app = await decode(qrPngDataUrl(await headlessSkia(), url));
    expect([app.width, app.height]).toEqual([web.width, web.height]);
    expect(app.width).toBeGreaterThan(800);
    expect(Buffer.from(app.px).equals(Buffer.from(web.px))).toBe(true);
  });

  it('pure black and white, with a white quiet zone around it', () => {
    const { width, rgba } = qrPixels(memoryUrl('abcd2345'));
    const values = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) values.add(rgba[i] | (rgba[i + 1] << 8) | (rgba[i + 2] << 16));
    expect([...values].sort()).toEqual([0, 0xffffff]);
    // The top-left corner (inside the quiet zone) is white.
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([255, 255, 255, 255]);
    expect(width % 1).toBe(0);
  });
});
