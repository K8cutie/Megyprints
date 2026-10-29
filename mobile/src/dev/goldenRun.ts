/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES AND COVERS, DRAWN ON THE PHONE (a test build's debug
   screen only: src/app/golden-pages.tsx).

   The golden check (test/goldenPages.test.ts) proves the app's renderer
   against the website's print renderer, but it runs Skia's CanvasKit build
   in Node. A phone runs native Skia, built separately, with its own
   FreeType, its own shaping and its own rounding. So this draws the very
   same golden pages and covers (the same page data, the same test photo
   files, the same font files, bundled into the test build by
   scripts/golden-phone-assets.cjs) with the phone's own Skia, the way a
   print page will be made on the phone: PageDrawer.renderPrintPage, a CPU
   surface (Skia.Surface.Make), at the print file's size, bleed included.

   For each page it writes NAME.png, and NAME.bare.png (the page without its
   words) when the page has words, plus report.json: the lines each text
   breaks into and how wide the phone's Skia measures them, each text's box,
   what the plan could not draw, and how long each page took. Then the same
   for every golden cover file (CoverDrawer.render, the flat wrap at 300 DPI,
   with and without its words), every texture tile alone (tile-NAME.png),
   and a timing pass: the slowest kinds of page (colour looks, halved
   photos, textured and soft edges, a full-page photo) drawn again with a
   12 MP camera-sized photo (4032 x 3024, made on the phone and JPEG'd), to
   see how long a real print page takes. The computer then holds the
   phone's pictures to the website's with the same bars and the same
   pixelmatch code as the Node check (test/goldenPhone.check.ts).

   A photo saved with a colour profile other than sRGB (the golden set has a
   Display P3 one) is drawn twice: as the file is (what the renderer does
   with it today) and after `toSrgb` (the photo intake's colour conversion,
   when the build has it), so the run shows both what goes wrong and that
   the conversion fixes it.

   It takes the Skia API and the file writer as arguments, so jest runs it
   headless with CanvasKit (test/goldenRun.test.ts) before it goes on a phone.
   ══════════════════════════════════════════════════════════════════════════ */
import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ImageFormat } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { TileMode } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType } from '@web/pages/builder/types';
import { planPage, type PagePlan } from '../render/pagePlan';
import { PageDrawer } from '../render/drawPage';
import { PageText, isLightColor, LIGHT_WEIGHT_TRIALS, type FontFile } from '../render/pageText';
import { BUNDLED_FONTS } from '../render/fontTable';
import { appWords, type TextItemLines } from '../render/pageWords';
import { AssetCache, fromBase64 } from '../render/assets';
import { planCover, type CoverMeasure } from '../render/coverPlan';
import { CoverDrawer, appCoverWords } from '../render/drawCover';
import { makeTextureTile } from '../render/textureTile';

/** What scripts/golden-phone-assets.cjs bundles into a test build. */
export interface GoldenBundle {
  /** What the website pictures were made from (tools/golden/web/manifest.json). */
  madeFrom: { madeAt: string; chromium: string; pagesSha256: string; renderer: string; tools: string; fonts: string };
  /** A hash of the app's renderer files when the bundle was made (sources.cjs hashFiles). */
  appRenderer: string;
  /** The album's photos, as the golden pages number them: `image` = which file. */
  photos: { id: string; image: number; width: number; height: number }[];
  photoFiles: { file: string; sha256: string; base64: string }[];
  /** The files the website serves that the pages name (a mask edge, corner
   *  art), by address; a QR code or a graphic is inside the page data itself. */
  assetFiles?: { url: string; base64: string }[];
  fonts: { file: string; base64: string }[];
  cases: GoldenPhoneCase[];
  /** The golden cover files (pages.json covers). */
  covers?: GoldenPhoneCover[];
  /** The texture tiles the website prepared (manifest.json tiles). */
  tiles?: GoldenPhoneTile[];
}

export interface GoldenPhoneCover {
  name: string;
  albumSize: AlbumSizePreset;
  pageCount: number;
  cover: CoverType;
  material: MaterialType;
  coverFront?: AlbumPage;
  coverDesign?: CoverDesign;
  /** The website picture's size, px. */
  width: number;
  height: number;
}

export interface GoldenPhoneTile {
  name: string;
  color: string | null;
  px: number;
  /** The website's tile picture (tools/golden/web/...). */
  file: string;
}

