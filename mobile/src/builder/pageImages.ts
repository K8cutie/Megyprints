/* ══════════════════════════════════════════════════════════════════════════
   ALBUM PAGES AS PICTURES ON SCREEN, drawn by the app's page renderer
   (src/render: the drawing the golden check holds to the website's print
   pictures, on the phone too, PR #219).

   A page is planned from the builder's own page data (planPage), its photos
   are loaded, and it is drawn at the size it is shown (the plan is in print
   pixels; the canvas is scaled down to the screen's). What the renderer
   cannot draw yet is not drawn and is listed (plan.notDrawn), never faked.

   The pictures a page keeps inside the album (a memory QR code, a graphic,
   a sticker: PNG data: URLs) are opened and drawn (render/assets.ts). Files
   the website serves (a textured edge's /masks pictures, a theme's corner
   art, a background stored by address) are not in the app yet: such a page
   is drawn without them, as print draws a picture that fails to load, and
   each one is added to the page's notDrawn list.

   Photos are drawn from small copies (at most PHOTO_MAX_SIDE px), made by
   the phone (modules/photo-files drawableCopy: upright, sRGB, HEIC opened)
   into the app's cache, which the phone may clear: they are made again. The
   album keeps only each photo's own address.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { planPage, type PagePlan } from '../render/pagePlan';
import { PageDrawer } from '../render/drawPage';
import { AssetCache } from '../render/assets';
import type { PageText } from '../render/pageText';

/** Longest side of a photo's copy for drawing on screen: enough for a page
 *  the width of a phone screen (1080 px) with a full-page photo. */
export const PHOTO_MAX_SIDE = 1280;
/** Changes when what the app draws changes, so old page pictures are dropped.
 *  2: textures, QR codes, graphics, stickers, colour looks and soft edges drawn. */
export const PAGE_PICTURE_VERSION = 2;

/** Where a photo's picture comes from (by its address on the phone). */
export interface PhotoImages {
  /** The photo's picture, or null when it can't be opened (drawn empty). */
  image(uri: string): Promise<SkImage | null>;
}

export interface PageRequest {
  page: AlbumPage;
  /** 0-based; drives the spine side, as in print. */
  pageIndex: number;
  albumSize: AlbumSizePreset;
  photos: readonly UploadedPhoto[];
  /** The picture's width, px. */
  width: number;
  /** The front cover (print's coverMode: no binding, the photo cover-fitted). */
  coverMode?: boolean;
}

/** The plan for a request (the album's photo ids name a photo background). */
export function planFor(req: PageRequest): PagePlan {
  return planPage({
    page: req.page, albumSize: req.albumSize, pageIndex: req.pageIndex, photoCount: req.photos.length,
    coverMode: req.coverMode, photoIds: req.photos.map((p) => p.id),
  });
}

/** FNV-1a, 52 bits, as hex: a short, stable name for a page picture. */
export function hashText(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + (h2 & 0xfffff).toString(16).padStart(5, '0');
}

/** The album photos a plan draws (by album photo index). */
export function photosDrawn(plan: PagePlan): number[] {
  const out = new Set<number>();
  if (plan.backgroundPhoto) out.add(plan.backgroundPhoto.photoIndex);
  for (const item of plan.items) if (item.kind === 'photo' || item.kind === 'boxPhoto') out.add(item.photoIndex);
  return [...out];
}

/** A name for this page's picture: changes whenever anything drawn changes. */
export function pageKey(req: PageRequest): string {
  const plan = planFor(req);
  const used = photosDrawn(plan).map((i) => [i, req.photos[i]?.previewUrl ?? '', req.photos[i]?.width ?? 0, req.photos[i]?.height ?? 0]);
  return hashText(JSON.stringify([PAGE_PICTURE_VERSION, req.albumSize, req.pageIndex, req.width, !!req.coverMode, req.page, used]));
}

export interface DrawnPage {
  image: SkImage;
  /** The page's plan; its notDrawn also names each picture file the app
   *  does not have yet (see the top of this file). */
  plan: PagePlan;
  /** Photos the page has that could not be opened. */
  missing: number;
}

/** Draws one page at `req.width` px wide. The caller disposes the image. */
export async function drawPageImage(Sk: Skia, text: PageText, req: PageRequest, images: PhotoImages): Promise<DrawnPage> {
  const plan = planFor(req);
  const loaded = new Map<number, SkImage>();
  let missing = 0;
  for (const i of photosDrawn(plan)) {
    const uri = req.photos[i]?.previewUrl;
    const img = uri ? await images.image(uri) : null;
    if (img) loaded.set(i, img);
    else missing++;
  }
  const scale = req.width / plan.width;
  const height = Math.max(1, Math.round(plan.height * scale));
  const surface = Sk.Surface.Make(req.width, height);
  if (!surface) throw new Error(`could not make a ${req.width}×${height} drawing surface`);
  const canvas = surface.getCanvas();
  canvas.scale(scale, scale);
  // The album's own pictures (data: URLs) only: no files from the website yet.
  const assets = new AssetCache(Sk);
  const unavailable = new Set<string>();
  const drawer = new PageDrawer(Sk, text);
  try {
    drawer.draw(canvas, plan, (i) => loaded.get(i) ?? null, { assets: assets.get, onMissing: (src) => { unavailable.add(src); } });
  } finally {
    drawer.dispose();
    assets.dispose();
  }
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose();
  const notDrawn = [...plan.notDrawn, ...[...unavailable].map(pictureNotDrawn)];
  return { image, plan: notDrawn.length === plan.notDrawn.length ? plan : { ...plan, notDrawn }, missing };
}

/** A picture the page names that the app could not open, for notDrawn. */
function pictureNotDrawn(src: string): string {
  return src.startsWith('data:') ? 'a picture kept in the album that could not be opened' : `picture file ${src.length > 80 ? `${src.slice(0, 77)}...` : src}`;
}

/** Keeps the last few photo pictures decoded (a 1280 px copy is about 5 MB).
 *  Nothing is let go while a page is being drawn (a page can hold more
 *  photos than `keep`, and a picture let go mid-draw would be drawn after it
 *  is gone): the caller trims after each page, and clears when the pages
 *  are off screen. */
export function photoImageCache(load: (uri: string) => Promise<SkImage | null>, keep = 6): PhotoImages & { trim(): void; clear(): void; size(): number } {
  const cache = new Map<string, Promise<SkImage | null>>();
  return {
    image(uri) {
      const hit = cache.get(uri);
      if (hit) {
        cache.delete(uri);
        cache.set(uri, hit); // most recent last
        return hit;
      }
      const p = load(uri).catch(() => null);
      cache.set(uri, p);
      return p;
    },
    trim() {
      while (cache.size > keep) {
        const [oldest, img] = cache.entries().next().value as [string, Promise<SkImage | null>];
        cache.delete(oldest);
        void img.then((i) => i?.dispose());
      }
    },
    clear() {
      for (const p of cache.values()) void p.then((i) => i?.dispose());
      cache.clear();
    },
    size: () => cache.size,
  };
}
