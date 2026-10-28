/* ══════════════════════════════════════════════════════════════════════════
   THE FLAT COVER ("<order>-cover.pdf"), made by the app the way the website
   makes it at checkout (printPipeline renderCoverWrapForPrint, cover-as-
   pages; generateAlbumPdf generateCoverWrapPdf), step by step:
     1. the wrap at full 300 DPI (coverWrapGeometry): the back's colour left
        of the spine, the front's colour right;
     2. the reserved back panel: the Megy Prints mark (coverSpine
        deriveBrandedBack), its words lifted off as see-through patches;
     3. the front cover page drawn by the app's page renderer in cover mode
        (no spine keep-out, the cover's floating shadow), without its words,
        edge to edge in its trim box, its words as patches on top;
     4. the front carried on past its trim (top, bottom, outer edge) as its
        own mirror image, through the bleed or the hardcover turn-in;
     5. the spine: its colour, and the front title fitted up it (coverSpine
        deriveSpine, measured with the app's own fonts), lifted off as well;
     6. one JPEG at COVER_JPEG_QUALITY (shrunk only past MAX_COVER_SIDE) on a
        single PDF page the size of the flat wrap, the words on top.
   The website's old CoverDesign form (drafts from before cover pages) is not
   drawn: every app album has a front cover page.
   ══════════════════════════════════════════════════════════════════════════ */

import type { SkCanvas, SkImage, SkSurface, Skia } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { BlendMode } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import type { AlbumPage, AlbumSizePreset, CoverType, MaterialType } from '@web/pages/builder/types';
import { coverWrapGeometry, insetRect, type Rect } from '@web/pages/builder/coverGeometry';
import { deriveBrandedBack, deriveSpine, solidOf, wrapCoverText, type PositionedText, type SpineMeasure } from '@web/pages/builder/coverSpine';
import { wordPatches, type PxPatch } from '@web/pages/builder/wordPatches';
import { COVER_JPEG_QUALITY, MAX_COVER_SIDE } from '@web/pages/builder/printFileSpec';
import { TEXT_LINE_HEIGHT } from '@web/pages/builder/wordArtRules';
import { planPage, type PagePlan } from '../render/pagePlan';
import type { PageDrawer, PhotoSource } from '../render/drawPage';
import type { Align, PageText, TextLook } from '../render/pageText';
import { PagePictures, pixelSource, planHasWords } from './pagePicture';
import { PrintPdf, type PrintPicture } from './printPdf';

export interface CoverInput {
  albumSize: AlbumSizePreset;
  /** Interior page count (how thick the spine is). */
  pageCount: number;
  cover: CoverType;
  /** C2S 140 matte or glossy: the spine is that paper stacked. */
  material: MaterialType;
  /** The front cover page the customer made. */
  coverFront: AlbumPage;
  photoCount: number;
}

export interface CoverTools {
  Skia: Skia;
  drawer: PageDrawer;
  text: PageText;
}

/** The front cover page's plan, as the cover wrap draws it (print's coverMode, page index 0). */
export function coverFrontPlan(input: Pick<CoverInput, 'albumSize' | 'coverFront' | 'photoCount'>): PagePlan {
  return planPage({ page: input.coverFront, albumSize: input.albumSize, pageIndex: 0, photoCount: input.photoCount, cover: true });
}

/** The spine measured the way the print canvas measures it: the font string
 *  `${italic} ${bold} ${size}px ${family}`, here in the app's own fonts. */
export function spineMeasure(text: PageText): SpineMeasure {
  return (line, style, fontSize) => text.measure(line, { family: style.fontFamily || 'serif', size: fontSize, bold: style.bold, italic: style.italic });
}

const lookOf = (t: PositionedText): TextLook => ({ family: t.style.fontFamily || 'serif', size: t.style.fontSize || 24, bold: t.style.bold, italic: t.style.italic });

