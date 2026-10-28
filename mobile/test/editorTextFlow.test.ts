/* ══════════════════════════════════════════════════════════════════════════
   PART 2 (WORDS) IN THE "EDIT PAGES" SCREEN, on an album made through the
   app's own steps and the real shared builder (test/editorHarness.ts).

   Every tap goes through the hit test and the registry, as the screen does,
   and every save is held to MobileReview.tsx: the same action of the
   website's useBuilderState, with the same arguments the website's phone
   editor passes (a spy wraps the real builder and records each call), and
   the album changes as it does on the website (Undo included).
   ══════════════════════════════════════════════════════════════════════════ */
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { captionBoxSize, captionFits } from '@web/pages/builder/textFit';
import { contrastOutline, WORDART_OUTLINE_WIDTH } from '@web/pages/builder/wordArtRules';
import { PAGE_COLORS } from '@web/pages/builder/pageColors';
import type { AlbumPage } from '@web/pages/builder/types';
import { addChoicesFor, ADD_TO_BOX_SHEET, toolsFor, type EditorContext } from '../src/editor/registry';
import { editThePages } from '../src/editor/scope';
import type { Target } from '../src/editor/hitTest';
import '../src/editor/parts';
import { TEXT_SHEETS } from '../src/editor/text';
import { pickPageColour, pickPageColourEverywhere } from '../src/editor/text/PageColourSheet';
import {
  bigger, contentOf, editorStateOf, fitBoxFor, fitOf, initialContent, pickQuote, quoteBoxFor, quoteOpening, removeQuote,
  saveWords, slotTextInitial, smaller, tapOpens, type WordsTarget,
} from '../src/editor/text/wordsFlow';
import { PageText } from '../src/render/pageText';
import { skiaTextMeasurer } from '../src/builder/textMeasurer';
import { fontFiles, headlessSkia } from './golden/headless';
import { act, builder, ctxOn, madeAlbum, tapOn, useEditorBench } from './editorHarness';

useEditorBench();

type Call = [string, ...unknown[]];
const WATCHED = ['setBoxText', 'setSlotText', 'updateTextElement', 'setPageColor', 'applyPageColorToAllPages'] as const;

/** The real builder, every watched action recorded with its arguments. */
function spied(b: BuilderActions, calls: Call[]): BuilderActions {
  return new Proxy(b, {
    get(target, key, recv) {
      const v = Reflect.get(target, key, recv);
      if (typeof key === 'string' && (WATCHED as readonly string[]).includes(key) && typeof v === 'function') {
        return (...args: unknown[]) => { calls.push([key, ...args]); return (v as (...a: unknown[]) => unknown)(...args); };
      }
      return v;
    },
  });
}

async function onPage(i: number) {
  await act(async () => { editThePages(builder()); });
  await act(async () => { builder().goToPage(i); });
}

const page = (i: number) => builder().albumPages[i];
const targetOf = (platform: Parameters<typeof ctxOn>[0], kind: Target['kind'], index?: number) =>
  ctxOn(platform).targets.find((t) => t.kind === kind && (index == null || t.index === index))!;

