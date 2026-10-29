// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ══════════════════════════════════════════════════════════════════════════
   LESSONS AND FEATURES TRIED SO FAR (owner, 2026-10-29: the daily test
   becomes a daily lesson; "Lesson 4 · You've tried 7 of 15 features"). Kept
   on the phone next to the daily test's own state. Each feature counts
   once, whatever the day; only a task DONE counts (the before-task once the
   album is made with it, the task in the album once the album shows it); it
   is still there after a reload.
   ══════════════════════════════════════════════════════════════════════════ */

import { readProgress, markTried, lessonNumber, triedCount, progressLine } from './lessonProgress';
import {
  PROGRESS_KEY, RUN_KEY, startRun, addTestTime, attachRun, markAlbumTaskDone, dailyLessonProgress, readRun,
} from './dailyTestRun';
import { requestDailyTest, beforeTaskFor, dateExample, todaysAlbumTask, BEFORE_TASKS, ALBUM_TASKS, type DailyTestRequest } from './dailyTest';
import { sampleDayNumber } from './samplePhotos';

const K = 'lesson-progress-spec';
const OCT29 = new Date(2026, 9, 29, 15, 20);
const dayOf = (offset: number) => new Date(2026, 9, 29 + offset, 15, 20);
const D0 = sampleDayNumber(OCT29);
const MADE = OCT29.getTime();
/** Today's lesson on a day, done on Today's lesson: the name and today's answer. */
const testOn = (at: Date): DailyTestRequest => {
  const t = beforeTaskFor(at);
  return { day: sampleDayNumber(at), name: dateExample(at), before: t.id, answer: t.answer ?? t.options[0].value, album: todaysAlbumTask(at) };
};
/** The album made from it: the before-task is done; the task in the album starts. */
const albumMade = (at: Date, madeAt = MADE) => {
  const test = testOn(at);
  attachRun(test, madeAt, test.album, { page: 4, slot: null }, []);
  return test;
};

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('features tried: each one once', () => {
  it('a feature done again (another day, another answer) still counts once; each day counts once', () => {
    markTried(K, 'titleFont', 1);
    markTried(K, 'titleFont', 11);
    markTried(K, 'layout', 1);
    markTried(K, 'layout', 1);
    expect(readProgress(K)).toEqual({ tried: ['titleFont', 'layout'], days: [1, 11] });
    expect(triedCount(readProgress(K), [...BEFORE_TASKS, ...ALBUM_TASKS])).toBe(2);
    // Only the features asked about count.
    expect(triedCount(readProgress(K), ['layout'])).toBe(1);
  });

  it("the lesson's number: the days before (and after) today with a lesson, plus one; the same all day", () => {
    expect(lessonNumber({ tried: [], days: [] }, 5)).toBe(1);
    expect(lessonNumber({ tried: ['cover'], days: [1, 2, 3] }, 4)).toBe(4);
    expect(lessonNumber({ tried: ['cover'], days: [1, 2, 3, 4] }, 4)).toBe(4); // today's done: still lesson 4
  });

  it('the line, small and plain', () => {
    expect(progressLine(4, 7, 15)).toBe("Lesson 4 · You've tried 7 of 15 features");
    expect(progressLine(2, 1, 15)).toBe("Lesson 2 · You've tried 1 of 15 features");
    expect(progressLine(1, 0, 15)).toBe('Lesson 1 · 15 features to try');
  });

  it('nothing kept, or something unreadable: none, and no crash', () => {
    expect(readProgress(K)).toEqual({ tried: [], days: [] });
    localStorage.setItem(K, '{not json');
    expect(readProgress(K)).toEqual({ tried: [], days: [] });
    localStorage.setItem(K, JSON.stringify({ tried: ['cover', 7, null, 'cover'], days: ['x', 3, 3] }));
    expect(readProgress(K)).toEqual({ tried: ['cover'], days: [3] });
  });
});

