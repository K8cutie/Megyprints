/* ══════════════════════════════════════════════════════════════════════════
   TODAY'S TEST — the Android app's daily test, while TESTING_PHASE is on.

   Owner, 2026-10-29: testers screenshot the home page or just flip pages;
   the daily test should prove real use. "They should type the correct date
   so they cant cheat the process." Then, the same day: "Do 10 test pool that
   shows different feature", "Dont make the tasks too complicated", "Select a
   default font to use for the album, those kind of stuff that can be done
   before page generate", "Including your other suggestions make that pool",
   and "Also let them spend a minute on the app".

   Each day (sampleDayNumber: the same all day, by the phone's clock):
     1. Today's date as the album's name, typed (Today's test).
     2. ONE task from a pool of 10, done on Today's test before "Make my
        album": an album setting the builder really has before the pages are
        made. All 10 come round in any 10 days in a row, and each time a task
        comes back it asks for another answer.
     3. ONE task from a pool of 5, done in the album once it is made: one of
        the editor's own tools, already open. All 5 come round in any 5 days.
   "You're done" opens after both tasks AND a minute in the app
   (lib/dailyTestRun), with a line that names both: "Today: title font
   Dancing Script · new layout on page 5".

   The 10 before-tasks are settings the builder has today, taken from the
   steps before "Make my album" (Step 1, Step 2 and the cover step), plus the
   page colour on every page that the owner asked for. Left out of the first
   list, because the builder can't do them for a whole album: photos per page
   (40 sample photos always make one photo a page: generateAlbum's fill
   rule), a page texture (not offered on a phone), a photo look (filter) for
   every photo (filters are per photo: that one is an in-album task) and one
   colour for all the album's words (no such setting). An album-wide font isn't a
   setting either: the font task sets the cover title's font, as the cover
   step does.
   ══════════════════════════════════════════════════════════════════════════ */

import { MONTHS } from './testingPhase';
import { sampleDayNumber, sampleAlbumPhotos, SAMPLE_END_OF_DAY_NAMES } from './samplePhotos';
import { cleanAlbumName } from './albumName';
import { COMMON_THEMES } from './albumTheme';
import { SIZE_LABELS } from './pricing';
import { PAGE_COLORS } from '../pages/builder/pageColors';
import { TEXT_COLORS, sameColor } from '../pages/builder/textColors';
import { FONTS } from '../pages/builder/fonts';
import { offerableAlbumSizes } from '../pages/builder/albumSizeOptions';
import type { AlbumSizePreset, TextElement } from '../pages/builder/types';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/* ── 1. Today's date as the album's name ── */

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "Oct 29": today's date the way the screen shows it, as an example. */
export function dateExample(now: Date): string {
  return `${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

/** A month written as a word, 1-12: the whole name or its first 3 letters or
 *  more ("Oct", "Octo", "October", "Sept"). Null for anything else. */
function monthOf(word: string): number | null {
  if (word.length < 3) return null;
  const i = MONTH_NAMES.findIndex((m) => m.startsWith(word));
  return i < 0 ? null : i + 1;
}

/** Is this today's date by the phone's clock? The usual ways of writing it:
 *  "Oct 29", "October 29", "Oct 29 2026", "Oct 29, 2026", "29 Oct", "10/29",
 *  "29/10", "10-29", "10/29/2026", "2026-10-29". Case and spaces don't
 *  matter. A year, when given, must be this year. Anything else is not. */
export function isTodaysDate(typed: string, now: Date): boolean {
  const s = typed.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return false;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const year = now.getFullYear();
  const yearOk = (y: string | undefined) =>
    y === undefined || (y.length === 4 ? Number(y) === year : y.length === 2 && Number(y) === year % 100);
  const is = (m: number | null, d: string, y?: string) => m === month && Number(d) === day && yearOk(y);
  let r: RegExpMatchArray | null;
  // "Oct 29", "October 29", "Oct. 29th", "Oct 29 2026"
  if ((r = s.match(/^([a-z]+)\.? ?(\d{1,2})(?:st|nd|rd|th)?(?: ?(\d{4}))?$/))) return is(monthOf(r[1]), r[2], r[3]);
  // "29 Oct", "29th October 2026"
  if ((r = s.match(/^(\d{1,2})(?:st|nd|rd|th)? ?([a-z]+)\.?(?: ?(\d{4}))?$/))) return is(monthOf(r[2]), r[1], r[3]);
  // "2026-10-29", "2026/10/29"
  if ((r = s.match(/^(\d{4}) ?([-/.]) ?(\d{1,2}) ?\2 ?(\d{1,2})$/))) return is(Number(r[3]), r[4], r[1]);
  // "10/29", "29/10", "10-29", "10/29/2026", "29-10-26": month first or day first.
  if ((r = s.match(/^(\d{1,2}) ?([-/.]) ?(\d{1,2})(?: ?\2 ?(\d{4}|\d{2}))?$/))) {
    return is(Number(r[1]), r[3], r[4]) || is(Number(r[3]), r[1], r[4]);
  }
  return false;
}

/** Under the name box, when what they typed isn't today. */
export function dateRefusedMessage(now: Date): string {
  return `That's not today's date. Type today's date, for example ${dateExample(now)}.`;
}

