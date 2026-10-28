/* ══════════════════════════════════════════════════════════════════════════
   WHAT A TAP ON WORDS DOES, AND WHAT EACH SAVE CALLS: MobileReview.tsx, line
   for line, as plain functions (so the tests hold every call to the
   website's own arguments).

   Three kinds of words on a page, each saved through its own action of the
   website's album builder (useBuilderState, shared):
     • a caption box's words (template.textSlots): setBoxText;
     • words in a photo frame (the chooser's "Your Text" / "Add Quote"):
       setSlotText, with the page index;
     • a free text, like a theme title: updateTextElement by its id.
   A line from the quote pool (isPoolQuote) re-opens the quotes, not the
   typing editor (owner, 2026-10-20); an empty box Megy dealt goes straight
   to its kind's editor; any other empty box offers "Add to this box".
   ══════════════════════════════════════════════════════════════════════════ */
import type { AlbumPage, AlbumSizePreset, SlotText, TextElement } from '@web/pages/builder/types';
import { dealtBoxRoll, isPoolQuote } from '@web/pages/builder/types';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { captionBoxSize, captionFits, type Box, type CaptionStyle, type Fit, type Measurer } from '@web/pages/builder/textFit';
import { contrastOutline, WORDART_OUTLINE_WIDTH } from '@web/pages/builder/wordArtRules';
import { DEFAULT_TEXT_FONT } from '@web/pages/builder/fontCatalog';
import type { Target } from '../hitTest';
import { SIZE_MAX, SIZE_MIN, SIZE_STEP } from './words';

/** MobileTextEditor's BoxTextContent: what the editor opens with and saves. */
export type BoxTextContent = Pick<
  TextElement,
  'text' | 'fontSize' | 'fontFamily' | 'color' | 'bold' | 'italic' | 'underline' | 'alignment' | 'outlineColor' | 'outlineWidth' | 'shadow'
>;

/** Which words an editor or a quote picker is for. */
export type WordsTarget =
  | { kind: 'box'; boxIndex: number }
  | { kind: 'slot'; slotIndex: number }
  | { kind: 'free'; textId: string };

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
  if (target.kind === 'free') {
    const el = page.textElements?.find((t) => t.id === target.textId);
    return {
      text: el?.text ?? '', fontSize: el?.fontSize ?? 28,
      fontFamily: el?.fontFamily ?? GEORGIA,
      color: el?.color ?? '#2D2D2D', bold: el?.bold ?? false, italic: el?.italic ?? false,
      underline: el?.underline ?? false, alignment: el?.alignment ?? 'center',
      outlineColor: el?.outlineColor, outlineWidth: el?.outlineWidth, shadow: el?.shadow,
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

/** What the typing editor holds while it is open (MobileTextEditor's state). */
export interface EditorState {
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right';
  outline: boolean;
  shadow: boolean;
}

/** MobileTextEditor's useState defaults, from what it opens with. */
export function editorStateOf(initial: BoxTextContent): EditorState {
  return {
    text: initial.text,
    fontSize: initial.fontSize || 28,
    fontFamily: initial.fontFamily || DEFAULT_TEXT_FONT,
    color: initial.color || '#2D2D2D',
    bold: initial.bold ?? false,
    italic: initial.italic ?? false,
    underline: initial.underline ?? false,
    alignment: initial.alignment ?? 'center',
    outline: !!initial.outlineWidth,
    shadow: !!initial.shadow,
  };
}

/** MobileTextEditor save(): the outline is the colour's contrast at the
 *  WordArt width; no shadow is left out (not false). */
export function contentOf(s: EditorState): BoxTextContent {
  return {
    text: s.text, fontSize: s.fontSize, fontFamily: s.fontFamily, color: s.color,
    bold: s.bold, italic: s.italic, underline: s.underline, alignment: s.alignment,
    outlineColor: s.outline ? contrastOutline(s.color) : undefined,
    outlineWidth: s.outline ? WORDART_OUTLINE_WIDTH : undefined,
    shadow: s.shadow || undefined,
  };
}

/** The size buttons: 2 at a time, 14 to 80 (MobileTextEditor). */
export const smaller = (size: number) => Math.max(SIZE_MIN, size - SIZE_STEP);
export const bigger = (size: number) => Math.min(SIZE_MAX, size + SIZE_STEP);

type SaveActions = Pick<BuilderActions, 'setBoxText' | 'setSlotText' | 'updateTextElement'>;

/** MobileReview's three editors' onSave: the website's action, its arguments. */
export function saveWords(b: SaveActions, page: AlbumPage, pageIndex: number, target: WordsTarget, content: BoxTextContent): void {
  if (target.kind === 'box') {
    b.setBoxText(target.boxIndex, content);
  } else if (target.kind === 'slot') {
    // Cleared words take the slot text off, so the frame is a "+" again.
    b.setSlotText(target.slotIndex, content.text.trim() ? { ...content, quote: page.slotTexts?.[target.slotIndex]?.quote } as SlotText : null, pageIndex);
  } else {
    b.updateTextElement(target.textId, content);
  }
}

/** The caption box a caption must fit (design px), or null: only a caption
 *  box's editor says "Too long" (MobileReview passes `box` for it alone). */
export function fitBoxFor(page: AlbumPage, target: WordsTarget, albumSize: AlbumSizePreset, pageIndex: number, coverMode = false): Box | null {
  if (target.kind !== 'box') return null;
  return captionBoxSize(page, target.boxIndex, albumSize, pageIndex, { coverMode });
}

/** MobileTextEditor's fit: the renderers' own wrap, measured on the phone. */
export function fitOf(s: Pick<EditorState, 'text' | 'fontSize' | 'fontFamily' | 'bold' | 'italic'>, box: Box | null, m: Measurer | null): Fit | null {
  if (!box || !m) return null;
  return captionFits(s.text, { fontSize: s.fontSize, fontFamily: s.fontFamily, bold: s.bold, italic: s.italic }, box, m);
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