/** The pages the timing pass draws again with a 12 MP photo (when the bundle has them). */
export const TIMING_PAGES = ['looks-four', 'looks-64', 'big-photo-small-frames', 'textured-edges', 'soft-edges', 'photo-background', 'gen-8x8-p0-t88-fb-solo'] as const;
/** A phone camera's photo size (12 MP, 4:3). */
export const CAMERA_PHOTO = { width: 4032, height: 3024 } as const;

export interface GoldenPhoneCase {
  name: string;
  albumSize: AlbumSizePreset;
  pageIndex: number;
  kind: string;
  page: AlbumPage;
  /** The website picture's size, px. */
  width: number;
  height: number;
  /** The website drew it twice (it has words). */
  bare: boolean;
}

/** Where the phone's pictures go (the app's files folder on the phone). */
export interface GoldenWriter {
  write(name: string, content: Uint8Array | string): Promise<void>;
}

/** The photo intake's colour conversion: the file as sRGB, and what it was. */
export type ToSrgb = (file: { file: string; bytes: Uint8Array }) => Promise<{ colorSpace: string | null; converted: boolean; bytes: Uint8Array } | null>;

export interface PhonePage {
  name: string;
  /** A golden page (default) or a cover file. */
  kind?: 'page' | 'cover';
  /** '' = the photos as they are; 'srgb' = after the intake's colour conversion. */
  variant: '' | 'srgb';
  file: string;
  bareFile: string | null;
  width: number;
  height: number;
  notDrawn: string[];
  words: TextItemLines[];
  drawMs: number;
  bareMs: number | null;
  encodeMs: number;
  /** Something stopped this page (it has no picture). */
  error?: string;
  /** Pictures the page names that did not open (should be none). */
  missing?: string[];
}

export interface PhoneReport {
  madeFrom: GoldenBundle['madeFrom'];
  appRenderer: string;
  device: Record<string, unknown>;
  startedAt: string;
  totalMs: number;
  photos: { file: string; width: number; height: number; colorSpace?: string | null; converted?: boolean; srgbError?: string }[];
  pages: PhonePage[];
  /** Each texture tile drawn alone. */
  tiles?: { file: string; phoneFile: string; ms: number; error?: string }[];
  /** The timing pass: pages drawn with a 12 MP photo in every photo slot (not compared). */
  timing?: { photo: string; makeMs: number; pages: { name: string; drawMs: number; error?: string }[] };
  /** The light-weight trials: each page or cover with light words drawn
   *  again (with its words), its light letters given each trial weight
   *  (device px), compared with the website's by the phone check
   *  (pageText.ts "Light letters on the phone"). */
  lightWeight?: { px: number; name: string; kind: 'page' | 'cover'; file: string; error?: string }[];
}

// Base64 → bytes: the renderer's own (assets.ts), re-exported for the build test.
export { fromBase64 };

