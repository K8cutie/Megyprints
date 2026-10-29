/* ══════════════════════════════════════════════════════════════════════════
   PART 2: WORDS, FONTS, COLOURS, QUOTES AND PAGE COLOURS in the "Edit
   pages" screen: the website's phone editor (MobileReview.tsx) for words,
   every change through ctx.builder (the website's useBuilderState).

   • A tap on words (taps): a caption box's words, words in a photo frame,
     or a free text. A line from the quote pool (isPoolQuote) opens the
     quotes; anything else opens the text editor. An empty caption box Megy
     dealt opens its kind's editor at once; any other empty box is left to
     the screen's "Add to this box" (wordsFlow.tapOpens).
   • "Add Quote" and "Your Text" in "Add to this box" (addChoices), for an
     empty photo frame and an empty caption box, in the website's order.
   • The text editor (TextEditorSheet: MobileTextEditor), the 74 fonts
     (FontPicker: FontList; fonts/: bundled, or fetched from Google Fonts the
     first time and kept), the text colours (ColourPickers: TextColorPicker),
     the "too long" line with the website's caption fit.
   • The quotes (QuotePickerSheet: QuotePickerModal): "Write a line for this
     photo" (signed in; the website's endpoint by its full address), the
     bank behind the website's own switch, your own words.
   • The "Page colour" tool (PageColourSheet: PageColorSheet).
   • Two lines over the page with nothing to show (banners): one opens the
     quotes again after a sign-in the picker asked for (resumeQuote.ts), one
     fetches the fonts the album uses that this phone doesn't have yet (an
     album made on the website, or on another phone).
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { CHOICE_WORDS } from '../editorWords';
import { ORDER, registerEditorPart, type EditorContext } from '../registry';
import type { Target } from '../hitTest';
import { fontStore } from './fonts/appFonts';
import { familiesOn } from './fonts/fontStore';
import { catalogFace } from './fonts/fontSources';
import { PageColourSheet } from './PageColourSheet';
import { QuotePickerSheet } from './QuotePickerSheet';
import { takeResume } from './resumeQuote';
import { TextEditorSheet } from './TextEditorSheet';
import { PAGE_COLOUR } from './words';
import { tapOpens, wordsTargetOf } from './wordsFlow';

/** Sheet ids ('text:<name>'). */
export const TEXT_SHEETS = { edit: 'text:edit', quotes: 'text:quotes', pageColour: 'text:pageColour' } as const;

function openWords(target: Target, ctx: EditorContext, opens: 'quotes' | 'editor'): boolean {
  const words = wordsTargetOf(target);
  if (!words) return false;
  ctx.select(target);
  ctx.openSheet(opens === 'quotes' ? TEXT_SHEETS.quotes : TEXT_SHEETS.edit, { target: words });
  return true;
}

/** Opens the quotes again on the box a sign-in was asked for (nothing shown). */
function ResumeQuote({ ctx }: { ctx: EditorContext }) {
  // Who is signed in, from the builder's platform (the app's sign-in).
  const signedIn = !!ctx.platform.cloud.useUser();
  const { pageIndex, openSheet } = ctx;
  // Only while the editor is the screen on top: a sheet is a window of its
  // own and would show over the sign-in screen otherwise.
  useFocusEffect(useCallback(() => {
    const target = takeResume(pageIndex, signedIn);
    if (target) openSheet(TEXT_SHEETS.quotes, { target, autoWrite: true });
    // openSheet is made anew each render; the page and the sign-in are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, pageIndex]));
  return null;
}

/** A face not fetched lately (offline, it failed): not asked again for a minute. */
const RETRY_MS = 60 * 1000;
const tried = new Map<string, number>();

/** Fetches the fonts the album uses that this phone doesn't have yet (an
 *  album made on the website or another phone): the page on screen first,
 *  then the rest and the cover. Nothing shown; a page is drawn again once
 *  its font is in. */
function PageFonts({ ctx }: { ctx: EditorContext }) {
  const { albumPages, coverFront } = ctx.builder;
  const families = [...new Set([
    ...familiesOn(ctx.page),
    ...albumPages.flatMap((p) => familiesOn(p)),
    ...(coverFront ? familiesOn(coverFront) : []),
  ])].join('|');
  useEffect(() => {
    const now = Date.now();
    for (const family of families ? families.split('|') : []) {
      const face = catalogFace(family);
      if (!face || fontStore.status(face) !== 'missing' || now - (tried.get(face) ?? -Infinity) < RETRY_MS) continue;
      tried.set(face, now);
      void fontStore.ensure(family);
    }
  }, [families]);
  return null;
}

registerEditorPart({
  id: 'text',
  taps: [{
    kinds: ['boxText', 'slotText', 'freeText', 'emptyBox'],
    order: 50,
    onTap(target, ctx) {
      const opens = tapOpens(ctx.page, target);
      // An empty box nobody dealt: the screen offers "Add to this box".
      return opens ? openWords(target, ctx, opens) : false;
    },
  }],
  addChoices: [
    {
      id: 'quote',
      ...CHOICE_WORDS.quote,
      short: 'Quote',
      kinds: ['emptySlot', 'emptyBox'],
      order: ORDER.addChoices.quote,
      onPick: (target, ctx) => { openWords(target, ctx, 'quotes'); },
    },
    {
      id: 'text',
      ...CHOICE_WORDS.text,
      short: 'Text',
      kinds: ['emptySlot', 'emptyBox'],
      order: ORDER.addChoices.text,
      onPick: (target, ctx) => { openWords(target, ctx, 'editor'); },
    },
  ],
  tools: [{
    id: 'pageColour',
    label: PAGE_COLOUR,
    order: ORDER.tools.pageColour,
    onPress: (ctx) => ctx.openSheet(TEXT_SHEETS.pageColour),
  }],
  sheets: { edit: TextEditorSheet, quotes: QuotePickerSheet, pageColour: PageColourSheet },
  banners: [
    { id: 'text-resume-quote', order: 900, Component: ResumeQuote },
    { id: 'text-page-fonts', order: 901, Component: PageFonts },
  ],
});
