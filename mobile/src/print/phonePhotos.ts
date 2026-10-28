/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM'S PHOTOS, OPENED FOR PRINTING ON THE PHONE (makePrintFiles'
   OpenPhoto). The album points at each photo where it is on the phone
   (Phase 2: nothing is copied into the app), so a page's photos are opened
   just before it is drawn:
     1. turned into sRGB by Android itself (modules/photo-files srgbCopy,
        ImageDecoder), into the app's cache: Skia on the phone draws a
        photo's colour numbers as they are, so a Display P3 or Adobe RGB
        photo would print duller than the website prints it (see the plan's
        "The Display P3 photo"); ImageDecoder also turns the photo the way
        its EXIF says, as Chrome does when the website draws it;
     2. decoded by Skia from that copy, and the copy deleted at once.
   On Android 8 and older (no ImageDecoder) the photo is decoded as it is.
   Not run on a phone yet: written for Phase 5's checkout step.
   ══════════════════════════════════════════════════════════════════════════ */

import type { Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { OpenPhoto } from './printFiles';

/** `uris[i]` is album photo i (content:// or file://). */
export function phoneOpenPhoto(Sk: Skia, uris: readonly string[]): OpenPhoto {
  let n = 0;
  return async (i) => {
    const uri = uris[i];
    if (!uri) return null;
    const { Directory, File, Paths } = await import('expo-file-system');
    const { srgbCopy } = await import('../../modules/photo-files');
    const dir = new Directory(Paths.cache, 'print-photos');
    dir.create({ intermediates: true, idempotent: true });
    const copy = new File(dir, `photo-${i}-${n++}.png`);
    try {
      const r = await srgbCopy(uri, copy.uri);
      const bytes = r?.supported ? await copy.bytes() : await new File(uri).bytes();
      return Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(bytes));
    } catch {
      return null;
    } finally {
      if (copy.exists) copy.delete();
    }
  };
}
