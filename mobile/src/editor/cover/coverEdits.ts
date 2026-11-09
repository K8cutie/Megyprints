/* ══════════════════════════════════════════════════════════════════════════
   WHAT THE COVER EDITOR DOES TO THE COVER: the website's CoverEditor, call
   for call, on the website's own album builder (useBuilderState, shared).

   Each control below makes the very call CoverEditor.tsx makes for it, with
   the same arguments (test/editorCover.test.ts holds them to it):
     • a photo:         setPageBackground({ type: 'image', image, photoId, opacity })
                        (BackgroundDesigner, as the cover's photo grid uses it);
     • a colour:        setPageColor(hex) (a title that wouldn't show on it
                        switches to an ink that does: pageColors.recolorPage);
       "Use … on every page": applyPageColorToAllPages(hex);
     • move the photo:  setBackgroundCrop({ focusX, focusY }) from where the
                        drag started; zoom: setBackgroundCrop({ zoom }) 1–3;
                        Reset: { focusX: 0.5, focusY: 0.5, zoom: 1 };
     • Remove photo (a photo that is not one of the album's):
                        setPageBackground({ type: 'solid', solid: '#FFFBF7' });
     • the title:       setBoxText(0, { text: <the title now>, ...patch }) for
                        the words, font, colour, size, alignment, Bold, Italic
                        and Shadow (on = no setting, off = false); "Make it
                        fit": { fontSize: fitsAt };
     • move the title:  setBoxTextOffset(0, ox, oy), kept in the safe print
                        area (0.25" in from the trim; owner, 2026-11-07).
   Nothing here edits a page object itself.

   ONLY THE COVER: the builder sends these to the cover only while its cover
   scope is on (useBuilderState updateCurrentPage reads editScope), and to the
   page on screen otherwise. The cover screen turns the scope on while it is
   on top; every call here first checks the builder says so, and does nothing
   (returns false) if not, so a cover change can never land on a page.

   Not in the undo history: the website's Snapshot holds the pages, not the
   cover (test/editorUndo.test.ts pins it), so the cover screen shows no Undo
   or Redo, as the website's cover editor has none.
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumBackground, AlbumPage, AlbumSizePreset, TextElement, UploadedPhoto } from '@web/pages/builder/types';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { DEFAULT_TITLE_FONT } from '@web/pages/builder/fontCatalog';
import { type WordArtCurve } from '@web/pages/builder/wordArtRules';
import { wordsSafeArea } from '@web/pages/builder/freeWords';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import type { ColorGradient } from '@web/pages/builder/colorGradients';
import { outlineColourPatch, outlinePatch } from '../text/wordArtEdits';

export type Align = 'left' | 'center' | 'right';

/** The cover title as the editor shows it: box 0 of the cover page with
 *  CoverEditor's defaults for anything not set. */
export interface CoverTitle {
  text: string;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: Align;
  fontSize: number;
  offsetX: number;
  offsetY: number;
  /** The floating shadow (wordArt.wordArtShadow): on unless switched off, or a glow takes its place. */
  shadow: boolean;
  /** WordArt (the app's own: the website draws them and has no buttons for them). */
  outlineColor?: string;
  /** Design px; 0 = no outline. */
  outlineWidth: number;
  fillTo?: string;
  glow?: string;
  curve?: WordArtCurve;
}

export function coverTitleOf(cover: AlbumPage): CoverTitle {
  const el = cover.textElements?.find((t) => t.boxIndex === 0);
  return {
    text: el?.text ?? '',
    fontFamily: el?.fontFamily ?? DEFAULT_TITLE_FONT,
    color: el?.color ?? '#2D2D2D',
    bold: el?.bold ?? true,
    italic: el?.italic ?? false,
    underline: el?.underline ?? false,
    alignment: (el?.alignment ?? 'center') as Align,
    fontSize: el?.fontSize ?? 32,
    offsetX: el?.offsetX ?? 0,
    offsetY: el?.offsetY ?? 0,
    shadow: el?.shadow !== false && !el?.glow,
    outlineColor: el?.outlineColor,
    outlineWidth: el?.outlineWidth ?? 0,
    fillTo: el?.fillTo,
    glow: el?.glow,
    curve: el?.curve,
  };
}

