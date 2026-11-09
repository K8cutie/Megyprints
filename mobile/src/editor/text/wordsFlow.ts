/* ══════════════════════════════════════════════════════════════════════════
   WHAT A TAP ON WORDS DOES, AND WHAT EACH SAVE CALLS: MobileReview.tsx, line
   for line, as plain functions (so the tests hold every call to the
   website's own arguments).

   Three kinds of words on a page, each saved through its own action of the
   website's album builder (useBuilderState, shared):
     • a caption box's words (template.textSlots): setBoxText;
     • words in a photo frame (the chooser's "Your Text" / "Add Quote"):
       setSlotText, with the page index;
     • a free text, like a theme title: updateTextElement by its id;
     • words placed by hand on a photo ("Add text", owner 2026-11-07:
       freeWords.ts): new ones go in with addPlacedWords, and every change
       places them again (as wide as their words, their middle kept, inside
       the safe print area). Emptied words come off the page.
   A line from the quote pool (isPoolQuote) re-opens the quotes, not the
   typing editor (owner, 2026-10-20); an empty box Megy dealt goes straight
   to its kind's editor; any other empty box offers "Add to this box".
   Every kind takes WordArt (the cover title's: outline, two colours, glow,
   shape), as the cover title does (owner, 2026-11-07).
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, SlotText, TextElement } from '@web/pages/builder/types';
import { dealtBoxRoll, isPoolQuote } from '@web/pages/builder/types';
import { pageWithBoxText, pageWithSlotText, pageWithTextUpdate, type BuilderActions } from '@web/pages/builder/useBuilderState';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { captionBoxRect, captionBoxSize, captionFits, slotBoxRect, slotBoxSize, type Box, type BoxRect, type CaptionStyle, type Fit, type Measurer } from '@web/pages/builder/textFit';
import { type WordArtCurve } from '@web/pages/builder/wordArtRules';
import { DEFAULT_TEXT_FONT } from '@web/pages/builder/fontCatalog';
import {
  curveInBoxFit, freeSpot, isPlacedWords, NEW_WORDS_LOOK, newPlacedWords, placedWordsFit, placeWords, wordsInk, wordsMiddle, wordsSafeArea, type Area,
} from '@web/pages/builder/freeWords';
import { bundledFace } from '../../render/fontTable';
import type { Target } from '../hitTest';
import { catalogFace, fontSource } from './fonts/fontSources';
import { SIZE_MAX, SIZE_MIN, SIZE_STEP } from './words';

/** MobileTextEditor's BoxTextContent: what the editor opens with and saves,
 *  WordArt with it. */
export type BoxTextContent = Pick<
  TextElement,
  'text' | 'fontSize' | 'fontFamily' | 'color' | 'bold' | 'italic' | 'underline' | 'alignment' | 'outlineColor' | 'outlineWidth' | 'shadow'
  | 'fillTo' | 'glow' | 'curve'
>;

/** Which words an editor or a quote picker is for. `newWords`: words placed
 *  by hand that are not on the page yet, their middle at (cx, cy), design px. */
export type WordsTarget =
  | { kind: 'box'; boxIndex: number }
  | { kind: 'slot'; slotIndex: number }
  | { kind: 'free'; textId: string }
  | { kind: 'newWords'; textId: string; cx: number; cy: number };

/** The words a tapped target stands for (null: not words). */
export function wordsTargetOf(t: Target): WordsTarget | null {
  switch (t.kind) {
    case 'boxText':
    case 'emptyBox':
      return { kind: 'box', boxIndex: t.index };
    case 'slotText':
    case 'emptySlot':
      return { kind: 'slot', slotIndex: t.index };
    case 'freeText':
      return t.textId ? { kind: 'free', textId: t.textId } : null;
    default:
      return null;
  }
}

/** Georgia, as the website's editor writes it (MobileReview's defaults). */
const GEORGIA = 'Georgia, "Times New Roman", serif';

/** MobileReview buildInitial / buildSlotTextInitial / buildTextInitial: what
 *  the typing editor opens with. */
