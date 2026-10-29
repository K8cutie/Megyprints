/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S FEATURES, AS A LESSON TEACHES THEM (owner, 2026-10-29: the daily
   test "becomes a tutorial of sorts", "make it look like its a tutorial").

   One short line on what each feature does, in plain English. For the tools
   inside an album, also the control the coach mark points at (an element
   marked data-coach="…") and what to do there.

   Nothing here knows about testers: no date, no "today's answer", no minute,
   no proof. The tester's daily lesson (lib/dailyTest) adds today's answer
   after each line; a "learn the app" tour for new customers could use these
   lines as they are (components/lesson/CoachMark.tsx says how).
   ══════════════════════════════════════════════════════════════════════════ */

/** Settings made before the pages are made (Step 1, Step 2, the cover step):
 *  what each one does, in one line. */
export const SETUP_TIPS = {
  cover: 'Any photo can go on the front cover.',
  titleFont: 'Your cover title can use many fonts.',
  colour: 'Every page can have a background colour.',
  titleAlign: 'Your cover title can sit on the left, middle or right.',
  size: 'Albums come in different sizes, in inches.',
  titleColour: 'Your cover title can be any colour.',
  occasion: 'The occasion helps Megy pick words for your pages.',
  titleStyle: 'Your cover title can be bold or italic.',
  titleSize: 'Your cover title can be small or large.',
  titleShadow: 'A shadow helps your cover title stand out. You can take it off.',
} as const;

/** A control in the app a coach mark can point at: data-coach="…" on it. */
export type CoachControl = 'layout-picker' | 'text-box' | 'filter-sheet' | 'photo-picker' | 'open-book';

/** The CSS selector for a control marked data-coach="…". */
export const coachSelector = (control: string): string => `[data-coach="${control}"]`;

export interface AlbumTip {
  /** What the tool is for: "This is where you change a page's layout." */
  teach: string;
  /** What to do with it: "Pick any new one." */
  try: string;
  /** The control the coach mark points at, once the tool is open. */
  control: CoachControl;
}

/** The tools inside an album (the phone's pages screen and Preview). */
export const ALBUM_TIPS = {
  layout: { teach: "This is where you change a page's layout.", try: 'Pick any new one.', control: 'layout-picker' },
  caption: { teach: 'This box is for your own words.', try: 'Type any word, then tap Done.', control: 'text-box' },
  look: { teach: 'Filters change how a photo looks.', try: 'Tap any one.', control: 'filter-sheet' },
  swap: { teach: 'You can swap any photo for another.', try: 'Tap a photo to put it here.', control: 'photo-picker' },
  openBook: { teach: 'See two pages side by side, like a real book.', try: 'Tap See it as an open book.', control: 'open-book' },
} as const satisfies Record<string, AlbumTip>;

/** What the coach mark says at a tool: what it is for, then what to do (in **bold**). */
export function coachText(tip: AlbumTip): string {
  return `${tip.teach} **${tip.try}**`;
}

/** Every feature a lesson can teach: the settings, then the tools. */
export const LESSON_FEATURES: readonly string[] = [...Object.keys(SETUP_TIPS), ...Object.keys(ALBUM_TIPS)];