/** CoverEditor's limits: the title size slider, the zoom slider. */
export const TITLE_SIZE = { min: 16, max: 96 } as const;
export const ZOOM_RANGE = { min: 1, max: 3, step: 0.01 } as const;
/** The cover's plain paper (CoverEditor's Remove photo). */
export const COVER_PAPER = '#FFFBF7';

export type CoverBuilder = Pick<BuilderActions,
  'editScope' | 'coverFront' | 'setBoxText' | 'setBoxTextOffset' | 'setPageBackground' | 'setPageColor' |
  'applyPageColorToAllPages' | 'setBackgroundCrop'> & Partial<Pick<BuilderActions, 'albumSize'>>;

/** The builder edits the cover now (its cover scope is on). */
export function editsTheCover(b: Pick<BuilderActions, 'editScope'>): boolean {
  return b.editScope === 'coverFront';
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/* ── Background ────────────────────────────────────────────────────────── */

type CoverBg = AlbumBackground & { focusX?: number; focusY?: number; zoom?: number };
const bgOf = (cover: AlbumPage) => cover.background as CoverBg | undefined;

/** A photo is on the cover (any photo: the album's or one of its own). */
export function coverHasPhoto(cover: AlbumPage): boolean {
  return bgOf(cover)?.type === 'image';
}

/** The photo's crop now: focal point and zoom, CoverEditor's defaults. */
export function coverCrop(cover: AlbumPage): { focusX: number; focusY: number; zoom: number } {
  const bg = bgOf(cover);
  return { focusX: bg?.focusX ?? 0.5, focusY: bg?.focusY ?? 0.5, zoom: bg?.zoom ?? 1 };
}

/** A tap on one of the album's photos (BackgroundDesigner in the cover's photo-only mode). */
export function putPhotoOnCover(b: CoverBuilder, photo: Pick<UploadedPhoto, 'id' | 'previewUrl'>): boolean {
  if (!editsTheCover(b)) return false;
  b.setPageBackground({ type: 'image', image: photo.previewUrl, photoId: photo.id, opacity: b.coverFront.background?.opacity ?? 100 });
  return true;
}

/** A colour swatch (PageColorPicker onPick). */
export function colourTheCover(b: CoverBuilder, hex: string): boolean {
  if (!editsTheCover(b)) return false;
  b.setPageColor(hex);
  return true;
}

/** "Use <colour> on every page" (PageColorPicker onPickAll): the cover and every page. */
export function colourEveryPage(b: CoverBuilder, hex: string): boolean {
  if (!editsTheCover(b)) return false;
  b.applyPageColorToAllPages(hex);
  return true;
}

/** Dragging the cover moves the photo in its frame: `dx`, `dy` are how far the
 *  finger went, as fractions of the cover's width and height, from where it
 *  came down when the crop was `from`. Drag right shows more of the photo's
 *  left, so the focus goes down. */
export function panCoverPhoto(b: CoverBuilder, from: { focusX: number; focusY: number }, dx: number, dy: number): boolean {
  if (!editsTheCover(b) || !coverHasPhoto(b.coverFront)) return false;
  b.setBackgroundCrop({ focusX: clamp01(from.focusX - dx), focusY: clamp01(from.focusY - dy) });
  return true;
}

/** The zoom slider (1 to 3, in steps of 0.01). */
export function zoomCoverPhoto(b: CoverBuilder, zoom: number): boolean {
  if (!editsTheCover(b) || !coverHasPhoto(b.coverFront)) return false;
  const z = Math.round(clamp(zoom, ZOOM_RANGE.min, ZOOM_RANGE.max) / ZOOM_RANGE.step) * ZOOM_RANGE.step;
  b.setBackgroundCrop({ zoom: Number(z.toFixed(2)) });
  return true;
}

/** "Reset": the photo centred, not zoomed. */
export function resetCoverCrop(b: CoverBuilder): boolean {
  if (!editsTheCover(b) || !coverHasPhoto(b.coverFront)) return false;
  b.setBackgroundCrop({ focusX: 0.5, focusY: 0.5, zoom: 1 });
  return true;
}

/** "Remove photo" is offered only for a photo that is not one of the album's
 *  (an album photo is changed by tapping another, or a colour). */
export function canRemoveCoverPhoto(cover: AlbumPage): boolean {
  const bg = bgOf(cover);
  return bg?.type === 'image' && !bg.photoId;
}

export function removeCoverPhoto(b: CoverBuilder): boolean {
  if (!editsTheCover(b) || !canRemoveCoverPhoto(b.coverFront)) return false;
  b.setPageBackground({ type: 'solid', solid: COVER_PAPER });
  return true;
}

/* ── Title ─────────────────────────────────────────────────────────────── */

export type TitlePatch = Partial<Pick<TextElement, 'text' | 'fontFamily' | 'color' | 'bold' | 'italic' | 'alignment' | 'fontSize' | 'shadow' | 'outlineColor' | 'outlineWidth' | 'fillTo' | 'glow' | 'curve'>>;

/** CoverEditor updateTitle: setBoxText MERGES into the title, so only the
 *  patch goes, with the title's words (which it needs: empty words clear the
 *  box). */
export function updateTitle(b: CoverBuilder, patch: TitlePatch): boolean {
  if (!editsTheCover(b)) return false;
  b.setBoxText(0, { text: coverTitleOf(b.coverFront).text, ...patch });
  return true;
}

export const typeTitle = (b: CoverBuilder, text: string) => updateTitle(b, { text });
export const setTitleFont = (b: CoverBuilder, fontFamily: string) => updateTitle(b, { fontFamily });
/** A plain colour: the words in that one colour (a two-colour fill goes, as
 *  the colour list now offers gradients beside the colours). */
export const setTitleColour = (b: CoverBuilder, color: string) => updateTitle(b, { color, fillTo: undefined });
/** A gradient from the colour list: the words fade from its top to its bottom. */
export const setTitleGradient = (b: CoverBuilder, g: Pick<ColorGradient, 'top' | 'bottom'>) => updateTitle(b, { color: g.top, fillTo: g.bottom });
export const setTitleAlignment = (b: CoverBuilder, alignment: Align) => updateTitle(b, { alignment });
export const toggleTitleBold = (b: CoverBuilder) => updateTitle(b, { bold: !coverTitleOf(b.coverFront).bold });
export const toggleTitleItalic = (b: CoverBuilder) => updateTitle(b, { italic: !coverTitleOf(b.coverFront).italic });
/** Shadow on is no setting (every cover floats until switched off), off is
 *  false. A glow is in the shadow's place: Shadow takes it off and turns the shadow on. */
export function toggleTitleShadow(b: CoverBuilder): boolean {
  const t = coverTitleOf(b.coverFront);
  return updateTitle(b, t.glow ? { glow: undefined, shadow: undefined } : { shadow: t.shadow ? false : undefined });
}

/* ── WordArt: the app's own controls, on the fields every renderer draws ── */

export { OUTLINE_WIDTHS } from '../text/wordArtEdits';

/** No outline (0), or this thick. The first time, in the colour that stands out from the words. */
export function setTitleOutline(b: CoverBuilder, width: number): boolean {
  return updateTitle(b, outlinePatch(coverTitleOf(b.coverFront), width));
}
export function setTitleOutlineColour(b: CoverBuilder, outlineColor: string): boolean {
  return updateTitle(b, outlineColourPatch(coverTitleOf(b.coverFront), outlineColor));
}
/** The second colour of the fill, or none. */
export const setTitleFillTo = (b: CoverBuilder, fillTo: string | undefined) => updateTitle(b, { fillTo });
/** The glow's colour, or none. */
export const setTitleGlow = (b: CoverBuilder, glow: string | undefined) => updateTitle(b, { glow });
/** The words on a curve, or straight. */
export const setTitleCurve = (b: CoverBuilder, curve: WordArtCurve | undefined) => updateTitle(b, { curve });

/** The size slider (16 to 96, whole px). */
export function setTitleSize(b: CoverBuilder, px: number): boolean {
  return updateTitle(b, { fontSize: Math.round(clamp(px, TITLE_SIZE.min, TITLE_SIZE.max)) });
}

/** "Make it fit (size N)". */
export const fitTitle = (b: CoverBuilder, fitsAt: number) => updateTitle(b, { fontSize: fitsAt });

/* ── Where the title is, and how far it can move ───────────────────────── */

export interface TitleBox {
  /** The title box where its layout puts it, fractions of the cover. */
  baseX: number;
  baseY: number;
  w: number;
  h: number;
  /** The offsets that keep the whole box on the cover. */
  clampX(v: number): number;
  clampY(v: number): number;
}

/** The cover with no title: what is shown under the title's words while a
 *  finger moves them, so they are seen once, where the finger has them (the
 *  cover picture with the title in it would show it twice). Title changes
 *  alone leave this the same, so its picture is drawn again only when the
 *  rest of the cover changes. */
export function coverWithoutTitle(cover: AlbumPage): AlbumPage {
  const els = cover.textElements ?? [];
  return els.some((t) => t.boxIndex === 0) ? { ...cover, textElements: els.filter((t) => t.boxIndex !== 0) } : cover;
}

/** CoverEditor's title box: the cover layout's caption box 0 in the layout's
 *  margins (none on a full-bleed cover), as fractions of the cover, and the
 *  offset limits from the box's own place. With the album's size, the box
 *  stays in the safe print area (freeWords.wordsSafeArea, 0.25" in from the
 *  trim: owner, 2026-11-07, words dragged too close to an edge get cut off);
 *  without it, on the cover. Null for a cover with no title box. */
export function titleBoxOf(cover: AlbumPage, albumSize?: AlbumSizePreset): TitleBox | null {
  const tmpl = cover.templateId ? getTemplateById(cover.templateId) : null;
  const slot = tmpl?.textSlots?.[0];
  if (!tmpl || !slot) return null;
  const tm = tmpl.fullBleed ? { top: 0, bottom: 0, left: 0, right: 0 } : (tmpl.margin ?? { top: 0.04, bottom: 0.04, left: 0.04, right: 0.04 });
  const baseX = tm.left + slot.x * (1 - tm.left - tm.right);
  const baseY = tm.top + slot.y * (1 - tm.top - tm.bottom);
  const w = slot.width * (1 - tm.left - tm.right);
  const h = slot.height * (1 - tm.top - tm.bottom);
  // A box wider or taller than the room is tolerated (the range flips).
  const range = (v: number, lo: number, hi: number) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
  const room = albumSize ? (() => {
    const a = wordsSafeArea(albumSize, 0, true);
    const { width: uiW, height: uiH } = getCanvasDimensions(albumSize);
    return { x0: a.x / uiW, y0: a.y / uiH, x1: (a.x + a.w) / uiW, y1: (a.y + a.h) / uiH };
  })() : { x0: 0, y0: 0, x1: 1, y1: 1 };
  return {
    baseX, baseY, w, h,
    clampX: (v) => range(v, room.x0 - baseX, room.x1 - w - baseX),
    clampY: (v) => range(v, room.y0 - baseY, room.y1 - h - baseY),
  };
}

/** The title box as drawn now (its offset added), fractions of the cover. */
export function titleRectOf(cover: AlbumPage): { x: number; y: number; w: number; h: number } | null {
  const box = titleBoxOf(cover);
  if (!box) return null;
  const t = coverTitleOf(cover);
  return { x: box.baseX + t.offsetX, y: box.baseY + t.offsetY, w: box.w, h: box.h };
}

/** The title can be dragged: it has words and a box. */
export function titleMovable(cover: AlbumPage): boolean {
  return !!coverTitleOf(cover).text.trim() && !!titleBoxOf(cover);
}

/** Dragging the title: `dx`, `dy` as fractions of the cover, from where the
 *  finger came down when its offset was `from`. No undo step per move (the
 *  builder's setBoxTextOffset, as the website's drag). */
export function moveCoverTitle(b: CoverBuilder, from: { offsetX: number; offsetY: number }, dx: number, dy: number): boolean {
  if (!editsTheCover(b) || !titleMovable(b.coverFront)) return false;
  const box = titleBoxOf(b.coverFront, b.albumSize)!;
  b.setBoxTextOffset(0, box.clampX(from.offsetX + dx), box.clampY(from.offsetY + dy));
  return true;
}

