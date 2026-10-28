/* ══════════════════════════════════════════════════════════════════════════
   COVER PLAN: what goes where on the cover file (one flat wrap: back, spine,
   front, with the turn-in or bleed all round), worked out from the album's
   data without drawing anything.

   It follows the website's cover print code (printPipeline drawCoverWrap,
   which renderCoverWrapForPrint makes the cover file from) step by step, in
   the same order, and takes every number from the website's own album code
   (the shared files): the wrap's size from the page count, the cover type
   and the paper (coverGeometry), the spine's words and colour derived from
   the front page and fitted to the spine's length (coverLayoutRules
   deriveSpine), the reserved back's Megy Prints lockup (deriveBrandedBack),
   where a cover text's lines go (coverTextLayout), and the front page itself
   planned as print's coverMode page (pagePlan.ts).

   Two kinds of cover, as on the website:
     • the cover page (every album and order today): the back's colour left
       of the spine and the front's right, the back's lockup, the front page
       drawn into its panel and carried on past its trim, mirrored (top,
       bottom, outer edge), the spine's colour and its line turned up it;
     • the old cover form (drafts from before cover pages): each panel's
       colour and photo, its words, an opt-in mark.

   The words are laid out here (lines and where each sits), because the
   spine's size and the lockup's wrap need the font's own measure: the
   caller passes it (PageText.measure on the phone and in the golden check).
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumPage, AlbumSizePreset, CoverDesign, CoverType, MaterialType, TextStyle } from '@web/pages/builder/types';
import { DEFAULT_COVER_DESIGN } from '@web/pages/builder/types';
import { coverWrapGeometry, insetRect, type CoverWrapGeometry, type Rect as WrapRect } from '@web/pages/builder/coverGeometry';
import { coverLayout, coverTextLayout, deriveBrandedBack, deriveSpine, solidOf, type PositionedText, type SpineInfo } from '@web/pages/builder/coverLayoutRules';
import type { Margins } from '@web/pages/builder/bleedGeometry';
import { planPage, type ImageRef, type PagePlan, type Rect } from './pagePlan';
import { fontNotDrawn } from './fontTable';

/** A line of words on the wrap: at (x, y) (its middle), aligned by `align`,
 *  in `style` (font size in wrap px: drawn at scale 1, as print draws cover
 *  words). `turn`: the spine's line, drawn at (0, 0) after moving to the
 *  turn's centre and turning it. */
export interface CoverLine {
  text: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  style: TextStyle;
  turn: { cx: number; cy: number; deg: number } | null;
  /** The box the words were placed in (wrap px), for the check's ink zones. */
  box: Rect;
  /** Which text this line belongs to (lines of one text share it). */
  textIndex: number;
}

export type CoverStep =
  | { kind: 'fill'; rect: Rect; color: string }
  | { kind: 'line'; line: CoverLine }
  /** The front page (planned as print's coverMode page) drawn into its panel,
   *  then carried on past its trim by `mirror` px each side (drawMirroredEdges). */
  | { kind: 'front'; plan: PagePlan; rect: Rect; mirror: Margins }
  /** The old form's panel photo: cover-fitted, centred, clipped to the panel. */
  | { kind: 'photo'; image: ImageRef; rect: Rect };

export interface CoverPlan {
  albumSize: AlbumSizePreset;
  /** The flat wrap, px (300 DPI). */
  width: number;
  height: number;
  geometry: CoverWrapGeometry;
  /** The cover page (true) or the old cover form (false). */
  fromCoverPage: boolean;
  steps: CoverStep[];
  /** The spine as derived from the front page (cover page only). */
  spine: SpineInfo | null;
  /** Every picture named by address (the front page's, a panel photo's). */
  assets: string[];
  /** What is on the cover that the app does not draw yet. */
  notDrawn: string[];
}

/** A line's width in px, in a text style's own face at `fontSize`
 *  (coverLayoutRules SpineMeasure: the print canvas's measureText). */
export type CoverMeasure = (text: string, style: TextStyle, fontSize: number) => number;

export interface CoverInput {
  albumSize: AlbumSizePreset;
  /** Interior page count (the spine's thickness). */
  pageCount: number;
  cover: CoverType;
  /** C2S 140 matte or glossy (the spine's thickness). Missing = matte. */
  material?: MaterialType;
  /** The front cover page; without it, the old cover form is drawn. */
  coverFront?: AlbumPage | null;
  /** The old cover form (default: the website's DEFAULT_COVER_DESIGN). */
  coverDesign?: CoverDesign;
  /** How many photos the album has. */
  photoCount: number;
  /** The album's photo ids, in order (a picture background or a panel photo names its photo by id). */
  photoIds?: readonly string[];
}

const rect = (r: WrapRect): Rect => ({ x: r.x, y: r.y, w: r.width, h: r.height });

