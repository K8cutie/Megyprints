// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   TODAY'S TEST (owner, 2026-10-29: "They should type the correct date so they
   cant cheat the process"; then "Do 10 test pool that shows different
   feature", "Dont make the tasks too complicated", "Including your other
   suggestions make that pool"). The date check by the phone's clock; the two
   pools and which task is today's; each before-task's options, its one
   answer and its words; what "Make my album" says or keeps; how the answer
   reaches the album; and the line on "You're done".

   THE DAILY LESSON (owner, the same day: "it becomes a tutorial of sorts"):
   the same mechanics, in a lesson's words. Each before-task says what the
   feature does (lib/lessonTips), then what to do after "Try it:" ("Your
   cover title can use many fonts. Try it: pick Great Vibes."), and the done
   line says "Today you tried: ...".
   ══════════════════════════════════════════════════════════════════════════ */

import {
  isTodaysDate, dateExample, dateRefusedMessage, BEFORE_TASKS, ALBUM_TASKS, todaysBeforeTask, todaysAlbumTask, beforeTaskFor,
  isTodaysAnswer, coverChoices, COVER_CHOICES, samplePhotoNumber, dailyTestMissing, dailyTestRequest, requestDailyTest, takeDailyTest,
  WANT_DATE, coverTitleFrom, sizeFrom, beforeTaskLabel, doneLine, TITLE_SIZES, type BeforeTaskId,
} from './dailyTest';
import { sampleDayNumber, sampleAlbumPhotos, SAMPLE_END_OF_DAY_NAMES } from './samplePhotos';
import { PAGE_COLORS } from '../pages/builder/pageColors';
import { DEFAULT_TITLE_FONT, FONTS } from '../pages/builder/fonts';
import { COMMON_THEMES } from './albumTheme';
import { SETUP_TIPS, ALBUM_TIPS, LESSON_FEATURES } from './lessonTips';

// Thursday 29 October 2026, mid-afternoon on the phone's clock.
const OCT29 = new Date(2026, 9, 29, 15, 20);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
const nextDay = (d: Date) => addDays(d, 1);
/** The first day from Oct 29 whose before-task is this one. */
const dayFor = (task: BeforeTaskId, from = OCT29) => {
  for (let i = 0; i < 10; i++) if (todaysBeforeTask(addDays(from, i)) === task) return addDays(from, i);
  throw new Error(task);
};

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

describe('the pools: which tasks are today\'s', () => {
  it('10 before-tasks and 5 in-album tasks, each once', () => {
    expect(BEFORE_TASKS).toHaveLength(10);
    expect(new Set(BEFORE_TASKS).size).toBe(10);
    expect(ALBUM_TASKS).toEqual(['layout', 'caption', 'look', 'swap', 'openBook']);
  });

  it('the same all day long', () => {
    for (const h of [0, 6, 12, 18, 23]) {
      const t = new Date(2026, 9, 29, h, 59);
      expect(todaysBeforeTask(t)).toBe(todaysBeforeTask(OCT29));
      expect(todaysAlbumTask(t)).toBe(todaysAlbumTask(OCT29));
      expect(beforeTaskFor(t)).toEqual(beforeTaskFor(OCT29));
    }
  });

  it('any 10 days in a row go through all 10 before-tasks, any 5 through all 5 in-album tasks', () => {
    for (let start = 0; start < 30; start++) {
      const first = addDays(OCT29, start);
      expect(new Set(Array.from({ length: 10 }, (_, i) => todaysBeforeTask(addDays(first, i)))).size, `from day ${start}`).toBe(10);
      expect(new Set(Array.from({ length: 5 }, (_, i) => todaysAlbumTask(addDays(first, i)))).size, `from day ${start}`).toBe(5);
    }
  });

  it('never the same as the day before (the before-task and the in-album task both change)', () => {
    let d = OCT29;
    for (let i = 0; i < 40; i++) {
      expect(todaysBeforeTask(nextDay(d))).not.toBe(todaysBeforeTask(d));
      expect(todaysAlbumTask(nextDay(d))).not.toBe(todaysAlbumTask(d));
      d = nextDay(d);
    }
  });

  it('a task that comes back (10 days on) asks for another answer', () => {
    for (const task of BEFORE_TASKS) {
      if (task === 'cover' || task === 'titleShadow') continue; // any photo / the one change from the default
      const day = dayFor(task);
      expect(beforeTaskFor(addDays(day, 10)).answer, task).not.toBe(beforeTaskFor(day).answer);
    }
  });
});

describe('each before-task: one tap on a list already shown, one answer that counts', () => {
  for (const task of BEFORE_TASKS) {
    it(task, () => {
      const day = dayFor(task);
      const t = beforeTaskFor(day);
      expect(t.id).toBe(task);
      expect(t.options.length).toBeGreaterThan(1);
      if (task === 'cover') {
        // Any of today's photos counts; there is nothing to get wrong.
        expect(t.answer).toBeNull();
        expect(t.wrong).toBeNull();
        expect(t.want).toBe('Choose your cover first.');
        for (const o of t.options) expect(isTodaysAnswer(t, o.value)).toBe(true);
        expect(isTodaysAnswer(t, 'megy-sample-99.jpg')).toBe(false);
        return;
      }
      // The answer is one of the options, in bold in the line ("pick **Red**."), and the only one that counts.
      const answer = t.options.find((o) => o.value === t.answer)!;
      expect(answer, `${task} answer in its options`).toBeTruthy();
      expect(t.line).toBe(`pick **${answer.label}**.`);
      expect(t.options.filter((o) => isTodaysAnswer(t, o.value)).map((o) => o.value)).toEqual([t.answer]);
      expect(isTodaysAnswer(t, null)).toBe(false);
      expect(t.wrong).toMatch(new RegExp(`^Today's .+ is ${answer.label.replace(/[+×]/g, '\\$&')}\\. Tap ${answer.label.replace(/[+×]/g, '\\$&')}\\.$`));
      expect(t.want).toMatch(new RegExp(`^Pick today's .+ first: ${answer.label.replace(/[+×]/g, '\\$&')}\\.$`));
    });
  }

  it("the colour, in the owner's words, from the page colours", () => {
    let day = dayFor('colour');
    while (beforeTaskFor(day).answer !== PAGE_COLORS.find((c) => c.name === 'Brown')!.hex) day = addDays(day, 10);
    const t = beforeTaskFor(day);
    expect(t.options.map((o) => o.label)).toEqual(PAGE_COLORS.map((c) => c.name));
    // The owner's example: "Every page can have a background colour. Try it: pick Red."
    expect(t.teach).toBe('Every page can have a background colour.');
    expect(t.line).toBe('pick **Brown**.');
    expect(t.wrong).toBe("Today's colour is Brown. Tap Brown.");
    expect(t.want).toBe("Pick today's colour first: Brown.");
    expect(isTodaysAnswer(t, PAGE_COLORS.find((c) => c.name === 'Brown')!.hex.toLowerCase())).toBe(true);
  });

  it('the font: fonts the app can draw, shown in their own face, never the title\'s own font', () => {
    const t = beforeTaskFor(dayFor('titleFont'));
    expect(t.look).toBe('fonts');
    for (const o of t.options) {
      expect(FONTS.map((f) => f.family)).toContain(o.value);
      expect(o.font).toBe(o.value);
    }
    expect(t.options.map((o) => o.value)).not.toContain(DEFAULT_TITLE_FONT);
    // The owner's example: "Your cover title can use many fonts. Try it: pick Great Vibes."
    expect(t.teach).toBe('Your cover title can use many fonts.');
    expect(t.line).toMatch(/^pick \*\*.+\*\*\.$/);
  });

  it('the size: the sizes offered, never 8×8 (the size an album starts at)', () => {
    for (let k = 0; k < 6; k++) {
      const t = beforeTaskFor(addDays(dayFor('size'), k * 10));
      expect(t.answer).not.toBe('8x8');
      expect(t.line).toMatch(/^pick \*\*.+×.+\*\*\.$/);
      expect(t.teach).toBe('Albums come in different sizes, in inches.');
    }
  });

  it('the occasion: Step 1\'s occasions', () => {
    const t = beforeTaskFor(dayFor('occasion'));
    expect(t.options.map((o) => o.value)).toEqual([...COMMON_THEMES]);
    expect(t.line).toMatch(/^pick \*\*.+\*\*\.$/);
  });
});

describe('the lesson: a "Try it" card for each before-task', () => {
  it('every before-task first says what its feature does, in one short line, then what to do', () => {
    for (const task of BEFORE_TASKS) {
      const t = beforeTaskFor(dayFor(task));
      expect(t.teach, task).toBe(SETUP_TIPS[task]);
      // One short sentence (or two very short ones), ending in a full stop; no "test".
      expect(t.teach.length, task).toBeLessThanOrEqual(70);
      expect(t.teach, task).toMatch(/\.$/);
      expect(t.teach.toLowerCase(), task).not.toContain('test');
      // What to do reads on from "Try it:": small first letter, a full stop.
      expect(t.line, task).toMatch(/^[a-z].*\.$/);
    }
    expect(beforeTaskFor(dayFor('cover')).line).toBe('tap the photo you want on the cover.');
  });

  it('15 features to try: the 10 before-tasks and the 5 in the album, each with its line', () => {
    expect(LESSON_FEATURES).toEqual([...BEFORE_TASKS, ...ALBUM_TASKS]);
    expect(new Set(LESSON_FEATURES).size).toBe(15);
    for (const task of ALBUM_TASKS) {
      expect(ALBUM_TIPS[task].teach, task).toMatch(/\.$/);
      expect(ALBUM_TIPS[task].try, task).toMatch(/^[A-Z].*\.$/);
    }
    // The owner's example for the layout: "This is where you change a page's layout. Pick any new one."
    expect(`${ALBUM_TIPS.layout.teach} ${ALBUM_TIPS.layout.try}`).toBe("This is where you change a page's layout. Pick any new one.");
  });

  it('the checks are the same as before: the wrong pick and the missing step still name today\'s answer', () => {
    let day = dayFor('colour');
    while (beforeTaskFor(day).answer !== PAGE_COLORS.find((c) => c.name === 'Red')!.hex) day = addDays(day, 10);
    const t = beforeTaskFor(day);
    expect(t.wrong).toBe("Today's colour is Red. Tap Red.");
    expect(t.want).toBe("Pick today's colour first: Red.");
    expect(isTodaysAnswer(t, t.answer)).toBe(true);
    expect(isTodaysAnswer(t, PAGE_COLORS.find((c) => c.name !== 'Red')!.hex)).toBe(false);
  });
});

describe('"Make my album": what is missing, and what is kept', () => {
  const day = dayFor('titleFont');
  const t = beforeTaskFor(day);
  const typed = dateExample(day);
  const other = t.options.find((o) => o.value !== t.answer)!.value;

  beforeEach(() => sessionStorage.clear());

  it('says what is missing in the order of the steps: the date, then today\'s task', () => {
    expect(dailyTestMissing({ name: '' }, day)).toBe(WANT_DATE);
    // A wrong date, even with the task done: still the date.
    expect(dailyTestMissing({ name: 'Oct 1', answer: t.answer }, day)).toBe(WANT_DATE);
    expect(dailyTestMissing({ name: typed }, day)).toBe(t.want);
    expect(dailyTestMissing({ name: typed, answer: other }, day)).toBe(t.want);
    expect(dailyTestMissing({ name: typed, answer: t.answer }, day)).toBeNull();
    expect(WANT_DATE).toBe("Type today's date first.");
  });

  it('keeps nothing while a step is missing', () => {
    expect(requestDailyTest({ name: typed }, day)).toBe(false);
    expect(requestDailyTest({ name: 'Jan 1', answer: t.answer }, day)).toBe(false);
    expect(takeDailyTest(day)).toBeNull();
  });

  it('done: the builder gets the typed name, today\'s task and answer, and today\'s in-album task, once', () => {
    expect(requestDailyTest({ name: `  ${typed.toUpperCase()}  `, answer: t.answer }, day)).toBe(true);
    expect(takeDailyTest(day)).toEqual({ day: sampleDayNumber(day), name: typed.toUpperCase(), before: 'titleFont', answer: t.answer, album: todaysAlbumTask(day) });
    expect(takeDailyTest(day)).toBeNull(); // used up
  });

  it('a test kept on another day, or edited by hand, is never used', () => {
    requestDailyTest({ name: typed, answer: t.answer }, day);
    expect(takeDailyTest(nextDay(day))).toBeNull();
    sessionStorage.setItem('megy-daily-test', '{not json');
    expect(takeDailyTest(day)).toBeNull();
    const kept = (r: object) => { sessionStorage.setItem('megy-daily-test', JSON.stringify(r)); return takeDailyTest(day); };
    const good = dailyTestRequest({ name: typed, answer: t.answer }, day)!;
    expect(kept(good)).toEqual(good);
    expect(kept({ ...good, name: 'Jan 1' })).toBeNull();
    expect(kept({ ...good, answer: other })).toBeNull();
    expect(kept({ ...good, before: 'colour' })).toBeNull();
    expect(kept({ ...good, album: todaysAlbumTask(nextDay(day)) })).toBeNull();
    // #228's tests (a cover or a colour, no pool): refused.
    expect(kept({ day: good.day, name: typed, cover: coverChoices(day)[0] })).toBeNull();
  });

  it('the cover: any of today\'s 12 photos, all in today\'s album, none the end-of-day photo', () => {
    const cd = dayFor('cover');
    const choices = coverChoices(cd);
    expect(choices).toHaveLength(COVER_CHOICES);
    const album = sampleAlbumPhotos(sampleDayNumber(cd));
    for (const c of choices) expect(album).toContain(c);
    expect(choices.some((c) => SAMPLE_END_OF_DAY_NAMES.includes(c))).toBe(false);
    expect(dailyTestMissing({ name: dateExample(cd) }, cd)).toBe('Choose your cover first.');
    expect(dailyTestRequest({ name: dateExample(cd), answer: choices[7] }, cd)).toMatchObject({ before: 'cover', answer: choices[7] });
    expect(samplePhotoNumber('megy-sample-12.jpg')).toBe(12);
    expect(samplePhotoNumber('IMG_2001.jpg')).toBeNull();
  });
});

describe('the answer, applied to the album the way the steps before "Make my album" set it', () => {
  it('the cover title: white over the photo, unless the task is its colour; its font, side, style, size or shadow', () => {
    expect(coverTitleFrom(null)).toEqual({ color: '#FFFFFF', style: {} });
    expect(coverTitleFrom({ before: 'cover', answer: 'megy-sample-03.jpg' })).toEqual({ color: '#FFFFFF', style: {} });
    expect(coverTitleFrom({ before: 'titleColour', answer: '#C9A24B' })).toEqual({ color: '#C9A24B', style: {} });
    expect(coverTitleFrom({ before: 'titleFont', answer: '"Dancing Script", cursive' })).toEqual({ color: '#FFFFFF', style: { fontFamily: '"Dancing Script", cursive' } });
    expect(coverTitleFrom({ before: 'titleAlign', answer: 'left' }).style).toEqual({ alignment: 'left' });
    expect(coverTitleFrom({ before: 'titleStyle', answer: 'italic' }).style).toEqual({ bold: false, italic: true });
    expect(coverTitleFrom({ before: 'titleStyle', answer: 'boldItalic' }).style).toEqual({ bold: true, italic: true });
    expect(coverTitleFrom({ before: 'titleStyle', answer: 'plain' }).style).toEqual({ bold: false, italic: false });
    expect(coverTitleFrom({ before: 'titleSize', answer: 'large' }).style).toEqual({ fontSize: TITLE_SIZES.large });
    expect(coverTitleFrom({ before: 'titleSize', answer: 'small' }).style).toEqual({ fontSize: TITLE_SIZES.small });
    // Off is stored as false (the cover editor's way); on is no setting.
    expect(coverTitleFrom({ before: 'titleShadow', answer: 'off' }).style).toEqual({ shadow: false });
  });

  it('the size, only when today\'s task is the size', () => {
    expect(sizeFrom({ before: 'size', answer: '6x6' })).toBe('6x6');
    expect(sizeFrom({ before: 'colour', answer: '#EE204D' })).toBeNull();
    expect(sizeFrom(null)).toBeNull();
  });
});

describe('the line on "You finished today\'s lesson!": both of today\'s tasks', () => {
  it('names today\'s before-task and its answer in plain words', () => {
    expect(beforeTaskLabel({ before: 'cover', answer: 'megy-sample-12.jpg' })).toBe('cover photo 12');
    expect(beforeTaskLabel({ before: 'colour', answer: '#EE204D' })).toBe('background Red');
    expect(beforeTaskLabel({ before: 'titleFont', answer: FONTS.find((f) => f.name === 'Dancing Script')!.family })).toBe('title font Dancing Script');
    expect(beforeTaskLabel({ before: 'titleAlign', answer: 'left' })).toBe('title on the left');
    expect(beforeTaskLabel({ before: 'size', answer: '6x6' })).toBe('size 6×6');
    expect(beforeTaskLabel({ before: 'titleColour', answer: '#C9A24B' })).toBe('title colour Gold');
    expect(beforeTaskLabel({ before: 'occasion', answer: 'Birthday' })).toBe('occasion Birthday');
    expect(beforeTaskLabel({ before: 'titleStyle', answer: 'boldItalic' })).toBe('title bold + italic');
    expect(beforeTaskLabel({ before: 'titleSize', answer: 'large' })).toBe('title large');
    expect(beforeTaskLabel({ before: 'titleShadow', answer: 'off' })).toBe('title with no shadow');
  });

  it('"Today you tried: <before> · <in the album>" (the proof line: the owner\'s words)', () => {
    expect(doneLine('title font Great Vibes', 'words on page 4')).toBe('Today you tried: title font Great Vibes · words on page 4');
    expect(doneLine('title font Dancing Script', 'new layout on page 5')).toBe('Today you tried: title font Dancing Script · new layout on page 5');
  });
});
