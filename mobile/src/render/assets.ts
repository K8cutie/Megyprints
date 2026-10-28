/* ══════════════════════════════════════════════════════════════════════════
   THE PICTURES A PAGE NAMES BY ADDRESS (PagePlan.assets / CoverPlan.assets),
   opened for the drawer (drawPage.ts AssetSource).

   Most come inside the album as data: URLs: a memory QR code (the PNG the
   website's qrcode step made when the memory was added), a graphic or a
   sticker (the PNG the website rasterised from its SVG when it was picked).
   Those are decoded here, byte for byte the picture print draws. A file the
   website serves (a mask edge /masks/torn.png, a theme's corner art, a
   stored picture background) comes from `files` (the caller: the app's
   bundled assets on the phone, the website's public/ folder in the golden
   check). A picture that can't be had is null: drawn the way print draws a
   picture that fails to load.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Base64 → bytes (no atob or Buffer: the phone has neither for sure). */
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const n = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = B64_INDEX[clean.charCodeAt(i)], b = B64_INDEX[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64_INDEX[clean.charCodeAt(i + 2)] : -1;
    const d = i + 3 < clean.length ? B64_INDEX[clean.charCodeAt(i + 3)] : -1;
    if (o < n) out[o++] = (a << 2) | (b >> 4);
    if (c >= 0 && o < n) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && o < n) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** The bytes inside a data: URL (base64, or percent-encoded text), or null
 *  for any other address. */
export function dataUrlBytes(src: string): Uint8Array | null {
  const m = /^data:([^,]*?),(.*)$/s.exec(src);
  if (!m) return null;
  if (/;base64$/i.test(m[1])) return fromBase64(m[2]);
  const text = decodeURIComponent(m[2]);
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
  return out;
}

/** Opens a page's named pictures once each, and lets them go together. */
export class AssetCache {
  private readonly images = new Map<string, SkImage | null>();

  /** `files`: the bytes of an address that is not a data: URL, or null. */
  constructor(private readonly Skia: Skia, private readonly files: (src: string) => Uint8Array | null = () => null) {}

  /** The picture at `src`, or null when it can't be had or isn't a picture. */
  get = (src: string): SkImage | null => {
    if (this.images.has(src)) return this.images.get(src) ?? null;
    const bytes = dataUrlBytes(src) ?? this.files(src);
    const img = bytes ? this.Skia.Image.MakeImageFromEncoded(this.Skia.Data.fromBytes(bytes)) : null;
    this.images.set(src, img ?? null);
    return img ?? null;
  };

  dispose(): void {
    this.images.forEach((img) => img?.dispose());
    this.images.clear();
  }
}