/* ── The two pools, and which task is today's ── */

/** The 10 tasks done on Today's test, before "Make my album". In this order,
 *  neighbouring days ask about different things. */
export const BEFORE_TASKS = [
  'cover', 'titleFont', 'colour', 'titleAlign', 'size', 'titleColour', 'occasion', 'titleStyle', 'titleSize', 'titleShadow',
] as const;
export type BeforeTaskId = typeof BEFORE_TASKS[number];

/** The 5 tasks done in the album, once it is made. */
export const ALBUM_TASKS = ['layout', 'caption', 'look', 'swap', 'openBook'] as const;
export type AlbumTaskId = typeof ALBUM_TASKS[number];

/** Today's task on Today's test: all 10 in any 10 days in a row. */
export function todaysBeforeTask(now: Date): BeforeTaskId {
  return BEFORE_TASKS[mod(sampleDayNumber(now), BEFORE_TASKS.length)];
}

/** Today's task in the album: all 5 in any 5 days in a row. */
export function todaysAlbumTask(now: Date): AlbumTaskId {
  return ALBUM_TASKS[mod(sampleDayNumber(now), ALBUM_TASKS.length)];
}

/** Which time round the pool this is: a task that comes back (10 days on)
 *  asks for the next answer in its list. */
const roundOf = (now: Date) => Math.floor(sampleDayNumber(now) / BEFORE_TASKS.length);

/* ── The before-tasks: what each asks, and the one answer that counts ── */

/** One thing to tap on Today's test. */
export interface TaskOption {
  /** What is kept: a photo's name, a hex, a font family, a size, a word. */
  value: string;
  /** What the button says. */
  label: string;
  /** A colour to show (a swatch). */
  hex?: string;
  /** A font to show the label in. */
  font?: string;
  /** A sample photo to show. */
  photo?: string;
}

/** How the options are shown. */
export type TaskLook = 'photos' | 'swatches' | 'fonts' | 'words';

export interface BeforeTask {
  id: BeforeTaskId;
  /** The task, with today's answer in **bold**. */
  line: string;
  /** A second, smaller line (or none). */
  hint?: string;
  options: TaskOption[];
  look: TaskLook;
  /** The one answer that counts (a value), or null when any one counts (the cover). */
  answer: string | null;
  /** "Today's colour is Red. Tap Red." (null when any one counts). */
  wrong: string | null;
  /** What "Make my album" says while it is not done. */
  want: string;
}

/** How many of today's photos the cover picker shows. */
export const COVER_CHOICES = 12;

/** The cover picker: 12 of today's sample photos (they all go in today's
 *  album), spread over the day. */
export function coverChoices(now: Date): string[] {
  const everyday = sampleAlbumPhotos(sampleDayNumber(now)).filter((name) => !SAMPLE_END_OF_DAY_NAMES.includes(name));
  const want = Math.min(COVER_CHOICES, everyday.length);
  return Array.from({ length: want }, (_, i) => everyday[Math.floor((i * everyday.length) / want)]);
}