describe('a tap on words opens what the website opens', () => {
  it('an empty box Megy dealt "text" opens the text editor; one dealt "quote" opens the quotes', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    // Page 5 (index 5) holds a quote box and a text box.
    await onPage(5);
    expect(page(5).textSlotRoll).toEqual(['quote', 'text']);
    const sheets: { id: string; params: unknown }[] = [];
    expect(await tapOn(platform, targetOf(platform, 'emptyBox', 1), sheets)).toBe('rule');
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target: { kind: 'box', boxIndex: 1 } } });
    expect(ctxOn(platform).selected?.key).toBe('box:1');
    expect(await tapOn(platform, targetOf(platform, 'emptyBox', 0), sheets)).toBe('rule');
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.quotes, params: { target: { kind: 'box', boxIndex: 0 } } });
  });

  it('an empty box nobody dealt is left to "Add to this box" (Add Quote, Your Text, in that order)', () => {
    const p = { id: 'p', textSlotRoll: [null], textElements: [] } as unknown as AlbumPage;
    const box: Target = { kind: 'emptyBox', index: 0, key: 'box:0', box: { x: 0, y: 0, w: 1, h: 1 }, rotation: 0, pivot: 'center', scaleX: 1, scaleY: 1, shape: 'rect', z: 5 };
    expect(tapOpens(p, box)).toBeNull();
    expect(tapOpens({ ...p, textSlotRoll: ['qr'] } as unknown as AlbumPage, box)).toBeNull(); // a retired QR roll
    const choices = addChoicesFor('emptyBox').filter((c) => c.id === 'quote' || c.id === 'text');
    expect(choices.map((c) => [c.id, c.label, c.desc, c.short])).toEqual([
      ['quote', 'Add Quote', 'Megy writes a line from the photos on this page', 'Quote'],
      ['text', 'Your Text', 'Type your own caption or title', 'Text'],
    ]);
  });

  it('an empty photo frame: "Add to this box" offers Add Quote and Your Text; each opens its sheet for the frame', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    await act(async () => { builder().clearSlot(0); });
    const sheets: { id: string; params: unknown }[] = [];
    expect(await tapOn(platform, targetOf(platform, 'emptySlot', 0), sheets)).toBe('add');
    expect(sheets.pop()?.id).toBe(ADD_TO_BOX_SHEET);
    const ids = addChoicesFor('emptySlot').map((c) => c.id);
    expect(ids.indexOf('quote')).toBeLessThan(ids.indexOf('text'));
    const ctx = ctxOn(platform, sheets);
    await act(async () => { addChoicesFor('emptySlot').find((c) => c.id === 'text')!.onPick(targetOf(platform, 'emptySlot', 0), ctx); });
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target: { kind: 'slot', slotIndex: 0 } } });
    await act(async () => { addChoicesFor('emptySlot').find((c) => c.id === 'quote')!.onPick(targetOf(platform, 'emptySlot', 0), ctx); });
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.quotes, params: { target: { kind: 'slot', slotIndex: 0 } } });
  });
});

describe('the text editor saves through the website’s actions, with its arguments', () => {
  it('a caption box: setBoxText(box, content), the current page; tapping the words again opens the editor on them; Undo takes them off', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4); // one box, dealt "text"
    const target: WordsTarget = { kind: 'box', boxIndex: 0 };
    const start = initialContent(page(4), target);
    // MobileReview buildInitial: Georgia 28, charcoal, the template's alignment.
    expect(start).toMatchObject({ text: '', fontSize: 28, fontFamily: 'Georgia, "Times New Roman", serif', color: '#2D2D2D', bold: false, italic: false, underline: false });
    const s = { ...editorStateOf(start), text: 'Our first beach day', bold: true, outline: true, color: '#1F3A5F', fontSize: bigger(bigger(28)) };
    const content = contentOf(s);
    expect(content).toEqual({
      text: 'Our first beach day', fontSize: 32, fontFamily: 'Georgia, "Times New Roman", serif', color: '#1F3A5F',
      bold: true, italic: false, underline: false, alignment: start.alignment,
      outlineColor: contrastOutline('#1F3A5F'), outlineWidth: WORDART_OUTLINE_WIDTH, shadow: undefined,
    });
    const calls: Call[] = [];
    await act(async () => { saveWords(spied(builder(), calls), page(4), 4, target, content); });
    expect(calls).toEqual([['setBoxText', 0, content]]);
    const saved = page(4).textElements.find((t) => t.boxIndex === 0)!;
    expect(saved).toMatchObject({ text: 'Our first beach day', bold: true, fontSize: 32, color: '#1F3A5F', outlineWidth: WORDART_OUTLINE_WIDTH });

    const sheets: { id: string; params: unknown }[] = [];
    expect(await tapOn(platform, targetOf(platform, 'boxText', 0), sheets)).toBe('rule');
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target } });
    expect(initialContent(page(4), target)).toMatchObject({ text: 'Our first beach day', bold: true, fontSize: 32 });

    await act(async () => { builder().undo(); });
    expect(page(4).textElements.find((t) => t.boxIndex === 0)).toBeUndefined();
  });

  it('words in a photo frame: setSlotText(frame, content + its quote flag, page); cleared words take them off (null)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    await act(async () => { builder().clearSlot(0); });
    const target: WordsTarget = { kind: 'slot', slotIndex: 0 };
    const content = contentOf({ ...editorStateOf(slotTextInitial(page(0), 0)), text: 'Hello', italic: true });
    const calls: Call[] = [];
    await act(async () => { saveWords(spied(builder(), calls), page(0), 0, target, content); });
    expect(calls).toEqual([['setSlotText', 0, { ...content, quote: undefined }, 0]]);
    expect(page(0).slotTexts?.[0]).toMatchObject({ text: 'Hello', italic: true });
    expect(targetOf(platform, 'slotText', 0)).toBeTruthy();
    const sheets: { id: string; params: unknown }[] = [];
    await tapOn(platform, targetOf(platform, 'slotText', 0), sheets);
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target } });

    calls.length = 0;
    const cleared = { ...content, text: '   ' };
    await act(async () => { saveWords(spied(builder(), calls), page(0), 0, target, cleared); });
    expect(calls).toEqual([['setSlotText', 0, null, 0]]);
    expect(page(0).slotTexts?.[0]).toBeNull();
  });

  it('a free text (a title): updateTextElement(its id, content)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(1);
    await act(async () => { builder().addTextElement(400, 300, 'Hi there'); });
    const id = page(1).textElements.find((t) => t.boxIndex == null)!.id;
    const t = targetOf(platform, 'freeText');
    expect(t.textId).toBe(id);
    const sheets: { id: string; params: unknown }[] = [];
    await tapOn(platform, t, sheets);
    const target: WordsTarget = { kind: 'free', textId: id };
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target } });
    const content = contentOf({ ...editorStateOf(initialContent(page(1), target)), text: 'Our trip', shadow: true, alignment: 'left' });
    const calls: Call[] = [];
    await act(async () => { saveWords(spied(builder(), calls), page(1), 1, target, content); });
    expect(calls).toEqual([['updateTextElement', id, content]]);
    expect(page(1).textElements.find((e) => e.id === id)).toMatchObject({ text: 'Our trip', shadow: true, alignment: 'left' });
  });

  it('the size goes 2 at a time between 14 and 80', () => {
    expect(smaller(16)).toBe(14);
    expect(smaller(14)).toBe(14);
    expect(bigger(78)).toBe(80);
    expect(bigger(80)).toBe(80);
  });
});

