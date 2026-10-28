/* The words part's words: the website's own for the same control (its files
   are .tsx with its icons, so they can't be shared as they are).
   test/editorTextWords.test.ts fails if one stops matching the website's
   source. Where the website has an icon and no word (bold, the alignment
   buttons, the bank's refresh), the app says what the button does; where
   only the app needs a line (a font that needs the internet the first
   time), it is new, in the same plain words. */

/* ── MobileTextEditor.tsx ── */
export const EDIT_TEXT = 'Edit text';
export const DONE = 'Done';
export const TYPE_YOUR_TEXT = 'Type your text…';
export const COLOR = 'Color';
export const OUTLINE = 'Outline';
export const SHADOW = 'Shadow';
/** The "too long" line (PERF2-2), and the button that makes it fit. */
export const tooLong = (canShrink: boolean) =>
  `Too long for this box: part of it will be cut off in print. Shorten it${canShrink ? ', or make the text smaller' : ''}.`;
export const makeItFit = (size: number) => `Make it fit (size ${size})`;
/** The website's buttons are icons (Bold, Italic, Underline, AlignLeft …):
 *  the app writes what each one does. */
export const BOLD = 'Bold';
export const ITALIC = 'Italic';
export const UNDERLINE = 'Underline';
export const SMALLER = 'Smaller';
export const BIGGER = 'Bigger';
export const ALIGN_WORDS = { left: 'Left', center: 'Center', right: 'Right' } as const;
/** The size range and step (MobileTextEditor: Math.max(14, s - 2) / Math.min(80, s + 2)). */
export const SIZE_MIN = 14;
export const SIZE_MAX = 80;
export const SIZE_STEP = 2;

/* ── FontList.tsx ── */
export const FONTS_LABEL = 'Fonts';

/* ── Fonts that come from the internet the first time (app only) ── */
export const GETTING_FONT = 'Getting the font…';
/** Offline, or the font could not be downloaded: the words keep their font. */
export const fontOffline = (font: string, kept: string) =>
  `No internet: ${font} can't be downloaded now. Your words stay in ${kept}. Try again when you are online.`;
export const FONT_NEEDS_INTERNET = 'Needs the internet the first time';

/* ── TextColorPicker.tsx ── */
export const TEXT_COLOR_LABEL = 'Text color';
export const ANY_COLOR = 'Any color';
export const YOUR_OWN_COLOR = 'Your own color';
/** "Any color" opens the phone's own colour picker on the website (an
 *  <input type="color">); the app's is a sheet of shades and a colour code. */
export const ANY_COLOR_HINT = 'Tap a shade, or type a colour code like #3A6EA5.';
export const COLOR_CODE = 'Colour code';
export const USE_THIS_COLOR = 'Use this colour';
export const NOT_A_COLOR_CODE = 'That is not a colour code. It looks like #3A6EA5.';

/* ── PageColorPicker.tsx (PageColorSheet) and MobileReview.tsx ── */
export const PAGE_COLOUR = 'Page colour';
export const PAGE_COLOUR_LABEL = 'Page colour';
export const useOnEveryPage = (name: string) => `Use ${name.toLowerCase()} on every page`;
export const PAGE_COLOUR_HINT = 'Tap a colour for this page. Words that wouldn\'t show on it switch to an ink that does.';
/** MobileReview: the line said after "Use … on every page". */
export const everyPageIs = (name: string | null | undefined) => `Every page is ${name?.toLowerCase() ?? 'that colour'} now.`;

/* ── QuotePickerModal.tsx ── */
export const CHANGE_QUOTE = 'Change quote';
export const ADD_A_QUOTE = 'Add a quote';
export const CHOOSE_A_QUOTE = 'Choose a quote';
export const EDIT_THE_WORDS = 'Edit the words';
export const REMOVE_QUOTE = 'Remove quote';
export const TYPE_YOUR_OWN_WORDS = 'Type your own words';
export const writeALine = (many: boolean) => `Write a line for ${many ? 'these photos' : 'this photo'}`;
export const WRITE_3_MORE = 'Write 3 more';
export const lookingAt = (many: boolean) => `Looking at the photo${many ? 's' : ''}…`;
export const writtenFor = (many: boolean) => `Written for ${many ? 'these photos' : 'this photo'}`;
export const consent = (many: boolean) =>
  `A small copy of ${many ? 'each photo' : 'the photo'} on this page goes to Claude AI (Anthropic) to write 3 lines. We don’t keep it.`;
export const SIGN_IN_FIRST = 'Sign in first';
export const signInFor = (many: boolean) => `to have Megy write lines for ${many ? 'these photos' : 'this photo'}.`;
export const SIGN_IN = 'Sign in';
/** QuotePickerModal PHOTO_QUOTE_MESSAGES: every way "Write a line" can end. */
export const PHOTO_QUOTE_MESSAGES: Record<'limit_user' | 'limit_all' | 'refused' | 'failed' | 'no_fit', string> = {
  limit_user: 'You have used today’s lines for photos. Try again tomorrow, or type your own words.',
  limit_all: 'Lines for photos are busy today. Try again tomorrow, or type your own words.',
  refused: 'Megy couldn’t write lines for this photo. Type your own words instead.',
  failed: 'Couldn’t write lines just now. Tap to try again.',
  no_fit: 'Megy’s lines were too long for this box. Tap to try again, or type your own words.',
};
/** QuotePickerModal NO_PHOTO_NOTE: a page with no photo yet. */
export const NO_PHOTO_NOTE = 'Put a photo on this page, and Megy can write a line from it.';
/** The quote bank's lines (shown only while the shared DEAL_BANK_QUOTES is on,
 *  as on the website). The website's refresh button is an icon titled "More lines". */
export const BANK_HEADING = 'Lines written for your album’s theme';
export const BANK_PLACEHOLDER = 'e.g. Marriage, 1st birthday, Palawan trip';
export const MORE_LINES = 'More lines';
export const BANK_EMPTY = 'Type what your album’s about, then tap refresh.';
export const bankSource = (theme: string, maxChars: number) =>
  `${theme.trim() ? `Our curated lines for “${theme.trim()}”.` : 'Our curated lines — add an album theme above for lines written for it.'} Max ${maxChars} characters so it prints cleanly.`;