/** A sample photo's number: "megy-sample-12.jpg" is photo 12. Null for any
 *  other photo. */
export function samplePhotoNumber(name: string): number | null {
  const m = /^megy-sample-(\d+)\.jpg$/.exec(name);
  return m ? Number(m[1]) : null;
}

/** The cover title's fonts to pick from: easy to tell apart. Cinzel, the
 *  title's own font, is not one of them, so the pick shows. */
export const TITLE_FONT_NAMES = ['Dancing Script', 'Playfair', 'Caveat', 'Montserrat', 'Great Vibes', 'Amatic SC', 'Pacifico', 'Lora'] as const;

/** The cover title's colours to pick from: light ones, which read on a photo. */
export const TITLE_COLOUR_NAMES = ['White', 'Cream', 'Gold', 'Mustard', 'Blush', 'Pink', 'Coral', 'Sky', 'Lavender'] as const;

/** The cover title's sizes (font size on the cover). */
export const TITLE_SIZES = { small: 22, medium: 32, large: 46 } as const;

const fontOptions = (): TaskOption[] => TITLE_FONT_NAMES.flatMap((name) => {
  const f = FONTS.find((x) => x.name === name);
  return f ? [{ value: f.family, label: f.name, font: f.family }] : [];
});
const titleColourOptions = (): TaskOption[] => TITLE_COLOUR_NAMES.flatMap((name) => {
  const c = TEXT_COLORS.find((x) => x.name === name);
  return c ? [{ value: c.hex, label: c.name, hex: c.hex }] : [];
});
const words = (...pairs: [string, string][]): TaskOption[] => pairs.map(([value, label]) => ({ value, label }));

/** The sizes offered today. 8×8, the size an album starts at, is never the
 *  answer, so the pick shows. */
function sizeOptions(): TaskOption[] {
  return offerableAlbumSizes().map((s) => ({ value: s.preset, label: SIZE_LABELS[s.preset] ?? s.preset }));
}

/** Today's answer from a list, by the time round the pool. */
const pickFor = (now: Date, values: readonly string[]): string => values[mod(roundOf(now), values.length)];

/** Today's task on Today's test, with its options and the answer that counts. */
export function beforeTaskFor(now: Date): BeforeTask {
  const id = todaysBeforeTask(now);
  const prescribed = (look: TaskLook, options: TaskOption[], answers: string[], noun: string, line: (a: string) => string, hint?: string): BeforeTask => {
    const answer = pickFor(now, answers.length ? answers : options.map((o) => o.value));
    const label = options.find((o) => o.value === answer)?.label ?? answer;
    return {
      id, line: line(label), hint, options, look, answer,
      wrong: `Today's ${noun} is ${label}. Tap ${label}.`,
      want: `Pick today's ${noun} first: ${label}.`,
    };
  };
  switch (id) {
    case 'cover':
      return {
        id, line: 'Choose your cover.', hint: 'Tap the photo you want on the front of your album.',
        options: coverChoices(now).map((photo, i) => ({ value: photo, label: `Photo ${samplePhotoNumber(photo) ?? i + 1}`, photo })),
        look: 'photos', answer: null, wrong: null, want: 'Choose your cover first.',
      };
    case 'colour':
      // The owner's words: "For today, select Brown for your album background."
      return prescribed('swatches', PAGE_COLORS.map((c) => ({ value: c.hex, label: c.name, hex: c.hex })), [], 'colour',
        (a) => `For today, select **${a}** for your album background.`);
    case 'titleFont': {
      const options = fontOptions();
      return prescribed('fonts', options, [], 'font', (a) => `For today, pick the font **${a}** for your album's title.`,
        'The title is your album\'s name, on the front cover.');
    }
    case 'titleAlign':
      return prescribed('words', words(['left', 'Left'], ['center', 'Middle'], ['right', 'Right']), ['left', 'right'], 'side',
        (a) => `Put the cover title on the **${a}**.`, "The title is your album's name, on the front cover.");
    case 'size': {
      const options = sizeOptions();
      const answers = options.map((o) => o.value).filter((v) => v !== '8x8');
      return prescribed('words', options, answers, 'size', (a) => `Make your album **${a}**.`, 'The size is in inches.');
    }
    case 'titleColour':
      return prescribed('swatches', titleColourOptions(), [], 'title colour', (a) => `Make the cover title **${a}**.`,
        "The title is your album's name, on the front cover.");
    case 'occasion':
      return prescribed('words', COMMON_THEMES.map((o) => ({ value: o, label: o })), [], 'occasion', (a) => `This album is for: **${a}**.`);
    case 'titleStyle':
      return prescribed('words', words(['bold', 'Bold'], ['italic', 'Italic'], ['boldItalic', 'Bold + italic'], ['plain', 'Plain']),
        ['italic', 'boldItalic', 'plain'], 'style', (a) => `Make the cover title **${a}**.`, "The title is your album's name, on the front cover.");
    case 'titleSize':
      return prescribed('words', words(['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']), ['small', 'large'], 'title size',
        (a) => `Make the cover title **${a}**.`, "The title is your album's name, on the front cover.");
    case 'titleShadow':
      return prescribed('words', words(['on', 'With shadow'], ['off', 'No shadow']), ['off'], 'choice',
        (a) => `Take the shadow off the cover title: tap **${a}**.`);
  }
}

