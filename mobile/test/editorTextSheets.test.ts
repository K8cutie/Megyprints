/* ══════════════════════════════════════════════════════════════════════════
   THE WORDS PART'S SHEETS, RENDERED AND TAPPED (test-renderer), on an album
   made through the app's steps (test/editorHarness.ts):

   • the quote picker: "Write a line for this photo" asks the website's
     endpoint by its full address with the website's request, offers only
     the lines that fit the box, and has words for every way it can end;
     signed out it asks for the sign-in and sends nothing; the bank shows
     only behind the website's switch. The live endpoint is NEVER called:
     fetch is a fake, and the real one fails the test if touched.
   • the text editor: typing, bold, the colour, a font (fetched first; no
     internet keeps the old one and says so), "Too long for this box" with
     "Make it fit", Done saves through the website's action, ✕ does not.
   • the page colour sheet.
   ══════════════════════════════════════════════════════════════════════════ */
import { createElement, type ReactElement } from 'react';
import { createRoot, type Root, type TestInstance } from 'test-renderer';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { curatedQuotesFor } from '@web/lib/themeQuotePool';
import { PAGE_COLORS } from '@web/pages/builder/pageColors';
import { editThePages } from '../src/editor/scope';
import '../src/editor/parts';
import type { EditorContext, SheetProps } from '../src/editor/registry';
import { QuotePickerSheet, type QuotePickerParams } from '../src/editor/text/QuotePickerSheet';
import { TextEditorSheet, type TextEditorParams } from '../src/editor/text/TextEditorSheet';
import { PageColourSheet } from '../src/editor/text/PageColourSheet';
import { PHOTO_QUOTES_URL, type PhotoQuoteDeps } from '../src/editor/text/photoQuotes';
import { forgetResume, takeResume } from '../src/editor/text/resumeQuote';
import { createFontStore, type FontStoreDeps } from '../src/editor/text/fonts/fontStore';
import * as words from '../src/editor/text/words';
import { PageText } from '../src/render/pageText';
import { forgetAddedFonts } from '../src/render/fontTable';
import { skiaTextMeasurer } from '../src/builder/textMeasurer';
import type { AppPlatform } from '../src/builder/appPlatform';
import { fontFiles, headlessSkia } from './golden/headless';
import { act, builder, ctxOn, madeAlbum, useEditorBench } from './editorHarness';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { router } = require('expo-router') as { router: { push: jest.Mock } };

useEditorBench();

let sheetRoot: Root | null = null;
let liveFetch: jest.SpyInstance;
beforeEach(() => {
  forgetResume();
  router.push.mockClear();
  // The live endpoint (or any network) must never be reached from a test.
  liveFetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('the network was called from a test'); });
});
afterEach(async () => {
  expect(liveFetch).not.toHaveBeenCalled();
  liveFetch.mockRestore();
  forgetAddedFonts();
  await act(async () => { sheetRoot?.unmount(); });
  sheetRoot = null;
});

async function onPage(i: number) {
  await act(async () => { editThePages(builder()); });
  await act(async () => { builder().goToPage(i); });
}

/** A sheet on the page on screen; `log` records closes, sheets opened and lines said. */
async function show<P>(Sheet: (p: SheetProps<P>) => ReactElement | null, platform: AppPlatform, params: P, platformPatch: Partial<AppPlatform> = {}) {
  const log = { closed: 0, sheets: [] as { id: string; params: unknown }[], said: [] as string[] };
  const base = ctxOn(platform, log.sheets, log.said);
  const ctx: EditorContext = { ...base, platform: { ...platform, ...platformPatch } as AppPlatform };
  sheetRoot = createRoot();
  await act(async () => { sheetRoot!.render(createElement(Sheet as (p: SheetProps<P>) => ReactElement, { ctx, params, close: () => { log.closed++; } })); });
  return log;
}

const all = (pred: (i: TestInstance) => boolean) => sheetRoot!.container.queryAll(pred);
const has = (id: string) => all((i) => i.props.testID === id).length > 0;
function textOf(node: TestInstance = sheetRoot!.container): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}
async function press(id: string, n = 0) {
  const hit = all((i) => i.props.testID === id && typeof i.props.onClick === 'function')[n];
  if (!hit) throw new Error(`nothing to press: ${id}`);
  await act(async () => { hit.props.onClick({ nativeEvent: {}, currentTarget: 1, target: 1, stopPropagation() {} }); });
  await act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
}
async function type(id: string, text: string) {
  const input = all((i) => i.props.testID === id && i.type === 'TextInput')[0];
  await act(async () => { input.props.onChangeText(text); });
}

