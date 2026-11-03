/* ══════════════════════════════════════════════════════════════════════════
   THE FLAT COVER ("<order>-cover.pdf"), made by the app the way the website
   makes it at checkout (printPipeline renderCoverWrapForPrint, cover-as-
   pages; generateAlbumPdf generateCoverWrapPdf).

   The wrap is drawn by the app's own cover renderer (render/coverPlan.ts +
   render/drawCover.ts, which the golden covers check holds to the website's
   cover file pixel by pixel), WITHOUT its words: the back's colour and the
   front's, the front cover page in cover mode edge to edge in its panel and
   mirrored past its trim, the spine's colour. That picture is the cover
   file's one JPEG (COVER_JPEG_QUALITY, shrunk only past MAX_COVER_SIDE).

   The words go on top as see-through 300 DPI patches (wordPatches.ts, the
   website's own code), lifted the way the website lifts them:
     • each text of the wrap (the Megy Prints mark and megyprints.com on the
       back, the spine's title) on its own, from the wrap with that text
       drawn and without it, in the text's box and a margin round it
       (printPipeline liftWords);
     • the front cover page's words from the page drawn with and without
       them, placed into its panel.
   The website's old CoverDesign form (drafts from before cover pages) is not
   drawn: every app album has a front cover page.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkImage, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverType, MaterialType } from '@web/pages/builder/types';
import { wordPatches, type PixelSource, type PxPatch } from '@web/pages/builder/wordPatches';
import { COVER_JPEG_QUALITY, MAX_COVER_SIDE } from '@web/pages/builder/printFileSpec';
import { planCover, type CoverLine, type CoverMeasure, type CoverPlan, type CoverStep } from '../render/coverPlan';
import { CoverDrawer } from '../render/drawCover';
import type { AssetSource, PageDrawer, PhotoSource } from '../render/drawPage';
import type { PageText } from '../render/pageText';
import { photosDrawn } from '../builder/pageImages';
import { PagePictures, pixelSource, planHasWords } from './pagePicture';
import { PrintPdf, type PrintPicture } from './printPdf';

export interface CoverInput {
  albumSize: AlbumSizePreset;
  /** Interior page count (how thick the spine is). */
  pageCount: number;
  cover: CoverType;
  /** C2S matte or glossy: the spine is that paper stacked. */
  material: MaterialType;
  /** The front cover page the customer made. */
  coverFront: AlbumPage;
  photoCount: number;
  /** The album's photo ids, in order (a picture background names its photo by id). */
  photoIds?: readonly string[];
}

export interface CoverTools {
  Skia: Skia;
  drawer: PageDrawer;
  text: PageText;
}

/** A cover line's width, measured the way the print canvas measures it
 *  (the font string `${italic} ${bold} ${size}px ${family}`), in the app's
 *  own fonts: the golden covers check measures the same way. */
export function coverMeasure(text: PageText): CoverMeasure {
  return (line, style, fontSize) => text.measure(line, { family: style.fontFamily, size: fontSize, bold: style.bold, italic: style.italic });
}

/** The wrap's plan for the cover file. */
export function coverPlanFor(input: CoverInput, text: PageText): CoverPlan {
  return planCover({
    albumSize: input.albumSize, pageCount: input.pageCount, cover: input.cover, material: input.material,
    coverFront: input.coverFront, photoCount: input.photoCount, photoIds: input.photoIds,
  }, coverMeasure(text));
}

/** The photos the wrap draws (the front cover page's). */
export function coverPhotos(plan: CoverPlan): number[] {
  const out = new Set<number>();
  for (const step of plan.steps) if (step.kind === 'front') photosDrawn(step.plan).forEach((i) => out.add(i));
  return [...out];
}

/** Each text's lines (cover lines carry the text they belong to). */
function linesByText(steps: readonly CoverStep[]): Map<number, CoverLine[]> {
  const out = new Map<number, CoverLine[]>();
  for (const step of steps) {
    if (step.kind !== 'line') continue;
    const list = out.get(step.line.textIndex);
    if (list) list.push(step.line);
    else out.set(step.line.textIndex, [step.line]);
  }
  return out;
}

/** printPipeline liftWords' area: the text's box and a margin round it (an
 *  outline, a shadow or a line that runs over), inside the wrap. */
export function liftArea(box: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  const m = Math.max(150, Math.round(Math.max(box.w, box.h) * 0.25));
  const x = Math.max(0, Math.floor(box.x - m));
  const y = Math.max(0, Math.floor(box.y - m));
  return { x, y, w: Math.min(W, Math.ceil(box.x + box.w + m)) - x, h: Math.min(H, Math.ceil(box.y + box.h + m)) - y };
}