/** Is this the answer that counts today? */
export function isTodaysAnswer(task: BeforeTask, value: string | null | undefined): boolean {
  if (!value) return false;
  if (task.answer == null) return task.options.some((o) => o.value === value);
  return task.look === 'swatches' ? sameColor(value, task.answer) : value === task.answer;
}

/* ── "Make my album" ── */

export const WANT_DATE = "Type today's date first.";

/** What the tester gave on Today's test. */
export interface DailyTestPick {
  name: string;
  /** Their answer to today's task (an option's value). */
  answer?: string | null;
}

/** What "Make my album" says when a step is missing, in the order of the
 *  steps (the date, then today's task), or null when all is done. */
export function dailyTestMissing(pick: DailyTestPick, now: Date): string | null {
  if (!isTodaysDate(pick.name, now)) return WANT_DATE;
  const task = beforeTaskFor(now);
  return isTodaysAnswer(task, pick.answer) ? null : task.want;
}

/** What the builder makes: the name, today's task and its answer, and the
 *  task to do in the album once it is made. */
export interface DailyTestRequest {
  /** The day it was done on (sampleDayNumber). */
  day: number;
  name: string;
  before: BeforeTaskId;
  /** The answer (an option's value). */
  answer: string;
  album: AlbumTaskId;
}

const DAILY_TEST_KEY = 'megy-daily-test';

/** The finished test, or null while a step is missing. */
export function dailyTestRequest(pick: DailyTestPick, now: Date): DailyTestRequest | null {
  if (dailyTestMissing(pick, now)) return null;
  const task = beforeTaskFor(now);
  return {
    day: sampleDayNumber(now),
    name: cleanAlbumName(pick.name),
    before: task.id,
    // A colour as the list writes it (the tap may differ only in case).
    answer: task.options.find((o) => isTodaysAnswer({ ...task, answer: o.value }, pick.answer))?.value ?? pick.answer!,
    album: todaysAlbumTask(now),
  };
}

/** Today's test → the builder: make today's sample album this way. Only a
 *  finished test is kept; returns whether it was. */
export function requestDailyTest(pick: DailyTestPick, now: Date): boolean {
  const request = dailyTestRequest(pick, now);
  if (!request) return false;
  try { sessionStorage.setItem(DAILY_TEST_KEY, JSON.stringify(request)); return true; } catch { return false; }
}

/** The builder, as it makes today's sample album: the tester's test, once.
 *  Null when there is none, or it is not today's, or not finished. */
export function takeDailyTest(now: Date = new Date()): DailyTestRequest | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(DAILY_TEST_KEY);
    sessionStorage.removeItem(DAILY_TEST_KEY);
  } catch { return null; }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<DailyTestRequest>;
    if (r.day !== sampleDayNumber(now) || typeof r.name !== 'string' || typeof r.answer !== 'string') return null;
    if (r.before !== todaysBeforeTask(now) || r.album !== todaysAlbumTask(now)) return null;
    return dailyTestRequest({ name: r.name, answer: r.answer }, now);
  } catch {
    return null;
  }
}

