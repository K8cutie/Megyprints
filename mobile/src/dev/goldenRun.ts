/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN PAGES, DRAWN ON THE PHONE (a test build's debug screen only:
   src/app/golden-pages.tsx).

   The golden check (test/goldenPages.test.ts) proves the app's renderer
   against the website's print renderer, but it runs Skia's CanvasKit build
   in Node. A phone runs native Skia, built separately, with its own
   FreeType, its own shaping and its own rounding. So this draws the very
   same 45 pages (the same page data, the same test photo files, the same
   font files, bundled into the test build by scripts/golden-phone-assets.cjs)
   with the phone's own Skia, the way a print page will be made on the
   phone: PageDrawer.renderPrintPage, a CPU surface (Skia.Surface.Make), at
   the print file's size, bleed included.

   For each page it writes NAME.png, and NAME.bare.png (the page without its
   words) when the page has words, plus report.json: the lines each text
   breaks into and how wide the phone's Skia measures them, each text's box,
   what the plan could not draw, and how long each page took. The computer
   then holds the phone's pictures to the website's with the same bars and
   the same pixelmatch code as the Node check (test/goldenPhone.check.ts).

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
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { planPage, type PagePlan } from '../render/pagePlan';
import { PageDrawer } from '../render/drawPage';
import { PageText, type FontFile } from '../render/pageText';
import { BUNDLED_FONTS } from '../render/fontTable';
import { appWords, type TextItemLines } from '../render/pageWords';
import { AssetCache, fromBase64 } from '../render/assets';

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
}

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

  images.forEach((img) => img.dispose());
  assets.dispose();
  drawer.dispose();
  converted.forEach((img) => img.dispose());
  report.totalMs = Date.now() - t0;
  await writer.write('report.json', JSON.stringify(report, null, 1));
  options.onPage?.(jobs.length, jobs.length, '');
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