/** One positioned cover text (printPipeline drawCoverText): sizes are wrap px
 *  already (WordArt scale 1); a turned one (the spine) is one centred line
 *  turned about the box's centre; the others wrap inside their box. */
export function drawCoverText(canvas: SkCanvas, text: PageText, t: PositionedText): void {
  const st = t.style;
  if (!st.text || !st.text.trim()) return;
  const look = lookOf(t);
  const style = { ...st, color: st.color || '#2D2D2D' };
  if (t.rotateDeg) {
    canvas.save();
    canvas.translate(t.rect.x + t.rect.width / 2, t.rect.y + t.rect.height / 2);
    canvas.rotate(t.rotateDeg, 0, 0);
    text.drawLine(canvas, st.text, 0, 0, look, 'center', style, 1);
    canvas.restore();
    return;
  }
  const align = (st.alignment ?? 'center') as Align;
  const pad = t.rect.width * 0.02;
  const anchorX = align === 'left' ? t.rect.x + pad : align === 'right' ? t.rect.x + t.rect.width - pad : t.rect.x + t.rect.width / 2;
  const lines = wrapCoverText(text.measurer(look), st.text, t.rect.width - pad * 2);
  const lineH = look.size * TEXT_LINE_HEIGHT;
  const blockH = lines.length * lineH;
  const startY = t.valign === 'top' ? t.rect.y + lineH / 2
    : t.valign === 'bottom' ? t.rect.y + t.rect.height - blockH + lineH / 2
      : t.rect.y + t.rect.height / 2 - blockH / 2 + lineH / 2;
  lines.forEach((line, i) => text.drawLine(canvas, line, anchorX, startY + i * lineH, look, align, style, 1));
}

/** Draw words onto the wrap, then take them back off as patches (printPipeline
 *  liftWords): the wrap keeps what is under them and the patches go on top.
 *  The margin round `near` takes in an outline, a shadow or a line that runs over. */
export function liftWords(Sk: Skia, surface: SkSurface, near: Rect, draw: () => void): PxPatch[] {
  const W = surface.width(), H = surface.height();
  const m = Math.max(150, Math.round(Math.max(near.width, near.height) * 0.25));
  const x = Math.max(0, Math.floor(near.x - m));
  const y = Math.max(0, Math.floor(near.y - m));
  const area = { x, y, w: Math.min(W, Math.ceil(near.x + near.width + m)) - x, h: Math.min(H, Math.ceil(near.y + near.height + m)) - y };
  if (area.w <= 0 || area.h <= 0) { draw(); return []; }
  const box = Sk.XYWHRect(area.x, area.y, area.w, area.h);
  surface.flush();
  const before = surface.makeImageSnapshot(box);
  draw();
  surface.flush();
  const after = surface.makeImageSnapshot(box);
  // Wrap pixels → the snapshots' own.
  const at = (img: SkImage) => {
    const src = pixelSource(img);
    return { getImageData: (sx: number, sy: number, sw: number, sh: number) => src.getImageData(sx - area.x, sy - area.y, sw, sh) };
  };
  try {
    const patches = wordPatches(at(after), at(before), area);
    // Put back what was there (canvas putImageData: the pixels as they were).
    const restore = Sk.Paint();
    restore.setBlendMode(BlendMode.Src);
    surface.getCanvas().drawImage(before, area.x, area.y, restore);
    return patches;
  } finally {
    before.dispose();
    after.dispose();
  }
}

