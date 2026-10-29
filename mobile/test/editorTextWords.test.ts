/* The words part says what the website's editor says for the same control
   (src/editor/text/words.ts). The website's words live in its .tsx files
   (with its icons, so they can't be shared as they are): each phrase the app
   reuses must still be in the website's file, so a change on one side shows
   here. Where the website has only an icon, the app's word is listed in
   APP_ONLY below, and a test fails if the website ever gets a word for it. */
import fs from 'node:fs';
import path from 'node:path';
import * as w from '../src/editor/text/words';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const web = {
  editor: read('src/pages/builder/MobileTextEditor.tsx'),
  fonts: read('src/pages/builder/FontList.tsx'),
  textColor: read('src/pages/builder/TextColorPicker.tsx'),
  pageColor: read('src/pages/builder/PageColorPicker.tsx'),
  review: read('src/pages/builder/MobileReview.tsx'),
  quotes: read('src/pages/builder/QuotePickerModal.tsx'),
};

describe("the words part uses the website's words", () => {
  it('the text editor (MobileTextEditor.tsx)', () => {
    expect(web.editor).toContain(`>${w.EDIT_TEXT}</span>`);
    expect(web.editor).toContain(`<Check size={18} /> ${w.DONE}`);
    expect(web.editor).toContain(`placeholder="${w.TYPE_YOUR_TEXT}"`);
    expect(web.editor).toContain(`${w.COLOR} <ChevronDown`);
    expect(web.editor).toContain(`>${w.OUTLINE}</button>`);
    expect(web.editor).toContain(`>${w.SHADOW}</button>`);
    // The "too long" line and its button, word for word.
    expect(web.editor).toContain("Too long for this box: part of it will be cut off in print. Shorten it{fit.fitsAt ? ', or make the text smaller' : ''}.");
    expect(w.tooLong(true)).toBe('Too long for this box: part of it will be cut off in print. Shorten it, or make the text smaller.');
    expect(w.tooLong(false)).toBe('Too long for this box: part of it will be cut off in print. Shorten it.');
    expect(web.editor).toContain('Make it fit (size {fit.fitsAt})');
    expect(w.makeItFit(22)).toBe('Make it fit (size 22)');
    // The size buttons: 2 at a time, 14 to 80.
    expect(web.editor).toContain(`setFontSize((s) => Math.max(${w.SIZE_MIN}, s - ${w.SIZE_STEP}))`);
    expect(web.editor).toContain(`setFontSize((s) => Math.min(${w.SIZE_MAX}, s + ${w.SIZE_STEP}))`);
  });

  it('the font list (FontList.tsx)', () => {
    expect(web.fonts).toContain(`aria-label="${w.FONTS_LABEL}"`);
  });

  it('the text colours (TextColorPicker.tsx)', () => {
    expect(web.textColor).toContain(`aria-label="${w.TEXT_COLOR_LABEL}"`);
    expect(web.textColor).toContain(`aria-label="${w.ANY_COLOR}"`);
    expect(web.textColor).toContain(`'${w.YOUR_OWN_COLOR}'`);
  });

  it('the page colours (PageColorPicker.tsx) and the line after "every page" (MobileReview.tsx)', () => {
    expect(web.pageColor).toContain(`>${w.PAGE_COLOUR}</span>`);
    expect(web.pageColor).toContain(`aria-label="${w.PAGE_COLOUR_LABEL}"`);
    expect(web.pageColor).toContain('Use {current.name.toLowerCase()} on every page');
    expect(w.useOnEveryPage('Red')).toBe('Use red on every page');
    expect(web.pageColor).toContain(w.PAGE_COLOUR_HINT);
    expect(web.review).toContain("sayGuard(`Every page is ${pageColorOf({ type: 'solid', solid: hex })?.name.toLowerCase() ?? 'that colour'} now.`)");
    expect(w.everyPageIs('Blue')).toBe('Every page is blue now.');
    expect(w.everyPageIs(null)).toBe('Every page is that colour now.');
    expect(web.review).toContain(`<Palette size={18} /> ${w.PAGE_COLOUR}`);
  });

  it('the quote picker (QuotePickerModal.tsx)', () => {
    expect(web.quotes).toContain(`{initial ? '${w.CHANGE_QUOTE}' : '${w.ADD_A_QUOTE}'}`);
    expect(web.quotes).toContain(`aria-label={'${w.CHOOSE_A_QUOTE}'}`);
    expect(web.quotes).toContain(`<Pencil size={14} /> ${w.EDIT_THE_WORDS}`);
    expect(web.quotes).toContain(`<Trash2 size={14} /> ${w.REMOVE_QUOTE}`);
    expect(web.quotes).toContain(`<Type size={15} /> ${w.TYPE_YOUR_OWN_WORDS}`);
    expect(web.quotes).toContain("Write a line for {many ? 'these photos' : 'this photo'}");
    expect(w.writeALine(true)).toBe('Write a line for these photos');
    expect(web.quotes).toContain(`<Sparkles size={13} /> ${w.WRITE_3_MORE}`);
    expect(web.quotes).toContain("Looking at the photo{many ? 's' : ''}…");
    expect(w.lookingAt(false)).toBe('Looking at the photo…');
    expect(web.quotes).toContain("Written for {many ? 'these photos' : 'this photo'}");
    expect(web.quotes).toContain("A small copy of {many ? 'each photo' : 'the photo'} on this page goes to Claude AI (Anthropic) to write 3 lines. We don’t keep it.");
    expect(w.consent(false)).toBe('A small copy of the photo on this page goes to Claude AI (Anthropic) to write 3 lines. We don’t keep it.');
    expect(web.quotes).toContain(`<span className="font-semibold">${w.SIGN_IN_FIRST}</span> to have Megy write lines for {many ? 'these photos' : 'this photo'}.`);
    expect(w.signInFor(true)).toBe('to have Megy write lines for these photos.');
    expect(web.quotes).toContain(`>${w.SIGN_IN}</button>`);
    for (const [k, v] of Object.entries(w.PHOTO_QUOTE_MESSAGES)) expect(web.quotes).toContain(`${k}: '${v}'`);
    expect(web.quotes).toContain(`export const NO_PHOTO_NOTE = '${w.NO_PHOTO_NOTE}';`);
    // The bank (behind DEAL_BANK_QUOTES, as on the website).
    expect(web.quotes).toContain(`>${w.BANK_HEADING}</label>`);
    expect(web.quotes).toContain(`placeholder="${w.BANK_PLACEHOLDER}"`);
    expect(web.quotes).toContain(`title="${w.MORE_LINES}"`);
    expect(web.quotes).toContain(w.BANK_EMPTY);
    expect(web.quotes).toContain('Our curated lines — add an album theme above for lines written for it.');
    expect(web.quotes).toContain('Max {MAX_QUOTE_CHARS} characters so it prints cleanly.');
    expect(w.bankSource('Wedding', 46)).toBe('Our curated lines for “Wedding”. Max 46 characters so it prints cleanly.');
  });

  it('where the website has only an icon, the app writes what the button does', () => {
    // The website's buttons for these are icons: if it ever gets words, use them.
    const APP_ONLY = [w.BOLD, w.ITALIC, w.UNDERLINE, w.SMALLER, w.BIGGER, ...Object.values(w.ALIGN_WORDS)];
    for (const word of APP_ONLY) expect(web.editor).not.toContain(`>${word}<`);
    expect(web.editor).toContain('<Bold size={18} />');
    expect(web.editor).toContain('<AlignCenter size={18} />');
  });
});