/* ── What the builder does with the answer ── */

/** The cover title's look from today's task: its font, side, style, size or
 *  shadow (applied the way the cover step's controls set them), and its
 *  colour (white, which reads on a photo, unless the task says another). */
export function coverTitleFrom(request: Pick<DailyTestRequest, 'before' | 'answer'> | null | undefined): { color: string; style: Partial<TextElement> } {
  const white = '#FFFFFF';
  if (!request) return { color: white, style: {} };
  const a = request.answer;
  switch (request.before) {
    case 'titleFont': return { color: white, style: { fontFamily: a } };
    case 'titleColour': return { color: a, style: {} };
    case 'titleAlign': return { color: white, style: { alignment: a as TextElement['alignment'] } };
    case 'titleStyle': return { color: white, style: { bold: a === 'bold' || a === 'boldItalic', italic: a === 'italic' || a === 'boldItalic' } };
    case 'titleSize': return { color: white, style: { fontSize: TITLE_SIZES[a as keyof typeof TITLE_SIZES] ?? TITLE_SIZES.medium } };
    case 'titleShadow': return { color: white, style: { shadow: a !== 'off' ? undefined : false } };
    default: return { color: white, style: {} };
  }
}

/** The size to make the album in, when today's task is the size. */
export function sizeFrom(request: Pick<DailyTestRequest, 'before' | 'answer'> | null | undefined): AlbumSizePreset | null {
  return request?.before === 'size' ? (request.answer as AlbumSizePreset) : null;
}

/* ── The line on "You're done" ── */

/** Today's before-task and its answer, for the line: "title font Dancing Script". */
export function beforeTaskLabel(request: Pick<DailyTestRequest, 'before' | 'answer'>): string {
  const a = request.answer;
  const name = (list: { name: string; hex?: string; family?: string }[], key: 'hex' | 'family') =>
    list.find((x) => (key === 'hex' ? sameColor(x.hex, a) : x.family === a))?.name ?? a;
  switch (request.before) {
    case 'cover': return `cover photo ${samplePhotoNumber(a) ?? a}`;
    case 'colour': return `background ${name(PAGE_COLORS as { name: string; hex: string }[], 'hex')}`;
    case 'titleFont': return `title font ${name(FONTS, 'family')}`;
    case 'titleAlign': return `title on the ${a === 'center' ? 'middle' : a}`;
    case 'size': return `size ${SIZE_LABELS[a as AlbumSizePreset] ?? a}`;
    case 'titleColour': return `title colour ${name(TEXT_COLORS as { name: string; hex: string }[], 'hex')}`;
    case 'occasion': return `occasion ${a}`;
    case 'titleStyle': return `title ${{ bold: 'bold', italic: 'italic', boldItalic: 'bold + italic', plain: 'plain' }[a] ?? a}`;
    case 'titleSize': return `title ${a}`;
    case 'titleShadow': return a === 'off' ? 'title with no shadow' : 'title with shadow';
  }
}

/** "Today: title font Dancing Script · new layout on page 5". */
export function doneLine(before: string, album: string): string {
  return `Today: ${before} · ${album}`;
}

/* ── The in-album tasks ── */

/** What the album task says, at the top of the album. */
export const ALBUM_TASK_HINTS: Record<AlbumTaskId, string> = {
  layout: 'Pick a new layout for this page.',
  caption: 'Type any word in this box, then tap Done.',
  // The phone calls a photo's look a "Filter" (Studio's sheet): its word.
  look: 'Give this photo a filter: tap one.',
  swap: 'Swap this photo: tap another photo.',
  openBook: 'See your album as an open book: tap See it as an open book.',
};

/** The button beside it that opens the tool again (none for the open book:
 *  its own button is right there, and glows). */
export const ALBUM_TASK_BUTTONS: Record<AlbumTaskId, string | null> = {
  layout: 'Change layout',
  caption: 'Type here',
  look: 'Pick a filter',
  swap: 'Swap photo',
  openBook: null,
};