describe('quotes', () => {
  it('a quote box: a picked line is setBoxText(box, { text, italic, quote }, page); tapping it opens the quotes; Remove clears it', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3); // one box, dealt "quote"
    const target: WordsTarget = { kind: 'box', boxIndex: 0 };
    expect(quoteOpening(page(3), target)).toEqual({ initial: null, autoWrite: true });
    const calls: Call[] = [];
    await act(async () => { pickQuote(spied(builder(), calls), page(3), 3, target, 'Two hearts, one journey'); });
    expect(calls).toEqual([['setBoxText', 0, { text: 'Two hearts, one journey', italic: true, quote: true }, 3]]);
    expect(quoteOpening(page(3), target)).toEqual({ initial: 'Two hearts, one journey', autoWrite: false });
    const sheets: { id: string; params: unknown }[] = [];
    await tapOn(platform, targetOf(platform, 'boxText', 0), sheets);
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.quotes, params: { target } });

    calls.length = 0;
    await act(async () => { removeQuote(spied(builder(), calls), 3, target); });
    expect(calls).toEqual([['setBoxText', 0, { text: '' }, 3]]);
    expect(page(3).textElements.find((t) => t.boxIndex === 0)).toBeUndefined();
  });

  it('typed words in a quote box open the editor, not the quotes (isPoolQuote)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    await act(async () => { saveWords(builder(), page(3), 3, { kind: 'box', boxIndex: 0 }, contentOf({ ...editorStateOf(initialContent(page(3), { kind: 'box', boxIndex: 0 })), text: 'My own words' })); });
    const sheets: { id: string; params: unknown }[] = [];
    await tapOn(platform, targetOf(platform, 'boxText', 0), sheets);
    expect(sheets.pop()?.id).toBe(TEXT_SHEETS.edit);
  });

  it('a photo frame: the line keeps the frame’s look, italic and flagged; Remove is setSlotText(frame, null, page)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    await act(async () => { builder().clearSlot(0); });
    const target: WordsTarget = { kind: 'slot', slotIndex: 0 };
    const calls: Call[] = [];
    await act(async () => { pickQuote(spied(builder(), calls), page(0), 0, target, 'Forever starts today'); });
    expect(calls).toEqual([['setSlotText', 0, { ...slotTextInitial({ ...page(0), slotTexts: [] } as AlbumPage, 0), text: 'Forever starts today', italic: true, quote: true }, 0]]);
    const sheets: { id: string; params: unknown }[] = [];
    await tapOn(platform, targetOf(platform, 'slotText', 0), sheets);
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.quotes, params: { target } });
    calls.length = 0;
    await act(async () => { removeQuote(spied(builder(), calls), 0, target); });
    expect(calls).toEqual([['setSlotText', 0, null, 0]]);
  });

  it('a line is written for the box it goes in (lib/photoQuotes quoteBoxFor): its size, and the style it prints in', async () => {
    await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    const qb = quoteBoxFor(page(3), { kind: 'box', boxIndex: 0 }, builder().albumSize, 3)!;
    expect(qb.box).toEqual(captionBoxSize(page(3), 0, builder().albumSize, 3));
    expect(qb.style).toEqual({ fontSize: 28, fontFamily: '"Playfair Display", serif', bold: false, italic: true });
    expect(quoteBoxFor(page(3), { kind: 'slot', slotIndex: 0 }, builder().albumSize, 3)).toBeNull();
  });
});