export function initialContent(page: AlbumPage, target: WordsTarget): BoxTextContent {
  if (target.kind === 'newWords') {
    const { fontSize, fontFamily, color, bold, italic, underline, alignment, outlineColor, outlineWidth, shadow } = NEW_WORDS_LOOK;
    return { text: '', fontSize, fontFamily, color, bold, italic, underline, alignment, outlineColor, outlineWidth, shadow };
  }
  if (target.kind === 'free') {
    const el = page.textElements?.find((t) => t.id === target.textId);
    return {
      text: el?.text ?? '', fontSize: el?.fontSize ?? 28,
      fontFamily: el?.fontFamily ?? GEORGIA,
      color: el?.color ?? '#2D2D2D', bold: el?.bold ?? false, italic: el?.italic ?? false,
      underline: el?.underline ?? false, alignment: el?.alignment ?? 'center',
      outlineColor: el?.outlineColor, outlineWidth: el?.outlineWidth, shadow: el?.shadow,
      fillTo: el?.fillTo, glow: el?.glow, curve: el?.curve,
    };
  }
  if (target.kind === 'slot') return slotTextInitial(page, target.slotIndex);
  const existing = page.textElements?.find((t) => t.boxIndex === target.boxIndex);
  if (existing) {
    return {
      text: existing.text, fontSize: existing.fontSize, fontFamily: existing.fontFamily,
      color: existing.color, bold: existing.bold, italic: existing.italic,
      underline: existing.underline, alignment: existing.alignment,
      outlineColor: existing.outlineColor, outlineWidth: existing.outlineWidth, shadow: existing.shadow,
      fillTo: existing.fillTo, glow: existing.glow, curve: existing.curve,
    };
  }
  const template = page.templateId ? getTemplateById(page.templateId) : null;
  const ts = template?.textSlots?.[target.boxIndex];
  return {
    text: '', fontSize: 28, fontFamily: GEORGIA,
    color: '#2D2D2D', bold: false, italic: false, underline: false,
    alignment: ts?.align ?? 'center',
  };
}

/** MobileReview buildSlotTextInitial. */
export function slotTextInitial(page: AlbumPage, slotIndex: number): BoxTextContent {
  const existing = page.slotTexts?.[slotIndex];
  if (existing) return { ...existing };
  return {
    text: '', fontSize: 28, fontFamily: GEORGIA,
    color: '#2D2D2D', bold: false, italic: false, underline: false, alignment: 'center',
  };
}

/** What the typing editor holds while it is open (MobileTextEditor's state,
 *  with the cover title's WordArt). */
export interface EditorState {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right';
  /** Design px; 0 = no outline. */
  outlineWidth: number;
  outlineColor?: string;
  /** The shadow shows (a glow takes its place). */
  shadow: boolean;
  fillTo?: string;
  glow?: string;
  curve?: WordArtCurve;
}

/** MobileTextEditor's useState defaults, from what it opens with. On the
 *  cover (`onCover`) words float on a shadow unless it was switched off
 *  (wordArtShadow): no setting is "on". */
export function editorStateOf(initial: BoxTextContent, onCover = false): EditorState {
  return {
    text: initial.text,
    fontSize: initial.fontSize || 28,
    fontFamily: initial.fontFamily || DEFAULT_TEXT_FONT,
    color: initial.color || '#2D2D2D',
    bold: initial.bold ?? false,
    italic: initial.italic ?? false,
    underline: initial.underline ?? false,
    alignment: initial.alignment ?? 'center',
    outlineWidth: initial.outlineWidth && initial.outlineColor ? initial.outlineWidth : 0,
    outlineColor: initial.outlineColor,
    shadow: !initial.glow && (onCover ? initial.shadow !== false : !!initial.shadow),
    fillTo: initial.fillTo,
    glow: initial.glow,
    curve: initial.curve,
  };
}

/** What Done saves. No shadow is left out (not false); on the cover the shadow
 *  is on by itself, so off is false. A glow leaves the shadow unset: it takes
 *  its place. */
export function contentOf(s: EditorState, onCover = false): BoxTextContent {
  const outlined = s.outlineWidth > 0 && !!s.outlineColor;
  return {
    text: s.text, fontSize: s.fontSize, fontFamily: s.fontFamily, color: s.color,
    bold: s.bold, italic: s.italic, underline: s.underline, alignment: s.alignment,
    outlineColor: outlined ? s.outlineColor : undefined,
    outlineWidth: outlined ? s.outlineWidth : undefined,
    shadow: s.glow ? undefined : onCover ? (s.shadow ? undefined : false) : (s.shadow || undefined),
    fillTo: s.fillTo || undefined,
    glow: s.glow || undefined,
    curve: s.curve || undefined,
  };
}

/** The Shadow button: on and off; with a glow, it takes the glow off and the shadow comes back. */
export function shadowToggled(s: EditorState): Partial<EditorState> {
  return s.glow ? { glow: undefined, shadow: true } : { shadow: !s.shadow };
}

/** The size buttons: 2 at a time, 14 to 80 (MobileTextEditor). */
export const smaller = (size: number) => Math.max(SIZE_MIN, size - SIZE_STEP);
export const bigger = (size: number) => Math.min(SIZE_MAX, size + SIZE_STEP);

