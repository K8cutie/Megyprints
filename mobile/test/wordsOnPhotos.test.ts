/* ══════════════════════════════════════════════════════════════════════════
   WORDS ON A PHOTO, WITH WORDART (owner, 2026-11-07: "I like wordart and
   effect features included when editing photos so adding text on a photo is
   possible... applied in cover and pages picture editor"; and "applying your
   solution to potential risks": words stop at the safe print area).

   On an album made through the app's steps (test/editorHarness.ts), on the
   real shared builder, the words part's own sheet rendered and tapped:
     • "Add text" under a picked photo, beside Mask and Filter, opens Edit
       text for new words with their middle on the photo's middle;
     • typed and Done: words placed by hand, white with a thin dark outline
       and a shadow, inside the safe print area; ✕ or nothing typed: nothing;
       one Undo takes them off;
     • Effects: outline (thickness, colour), two colours, glow, shape, shadow,
       the panel open after each pick; a caption box and a photo frame's
       words take them too;
     • placed words: tapped, they open; Remove, or emptied, takes them off; a
       bigger size keeps their middle; too long for the page says so and
       Done makes them the size that fits;
     • the finger: where it can take them stops at the safe area; their tap
       area is their letters.
   The page picture is a stand-in (no Skia here); the words are measured
   with the real page fonts in headless Skia where it matters.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { AlbumPage, TextElement } from '@web/pages/builder/types';
import { getCanvasDimensions } from '@web/pages/builder/layouts';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { getPrintDimensions } from '@web/pages/builder/printSize';
import { isPlacedWords, wordsInk, wordsMiddle, wordsSafeArea } from '@web/pages/builder/freeWords';
import { captionBoxRect, type Measurer } from '@web/pages/builder/textFit';
import { editThePages } from '../src/editor/scope';
import '../src/editor/parts';
import { selectedActionsFor, type EditorContext, type SheetProps } from '../src/editor/registry';
import { pageTargets } from '../src/editor/hitTest';
import { TEXT_SHEETS, newWordsOn } from '../src/editor/text';
import { TextEditorSheet, type TextEditorParams } from '../src/editor/text/TextEditorSheet';
import { draggedTo, pageWithoutWords } from '../src/editor/text/WordsDragOverlay';
import { createFontStore, type FontStoreDeps } from '../src/editor/text/fonts/fontStore';
import { placedInk } from '../src/editor/textLines';
import * as words from '../src/editor/text/words';
import type { WordsTarget } from '../src/editor/text/wordsFlow';
import { PageText } from '../src/render/pageText';
import { skiaTextMeasurer } from '../src/builder/textMeasurer';
import type { AppPlatform } from '../src/builder/appPlatform';
import { fontFiles, headlessSkia } from './golden/headless';
import { act, builder, ctxOn, madeAlbum, tapOn, useEditorBench } from './editorHarness';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../src/builder/usePagePicture', () => ({
  PRIORITY: { editing: 3, shown: 2, thumbnail: 1, ahead: 0 },
  usePagePicture: (_text: unknown, req: { page: AlbumPage } | null) => ({ uri: req ? 'file:///page.jpg' : null, notDrawn: [], missing: 0, error: null }),
}));

useEditorBench();

const GOLD = '#C9A24B';
const NAVY = '#1F3A5F';

let m: Measurer;
beforeAll(async () => {
  const Sk = await headlessSkia();
  m = skiaTextMeasurer(new PageText(Sk, fontFiles()));
});

let sheetRoot: Root | null = null;
afterEach(async () => {
  await act(async () => { sheetRoot?.unmount(); });
  sheetRoot = null;
});

function fakeFonts() {
  const files = new Map<string, Uint8Array>();
  const deps: FontStoreDeps = {
    fetchText: async () => { throw new Error('offline'); },
    fetchBytes: async () => { throw new Error('offline'); },
    files: { read: (n) => files.get(n) ?? null, write: (n, b) => { files.set(n, b); }, uri: (n) => `file:///f/${n}`, list: () => [...files.keys()] },
    registerUi: async () => {},
    addToRenderer: async () => {},
  };
  return createFontStore(deps);
}

async function onPage(i: number) {
  await act(async () => { editThePages(builder()); });
  await act(async () => { builder().goToPage(i); });
}

/** Edit text for `target` on the page on screen, measured with the page fonts. */
async function edit(platform: AppPlatform, target: WordsTarget) {
  const log = { closed: 0, said: [] as string[], sheets: [] as { id: string; params: unknown }[] };
  const base = ctxOn(platform, log.sheets, log.said);
  const ctx: EditorContext = { ...base, platform: { ...platform, textMeasurer: () => m } as AppPlatform };
  sheetRoot = createRoot();
  await act(async () => {
    sheetRoot!.render(createElement(TextEditorSheet as (p: SheetProps<TextEditorParams>) => ReactElement, { ctx, params: { target, store: fakeFonts() }, close: () => { log.closed++; } }));
  });
  return log;
}