/** The endpoint's stand-in: records each request, answers what it is told. */
function fakeEndpoint(answer: { status: number; body: unknown }, token: string | null = 'test-token') {
  const requests: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
  const deps: PhotoQuoteDeps = {
    token: async () => token,
    shrink: async (uri) => `jpeg-of-${uri.slice(-4)}`,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
    },
  };
  return { deps, requests };
}

describe('the quote picker', () => {
  it('signed out: an empty quote box asks for the sign-in at once and sends nothing; Sign in comes back to this box', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    const ep = fakeEndpoint({ status: 200, body: { lines: ['x'] } }, null);
    const log = await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: false });
    expect(textOf()).toContain(words.ADD_A_QUOTE);
    expect(textOf()).toContain(words.writeALine(false));
    expect(textOf()).toContain(words.consent(false));
    expect(has('photo-quote-sign-in')).toBe(true);
    expect(textOf()).toContain(`${words.SIGN_IN_FIRST} ${words.signInFor(false)}`);
    expect(ep.requests).toHaveLength(0);
    await press('photo-quote-sign-in-button');
    expect(log.closed).toBe(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/sign-in', params: { back: '1' } });
    expect(takeResume(3, false)).toBeNull(); // still signed out: nothing
    expect(takeResume(4, true)).toBeNull(); // another page: nothing
    expect(takeResume(3, true)).toEqual({ kind: 'box', boxIndex: 0 });
    expect(takeResume(3, true)).toBeNull(); // once
  });

  it('signed in: writes at once for the page’s photos, with the website’s request to its full address, and offers only lines that fit the box', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    const Sk = await headlessSkia();
    const m = skiaTextMeasurer(new PageText(Sk, fontFiles()));
    // Far more than any 8x8 caption box holds at size 28 (they take about 250 letters).
    const tooLong = Array(4).fill('The castle lights came on and none of us wanted this happy day to end so we stayed a little longer together under the bright night sky').join(' and ');
    const ep = fakeEndpoint({ status: 200, body: { lines: ['Two hearts, one journey', tooLong, 'Forever starts today'], left: 37 } });
    const log = await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true }, { textMeasurer: () => m });
    expect(ep.requests).toHaveLength(1);
    const [req] = ep.requests;
    expect(req.url).toBe(PHOTO_QUOTES_URL);
    expect(PHOTO_QUOTES_URL).toBe('https://megyprints.vercel.app/api/photo-quotes');
    expect(req.init.method).toBe('POST');
    expect(req.init.headers).toEqual({ 'content-type': 'application/json', Authorization: 'Bearer test-token' });
    const body = JSON.parse(req.init.body) as { photos: string[]; theme: string; avoid: string[]; maxChars?: number };
    const onThePage = (builder().albumPages[3].slotFills ?? []).filter((f) => typeof f === 'number').length;
    expect(body.photos).toHaveLength(onThePage);
    expect(body.theme).toBe(SCENARIOS[0].occasion);
    expect(body.avoid).toEqual([]);
    expect(body.maxChars).toBeGreaterThanOrEqual(20);
    expect(body.maxChars).toBeLessThanOrEqual(100);
    expect(textOf()).toContain(words.writtenFor(false));
    const offered = all((i) => i.props.testID === 'photo-quote-line' && typeof i.props.onClick === 'function').map((i) => i.props.accessibilityLabel);
    expect(offered).toEqual(['Two hearts, one journey', 'Forever starts today']);
    // "Write 3 more" avoids the lines already offered.
    await press('photo-quote-more');
    expect(JSON.parse(ep.requests[1].init.body).avoid).toEqual(['Two hearts, one journey', 'Forever starts today']);
    await press('photo-quote-line', 1);
    expect(log.closed).toBe(1);
    expect(builder().albumPages[3].textElements.find((t) => t.boxIndex === 0)).toMatchObject({ text: 'Forever starts today', italic: true, quote: true });
  });

  it.each([
    [{ status: 429, body: { error: 'limit_all' } }, words.PHOTO_QUOTE_MESSAGES.limit_all],
    [{ status: 429, body: { error: 'limit_user' } }, words.PHOTO_QUOTE_MESSAGES.limit_user],
    [{ status: 200, body: { lines: [], reason: 'refused' } }, words.PHOTO_QUOTE_MESSAGES.refused],
    [{ status: 502, body: { error: 'failed' } }, words.PHOTO_QUOTE_MESSAGES.failed],
  ])('every way it ends has words (%j)', async (answer, line) => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    const ep = fakeEndpoint(answer);
    await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true });
    expect(textOf()).toContain(line);
    expect(textOf()).toContain(words.TYPE_YOUR_OWN_WORDS);
  });

  it('the session ran out on the server (401): it asks for the sign-in again', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    const ep = fakeEndpoint({ status: 401, body: { error: 'sign_in' } });
    await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true });
    expect(has('photo-quote-sign-in')).toBe(true);
  });

  it('a page with no photo: says how to get a line, and offers your own words (no dead end)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    await act(async () => { builder().clearSlot(0); });
    const ep = fakeEndpoint({ status: 200, body: { lines: ['x'] } });
    const log = await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true });
    expect(textOf()).toContain(words.NO_PHOTO_NOTE);
    expect(has('photo-quote-write')).toBe(false);
    expect(ep.requests).toHaveLength(0);
    await press('quote-own-words');
    expect(log.closed).toBe(1);
    expect(log.sheets).toEqual([{ id: 'text:edit', params: { target: { kind: 'box', boxIndex: 0 } } }]);
  });

  it('a box with a line: "Change quote", Edit the words, Remove quote (no writing until asked)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    await act(async () => { builder().setBoxText(0, { text: 'Two hearts, one journey', italic: true, quote: true }, 3); });
    const ep = fakeEndpoint({ status: 200, body: { lines: ['x'] } });
    const log = await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true });
    expect(textOf()).toContain(words.CHANGE_QUOTE);
    expect(ep.requests).toHaveLength(0);
    expect(has('quote-own-words')).toBe(false);
    await press('quote-remove');
    expect(log.closed).toBe(1);
    expect(builder().albumPages[3].textElements.find((t) => t.boxIndex === 0)).toBeUndefined();
  });

  it('the bank shows only behind the website’s switch (off today); on, its lines go in the box', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(3);
    await act(async () => { builder().clearSlot(0); });
    const ep = fakeEndpoint({ status: 200, body: { lines: [] } });
    await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true });
    expect(has('quote-bank')).toBe(false);
    await act(async () => { sheetRoot!.unmount(); });
    await show<QuotePickerParams>(QuotePickerSheet, platform, { target: { kind: 'box', boxIndex: 0 }, deps: ep.deps, signedIn: true, bank: true });
    expect(has('quote-bank')).toBe(true);
    const lines = all((i) => i.props.testID === 'quote-bank-line' && typeof i.props.onClick === 'function').map((i) => i.props.accessibilityLabel);
    expect(lines).toEqual(curatedQuotesFor(SCENARIOS[0].occasion));
    expect(lines.length).toBe(100);
    await press('quote-bank-line', 2);
    expect(builder().albumPages[3].textElements.find((t) => t.boxIndex === 0)).toMatchObject({ text: lines[2], italic: true, quote: true });
  });
});