/** One text of the wrap lifted off as patches: the wrap without words
 *  (`bare`) in the text's area, with that text drawn and without it. */
function liftText(Sk: Skia, covers: CoverDrawer, bare: SkImage, lines: readonly CoverLine[]): PxPatch[] {
  if (!lines.length) return [];
  const W = bare.width(), H = bare.height();
  const area = liftArea(lines[0].box, W, H);
  if (area.w <= 0 || area.h <= 0) return [];
  const surface = Sk.Surface.Make(area.w, area.h);
  if (!surface) throw new Error(`could not make a ${area.w}×${area.h} drawing surface for the cover's words`);
  try {
    const canvas = surface.getCanvas();
    canvas.drawImage(bare, -area.x, -area.y);
    canvas.save();
    canvas.translate(-area.x, -area.y);
    covers.drawLines(canvas, lines);
    canvas.restore();
    surface.flush();
    const after = surface.makeImageSnapshot();
    try {
      const own = pixelSource(after);
      // Wrap pixels → the snapshot's own.
      const at: PixelSource = { getImageData: (x, y, w, h) => own.getImageData(x - area.x, y - area.y, w, h) };
      return wordPatches(at, pixelSource(bare), area);
    } finally {
      after.dispose();
    }
  } finally {
    surface.dispose();
  }
}

/** The front cover page's words, as patches on the wrap (its panel). */
function frontWords(drawer: PageDrawer, step: Extract<CoverStep, { kind: 'front' }>, photos: PhotoSource, assets: AssetSource, onMissing: (src: string) => void): PxPatch[] {
  if (!planHasWords(step.plan)) return [];
  const bare = drawer.renderTrim(step.plan, photos, { words: false, assets, onMissing });
  const full = drawer.renderTrim(step.plan, photos, { words: true, assets, onMissing });
  try {
    const kx = step.rect.w / step.plan.width, ky = step.rect.h / step.plan.height;
    return wordPatches(pixelSource(full), pixelSource(bare), { x: 0, y: 0, w: step.plan.width, h: step.plan.height })
      .map((p) => ({ png: p.png, x: step.rect.x + p.x * kx, y: step.rect.y + p.y * ky, w: p.w * kx, h: p.h * ky }));
  } finally {
    full.dispose();
    bare.dispose();
  }
}

/** The flat cover as its picture and words (renderCoverWrapForPrint). */
export function coverPicture(
  plan: CoverPlan, photos: PhotoSource, tools: CoverTools, pictures: PagePictures,
  { assets = () => null, onMissing = () => {} }: { assets?: AssetSource; onMissing?: (src: string) => void } = {},
): PrintPicture {
  const { Skia: Sk, drawer, text } = tools;
  const covers = new CoverDrawer(Sk, text, drawer);
  const W = plan.width, H = plan.height;
  // One drawing: the front page's photos are prepared once for all its drawings.
  return drawer.drawing(() => {
    const bare = covers.render(plan, photos, { words: false, assets, onMissing });
    try {
      const words: PxPatch[] = [];
      // In the order the wrap draws them: the back's mark, the front page, the spine.
      const texts = linesByText(plan.steps);
      const lifted = new Set<number>();
      for (const step of plan.steps) {
        if (step.kind === 'front') words.push(...frontWords(drawer, step, photos, assets, onMissing));
        else if (step.kind === 'line' && !lifted.has(step.line.textIndex)) {
          lifted.add(step.line.textIndex);
          words.push(...liftText(Sk, covers, bare, texts.get(step.line.textIndex) ?? []));
        }
      }
      const jpeg = pictures.jpeg(bare, MAX_COVER_SIDE, COVER_JPEG_QUALITY);
      return { jpeg, words: words.map((p) => ({ png: p.png, x: p.x / W, y: p.y / H, w: p.w / W, h: p.h / H })) };
    } finally {
      bare.dispose();
    }
  });
}

/** "<order>-cover.pdf": ONE page the size of the flat wrap (generateCoverWrapPdf). */
export async function makeCoverPdf(
  plan: CoverPlan, photos: PhotoSource, tools: CoverTools, pictures: PagePictures,
  options: { assets?: AssetSource; onMissing?: (src: string) => void } = {},
): Promise<Uint8Array> {
  const picture = coverPicture(plan, photos, tools, pictures, options);
  const pdf = await PrintPdf.create();
  await pdf.addPage(picture, plan.geometry.wrap.wIn, plan.geometry.wrap.hIn);
  return pdf.save();
}