const all = (pred: (i: TestInstance) => boolean) => sheetRoot!.container.queryAll(pred);
const has = (id: string) => all((i) => i.props.testID === id).length > 0;
function textOf(node: TestInstance = sheetRoot!.container): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
async function press(id: string) {
  const hit = all((i) => i.props.testID === id && typeof i.props.onClick === 'function')[0];
  if (!hit) throw new Error(`nothing to press: ${id}`);
  await act(async () => { hit.props.onClick({ nativeEvent: {}, currentTarget: 1, target: 1, stopPropagation() {} }); });
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
}
async function type(text: string) {
  const input = all((i) => i.props.testID === 'text-editor-input' && i.type === 'TextInput')[0];
  await act(async () => { input.props.onChangeText(text); });
}

const placedOn = (i: number): TextElement[] => (builder().albumPages[i].textElements ?? []).filter(isPlacedWords);

/** The letters inside the safe print area of page `i`. */
function expectInside(t: TextElement, i: number) {
  const area = wordsSafeArea(builder().albumSize, i);
  const ink = wordsInk(t, m);
  expect(t.x + ink.left).toBeGreaterThanOrEqual(area.x - 1e-6);
  expect(t.x + ink.right).toBeLessThanOrEqual(area.x + area.w + 1e-6);
  expect(t.y + ink.top).toBeGreaterThanOrEqual(area.y - 1e-6);
  expect(t.y + ink.bottom).toBeLessThanOrEqual(area.y + area.h + 1e-6);
}

/** New words on page 0's first photo, through "Add text". */
async function addWordsOnPage0(platform: AppPlatform, text: string) {
  await onPage(0);
  const ctx = ctxOn(platform);
  const photo = ctx.targets.find((t) => t.kind === 'photo')!;
  const target = newWordsOn(photo, builder().albumSize);
  const log = await edit(platform, target);
  await type(text);
  await press('text-editor-done');
  await act(async () => { sheetRoot?.unmount(); });
  sheetRoot = null;
  return { target, log, photo };
}

describe('"Add text" under a picked photo', () => {
  it('is beside Mask and Filter, and opens Edit text for new words with their middle on the photo\'s middle', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    const sheets: { id: string; params: unknown }[] = [];
    const ctx = ctxOn(platform, sheets);
    const photo = ctx.targets.find((t) => t.kind === 'photo')!;
    const actions = selectedActionsFor(photo, ctx);
    const ids = actions.map((a) => a.id);
    const add = actions.find((a) => a.id === 'addWords')!;
    expect(add.label).toBe(words.ADD_TEXT);
    expect(ids.indexOf('addWords')).toBe(ids.indexOf('mask') - 1); // just before Mask, then Filter
    expect(ids.indexOf('filter')).toBe(ids.indexOf('mask') + 1);
    await act(async () => { add.onPress(photo, ctx); });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].id).toBe(TEXT_SHEETS.edit);
    const target = (sheets[0].params as { target: WordsTarget }).target;
    // Its id starts "theme-quote-": the live website and older builds leave such words where they are when an album opens.
    expect(target).toMatchObject({ kind: 'newWords', textId: expect.stringMatching(/^theme-quote-placed-/) });
    const perDesign = getPrintDimensions(builder().albumSize).width / getCanvasDimensions(builder().albumSize).width;
    expect((target as { cx: number }).cx).toBeCloseTo((photo.box.x + photo.box.w / 2) / perDesign, 6);
    expect((target as { cy: number }).cy).toBeCloseTo((photo.box.y + photo.box.h / 2) / perDesign, 6);
    // Not for an empty frame or words.
    expect(ctx.targets.filter((t) => t.kind !== 'photo').every((t) => !selectedActionsFor(t, ctx).some((a) => a.id === 'addWords'))).toBe(true);
  });

  it('typed and Done: words placed by hand, white with a thin dark outline and a shadow, in the safe print area, where the photo is; one Undo takes them off', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const before = builder().albumPages[0].textElements.length;
    const { target, log } = await addWordsOnPage0(platform, 'Our beach day');
    expect(log.closed).toBe(1);
    const [w] = placedOn(0);
    expect(builder().albumPages[0].textElements).toHaveLength(before + 1);
    expect(w).toMatchObject({ id: target.textId, text: 'Our beach day', placed: true, color: '#FFFFFF', outlineColor: '#2D2D2D', outlineWidth: 2, shadow: true, bold: true });
    expect(w.boxIndex).toBeUndefined();
    expectInside(w, 0);
    const mid = wordsMiddle(w, m);
    expect(mid.cx).toBeCloseTo((target as { cx: number }).cx, 0);
    // The first times: how to move them.
    expect(log.said).toContain(words.MOVE_WORDS_HINT);
    await act(async () => { builder().undo(); });
    expect(placedOn(0)).toHaveLength(0);
  });

  it('✕, or Done with nothing typed, puts nothing on the page (and no Undo step)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    const photo = ctxOn(platform).targets.find((t) => t.kind === 'photo')!;
    const page = JSON.stringify(builder().albumPages[0]);
    const canUndo = builder().canUndo;
    await edit(platform, newWordsOn(photo, builder().albumSize));
    await type('Not kept');
    await press('text-editor-close');
    await act(async () => { sheetRoot?.unmount(); });
    await edit(platform, newWordsOn(photo, builder().albumSize));
    expect(has('text-editor-remove')).toBe(false); // nothing to remove yet
    await press('text-editor-done');
    expect(JSON.stringify(builder().albumPages[0])).toBe(page);
    expect(builder().canUndo).toBe(canUndo);
  });

  it('two in a row on one photo: the second goes under the first, not on top of it', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Hello');
    await addWordsOnPage0(platform, 'Again');
    const [a, b] = placedOn(0);
    const ia = wordsInk(a, m), ib = wordsInk(b, m);
    expect(b.y + ib.top).toBeGreaterThanOrEqual(a.y + ia.bottom - 1);
  });
});