type SaveActions = Pick<BuilderActions, 'setBoxText' | 'setSlotText' | 'updateTextElement'> & Partial<Pick<BuilderActions, 'deleteTextElement' | 'addPlacedWords'>>;

/** What a frame's words are saved as. Cleared words take the slot text off,
 *  so the frame is a "+" again. */
function slotWords(page: AlbumPage, slotIndex: number, content: BoxTextContent): SlotText | null {
  return content.text.trim() ? { ...content, quote: page.slotTexts?.[slotIndex]?.quote } as SlotText : null;
}

/** Placing words by hand on one page: where they may go (the safe print
 *  area), and the page fonts to measure them in (null before they load: the
 *  words' rough size, freeWords.wordsInk). */
export interface Placer {
  area: Area;
  measurer: Measurer | null;
  /** New words with `content`, placed where `target` says (lower when placed words are there). */
  add(page: AlbumPage, target: Extract<WordsTarget, { kind: 'newWords' }>, content: BoxTextContent): TextElement;
  /** What updateTextElement takes for these words now: placed words are placed
   *  again (their middle where it was); any other free text, the content as it is. */
  update(el: TextElement, content: BoxTextContent): Partial<TextElement>;
}

export function placerFor(albumSize: AlbumSizePreset, pageIndex: number, coverMode: boolean, measurer: Measurer | null): Placer {
  const area = wordsSafeArea(albumSize, pageIndex, coverMode);
  return {
    area,
    measurer,
    add(page, target, content) {
      // Not on top of words already there: placed words, and caption boxes with
      // words in them (the cover's title among them, where it was moved to).
      const captions = (page.textElements ?? [])
        .filter((t) => t.boxIndex != null && (t.text ?? '').trim())
        .map((t) => captionBoxRect(page, t.boxIndex!, albumSize, pageIndex, { coverMode }))
        .filter((r): r is NonNullable<typeof r> => !!r);
      // Placed once where asked, for their size; then where there is room.
      const first = newPlacedWords(target.textId, content, { cx: target.cx, cy: target.cy }, measurer, area);
      const ink = wordsInk(first, measurer);
      const size = { w: ink.right - ink.left, h: ink.bottom - ink.top };
      const spot = freeSpot(page.textElements ?? [], wordsMiddle(first, measurer), measurer, area, captions, size);
      return newPlacedWords(target.textId, content, spot, measurer, area);
    },
    update(el, content) {
      if (!isPlacedWords(el)) return content;
      const placed = placeWords({ ...el, ...content }, measurer, area, wordsMiddle(el, measurer));
      return { ...content, x: placed.x, y: placed.y, width: placed.width };
    },
  };
}

/** MobileReview's three editors' onSave: the website's action, its arguments.
 *  Words placed by hand: new ones go in placed (addPlacedWords); emptied ones
 *  come off the page; a change places them again (`place`). */
export function saveWords(b: SaveActions, page: AlbumPage, pageIndex: number, target: WordsTarget, content: BoxTextContent, place?: Placer): void {
  if (target.kind === 'box') {
    b.setBoxText(target.boxIndex, content);
  } else if (target.kind === 'slot') {
    b.setSlotText(target.slotIndex, slotWords(page, target.slotIndex, content), pageIndex);
  } else if (target.kind === 'newWords') {
    if (!content.text.trim() || !place) return;
    b.addPlacedWords?.(place.add(page, target, content));
  } else {
    const el = page.textElements?.find((t) => t.id === target.textId);
    if (!content.text.trim() && b.deleteTextElement && el && isPlacedWords(el)) { b.deleteTextElement(target.textId); return; }
    b.updateTextElement(target.textId, el && place ? place.update(el, content) : content);
  }
}

/** The page as saveWords would leave it, to draw above the editor: nothing is
 *  saved. The same words give the same page, so a picture is drawn only once. */
export function pageWithWords(page: AlbumPage, target: WordsTarget, content: BoxTextContent, place?: Placer): AlbumPage {
  if (target.kind === 'box') {
    return pageWithBoxText(page, target.boxIndex, content, { fontFamily: content.fontFamily, textColor: content.color }, () => `box-${target.boxIndex}-being-typed`);
  }
  if (target.kind === 'slot') return pageWithSlotText(page, target.slotIndex, slotWords(page, target.slotIndex, content));
  if (target.kind === 'newWords') {
    if (!content.text.trim() || !place) return page;
    return { ...page, textElements: [...(page.textElements ?? []), place.add(page, target, content)] };
  }
  const el = page.textElements?.find((t) => t.id === target.textId);
  return pageWithTextUpdate(page, target.textId, el && place ? place.update(el, content) : content);
}

