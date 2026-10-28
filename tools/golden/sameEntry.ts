/* The website's print files for the golden pages and covers, as the website
   makes them for an order: renderPageForPrint (the page's JPEG and its
   sharp-words patches; and the smaller file with the words baked in) and
   renderCoverWrapForPrint (the cover's JPEG and its word patches).
   websiteSame.mjs bundles this twice, once against the website's print code
   at a git ref and once against the working copy ('megy-print' is aliased
   to each), and holds the two to the same bytes. */

import { renderPageForPrint, renderCoverWrapForPrint } from 'megy-print';
import { DEFAULT_COVER_DESIGN } from 'megy-types';
import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType, UploadedPhoto } from '../../src/pages/builder/types';

interface FontIn { face: string; weight: number; italic: boolean; base64: string }
interface PhotoIn { id: string; width: number; height: number; image: number }

const fromBase64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
let imageUrls: string[] = [];
const photosOf = (list: PhotoIn[]): UploadedPhoto[] => list.map((p) => ({
  id: p.id, previewUrl: imageUrls[p.image], name: `${p.id}.png`, type: 'image/png', size: 0, width: p.width, height: p.height,
}));

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** A print file's picture and word patches, every byte (as base64: the page
 *  is plain http, which has no crypto.subtle; Node compares and hashes them). */
async function fingerprint(layers: { image: Blob; words: { png: Uint8Array; x: number; y: number; w: number; h: number }[] }): Promise<{ image: string; words: string[] }> {
  const image = new Uint8Array(await layers.image.arrayBuffer());
  return { image: toBase64(image), words: layers.words.map((w) => `${toBase64(w.png)} ${w.x} ${w.y} ${w.w} ${w.h}`) };
}

const api = {
  async registerFonts(fonts: FontIn[]): Promise<number> {
    for (const f of fonts) {
      const face = new FontFace(f.face, fromBase64(f.base64), { weight: String(f.weight), style: f.italic ? 'italic' : 'normal' });
      await face.load();
      document.fonts.add(face);
    }
    return document.fonts.size;
  },
  setImages(pngs: string[]): number {
    imageUrls = pngs.map((b64) => URL.createObjectURL(new Blob([fromBase64(b64) as BlobPart], { type: 'image/png' })));
    return imageUrls.length;
  },
  async page(input: { page: AlbumPage; albumSize: AlbumSizePreset; pageIndex: number; photos: PhotoIn[]; bakeWords: boolean }) {
    return fingerprint(await renderPageForPrint({ page: input.page, photos: photosOf(input.photos), albumSize: input.albumSize, pageIndex: input.pageIndex, bakeWords: input.bakeWords }));
  },
  async cover(input: { albumSize: AlbumSizePreset; pageCount: number; cover: CoverType; material: MaterialType; coverFront?: AlbumPage; coverDesign?: CoverDesign; photos: PhotoIn[] }) {
    return fingerprint(await renderCoverWrapForPrint({
      albumSize: input.albumSize, pageCount: input.pageCount, cover: input.cover, material: input.material,
      coverDesign: input.coverDesign ?? DEFAULT_COVER_DESIGN, coverFront: input.coverFront, photos: photosOf(input.photos),
    }));
  },
};

(globalThis as unknown as { same: typeof api }).same = api;