describe('Effects in Edit text (the cover title\'s WordArt, on every word on a page)', () => {
  it('outline in any thickness and colour, two colours, glow, shape and shadow: the panel stays open after each pick, Done saves them all, still in the safe area', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Boracay');
    const [w] = placedOn(0);
    const log = await edit(platform, { kind: 'free', textId: w.id });
    expect(has('text-effects-panel')).toBe(false);
    await press('text-effects-open');
    expect(has('text-effects-panel')).toBe(true);
    await press('text-effect-outline');
    await press('text-outline-thick');
    await press('text-outline-color-Gold');
    await press('text-effect-fill');
    await press('text-fill-color-Navy');
    await press('text-effect-shape');
    await press('text-shape-arch');
    await press('text-effect-glow');
    await press('text-glow-color-Gold');
    expect(has('text-effects-panel')).toBe(true); // open all along
    // Shadow takes the glow off and the shadow comes back (one in the other's place).
    await press('text-effect-shadow');
    expect(log.closed).toBe(0);
    await press('text-editor-done');
    const [after] = placedOn(0);
    expect(after).toMatchObject({ outlineWidth: 8, outlineColor: GOLD, fillTo: NAVY, curve: 'arch', shadow: true });
    expect(after.glow).toBeUndefined();
    expectInside(after, 0);
  });

  it('a caption box\'s words take them too (setBoxText with the curve and the second colour)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    await edit(platform, { kind: 'box', boxIndex: 0 });
    await type('Sunday lunch');
    await press('text-effects-open');
    await press('text-effect-shape');
    await press('text-shape-smile');
    await press('text-effect-fill');
    await press('text-fill-color-Gold');
    await press('text-editor-done');
    expect(builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)).toMatchObject({ text: 'Sunday lunch', curve: 'smile', fillTo: GOLD });
  });

  it('words in a photo frame on a curve too wide for the frame say "Too long" (they aren\'t clipped to it); straight, never (they are)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(0);
    await act(async () => { builder().clearSlot(0); });
    await edit(platform, { kind: 'slot', slotIndex: 0 });
    await type('We walked all the way to the lighthouse and back before the sun went down');
    await press('text-bigger');
    expect(has('text-too-long')).toBe(false);
    await press('text-effects-open');
    await press('text-effect-shape');
    await press('text-shape-wave');
    expect(has('text-too-long')).toBe(true);
  });
});

