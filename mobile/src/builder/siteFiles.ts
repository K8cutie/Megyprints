/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S OWN PICTURES THAT AN ALBUM PAGE NAMES BY ADDRESS, from
   inside the app: the textured photo edges (/masks/deckle.png and the rest,
   and torn paper's white rim). The page drawer asks for them through
   AssetCache's `files` (render/assets.ts), on screen (pageImages.ts) and for
   print (Place order, lib/checkout/phoneSend.ts).

   Owner's phone test, 2026-11-03: Place order stopped with "page 1 has
   picture file /masks/deckle.png": the app had none of them. They come from
   maskFiles.ts (scripts/mask-files.cjs, the website's public/masks byte for
   byte; test/maskFiles.test.ts). Each is decoded the first time a page
   needs it, then kept. Any other address (a theme's corner art, which
   albums made today don't use) is not here: null, and the page says so.
   ══════════════════════════════════════════════════════════════════════════ */
import { fromBase64 } from '../render/assets';
import { MASK_FILES } from './maskFiles';

/** Every address the app can give. */
export const SITE_FILE_NAMES: readonly string[] = Object.keys(MASK_FILES);

const opened = new Map<string, Uint8Array>();

/** The bytes of a website picture a page names, or null when the app
 *  doesn't have it. */
export function siteFile(src: string): Uint8Array | null {
  const known = opened.get(src);
  if (known) return known;
  const b64 = Object.prototype.hasOwnProperty.call(MASK_FILES, src) ? MASK_FILES[src] : undefined;
  if (!b64) return null;
  const bytes = fromBase64(b64);
  opened.set(src, bytes);
  return bytes;
}
