// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   TODAY'S TEST (owner, 2026-10-29: "They should type the correct date so they
   cant cheat the process"; the colour day names ONE colour, "For today,
   select Brown for your album background"). The date check by the phone's
   clock, the task by the day, and what "Make my album" says or keeps.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  isTodaysDate, dateExample, dateRefusedMessage, todaysTask, todaysColour, colourTaskLine, wrongColourMessage,
  coverChoices, COVER_CHOICES, dailyTestMissing, requestDailyTest, takeDailyTest, wantColourMessage, WANT_DATE, WANT_COVER,
} from './dailyTest';
import { sampleDayNumber, sampleAlbumPhotos, SAMPLE_END_OF_DAY_NAMES } from './samplePhotos';
import { PAGE_COLORS } from '../pages/builder/pageColors';

// Thursday 29 October 2026, mid-afternoon on the phone's clock.
const OCT29 = new Date(2026, 9, 29, 15, 20);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0);
const nextDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, d.getHours(), d.getMinutes());

describe('the date check: today, by the phone\'s clock', () => {
  it('accepts the usual ways of writing today', () => {
    for (const typed of [
      'Oct 29', 'October 29', 'Oct 29 2026', '10/29', '29/10', '10-29', '2026-10-29',
      // case and spaces don't matter
      'oct 29', 'OCT 29', '  Oct   29  ', 'oct29', 'OCTOBER29', '10 / 29', ' 2026 - 10 - 29 ',
      // the other usual forms of the same date
      'Oct 29, 2026', 'Oct. 29', 'Oct 29th', '29 Oct', '29 October 2026', '10/29/2026', '29/10/2026', '10/29/26', '29-10', '2026/10/29',
    ]) expect(isTodaysDate(typed, OCT29), typed).toBe(true);
  });

  it('refuses yesterday, tomorrow, another year, other text, and nothing', () => {
    for (const typed of [
      'Oct 28', 'October 28', '10/28', '28/10', '2026-10-28', // yesterday
      'Oct 30', '10/30', '30/10', '2026-10-30', // tomorrow
      'Oct 29 2025', '10/29/2025', '2025-10-29', '10/29/25', // another year
      'Nov 29', '11/29', 'Sep 29', // another month
      '', '   ', 'Sample Album', 'today', 'Oct', '29', 'Oc 29', '1029', 'Oct 29 extra', 'hello Oct 29', '13/29', '29/13',
    ]) expect(isTodaysDate(typed, OCT29), JSON.stringify(typed)).toBe(false);
  });

  it('follows the clock: a single-digit day, and just after midnight', () => {
    const oct5 = at(2026, 10, 5);
    for (const typed of ['Oct 5', 'Oct 05', '10/5', '10/05', '5/10', '2026-10-05', 'October 5']) expect(isTodaysDate(typed, oct5), typed).toBe(true);
    expect(isTodaysDate('Oct 4', oct5)).toBe(false);
    const afterMidnight = new Date(2026, 9, 30, 0, 1);
    expect(isTodaysDate('Oct 30', afterMidnight)).toBe(true);
    expect(isTodaysDate('Oct 29', afterMidnight)).toBe(false);
    // September, written the usual ways.
    const sep9 = at(2026, 9, 9);
    for (const typed of ['Sep 9', 'Sept 9', 'September 9', '9/9']) expect(isTodaysDate(typed, sep9), typed).toBe(true);
  });

  it('the example and the refusal say today in the same format', () => {
    expect(dateExample(OCT29)).toBe('Oct 29');
    expect(dateExample(at(2026, 11, 3))).toBe('Nov 3');
    expect(isTodaysDate(dateExample(OCT29), OCT29)).toBe(true);
    expect(dateRefusedMessage(OCT29)).toBe("That's not today's date. Type today's date, for example Oct 29.");
  });
});

