/* ══════════════════════════════════════════════════════════════════════════
   PART 2: WORDS, FONTS, COLOURS, QUOTES AND PAGE COLOURS in the "Edit
   pages" screen.

   This folder is this part's own: the shared screen is reached only through
   registerEditorPart (../registry.ts). Add files here; change nothing in
   ../EditPagesScreen.tsx, ../PageStage.tsx or another part's folder (if the
   registry lacks something, add it to registry.ts in a small, separate step).
   Words go in this folder (text/words.ts), held to the website's source by
   this part's own test (test/editorText*.test.ts; test/editorHarness.ts
   makes an album through the app's steps and taps it).

   To build here, each the website's way and words (MobileReview.tsx), every
   change through ctx.builder (the website's useBuilderState):
   • Taps (registry taps) on words: 'boxText' (a quote from the pool,
     isPoolQuote with dealtBoxRoll, re-opens the quotes; else the text
     editor: setBoxText), 'slotText' (isPoolQuote: the quotes; else
     setSlotText), 'freeText' (updateTextElement by its id: target.textId).
     An empty caption box that Megy dealt (dealtBoxRoll 'text' / 'quote')
     goes straight to that editor (a tap rule on 'emptyBox' that returns
     false for a box not dealt, so the screen opens "Add to this box").
   • "Add Quote" and "Your Text" in "Add to this box" (addChoices, kinds
     ['emptySlot', 'emptyBox'], ids 'quote' and 'text' (a dealt box shows its
     invitation only for those ids), order ORDER.addChoices.quote / .text,
     CHOICE_WORDS.quote / .text).
   • The text editor (MobileTextEditor): the words, size, the 74 fonts
     (FontList; the app draws the bundled ones, the rest are listed in
     plan.notDrawn until the renderer job adds them), text colours
     (TextColorPicker), bold / italic / alignment; a caption's fit with
     captionBoxSize / textFit (platform.textMeasurer is the Skia one).
   • Quotes (QuotePickerModal): the 800-line bank, offline. AI photo quotes
     (/api/photo-quotes) only once the album is ordered and paid; never call
     the live endpoint from a test or a walk.
   • The "Page colour" tool (ORDER.tools.pageColour; PageColorPicker:
     Crayola 8 + White; setPageColor, applyPageColorToAllPages with its
     ctx.say line).
   The text editor floats over the keyboard on the website; here a sheet
   (core/EditorSheet or the part's own) with KeyboardAvoidingView.
   ══════════════════════════════════════════════════════════════════════════ */
import { registerEditorPart } from '../registry';

registerEditorPart({ id: 'text' });
