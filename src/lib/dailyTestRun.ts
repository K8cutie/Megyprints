/* ══════════════════════════════════════════════════════════════════════════
   Today's test as it goes (lib/dailyTest), kept on the phone so a reload, or
   leaving the app and coming back, carries on where it was:
     • the minute in the app (owner, 2026-10-29: "Also let them spend a
       minute on the app"): time with the app in front, from the moment
       Today's test opens. Time in the background doesn't count;
     • the test itself, once "Make my album" has made the album, and which
       album that is (the time its pages were made);
     • the task in the album: where it is, the album as it was made (to see
       when it is done), and what was done.
   "You're done" opens only when the task in the album is done AND the minute
   is up (runComplete).

   Next to it, the lessons and features tried over the test days (owner,
   2026-10-29: the daily test becomes a daily lesson): "Lesson 4 · You've
   tried 7 of 15 features" (lib/lessonProgress, under PROGRESS_KEY). Only a
   task DONE counts: the before-task once the album is made with it
   (attachRun), the task in the album once the album shows it
   (markAlbumTaskDone). Opening Today's lesson, or a pick with no album made,
   counts nothing. Each feature counts once, whatever the day.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useSyncExternalStore } from 'react';
import { BEFORE_TASKS, ALBUM_TASKS, type AlbumTaskId, type DailyTestRequest } from './dailyTest';
import { readProgress, markTried, lessonNumber, triedCount } from './lessonProgress';

export const RUN_KEY = 'megy-daily-test-run';
/** The lessons and features tried, over all the test days (lib/lessonProgress). */
export const PROGRESS_KEY = 'megy-daily-test-progress';
/** The minute while Today's test is open, before an album is made from it.
 *  Apart from the run, so opening Today's test (and closing it) never
 *  touches the album an earlier test made. */
export const TEST_CLOCK_KEY = 'megy-daily-test-clock';
const RUN_EVENT = 'megy-daily-test-run';

/** The time in the app before "You're done": a minute. */
export const MIN_FOREGROUND_MS = 60_000;
/** The most one tick adds: a phone that put the app to sleep between ticks
 *  doesn't count the sleep. */
export const MAX_TICK_MS = 1_500;

/** A page, as it was when the album was made: enough to see a change. */
export interface PageSnap {
  /** Its layout. */
  t: string;
  /** Its photos, in order. */
  f: string;
  /** How many photos have a look. */
  l: number;
  /** How many words (texts with something in them). */
  w: number;
}

export interface DailyTestRun {
  /** The day Today's test opened (sampleDayNumber). */
  day: number;
  /** Time with the app in front since then (ms). */
  fgMs: number;
  /** "Make my album": the test. */
  test?: DailyTestRequest;
  /** The album made from it: when its pages were made (each page carries it). */
  madeAt?: number;
  /** The task in the album (today's, unless the album had no box to type in). */
  task?: AlbumTaskId;
  /** Where the task is: the page, and the photo or box on it. */
  target?: { page: number; slot: number | null };
  /** The album as it was made. */
  start?: PageSnap[];
  /** The task in the album, done: what was done ("new layout on page 5"). */
  albumDone?: string;
  /** "You're done" has opened by itself. */
  doneShown?: boolean;
}

let cachedRaw: string | null = null;
let cached: DailyTestRun | null = null;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** The run on this phone, or null. The same object until it changes. */
export function readRun(): DailyTestRun | null {
  let raw: string | null = null;
  try { raw = storage()?.getItem(RUN_KEY) ?? null; } catch { raw = null; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const r = raw ? (JSON.parse(raw) as DailyTestRun) : null;
    cached = r && typeof r.day === 'number' && typeof r.fgMs === 'number' ? r : null;
  } catch { cached = null; }
  return cached;
}

function writeRun(run: DailyTestRun | null): void {
  try {
    if (run) storage()?.setItem(RUN_KEY, JSON.stringify(run));
    else storage()?.removeItem(RUN_KEY);
  } catch { /* storage blocked: this screen only */ }
  try { window.dispatchEvent(new Event(RUN_EVENT)); } catch { /* no window */ }
}

function updateRun(change: (run: DailyTestRun) => DailyTestRun): void {
  const run = readRun();
  if (run) writeRun(change(run));
}