/** The bundled font files, in BUNDLED_FONTS order (all of them, or it stops). */
export function bundleFonts(bundle: GoldenBundle): FontFile[] {
  const files = BUNDLED_FONTS.map((font) => {
    const f = bundle.fonts.find((x) => x.file === font.file);
    if (!f) throw new Error(`the test build has no ${font.file}`);
    return { font, bytes: fromBase64(f.base64) };
  });
  PageText.expectAll(files);
  return files;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface RunOptions {
  /** Only these pages (by name); all when left out. */
  only?: readonly string[];
  /** Called before each page is drawn. */
  onPage?: (done: number, total: number, name: string) => void;
  toSrgb?: ToSrgb;
  device?: Record<string, unknown>;
  /** The timing pass's pages (default TIMING_PAGES; [] for none). */
  timingPages?: readonly string[];
  /** The light-weight trials, device px (default LIGHT_WEIGHT_TRIALS; [] for none). */
  lightWeightTrials?: readonly number[];
}

/** A camera-sized photo made on the device (no real photo): colour washes,
 *  rings and a fine grid, JPEG'd and opened again, so it is a decoded
 *  opaque picture like a phone photo. */
function cameraPhoto(Sk: Skia, drawer: PageDrawer): SkImage {
  const { width: W, height: H } = CAMERA_PHOTO;
  const d = drawer.surfaces.take(W, H);
  const c = d.canvas;
  const wash = Sk.Paint();
  wash.setShader(Sk.Shader.MakeLinearGradient(Sk.Point(0, 0), Sk.Point(W, H), ['#C8553D', '#F2D0A4', '#3E7CB1', '#2D2D2D'].map((x) => Sk.Color(x)), [0, 0.35, 0.7, 1], TileMode.Clamp));
  c.drawRect(Sk.XYWHRect(0, 0, W, H), wash);
  const line = Sk.Paint();
  line.setColor(Sk.Color('rgba(20,20,20,0.6)'));
  line.setAntiAlias(true);
  for (let x = 0; x < W; x += 48) c.drawRect(Sk.XYWHRect(x, 0, 3, H), line);
  for (let y = 0; y < H; y += 48) c.drawRect(Sk.XYWHRect(0, y, W, 3), line);
  const ring = Sk.Paint();
  ring.setAntiAlias(true);
  for (let k = 0; k < 12; k++) {
    ring.setColor(Sk.Color(k % 2 ? '#FFFBF7' : '#1F3A5F'));
    c.drawCircle(W / 2, H / 2, 1400 - k * 110, ring);
  }
  const drawn = drawer.surfaces.snapshot(d);
  const jpeg = drawn.encodeToBytes(ImageFormat.JPEG, 92);
  drawn.dispose();
  const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(jpeg));
  if (!img) throw new Error('could not open the 12 MP photo again');
  return img;
}