describe('today\'s task alternates by day', () => {
  it('the same all day, the other one the next day: cover on even days, colour on odd days', () => {
    const day = sampleDayNumber(OCT29);
    expect(todaysTask(OCT29)).toBe(day % 2 === 0 ? 'cover' : 'colour');
    // All day long.
    for (const h of [0, 6, 12, 18, 23]) expect(todaysTask(new Date(2026, 9, 29, h, 59))).toBe(todaysTask(OCT29));
    // Two weeks of days: never the same task two days running.
    let d = OCT29;
    for (let i = 0; i < 14; i++) {
      const next = nextDay(d);
      expect(todaysTask(next)).not.toBe(todaysTask(d));
      expect(todaysTask(next)).toBe(sampleDayNumber(next) % 2 === 0 ? 'cover' : 'colour');
      d = next;
    }
  });

  it("today's colour: one of the website's page colours, the same all day, a different one the next day", () => {
    expect(PAGE_COLORS).toContainEqual(todaysColour(OCT29));
    for (const h of [0, 9, 23]) expect(todaysColour(new Date(2026, 9, 29, h, 30))).toEqual(todaysColour(OCT29));
    let d = OCT29;
    const colourDays: string[] = [];
    for (let i = 0; i < 18; i++) {
      expect(todaysColour(nextDay(d)).name).not.toBe(todaysColour(d).name);
      if (todaysTask(d) === 'colour') colourDays.push(todaysColour(d).name);
      d = nextDay(d);
    }
    // Over 18 days the colour days go through all 9 colours, none twice.
    expect(new Set(colourDays).size).toBe(colourDays.length);
    expect(new Set(colourDays)).toEqual(new Set(PAGE_COLORS.map((c) => c.name)));
  });

  it("says it in the owner's words", () => {
    const brown = PAGE_COLORS.find((c) => c.name === 'Brown')!;
    expect(colourTaskLine(brown)).toBe('For today, select Brown for your album background.');
    expect(wrongColourMessage(brown)).toBe("Today's colour is Brown. Tap Brown.");
    expect(wantColourMessage(brown)).toBe("Pick today's colour first: Brown.");
  });

  it('the cover picker: 12 of today\'s sample photos, all in today\'s album, none the end-of-day photo', () => {
    const choices = coverChoices(OCT29);
    expect(choices).toHaveLength(COVER_CHOICES);
    expect(new Set(choices).size).toBe(COVER_CHOICES);
    const album = sampleAlbumPhotos(sampleDayNumber(OCT29));
    for (const c of choices) expect(album).toContain(c);
    expect(choices.some((c) => SAMPLE_END_OF_DAY_NAMES.includes(c))).toBe(false);
    // The same all day; another set the next day.
    expect(coverChoices(new Date(2026, 9, 29, 23, 0))).toEqual(choices);
    expect(coverChoices(nextDay(OCT29))).not.toEqual(choices);
  });
});

describe('"Make my album": what is missing, and what is kept', () => {
  // One of each kind of day.
  const coverDay = todaysTask(OCT29) === 'cover' ? OCT29 : nextDay(OCT29);
  const colourDay = todaysTask(OCT29) === 'colour' ? OCT29 : nextDay(OCT29);
  const typed = (d: Date) => dateExample(d);

  beforeEach(() => sessionStorage.clear());

  it('refuses while a step is missing, saying which, first the date', () => {
    expect(dailyTestMissing({ name: '' }, coverDay)).toBe(WANT_DATE);
    expect(dailyTestMissing({ name: 'Oct 1', cover: coverChoices(coverDay)[0] }, coverDay)).toBe(WANT_DATE);
    expect(dailyTestMissing({ name: typed(coverDay) }, coverDay)).toBe(WANT_COVER);
    expect(dailyTestMissing({ name: typed(coverDay), cover: 'megy-sample-99.jpg' }, coverDay)).toBe(WANT_COVER);
    expect(dailyTestMissing({ name: typed(coverDay), cover: coverChoices(coverDay)[3] }, coverDay)).toBeNull();

    const colour = todaysColour(colourDay);
    const other = PAGE_COLORS.find((c) => c.hex !== colour.hex)!;
    expect(dailyTestMissing({ name: typed(colourDay) }, colourDay)).toBe(wantColourMessage(colour));
    // Only today's colour counts.
    expect(dailyTestMissing({ name: typed(colourDay), colour: other.hex }, colourDay)).toBe(wantColourMessage(colour));
    expect(dailyTestMissing({ name: typed(colourDay), colour: colour.hex }, colourDay)).toBeNull();
    expect(dailyTestMissing({ name: typed(colourDay), colour: colour.hex.toLowerCase() }, colourDay)).toBeNull();
  });

  it('keeps nothing while a step is missing', () => {
    expect(requestDailyTest({ name: typed(coverDay) }, coverDay)).toBe(false);
    expect(takeDailyTest(coverDay)).toBeNull();
  });

  it('done: the builder gets the typed name and the cover, once', () => {
    const cover = coverChoices(coverDay)[5];
    expect(requestDailyTest({ name: `  ${typed(coverDay).toUpperCase()}  `, cover }, coverDay)).toBe(true);
    expect(takeDailyTest(coverDay)).toEqual({ day: sampleDayNumber(coverDay), name: typed(coverDay).toUpperCase(), cover });
    expect(takeDailyTest(coverDay)).toBeNull(); // used up
  });

  it("done: the builder gets the typed name and today's colour", () => {
    const colour = todaysColour(colourDay);
    expect(requestDailyTest({ name: '10/' + colourDay.getDate(), colour: colour.hex }, colourDay)).toBe(true);
    expect(takeDailyTest(colourDay)).toEqual({ day: sampleDayNumber(colourDay), name: `10/${colourDay.getDate()}`, colour: colour.hex });
  });

  it('a test kept on another day is never used', () => {
    requestDailyTest({ name: typed(coverDay), cover: coverChoices(coverDay)[0] }, coverDay);
    expect(takeDailyTest(nextDay(coverDay))).toBeNull();
    sessionStorage.setItem('megy-daily-test', '{not json');
    expect(takeDailyTest(coverDay)).toBeNull();
    // Edited by hand to another date: refused.
    sessionStorage.setItem('megy-daily-test', JSON.stringify({ day: sampleDayNumber(coverDay), name: 'Jan 1', cover: coverChoices(coverDay)[0] }));
    expect(takeDailyTest(coverDay)).toBeNull();
  });
});