describe('the daily lesson: only tasks DONE count', () => {
  it('opening Today\'s lesson, a pick with no album made, or a task in the album not done yet: nothing', () => {
    startRun(D0);
    addTestTime(1000);
    expect(dailyLessonProgress(D0)).toEqual({ lesson: 1, tried: 0, total: 15 });
    // Today's date and today's answer, "Make my album" kept it: the album isn't made yet.
    const t = beforeTaskFor(OCT29);
    expect(requestDailyTest({ name: dateExample(OCT29), answer: t.answer ?? t.options[0].value }, OCT29)).toBe(true);
    expect(dailyLessonProgress(D0).tried).toBe(0);
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it('the album made with today\'s answer: the before-task; the album showing the task: the task in the album', () => {
    const test = albumMade(OCT29);
    expect(readProgress(PROGRESS_KEY).tried).toEqual([test.before]);
    expect(dailyLessonProgress(D0)).toEqual({ lesson: 1, tried: 1, total: 15 });
    markAlbumTaskDone('new layout on page 5');
    expect(readProgress(PROGRESS_KEY).tried).toEqual([test.before, test.album]);
    expect(dailyLessonProgress(D0)).toEqual({ lesson: 1, tried: 2, total: 15 });
    // Seen done again (each change in the album checks): still 2.
    markAlbumTaskDone('new layout on page 6');
    expect(dailyLessonProgress(D0).tried).toBe(2);
    expect(readRun()!.albumDone).toBe('new layout on page 5');
  });

  it('day 2 goes up (lesson 2, two more features); a feature that comes back 10 days on adds none', () => {
    albumMade(OCT29); markAlbumTaskDone('a');
    // The next day: lesson 2, with day 1's two features.
    expect(dailyLessonProgress(sampleDayNumber(dayOf(1)))).toEqual({ lesson: 2, tried: 2, total: 15 });
    albumMade(dayOf(1), MADE + 1); markAlbumTaskDone('b');
    expect(dailyLessonProgress(sampleDayNumber(dayOf(1)))).toEqual({ lesson: 2, tried: 4, total: 15 });
    // Ten days on, the same before-task (another answer) and the same task in the album: lesson 3, still 4.
    albumMade(dayOf(10), MADE + 2); markAlbumTaskDone('c');
    expect(testOn(dayOf(10)).before).toBe(testOn(OCT29).before);
    expect(dailyLessonProgress(sampleDayNumber(dayOf(10)))).toEqual({ lesson: 3, tried: 4, total: 15 });
  });

  it('all 15 in any 10 days in a row', () => {
    for (let i = 0; i < 10; i++) { albumMade(dayOf(i), MADE + i); markAlbumTaskDone('done'); }
    expect(dailyLessonProgress(sampleDayNumber(dayOf(9)))).toEqual({ lesson: 10, tried: 15, total: 15 });
  });

  it('kept apart from the album\'s run: a new album (or none) keeps what was tried', () => {
    albumMade(OCT29); markAlbumTaskDone('a');
    localStorage.removeItem(RUN_KEY);
    expect(dailyLessonProgress(D0).tried).toBe(2);
  });
});

describe('it survives a reload', () => {
  it('the app reloads (a fresh copy of the code): the same lesson and features tried', async () => {
    albumMade(OCT29); markAlbumTaskDone('a');
    albumMade(dayOf(1), MADE + 1);
    const before = dailyLessonProgress(sampleDayNumber(dayOf(1)));
    expect(before).toEqual({ lesson: 2, tried: 3, total: 15 });
    vi.resetModules();
    const fresh = await import('./dailyTestRun');
    expect(fresh.dailyLessonProgress(sampleDayNumber(dayOf(1)))).toEqual(before);
    // And it goes on counting from there.
    fresh.markAlbumTaskDone('b');
    expect(fresh.dailyLessonProgress(sampleDayNumber(dayOf(1)))).toEqual({ lesson: 2, tried: 4, total: 15 });
  });
});