/** Draw every golden page with this Skia and write the pictures and report.json. */
export async function runGoldenPages(Sk: Skia, bundle: GoldenBundle, writer: GoldenWriter, options: RunOptions = {}): Promise<PhoneReport> {
  const t0 = Date.now();
  const text = new PageText(Sk, bundleFonts(bundle));
  const drawer = new PageDrawer(Sk, text);
  const served = new Map((bundle.assetFiles ?? []).map((a) => [a.url, a.base64]));
  const assets = new AssetCache(Sk, (src) => { const b = served.get(src); return b ? fromBase64(b) : null; });
  const photoIds = bundle.photos.map((p) => p.id);
  const fileBytes = bundle.photoFiles.map((f) => fromBase64(f.base64));
  const decode = (bytes: Uint8Array, file: string): SkImage => {
    const img = Sk.Image.MakeImageFromEncoded(Sk.Data.fromBytes(bytes));
    if (!img) throw new Error(`Skia could not decode ${file}`);
    return img;
  };
  const images = fileBytes.map((b, i) => decode(b, bundle.photoFiles[i].file));
  const report: PhoneReport = {
    madeFrom: bundle.madeFrom,
    appRenderer: bundle.appRenderer,
    device: options.device ?? {},
    startedAt: new Date(t0).toISOString(),
    totalMs: 0,
    photos: images.map((img, i) => ({ file: bundle.photoFiles[i].file, width: img.width(), height: img.height() })),
    pages: [],
  };

  // The photo intake's colour conversion, file by file (when the build has it).
  const converted = new Map<number, SkImage>();
  if (options.toSrgb) {
    for (let i = 0; i < fileBytes.length; i++) {
      try {
        const r = await options.toSrgb({ file: bundle.photoFiles[i].file, bytes: fileBytes[i] });
        if (!r) continue;
        report.photos[i].colorSpace = r.colorSpace;
        report.photos[i].converted = r.converted;
        if (r.converted) converted.set(i, decode(r.bytes, `${bundle.photoFiles[i].file} (as sRGB)`));
      } catch (err) {
        // The pages are still drawn as the files are; the report says why there is no second picture.
        report.photos[i].srgbError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const cases = options.only ? bundle.cases.filter((c) => options.only?.includes(c.name)) : bundle.cases;
  const jobs: { c: GoldenPhoneCase; variant: '' | 'srgb' }[] = cases.map((c) => ({ c, variant: '' as const }));
  for (const c of cases) {
    const uses = new Set(planPhotoFiles(c, bundle));
    if ([...uses].some((i) => converted.has(i))) jobs.push({ c, variant: 'srgb' });
  }

  for (let j = 0; j < jobs.length; j++) {
    const { c, variant } = jobs[j];
    const tag = variant ? `${c.name}.${variant}` : c.name;
    options.onPage?.(j, jobs.length, tag);
    await pause(); // let the screen show the progress
    const photoOf = (i: number) => {
      const file = bundle.photos[i]?.image;
      if (file == null) return null;
      return (variant === 'srgb' ? converted.get(file) : undefined) ?? images[file] ?? null;
    };
    const entry: PhonePage = { name: c.name, variant, file: `${tag}.png`, bareFile: null, width: 0, height: 0, notDrawn: [], words: [], drawMs: 0, bareMs: null, encodeMs: 0 };
    try {
      const plan: PagePlan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: bundle.photos.length, photoIds });
      const missing = new Set<string>();
      const named = { assets: assets.get, onMissing: (src: string) => { missing.add(src); } };
      entry.notDrawn = plan.notDrawn;
      entry.words = appWords(plan, text);
      let t = Date.now();
      const img = drawer.renderPrintPage(plan, photoOf, { words: true, ...named });
      entry.drawMs = Date.now() - t;
      entry.width = img.width();
      entry.height = img.height();
      t = Date.now();
      const png = img.encodeToBytes(ImageFormat.PNG, 100);
      img.dispose();
      entry.encodeMs = Date.now() - t;
      await writer.write(entry.file, png);
      if (c.bare || entry.words.length) {
        await pause();
        t = Date.now();
        const bare = drawer.renderPrintPage(plan, photoOf, { words: false, ...named });
        entry.bareMs = Date.now() - t;
        entry.bareFile = `${tag}.bare.png`;
        const barePng = bare.encodeToBytes(ImageFormat.PNG, 100);
        bare.dispose();
        await writer.write(entry.bareFile, barePng);
      }
      entry.missing = [...missing];
    } catch (err) {
      entry.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    report.pages.push(entry);
  }

  // The cover files: the flat wrap with and without its words.
  const covers = new CoverDrawer(Sk, text, drawer);
  const measure: CoverMeasure = (str, style, fontSize) => text.measure(str, { family: style.fontFamily, size: fontSize, bold: style.bold, italic: style.italic });
  const coverList = (bundle.covers ?? []).filter((c) => !options.only || options.only.includes(c.name));
  const photoAsIs = (i: number) => { const file = bundle.photos[i]?.image; return file == null ? null : images[file] ?? null; };
  const total = jobs.length + coverList.length;
  for (let j = 0; j < coverList.length; j++) {
    const c = coverList[j];
    options.onPage?.(jobs.length + j, total, c.name);
    await pause();
    const entry: PhonePage = { name: c.name, kind: 'cover', variant: '', file: `${c.name}.png`, bareFile: null, width: 0, height: 0, notDrawn: [], words: [], drawMs: 0, bareMs: null, encodeMs: 0 };
    try {
      const plan = planCover({ albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material, coverFront: c.coverFront, coverDesign: c.coverDesign, photoCount: bundle.photos.length, photoIds }, measure);
      const missing = new Set<string>();
      const named = { assets: assets.get, onMissing: (src: string) => { missing.add(src); } };
      entry.notDrawn = plan.notDrawn;
      entry.words = appCoverWords(plan, text);
      let t = Date.now();
      const img = covers.render(plan, photoAsIs, { words: true, ...named });
      entry.drawMs = Date.now() - t;
      entry.width = img.width();
      entry.height = img.height();
      t = Date.now();
      const png = img.encodeToBytes(ImageFormat.PNG, 100);
      img.dispose();
      entry.encodeMs = Date.now() - t;
      await writer.write(entry.file, png);
      await pause();
      t = Date.now();
      const bare = covers.render(plan, photoAsIs, { words: false, ...named });
      entry.bareMs = Date.now() - t;
      entry.bareFile = `${c.name}.bare.png`;
      const barePng = bare.encodeToBytes(ImageFormat.PNG, 100);
      bare.dispose();
      await writer.write(entry.bareFile, barePng);
      entry.missing = [...missing];
    } catch (err) {
      entry.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    report.pages.push(entry);
  }

  // Each texture tile alone, as print prepares it before repeating it.
  if (bundle.tiles?.length && !options.only) {
    report.tiles = [];
    for (const tile of bundle.tiles) {
      const phoneFile = `tile-${tile.file.split('/').pop()}`;
      const t = Date.now();
      try {
        const img = makeTextureTile(Sk, tile.name, tile.color ?? undefined, tile.px);
        const ms = Date.now() - t;
        const png = img.encodeToBytes(ImageFormat.PNG, 100);
        img.dispose();
        await writer.write(phoneFile, png);
        report.tiles.push({ file: tile.file, phoneFile, ms });
      } catch (err) {
        report.tiles.push({ file: tile.file, phoneFile, ms: Date.now() - t, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      }
    }
  }

  // The light-weight trials: what drew light words, drawn again with each weight.
  const trials = options.lightWeightTrials ?? LIGHT_WEIGHT_TRIALS;
  const light = report.pages.filter((p) => !p.variant && !p.error && p.words.some((w) => w.lines.some((l) => isLightColor(Sk, l.color))));
  if (trials.length && light.length) {
    report.lightWeight = [];
    const own = text.setLightWeight(0);
    for (const px of trials) {
      text.setLightWeight(px);
      for (const p of light) {
        const entry: NonNullable<PhoneReport['lightWeight']>[number] = { px, name: p.name, kind: p.kind ?? 'page', file: `weight-${px.toFixed(2)}-${p.name}.png` };
        options.onPage?.(total, total, `light weight ${px} px: ${p.name}`);
        await pause();
        try {
          let img: SkImage;
          if (p.kind === 'cover') {
            const c = coverList.find((x) => x.name === p.name) as GoldenPhoneCover;
            const plan = planCover({ albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material, coverFront: c.coverFront, coverDesign: c.coverDesign, photoCount: bundle.photos.length, photoIds }, measure);
            img = covers.render(plan, photoAsIs, { words: true, assets: assets.get });
          } else {
            const c = cases.find((x) => x.name === p.name) as GoldenPhoneCase;
            const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: bundle.photos.length, photoIds });
            img = drawer.renderPrintPage(plan, photoAsIs, { words: true, assets: assets.get });
          }
          const png = img.encodeToBytes(ImageFormat.PNG, 100);
          img.dispose();
          await writer.write(entry.file, png);
        } catch (err) {
          entry.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        }
        report.lightWeight.push(entry);
      }
    }
    text.setLightWeight(own);
  }

  // The timing pass: the slow kinds of page with a 12 MP photo in every slot.
  const timingNames = (options.timingPages ?? TIMING_PAGES).filter((n) => cases.some((c) => c.name === n));
  if (timingNames.length) {
    options.onPage?.(total, total, 'timing: making a 12 MP photo');
    await pause();
    let t = Date.now();
    const big = cameraPhoto(Sk, drawer);
    report.timing = { photo: `${big.width()}x${big.height()} JPEG`, makeMs: Date.now() - t, pages: [] };
    for (const name of timingNames) {
      const c = cases.find((x) => x.name === name) as GoldenPhoneCase;
      options.onPage?.(total, total, `timing: ${name}`);
      await pause();
      try {
        const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: bundle.photos.length, photoIds });
        t = Date.now();
        const img = drawer.renderPrintPage(plan, () => big, { words: true, assets: assets.get });
        report.timing.pages.push({ name, drawMs: Date.now() - t });
        img.dispose();
      } catch (err) {
        report.timing.pages.push({ name, drawMs: 0, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      }
    }
    big.dispose();
  }

  images.forEach((img) => img.dispose());
  assets.dispose();
  drawer.dispose();
  converted.forEach((img) => img.dispose());
  report.totalMs = Date.now() - t0;
  await writer.write('report.json', JSON.stringify(report, null, 1));
  options.onPage?.(total, total, '');
  return report;
}

/** Which photo files a golden page draws (by the file's index). */
function planPhotoFiles(c: GoldenPhoneCase, bundle: GoldenBundle): number[] {
  const plan = planPage({ page: c.page, albumSize: c.albumSize, pageIndex: c.pageIndex, photoCount: bundle.photos.length, photoIds: bundle.photos.map((p) => p.id) });
  const out: number[] = [];
  for (const it of plan.items) {
    if (it.kind === 'photo' || it.kind === 'boxPhoto') {
      const file = bundle.photos[it.photoIndex]?.image;
      if (file != null) out.push(file);
    }
  }
  if (plan.background.kind === 'image' && 'photo' in plan.background.image) {
    const file = bundle.photos[plan.background.image.photo]?.image;
    if (file != null) out.push(file);
  }
  return out;
}