/** The thing on the page these words are, to outline while they are edited
 *  (new words: once they are on the page being drawn). */
export function targetOfWords(targets: readonly Target[], words: WordsTarget): Target | null {
  const want = words.kind === 'newWords' ? { kind: 'free' as const, textId: words.textId } : words;
  return targets.find((t) => {
    const w = wordsTargetOf(t);
    if (!w || w.kind !== want.kind) return false;
    if (w.kind === 'box') return w.boxIndex === (want as { boxIndex: number }).boxIndex;
    if (w.kind === 'slot') return w.slotIndex === (want as { slotIndex: number }).slotIndex;
    return w.textId === (want as { textId: string }).textId;
  }) ?? null;
}

/** A new id for words placed by hand. It starts "theme-quote-" on purpose:
 *  the live website and app builds before 2.0.8 put any free text into an
 *  empty caption box when an album opens (bindStrandedCaptions), except one
 *  whose id starts so. Until every one of them has this build's rule (it
 *  skips `placed`), the start is what keeps placed words where they were put
 *  if such an album is opened there. Nothing else reads it: placed words are
 *  known by `placed` (freeWords.isPlacedWords). */
export const newWordsId = (): string => `theme-quote-placed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Words placed by hand: new ones, or ones on the page. */
export function isPlacedTarget(page: AlbumPage, target: WordsTarget): boolean {
  if (target.kind === 'newWords') return true;
  return target.kind === 'free' && isPlacedWords(page.textElements?.find((t) => t.id === target.textId));
}

/** The box words must fit (design px), or null. A caption box's editor says
 *  "Too long" (MobileReview passes `box` for it alone); so does a photo
 *  frame's, for words on a curve (they aren't clipped to the frame: the
 *  editor asks only then). Placed words: placedFit. */
export function fitBoxFor(page: AlbumPage, target: WordsTarget, albumSize: AlbumSizePreset, pageIndex: number, coverMode = false): Box | null {
  if (target.kind === 'slot') return slotBoxSize(page, target.slotIndex, albumSize, pageIndex, { coverMode });
  if (target.kind !== 'box') return null;
  return captionBoxSize(page, target.boxIndex, albumSize, pageIndex, { coverMode });
}

/** Placed words too long for the page, measured as fitOf measures (not while
 *  their font is one from the internet the phone hasn't got yet). */
export function placedFit(s: EditorState, place: Placer, onCover = false): Fit | null {
  const face = catalogFace(s.fontFamily);
  if (face && fontSource(face) === 'google' && bundledFace(face) === null) return null;
  return placedWordsFit(contentOf(s, onCover), place.measurer, place.area);
}

/** Where a caption box or a photo frame is on the page (design px), for
 *  words on a curve in it; null for any other words. */
export function boxRectFor(page: AlbumPage, target: WordsTarget, albumSize: AlbumSizePreset, pageIndex: number, coverMode = false): BoxRect | null {
  if (target.kind === 'box') return captionBoxRect(page, target.boxIndex, albumSize, pageIndex, { coverMode });
  if (target.kind === 'slot') return slotBoxRect(page, target.slotIndex, albumSize, pageIndex, { coverMode });
  return null;
}

/** Words on a curve in a caption box or a photo frame: a curve isn't clipped
 *  to its box, so they must fit its width AND keep their letters in the safe
 *  print area (freeWords.curveInBoxFit; reviewer, 2026-11-07: an arch in a
 *  bottom band reached past the page's edge). Measured as fitOf measures. */
export function curveFit(s: EditorState, rect: BoxRect, place: Placer, onCover = false): Fit | null {
  const face = catalogFace(s.fontFamily);
  if (face && fontSource(face) === 'google' && bundledFace(face) === null) return null;
  return curveInBoxFit(contentOf(s, onCover), rect, place.area, place.measurer);
}

/** MobileTextEditor's fit: the renderers' own wrap, measured on the phone.
 *  Not while the words' font is one from the internet that is not on the
 *  phone yet (offline, or still being fetched for an album made on the
 *  website): measured in the phone's stand-in font, the answer and the size
 *  "Make it fit" offers would be a guess. The editor asks again when the
 *  font arrives (useFontStoreVersion). Georgia, which no phone has, is
 *  measured in the stand-in the page is drawn in. */
export function fitOf(s: Pick<EditorState, 'text' | 'fontSize' | 'fontFamily' | 'bold' | 'italic'> & { curve?: WordArtCurve }, box: Box | null, m: Measurer | null): Fit | null {
  if (!box || !m) return null;
  const face = catalogFace(s.fontFamily);
  if (face && fontSource(face) === 'google' && bundledFace(face) === null) return null;
  return captionFits(s.text, { fontSize: s.fontSize, fontFamily: s.fontFamily, bold: s.bold, italic: s.italic, curve: s.curve }, box, m);
}

/** The words as they were opened, unchanged: Done (or back) saves nothing,
 *  so it adds no step to Undo that changes nothing. */
export function sameWords(a: BoxTextContent, b: BoxTextContent): boolean {
  const keys: (keyof BoxTextContent)[] = ['text', 'fontSize', 'fontFamily', 'color', 'bold', 'italic', 'underline', 'alignment', 'outlineColor', 'outlineWidth', 'shadow', 'fillTo', 'glow', 'curve'];
  return keys.every((k) => (a[k] ?? null) === (b[k] ?? null));
}

/* ── Taps ── */

/** What a tap on words opens: the quotes, the typing editor, or (null) the
 *  screen's own "Add to this box". MobileReview onSlotTextTap, onTextSlotTap,
 *  onTextTap and onChooseTextSlot. */
export function tapOpens(page: AlbumPage, t: Target): 'quotes' | 'editor' | null {
  switch (t.kind) {
    case 'boxText': {
      const line = page.textElements?.find((e) => e.boxIndex === t.index);
      return isPoolQuote(line, dealtBoxRoll(page, t.index)) ? 'quotes' : 'editor';
    }
    case 'slotText':
      return isPoolQuote(page.slotTexts?.[t.index]) ? 'quotes' : 'editor';
    case 'freeText':
      return 'editor';
    case 'emptyBox': {
      const roll = dealtBoxRoll(page, t.index);
      return roll === 'text' ? 'editor' : roll === 'quote' ? 'quotes' : null;
    }
    default:
      return null;
  }
}

/* ── Quotes ── */

/** The quote picker's opening: the line there now, and (a quote box with no
 *  words yet) start writing at once (QuotePickerModal autoWrite). */
export function quoteOpening(page: AlbumPage, target: WordsTarget): { initial: string | null; autoWrite: boolean } {
  if (target.kind === 'box') {
    return {
      initial: page.textElements?.find((t) => t.boxIndex === target.boxIndex)?.text ?? null,
      autoWrite: !page.textElements?.some((t) => t.boxIndex === target.boxIndex),
    };
  }
  if (target.kind === 'slot') return { initial: page.slotTexts?.[target.slotIndex]?.text ?? null, autoWrite: false };
  return { initial: null, autoWrite: false };
}

type QuoteActions = Pick<BuilderActions, 'setBoxText' | 'setSlotText'>;

/** A picked line (onPick): a quote box takes it italic and flagged as from
 *  the pool; a photo frame keeps its words' look. */
export function pickQuote(b: QuoteActions, page: AlbumPage, pageIndex: number, target: WordsTarget, quote: string): void {
  if (target.kind === 'box') b.setBoxText(target.boxIndex, { text: quote, italic: true, quote: true }, pageIndex);
  else if (target.kind === 'slot') b.setSlotText(target.slotIndex, { ...slotTextInitial(page, target.slotIndex), text: quote, italic: true, quote: true } as SlotText, pageIndex);
}

/** "Remove quote" (onRemove). */
export function removeQuote(b: QuoteActions, pageIndex: number, target: WordsTarget): void {
  if (target.kind === 'box') b.setBoxText(target.boxIndex, { text: '' }, pageIndex);
  else if (target.kind === 'slot') b.setSlotText(target.slotIndex, null, pageIndex);
}

/** The box a "Write a line" quote is written for (lib/photoQuotes quoteBoxFor,
 *  a browser file): the box, and the style its line prints in (the line there
 *  now, or a picked quote's: size 28, italic, Playfair Display). Only a
 *  caption box has one; a photo frame's quote is written to the caption cap. */
export function quoteBoxFor(page: AlbumPage, target: WordsTarget, albumSize: AlbumSizePreset, pageIndex: number): { box: Box; style: CaptionStyle } | null {
  if (target.kind !== 'box') return null;
  const box = captionBoxSize(page, target.boxIndex, albumSize, pageIndex);
  if (!box) return null;
  const t = page.textElements?.find((e) => e.boxIndex === target.boxIndex);
  return { box, style: { fontSize: t?.fontSize ?? 28, fontFamily: t?.fontFamily ?? '"Playfair Display", serif', bold: t?.bold ?? false, italic: true } };
}