describe('"Too long for this box" (the website’s caption fit, measured with the phone’s page fonts)', () => {
  it('only a caption box says it, with the size it would fit at', async () => {
    await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const Sk = await headlessSkia();
    const m = skiaTextMeasurer(new PageText(Sk, fontFiles()));
    const target: WordsTarget = { kind: 'box', boxIndex: 0 };
    const box = fitBoxFor(page(4), target, builder().albumSize, 4)!;
    expect(box).toEqual(captionBoxSize(page(4), 0, builder().albumSize, 4));
    const long = 'The castle lights came on and none of us wanted this happy day to end so we stayed a little longer together under the bright night sky and talked about every ride we took that day';
    const s = { ...editorStateOf(initialContent(page(4), target)), text: long, fontFamily: '"Playfair Display", serif', fontSize: 40 };
    const fit = fitOf(s, box, m)!;
    expect(fit).toEqual(captionFits(long, { fontSize: 40, fontFamily: '"Playfair Display", serif', bold: false, italic: false }, box, m));
    expect(fit.fits).toBe(false);
    expect(fit.fitsAt).toBeGreaterThanOrEqual(8);
    expect(fitOf({ ...s, text: 'Hi', fontSize: 28 }, box, m)).toEqual({ fits: true, fitsAt: null });
    // Words in a frame and free texts: no box, nothing said (as MobileReview).
    expect(fitBoxFor(page(4), { kind: 'slot', slotIndex: 0 }, builder().albumSize, 4)).toBeNull();
    expect(fitBoxFor(page(4), { kind: 'free', textId: 'x' }, builder().albumSize, 4)).toBeNull();
    // Before the fonts load there is no measurer: nothing is said.
    expect(fitOf(s, box, null)).toBeNull();
  });
});

describe('"Page colour"', () => {
  it('is a tool in the website’s place, and opens its sheet', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(2);
    const sheets: { id: string; params: unknown }[] = [];
    const ctx = ctxOn(platform, sheets);
    const tool = toolsFor(ctx).find((t) => t.id === 'pageColour')!;
    expect(tool.label).toBe('Page colour');
    tool.onPress(ctx);
    expect(sheets.pop()?.id).toBe(TEXT_SHEETS.pageColour);
  });

  it('a swatch colours this page (setPageColor); "every page" colours all pages and the cover, and says so', async () => {
    await madeAlbum(SCENARIOS[0]);
    await onPage(2);
    const calls: Call[] = [];
    const said: string[] = [];
    const red = PAGE_COLORS.find((c) => c.name === 'Red')!.hex;
    await act(async () => { pickPageColour(spied(builder(), calls), red); });
    expect(calls).toEqual([['setPageColor', red]]);
    expect(page(2).background).toEqual({ type: 'solid', solid: red });
    expect(page(1).background).not.toEqual({ type: 'solid', solid: red });
    calls.length = 0;
    const blue = PAGE_COLORS.find((c) => c.name === 'Blue')!.hex;
    await act(async () => { pickPageColourEverywhere(spied(builder(), calls), blue, (m) => said.push(m)); });
    expect(calls).toEqual([['applyPageColorToAllPages', blue]]);
    expect(builder().albumPages.every((p) => p.background?.type === 'solid' && p.background.solid === blue)).toBe(true);
    expect(builder().coverFront.background).toEqual({ type: 'solid', solid: blue });
    expect(said).toEqual(['Every page is blue now.']);
    await act(async () => { builder().undo(); });
    expect(page(2).background).toEqual({ type: 'solid', solid: red });
  });
});

/** The context the screen hands the part (for a type check that parts compile against it). */
export type _Ctx = EditorContext;