/** The flat cover as its picture and words (renderCoverWrapForPrint). */
export function coverPicture(input: CoverInput, photos: PhotoSource, tools: CoverTools, pictures: PagePictures): PrintPicture {
  const { Skia: Sk, drawer, text } = tools;
  const geom = coverWrapGeometry(input.albumSize, input.pageCount, input.cover, { material: input.material });
  const W = geom.wrap.wPx, H = geom.wrap.hPx;
  const surface = Sk.Surface.Make(W, H);
  if (!surface) throw new Error(`could not make a ${W}×${H} drawing surface for the cover`);
  const canvas = surface.getCanvas();
  const words: PxPatch[] = [];
  const fill = (r: { x: number; y: number; w: number; h: number }, color: string) => {
    const p = Sk.Paint();
    p.setAntiAlias(true);
    p.setColor(Sk.Color(color));
    canvas.drawRect(Sk.XYWHRect(r.x, r.y, r.w, r.h), p);
  };
  try {
    const front = input.coverFront;
    const spine = deriveSpine(front, geom, spineMeasure(text));
    const branded = deriveBrandedBack(front, geom);
    // Full-bleed base: the reserved back's colour left of the spine, the front's right.
    const splitX = geom.foldXPx[0];
    fill({ x: 0, y: 0, w: splitX, h: H }, branded.bg);
    fill({ x: splitX, y: 0, w: W - splitX, h: H }, solidOf(front.background));
    // The reserved back: the brand lockup only.
    for (const t of branded.texts) words.push(...liftWords(Sk, surface, t.rect, () => drawCoverText(canvas, text, t)));

    // The front page, edge to edge in its trim box, without its words; its words as patches.
    const plan = coverFrontPlan(input);
    const bare = drawer.renderTrim(plan, photos, { words: false });
    let frontWords: PxPatch[] = [];
    if (planHasWords(plan)) {
      const full = drawer.renderTrim(plan, photos, { words: true });
      try {
        frontWords = wordPatches(pixelSource(full), pixelSource(bare), { x: 0, y: 0, w: plan.width, h: plan.height });
      } finally {
        full.dispose();
      }
    }
    const fr = geom.panels.front;
    try {
      const fw = bare.width(), fh = bare.height();
      const box = { x: fr.x, y: fr.y, w: fr.width, h: fr.height };
      drawer.drawPicture(canvas, bare, { x: 0, y: 0, w: fw, h: fh }, box);
      const fx = fr.width / fw, fy = fr.height / fh;
      words.push(...frontWords.map((p) => ({ png: p.png, x: fr.x + p.x * fx, y: fr.y + p.y * fy, w: p.w * fx, h: p.h * fy })));
      // The front carries on past its trim (top, bottom, outer edge), mirrored;
      // the hinge side keeps the cover colour.
      drawer.drawMirroredEdges(canvas, bare, box, { top: fr.y, bottom: H - (fr.y + fr.height), right: W - (fr.x + fr.width), left: 0 });
    } finally {
      bare.dispose();
    }

    // The spine: its colour, and the derived title turned up it.
    const sr = geom.panels.spine;
    fill({ x: sr.x, y: sr.y, w: sr.width, h: sr.height }, spine.bg);
    if (spine.text.text.trim()) {
      const safe = insetRect(sr, geom.safeInsetPx);
      words.push(...liftWords(Sk, surface, safe, () => drawCoverText(canvas, text, { style: spine.text, rect: safe, rotateDeg: -90, valign: 'middle' })));
    }

    surface.flush();
    const wrap = surface.makeImageSnapshot();
    try {
      const jpeg = pictures.jpeg(wrap, MAX_COVER_SIDE, COVER_JPEG_QUALITY);
      return { jpeg, words: words.map((p) => ({ png: p.png, x: p.x / W, y: p.y / H, w: p.w / W, h: p.h / H })) };
    } finally {
      wrap.dispose();
    }
  } finally {
    surface.dispose();
  }
}

/** "<order>-cover.pdf": ONE page the size of the flat wrap (generateCoverWrapPdf). */
export async function makeCoverPdf(input: CoverInput, photos: PhotoSource, tools: CoverTools, pictures: PagePictures): Promise<Uint8Array> {
  const geom = coverWrapGeometry(input.albumSize, input.pageCount, input.cover, { material: input.material });
  const picture = coverPicture(input, photos, tools, pictures);
  const pdf = await PrintPdf.create();
  await pdf.addPage(picture, geom.wrap.wIn, geom.wrap.hIn);
  return pdf.save();
}