describe('words placed by hand, on the page', () => {
  it('a tap on them opens them in Edit text, with Remove; Remove takes them off, and Undo puts them back', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Lola and Lolo');
    const [w] = placedOn(0);
    const sheets: { id: string; params: unknown }[] = [];
    const t = ctxOn(platform).targets.find((x) => x.textId === w.id)!;
    expect(await tapOn(platform, t, sheets)).toBe('rule');
    expect(sheets.pop()).toEqual({ id: TEXT_SHEETS.edit, params: { target: { kind: 'free', textId: w.id } } });
    const log = await edit(platform, { kind: 'free', textId: w.id });
    expect(textOf()).toContain(words.REMOVE);
    await press('text-editor-remove');
    expect(log.closed).toBe(1);
    expect(placedOn(0)).toHaveLength(0);
    await act(async () => { builder().undo(); });
    expect(placedOn(0)).toHaveLength(1);
  });

  it('emptied and Done: off the page', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Gone soon');
    await edit(platform, { kind: 'free', textId: placedOn(0)[0].id });
    await type('   ');
    await press('text-editor-done');
    expect(placedOn(0)).toHaveLength(0);
  });

  it('a bigger size keeps their middle where it was, and the letters in the safe area', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Hi');
    const [w] = placedOn(0);
    const mid = wordsMiddle(w, m);
    await edit(platform, { kind: 'free', textId: w.id });
    for (let i = 0; i < 6; i++) await press('text-bigger');
    await press('text-editor-done');
    const [after] = placedOn(0);
    expect(after.fontSize).toBe(w.fontSize + 12);
    const now = wordsMiddle(after, m);
    expect(now.cx).toBeCloseTo(mid.cx, 0);
    expect(now.cy).toBeCloseTo(mid.cy, 0);
    expectInside(after, 0);
  });

  it('too long for the page: it says so with "Make it fit"; Done makes them that size and says so, so nothing is cut off', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Short');
    const [w] = placedOn(0);
    const log = await edit(platform, { kind: 'free', textId: w.id });
    const long = 'The castle lights came on and none of us wanted this happy day to end so we stayed a little longer together under the bright night sky and talked about every ride we took '.repeat(2);
    await type(long);
    for (let i = 0; i < 20; i++) await press('text-bigger');
    expect(has('text-too-long')).toBe(true);
    expect(textOf()).toContain(words.tooLongForPage(true));
    const fitsAt = Number(/Make it fit \(size (\d+)\)/.exec(textOf())![1]);
    await press('text-editor-done');
    const [after] = placedOn(0);
    expect(after.fontSize).toBe(fitsAt);
    expect(log.said).toContain(words.madeSmaller(fitsAt));
    expectInside(after, 0);
  });

  it('typing holds at most 300 characters', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'x');
    await edit(platform, { kind: 'free', textId: placedOn(0)[0].id });
    expect(all((i) => i.props.testID === 'text-editor-input' && i.type === 'TextInput')[0].props.maxLength).toBe(words.PLACED_MAX_CHARS);
  });
});

describe('the finger on placed words', () => {
  it('their tap area is their letters (a curve\'s whole height); the page without them is the page less those words', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Our Beach Days');
    const [w] = placedOn(0);
    const curved = { ...w, curve: 'arch' as const };
    const page = { ...builder().albumPages[0], textElements: builder().albumPages[0].textElements.map((t) => (t.id === w.id ? curved : t)) };
    const { targets } = pageTargets({ page, albumSize: builder().albumSize, pageIndex: 0, photoCount: builder().uploadedPhotos.length, inkOf: placedInk(m) });
    const t = targets.find((x) => x.textId === w.id)!;
    const k = getPrintDimensions(builder().albumSize).width / getCanvasDimensions(builder().albumSize).width;
    const ink = wordsInk(curved, m);
    expect(t.box.x).toBeCloseTo((curved.x + ink.left) * k, 6);
    expect(t.box.h).toBeCloseTo((ink.bottom - ink.top) * k, 6);
    expect(t.box.h).toBeGreaterThan(curved.fontSize * 1.25 * k); // taller than one straight line
    expect(pageWithoutWords(page, w.id).textElements.some((x) => x.id === w.id)).toBe(false);
  });

  it('dragged anywhere, the letters stop at the safe print area, and it says so; a short drag inside goes where the finger goes', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Siargao 2026');
    const [w] = placedOn(0);
    const ctx = { ...ctxOn(platform), platform: { ...platform, textMeasurer: () => m } as AppPlatform };
    const k = 400 / getCanvasDimensions(builder().albumSize).width; // a page 400 px wide on screen
    for (const [dx, dy] of [[5000, 0], [-5000, 0], [0, -5000], [0, 5000], [-5000, 5000]]) {
      const to = draggedTo(w, { x: w.x, y: w.y }, dx, dy, k, ctx);
      expect(to.stopped).toBe(true);
      expectInside({ ...w, x: to.x, y: to.y }, 0);
    }
    const near = draggedTo(w, { x: w.x, y: w.y }, 8, -6, k, ctx);
    expect(near.stopped).toBe(false);
    expect(near.x).toBeCloseTo(w.x + 8 / k, 6);
    expect(near.y).toBeCloseTo(w.y - 6 / k, 6);
    // Page 2 binds on its right, page 1 on its left: the same area (1/2" from both
    // sides), so a page added before them can't leave words in the binding.
    const right = draggedTo(w, { x: w.x, y: w.y }, 5000, 0, k, { ...ctx, pageIndex: 1 });
    expect(right).toEqual(draggedTo(w, { x: w.x, y: w.y }, 5000, 0, k, ctx));
  });
});