/** A font store on fakes: Lora online or not. */
function fakeFonts(online: boolean) {
  const files = new Map<string, Uint8Array>();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ttf = new Uint8Array(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'node_modules', '@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf')));
  const deps: FontStoreDeps = {
    fetchText: async () => { if (!online) throw new Error('offline'); return "@font-face {\n  font-style: normal;\n  font-weight: 400;\n  src: url(https://fonts.gstatic.com/s/lora/a.ttf) format('truetype');\n}"; },
    fetchBytes: async () => { if (!online) throw new Error('offline'); return ttf; },
    files: { read: (n) => files.get(n) ?? null, write: (n, b) => { files.set(n, b); }, uri: (n) => `file:///f/${n}`, list: () => [...files.keys()] },
    registerUi: async () => {},
    addToRenderer: async () => {},
  };
  return createFontStore(deps);
}

describe('the text editor', () => {
  it('types, makes it bold and navy, and Done saves it through setBoxText', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const log = await show<TextEditorParams>(TextEditorSheet, platform, { target: { kind: 'box', boxIndex: 0 }, store: fakeFonts(true) });
    expect(textOf()).toContain(words.EDIT_TEXT);
    expect(textOf()).toContain('Georgia');
    await type('text-editor-input', 'Our first beach day');
    await press('text-bold');
    await press('text-bigger');
    await press('text-color-open');
    await press('text-color-Navy');
    expect(has('text-color-panel')).toBe(false); // a swatch closes the colours, as on the website
    await press('text-align-left');
    await press('text-editor-done');
    expect(log.closed).toBe(1);
    expect(builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)).toMatchObject({
      text: 'Our first beach day', bold: true, fontSize: 30, color: '#1F3A5F', alignment: 'left', fontFamily: 'Georgia, "Times New Roman", serif',
    });
  });

  it('✕ closes without saving', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const log = await show<TextEditorParams>(TextEditorSheet, platform, { target: { kind: 'box', boxIndex: 0 }, store: fakeFonts(true) });
    await type('text-editor-input', 'Not kept');
    await press('text-editor-close');
    expect(log.closed).toBe(1);
    expect(builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)).toBeUndefined();
  });

  it('a font from the internet is fetched, then used; Done saves it', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    await show<TextEditorParams>(TextEditorSheet, platform, { target: { kind: 'box', boxIndex: 0 }, store: fakeFonts(true) });
    await type('text-editor-input', 'Hello');
    await press('text-font-open');
    expect(has('font-list')).toBe(true);
    expect(all((i) => i.props.testID?.startsWith?.('font-') && typeof i.props.onClick === 'function' && i.props.testID !== 'font-list').length).toBe(74);
    await press('font-Lora');
    expect(has('font-list')).toBe(false);
    expect(textOf()).toContain('Lora');
    await press('text-editor-done');
    expect(builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)?.fontFamily).toBe('"Lora", Georgia, serif');
  });

  it('no internet: the words keep their font, and it says so plainly', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    await show<TextEditorParams>(TextEditorSheet, platform, { target: { kind: 'box', boxIndex: 0 }, store: fakeFonts(false) });
    await type('text-editor-input', 'Hello');
    await press('text-font-open');
    await press('font-Great Vibes');
    expect(textOf()).toContain(words.fontOffline('Great Vibes', 'Georgia'));
    await press('text-editor-done');
    expect(builder().albumPages[4].textElements.find((t) => t.boxIndex === 0)?.fontFamily).toBe('Georgia, "Times New Roman", serif');
  });

  it('too long for the box: says so as you type, and "Make it fit" picks the size it fits at', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(4);
    const Sk = await headlessSkia();
    const m = skiaTextMeasurer(new PageText(Sk, fontFiles()));
    await show<TextEditorParams>(TextEditorSheet, platform, { target: { kind: 'box', boxIndex: 0 }, store: fakeFonts(true) }, { textMeasurer: () => m });
    expect(has('text-too-long')).toBe(false);
    await type('text-editor-input', Array(4).fill('The castle lights came on and none of us wanted this happy day to end so we stayed a little longer together under the bright night sky').join(' and '));
    expect(has('text-too-long')).toBe(true);
    expect(textOf()).toContain(words.tooLong(true));
    const fitButton = all((i) => i.props.testID === 'text-make-fit' && typeof i.props.onClick === 'function')[0];
    const size = Number(/size (\d+)/.exec(fitButton.props.accessibilityLabel)![1]);
    expect(size).toBeLessThan(28);
    await press('text-make-fit');
    expect(textOf(all((i) => i.props.testID === 'text-size')[0])).toBe(String(size));
    expect(has('text-too-long')).toBe(false);
  });
});

describe('the page colour sheet', () => {
  it('a swatch colours the page; "Use red on every page" shows once one is chosen, colours them all, closes and says so', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await onPage(2);
    const log = await show(PageColourSheet, platform, undefined);
    expect(textOf()).toContain(words.PAGE_COLOUR);
    expect(textOf()).toContain(words.PAGE_COLOUR_HINT);
    expect(all((i) => i.props.testID?.startsWith?.('page-color-') && i.props.accessibilityRole === 'radio').length).toBe(9);
    await press('page-color-Red');
    const red = PAGE_COLORS.find((c) => c.name === 'Red')!.hex;
    expect(builder().albumPages[2].background).toEqual({ type: 'solid', solid: red });
    // The sheet shows the page as it was when opened; open it again on the red page.
    await act(async () => { sheetRoot!.unmount(); });
    const log2 = await show(PageColourSheet, platform, undefined);
    expect(textOf()).toContain(words.useOnEveryPage('Red'));
    await press('page-color-all');
    expect(log2.closed).toBe(1);
    expect(log2.said).toEqual(['Every page is red now.']);
    expect(builder().albumPages.every((p) => p.background?.type === 'solid' && p.background.solid === red)).toBe(true);
    expect(log.closed).toBe(0);
  });
});