/** The lines of one positioned cover text, as drawCoverText places them. */
function linesOf(t: PositionedText, id: number, measure: CoverMeasure): CoverLine[] {
  const st = t.style;
  if (!st.text || !st.text.trim()) return [];
  const fontSize = st.fontSize || 24;
  const box = rect(t.rect);
  if (t.rotateDeg) {
    // The spine: one centred line, turned about the box's centre.
    return [{
      text: st.text, x: 0, y: 0, align: 'center', style: st, box, textIndex: id,
      turn: { cx: t.rect.x + t.rect.width / 2, cy: t.rect.y + t.rect.height / 2, deg: t.rotateDeg },
    }];
  }
  const layout = coverTextLayout(t, (s) => measure(s, st, fontSize));
  return layout.lines.map((l) => ({ text: l.text, x: l.x, y: l.y, align: layout.align, style: st, turn: null, box, textIndex: id }));
}

/** The cover's plan: see the top of this file. */
export function planCover(input: CoverInput, measure: CoverMeasure): CoverPlan {
  const { albumSize, pageCount, cover, material, coverFront, photoCount, photoIds = [] } = input;
  const g = coverWrapGeometry(albumSize, pageCount, cover, { material });
  const W = g.wrap.wPx, H = g.wrap.hPx;
  const steps: CoverStep[] = [];
  const assets = new Set<string>();
  const notDrawn: string[] = [];
  let textId = 0;
  const note = (label: string) => { if (!notDrawn.includes(label)) notDrawn.push(label); };
  const words = (t: PositionedText) => {
    const label = fontNotDrawn({ family: t.style.fontFamily, bold: t.style.bold, italic: t.style.italic });
    if (label && t.style.text?.trim()) note(label);
    for (const line of linesOf(t, textId, measure)) steps.push({ kind: 'line', line });
    textId++;
  };

  if (coverFront) {
    const spine = deriveSpine(coverFront, g, measure);
    const branded = deriveBrandedBack(coverFront, g);
    const frontBg = solidOf(coverFront.background);
    const splitX = g.foldXPx[0];
    steps.push({ kind: 'fill', rect: { x: 0, y: 0, w: splitX, h: H }, color: branded.bg });
    steps.push({ kind: 'fill', rect: { x: splitX, y: 0, w: W - splitX, h: H }, color: frontBg });
    for (const t of branded.texts) words(t);
    const plan = planPage({ page: coverFront, albumSize, pageIndex: 0, photoCount, photoIds, coverMode: true });
    plan.assets.forEach((a) => assets.add(a));
    plan.notDrawn.forEach(note);
    const front = rect(g.panels.front);
    steps.push({
      kind: 'front', plan, rect: front,
      mirror: { top: front.y, bottom: H - (front.y + front.h), right: W - (front.x + front.w), left: 0 },
    });
    const spineRect = g.panels.spine;
    steps.push({ kind: 'fill', rect: rect(spineRect), color: spine.bg });
    if (spine.text.text.trim()) words({ style: spine.text, rect: insetRect(spineRect, g.safeInsetPx), rotateDeg: -90, valign: 'middle' });
    return { albumSize, width: W, height: H, geometry: g, fromCoverPage: true, steps, spine, assets: [...assets], notDrawn };
  }

  // The old cover form.
  const layout = coverLayout(g, input.coverDesign ?? DEFAULT_COVER_DESIGN);
  const panelBg = (name: 'back' | 'front') => layout.panels.find((p) => p.panel === name)?.bg || '#FFFFFF';
  const splitX = layout.foldXPx[0];
  steps.push({ kind: 'fill', rect: { x: 0, y: 0, w: splitX, h: H }, color: panelBg('back') });
  steps.push({ kind: 'fill', rect: { x: splitX, y: 0, w: W - splitX, h: H }, color: panelBg('front') });
  for (const p of layout.panels) {
    if (p.bg) steps.push({ kind: 'fill', rect: rect(p.rect), color: p.bg });
    if (p.photoId) {
      // resolveBgImageSrc({ photoId }): the album photo with that id (nothing else to fall back on).
      const at = photoIds.indexOf(p.photoId);
      if (at >= 0 && at < photoCount) steps.push({ kind: 'photo', image: { photo: at }, rect: rect(p.rect) });
    }
    for (const t of p.texts) words(t);
    const mark = p.brandMark;
    if (mark) {
      // ctx.font = 600 …px Cinzel: of the two Cinzel files (400, 700) a
      // browser picks 700 for 600, and so does the app (bold).
      const style: TextStyle = {
        text: 'Megy Prints', fontSize: Math.round(mark.height * 0.62), fontFamily: 'Cinzel, Georgia, serif',
        color: 'rgba(0,0,0,0.55)', bold: true, italic: false, underline: false, alignment: 'center',
      };
      steps.push({ kind: 'line', line: { text: style.text, x: mark.x + mark.width / 2, y: mark.y + mark.height / 2, align: 'center', style, turn: null, box: rect(mark), textIndex: textId++ } });
    }
  }
  return { albumSize, width: W, height: H, geometry: g, fromCoverPage: false, steps, spine: null, assets: [...assets], notDrawn };
}