describe('the review of 2026-11-07, fixed', () => {
  it('a caption on a curve too big for the page is made the size its letters stay in the safe area at (a curve is not clipped)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const log = await edit(platform, { kind: 'box', boxIndex: 0 });
    await type('Our first family trip to the beach together');
    for (let i = 0; i < 26; i++) await press('text-bigger'); // 80
    await press('text-effects-open');
    await press('text-effect-shape');
    await press('text-shape-arch');
    expect(has('text-too-long')).toBe(true);
    expect(textOf()).toContain(words.tooLongForPage(true));
    const fitsAt = Number(/Make it fit \(size (\d+)\)/.exec(textOf())![1]);
    await press('text-editor-done');
    expect(log.closed).toBe(1);
    const saved = builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)!;
    expect(saved).toMatchObject({ curve: 'arch', fontSize: fitsAt });
    expect(log.said).toContain(words.madeSmaller(fitsAt));
  });

  it('words that fit at no size: Done keeps the editor open and says what to do; nothing is saved', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await addWordsOnPage0(platform, 'Short');
    const [w] = placedOn(0);
    const log = await edit(platform, { kind: 'free', textId: w.id });
    await type('Our very long day at the beach with everyone we love '.repeat(5));
    await press('text-effects-open');
    await press('text-effect-shape');
    await press('text-shape-wave');
    await press('text-editor-done');
    expect(log.closed).toBe(0);
    expect(has('text-stuck')).toBe(true);
    expect(textOf()).toContain(words.CURVE_TOO_LONG);
    expect(placedOn(0)[0]).toEqual(w);
    // Straight again, it fits (smaller) and Done saves.
    await press('text-shape-straight');
    await press('text-editor-done');
    expect(log.closed).toBe(1);
    expect(placedOn(0)[0].curve).toBeUndefined();
  });

  it('an old free text (not placed by hand) gets no Shape: it is not kept in the safe area', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    // A page with no caption box: "Add text" on the website makes a free text there (not placed).
    const i = builder().albumPages.findIndex((p) => !(getTemplateById(p.templateId ?? '')?.textSlots?.length));
    await onPage(i);
    await act(async () => { builder().addTextElement(200, 200, 'Home'); });
    const old = builder().albumPages[i].textElements.find((t) => t.boxIndex == null && !t.placed)!;
    expect(old).toBeTruthy();
    await edit(platform, { kind: 'free', textId: old.id });
    await press('text-effects-open');
    expect(has('text-effect-outline')).toBe(true);
    expect(has('text-effect-shape')).toBe(false);
    expect(has('text-editor-remove')).toBe(false);
  });

  it('new words go clear of a caption that has words, not on top of it', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const cap = builder().albumPages[4].textElements.find((t) => t.boxIndex === 0);
    if (!cap) await act(async () => { builder().setBoxText(0, { text: 'Sunday lunch' }); });
    const rect = captionBoxRect(builder().albumPages[4], 0, builder().albumSize, 4)!;
    await edit(platform, { kind: 'newWords', textId: 'theme-quote-placed-x', cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 });
    await type('Hello');
    await press('text-editor-done');
    const [w] = placedOn(4);
    const ink = wordsInk(w, m);
    const overlaps = w.x + ink.left < rect.x + rect.w && w.x + ink.right > rect.x && w.y + ink.top < rect.y + rect.h && w.y + ink.bottom > rect.y;
    expect(overlaps).toBe(false);
  });
});
