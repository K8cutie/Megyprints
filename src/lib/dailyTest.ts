/* ══════════════════════════════════════════════════════════════════════════
   TODAY'S TEST — the Android app's daily test, while TESTING_PHASE is on.

   Owner, 2026-10-29: testers screenshot the home page or just flip pages;
   the daily test should prove real use. His words: "Type date and edit
   background color of sample album or choose cover for sample album. After
   that generate the album", and "They should type the correct date so they
   cant cheat the process". Then the colour day names ONE colour: "For
   today, select Brown for your album background."

   Home's "Make today's sample album" opens Today's test (home/TodaysTest):
     1. the album's name: today's date, typed, in any usual way of writing
        it, by the phone's clock;
     2. today's task, by the day (sampleDayNumber: the same all day, the
        other task tomorrow): on even days choose the cover from today's
        sample photos; on odd days tap today's colour, one of the page
        colours (pageColors) in turn;
     3. "Make my album": the builder makes it (useSampleAlbum) with that
        name and cover or colour, and opens Preview on its last page, "You're
        done with today's test!", with the stamp. No 39 "Next page" taps.
   ══════════════════════════════════════════════════════════════════════════ */

import { MONTHS } from './testingPhase';
import { sampleDayNumber, sampleAlbumPhotos, SAMPLE_END_OF_DAY_NAMES } from './samplePhotos';
import { cleanAlbumName } from './albumName';
import { PAGE_COLORS, type PageColor } from '../pages/builder/pageColors';
import { sameColor } from '../pages/builder/textColors';

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

/* ── 2. Today's task ── */

export type DailyTask = 'cover' | 'colour';

/** Even days: choose the cover. Odd days: tap today's colour. */
export function todaysTask(now: Date): DailyTask {
  return sampleDayNumber(now) % 2 === 0 ? 'cover' : 'colour';
}

/** Today's colour: the page colours in turn, a different one each day. */
export function todaysColour(now: Date): PageColor {
  const n = PAGE_COLORS.length;
  return PAGE_COLORS[((sampleDayNumber(now) % n) + n) % n];
}

/** "For today, select Red for your album background." (the owner's words). */
export function colourTaskLine(colour: PageColor): string {
  return `For today, select ${colour.name} for your album background.`;
}

/** A tap on another colour. */
export function wrongColourMessage(colour: PageColor): string {
  return `Today's colour is ${colour.name}. Tap ${colour.name}.`;
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

/* ── 3. "Make my album" ── */

export const WANT_DATE = "Type today's date first.";
export const WANT_COVER = 'Choose your cover first.';
export function wantColourMessage(colour: PageColor): string {
  return `Pick today's colour first: ${colour.name}.`;
}

/** What the tester gave on Today's test. */
export interface DailyTestPick {
  name: string;
  /** A sample photo's name (cover days). */
  cover?: string | null;
  /** A page colour's hex (colour days). */
  colour?: string | null;
}

/** What "Make my album" says when a step is missing, or null when all is done. */
export function dailyTestMissing(pick: DailyTestPick, now: Date): string | null {
  if (!isTodaysDate(pick.name, now)) return WANT_DATE;
  if (todaysTask(now) === 'cover') return pick.cover && coverChoices(now).includes(pick.cover) ? null : WANT_COVER;
  const colour = todaysColour(now);
  return pick.colour && sameColor(pick.colour, colour.hex) ? null : wantColourMessage(colour);
}

/** What the builder makes: the name, and the cover or the colour. */
export interface DailyTestRequest {
  /** The day it was done on (sampleDayNumber). */
  day: number;
  name: string;
  cover?: string;
  colour?: string;
}

const DAILY_TEST_KEY = 'megy-daily-test';

/** Home → the builder: make today's sample album this way. Only a finished
 *  test is kept; returns whether it was. */
export function requestDailyTest(pick: DailyTestPick, now: Date): boolean {
  if (dailyTestMissing(pick, now)) return false;
  const cover = todaysTask(now) === 'cover';
  const request: DailyTestRequest = {
    day: sampleDayNumber(now),
    name: cleanAlbumName(pick.name),
    ...(cover ? { cover: pick.cover! } : { colour: todaysColour(now).hex }),
  };
  try { sessionStorage.setItem(DAILY_TEST_KEY, JSON.stringify(request)); return true; } catch { return false; }
}

/** The builder, as it makes today's sample album: the tester's test, once.
 *  Null when there is none, or it is not today's (a test left from another
 *  day is never used). */
export function takeDailyTest(now: Date = new Date()): DailyTestRequest | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(DAILY_TEST_KEY);
    sessionStorage.removeItem(DAILY_TEST_KEY);
  } catch { return null; }
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<DailyTestRequest>;
    if (r.day !== sampleDayNumber(now) || typeof r.name !== 'string') return null;
    if (dailyTestMissing({ name: r.name, cover: r.cover ?? null, colour: r.colour ?? null }, now)) return null;
    return { day: r.day, name: r.name, ...(r.cover ? { cover: r.cover } : {}), ...(r.colour ? { colour: r.colour } : {}) };
  } catch {
    return null;
  }
}
