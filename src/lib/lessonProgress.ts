/* ══════════════════════════════════════════════════════════════════════════
   LESSONS AND FEATURES TRIED SO FAR, kept on the phone (owner, 2026-10-29:
   the daily test becomes a daily lesson). "Lesson 4 · You've tried 7 of 15
   features."

   • tried: the features done, each once (a feature done again on another day
     still counts once);
   • days: the days a lesson got that far (a day counts once).
   The lesson's number is the days before today, plus one: the same all day,
   before and after today's lesson is done.

   Generic: the caller says where it is kept (a localStorage key) and which
   features count. The tester's daily lesson keeps it next to its own state
   (lib/dailyTestRun PROGRESS_KEY) and marks a feature only once it is done.
   ══════════════════════════════════════════════════════════════════════════ */

export interface LessonProgress {
  /** The features done, each once. */
  tried: string[];
  /** The days (a day number, e.g. sampleDayNumber) a feature was done on. */
  days: number[];
}

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** What is kept under `key` (nothing yet, or something unreadable: none). */
export function readProgress(key: string): LessonProgress {
  try {
    const raw = JSON.parse(storage()?.getItem(key) ?? 'null') as Partial<LessonProgress> | null;
    const tried = Array.isArray(raw?.tried) ? raw.tried.filter((f): f is string => typeof f === 'string') : [];
    const days = Array.isArray(raw?.days) ? raw.days.filter((d): d is number => typeof d === 'number') : [];
    return { tried: [...new Set(tried)], days: [...new Set(days)] };
  } catch {
    return { tried: [], days: [] };
  }
}

/** A feature is done, on `day`. Each feature and each day is kept once. */
export function markTried(key: string, feature: string, day: number): void {
  const p = readProgress(key);
  if (p.tried.includes(feature) && p.days.includes(day)) return;
  const next: LessonProgress = {
    tried: p.tried.includes(feature) ? p.tried : [...p.tried, feature],
    days: p.days.includes(day) ? p.days : [...p.days, day],
  };
  try { storage()?.setItem(key, JSON.stringify(next)); } catch { /* storage blocked: not kept */ }
}

/** Today's lesson number: the days before (or after) today with a lesson, plus one. */
export function lessonNumber(p: LessonProgress, today: number): number {
  return p.days.filter((d) => d !== today).length + 1;
}

/** How many of these features are done. */
export function triedCount(p: LessonProgress, features: readonly string[]): number {
  return p.tried.filter((f) => features.includes(f)).length;
}

/** "Lesson 4 · You've tried 7 of 15 features" (the first: "Lesson 1 · 15 features to try"). */
export function progressLine(lesson: number, tried: number, total: number): string {
  return tried > 0
    ? `Lesson ${lesson} · You've tried ${tried} of ${total} features`
    : `Lesson ${lesson} · ${total} features to try`;
}