/** The minute counted on Today's test, or null. */
export function readTestClock(): { day: number; fgMs: number } | null {
  try {
    const c = JSON.parse(storage()?.getItem(TEST_CLOCK_KEY) ?? 'null') as { day?: unknown; fgMs?: unknown } | null;
    return c && typeof c.day === 'number' && typeof c.fgMs === 'number' ? { day: c.day, fgMs: c.fgMs } : null;
  } catch { return null; }
}

/** Today's test opened: its minute starts from zero. */
export function startRun(day: number): void {
  try { storage()?.setItem(TEST_CLOCK_KEY, JSON.stringify({ day, fgMs: 0 })); } catch { /* storage blocked */ }
}

/** Time with the app in front, on Today's test. */
export function addTestTime(ms: number): void {
  const c = readTestClock();
  if (!c || !(ms > 0)) return;
  try { storage()?.setItem(TEST_CLOCK_KEY, JSON.stringify({ ...c, fgMs: c.fgMs + Math.min(ms, MAX_TICK_MS) })); } catch { /* storage blocked */ }
}

/** The album is made: the run is this album's. Its minute carries on from
 *  Today's test (the same day), and the task in the album starts. */
export function attachRun(test: DailyTestRequest, madeAt: number, task: AlbumTaskId, target: { page: number; slot: number | null }, start: PageSnap[]): void {
  const clock = readTestClock();
  try { storage()?.removeItem(TEST_CLOCK_KEY); } catch { /* storage blocked */ }
  // The before-task is done: the album is made with it.
  markTried(PROGRESS_KEY, test.before, test.day);
  writeRun({ day: test.day, fgMs: clock?.day === test.day ? clock.fgMs : 0, test, madeAt, task, target, start });
}

/** Time with the app in front. */
export function addRunTime(ms: number): void {
  if (!(ms > 0)) return;
  updateRun((r) => ({ ...r, fgMs: r.fgMs + Math.min(ms, MAX_TICK_MS) }));
}

/** The task in the album is done. */
export function markAlbumTaskDone(label: string): void {
  const run = readRun();
  if (run && !run.albumDone && run.task) markTried(PROGRESS_KEY, run.task, run.day);
  updateRun((r) => (r.albumDone ? r : { ...r, albumDone: label }));
}

/** Today's lesson, for the tester: its number, and the features tried so far
 *  out of all 15 (the 10 before-tasks and the 5 in the album). */
export function dailyLessonProgress(day: number): { lesson: number; tried: number; total: number } {
  const features: string[] = [...BEFORE_TASKS, ...ALBUM_TASKS];
  const p = readProgress(PROGRESS_KEY);
  return { lesson: lessonNumber(p, day), tried: triedCount(p, features), total: features.length };
}

/** "You're done" has opened by itself. */
export function markDoneShown(): void {
  updateRun((r) => ({ ...r, doneShown: true }));
}

/** The run, while it is this album's (its pages were made then), else null. */
export function runFor(run: DailyTestRun | null, pages: readonly { madeAt?: number }[]): DailyTestRun | null {
  if (!run || run.madeAt == null || !run.test || !run.task || !run.target) return null;
  return pages.some((p) => p.madeAt === run.madeAt) ? run : null;
}

/** Both done: the task in the album, and the minute. */
export function runComplete(run: DailyTestRun | null): boolean {
  return !!run?.albumDone && run.fgMs >= MIN_FOREGROUND_MS;
}

/** Time left in the minute (ms). */
export function remainingMs(run: DailyTestRun | null): number {
  return Math.max(0, MIN_FOREGROUND_MS - (run?.fgMs ?? 0));
}

/** "0:23": the time left, rounded up to the second. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === RUN_KEY) onChange(); };
  window.addEventListener(RUN_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(RUN_EVENT, onChange); window.removeEventListener('storage', onStorage); };
}

/** The run, kept up to date. */
export function useDailyTestRun(): DailyTestRun | null {
  return useSyncExternalStore(subscribe, readRun, () => null);
}

/** Count the time the app is in front, while `active`, into the album's run
 *  (or, on Today's test, `add` = addTestTime). A tick adds the time since the
 *  last one (a second), never more than MAX_TICK_MS; a hidden app adds
 *  nothing, and coming back starts from then. */
export function useForegroundClock(active: boolean, add: (ms: number) => void = addRunTime): void {
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const gap = now - last;
      last = now;
      if (document.visibilityState === 'visible') add(gap);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') last = performance.now(); };
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisibility); };
  }, [active, add]);
}
