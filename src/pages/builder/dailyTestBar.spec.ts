// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   A MINUTE IN THE APP (owner, 2026-10-29: "Also let them spend a minute on
   the app"), and today's task in the album. "You're done" opens only when
   the task in the album is done AND the app has been in front for 60
   seconds since Today's test opened. Time in the background doesn't count;
   the count is kept with the album's test, so a reload or leaving and
   coming back carries on, never from zero and never skipped. Before that:
   "Look through your album: You're done in 0:23". Android app only, while
   testing.

   THE DAILY LESSON (owner, the same day: "make it look like its a
   tutorial"): the bar is a lesson strip, step 3, "Try it: pick a new layout
   for this page.", with a coach mark at the tool; the countdown says "Take a
   minute to look through your album: 0:48".
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ native: true, testing: true, vis: 'visible' as DocumentVisibilityState }));
vi.mock('../../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../../lib/testingPhase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, get TESTING_PHASE() { return h.testing; } };
});

import DailyTestBar, { TASK_TOOL_EVENT } from './DailyTestBar';
import {
  RUN_KEY, MIN_FOREGROUND_MS, MAX_TICK_MS, readRun, readTestClock, startRun, addTestTime, attachRun, addRunTime, runFor, runComplete, remainingMs, formatCountdown,
  type DailyTestRun,
} from '../../lib/dailyTestRun';
import { snapPages } from './dailyAlbumTask';
import type { DailyTestRequest } from '../../lib/dailyTest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h.vis });

const MADE = new Date(2026, 9, 29, 15, 22).getTime();
const TEST: DailyTestRequest = { day: 20755, name: 'Oct 29', before: 'titleFont', answer: '"Caveat", cursive', album: 'layout' };
type Pg = { id: string; templateId: string; slotFills: number[]; textElements: never[]; madeAt: number };
const pagesOf = (over: (i: number) => Partial<Pg> = () => ({})): Pg[] =>
  Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, templateId: 't88-solo-square', slotFills: [i], textElements: [], madeAt: MADE, ...over(i) }));

let host: HTMLDivElement;
let root: Root;
let actions: { albumPages: Pg[]; phase: string; goToPage: ReturnType<typeof vi.fn>; dispatch: ReturnType<typeof vi.fn>; setPhase: ReturnType<typeof vi.fn>; setWizardStep: ReturnType<typeof vi.fn> };
const $ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const render = async () => { await act(async () => { root.render(createElement(DailyTestBar, { actions: { ...actions } as never })); }); };
const seconds = async (n: number) => { for (let i = 0; i < n; i++) await act(async () => { vi.advanceTimersByTime(1000); }); };
const run = () => readRun() as DailyTestRun;
const previews = () => actions.dispatch.mock.calls.filter(([i]) => (i as { type: string }).type === 'preview_album').length;
/** The album Today's test made, its test kept with it. */
const made = (over: Partial<DailyTestRun> = {}, task: DailyTestRun['task'] = 'layout') => {
  attachRun(TEST, MADE, task!, { page: 4, slot: task === 'layout' ? null : 0 }, snapPages(pagesOf()));
  localStorage.setItem(RUN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(RUN_KEY)!), ...over }));
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'performance', 'Date'] });
  h.native = true; h.testing = true; h.vis = 'visible';
  localStorage.clear();
  actions = { albumPages: pagesOf(), phase: 'edit', goToPage: vi.fn(), dispatch: vi.fn(async () => ({ success: true })), setPhase: vi.fn(), setWizardStep: vi.fn() };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.useRealTimers(); });

describe('the album\'s test state', () => {
  it('Today\'s test opening starts the minute from zero; the album made from it carries it on (the same day)', () => {
    startRun(TEST.day);
    addTestTime(1000); addTestTime(1000);
    expect(readTestClock()).toEqual({ day: TEST.day, fgMs: 2000 });
    attachRun(TEST, MADE, 'layout', { page: 4, slot: null }, []);
    expect(run()).toMatchObject({ day: TEST.day, fgMs: 2000, madeAt: MADE, task: 'layout', test: TEST });
    expect(readTestClock()).toBeNull();
    // A minute kept from another day: this album's starts from zero.
    startRun(TEST.day - 1);
    attachRun(TEST, MADE, 'layout', { page: 4, slot: null }, []);
    expect(run().fgMs).toBe(0);
  });

  it('opening Today\'s test again (and closing it) leaves the album an earlier test made as it was', () => {
    made({ albumDone: 'new layout on page 5', fgMs: 61_000, doneShown: true });
    const before = localStorage.getItem(RUN_KEY);
    startRun(TEST.day);
    addTestTime(1000);
    expect(localStorage.getItem(RUN_KEY)).toBe(before);
    expect(runComplete(run())).toBe(true);
  });

  it('one tick never adds more than MAX_TICK_MS (a phone asleep between ticks adds nothing more)', () => {
    made({ fgMs: 0 });
    addRunTime(5 * 60_000);
    expect(run().fgMs).toBe(MAX_TICK_MS);
    addRunTime(-50);
    expect(run().fgMs).toBe(MAX_TICK_MS);
    startRun(TEST.day);
    addTestTime(5 * 60_000);
    expect(readTestClock()!.fgMs).toBe(MAX_TICK_MS);
  });

  it('this album\'s only (its pages carry the time it was made); done = the task AND the minute', () => {
    made();
    expect(runFor(readRun(), pagesOf())).not.toBeNull();
    expect(runFor(readRun(), pagesOf(() => ({ madeAt: MADE + 1 })))).toBeNull();
    expect(runComplete(run())).toBe(false);
    made({ albumDone: 'new layout on page 5', fgMs: MIN_FOREGROUND_MS - 1 });
    expect(runComplete(run())).toBe(false);
    made({ albumDone: 'new layout on page 5', fgMs: MIN_FOREGROUND_MS });
    expect(runComplete(run())).toBe(true);
    made({ fgMs: MIN_FOREGROUND_MS * 2 });
    expect(runComplete(run())).toBe(false); // the minute, but not the task
  });

  it('the countdown in minutes and seconds, rounded up', () => {
    expect(formatCountdown(23_000)).toBe('0:23');
    expect(formatCountdown(22_100)).toBe('0:23');
    expect(formatCountdown(60_000)).toBe('1:00');
    expect(formatCountdown(0)).toBe('0:00');
    expect(remainingMs({ day: 1, fgMs: 70_000 })).toBe(0);
  });
});

describe('the bar at the top of the album', () => {
  it('today\'s task, in plain words, with a way back to its tool', async () => {
    made({}, 'caption');
    actions.phase = 'preview';
    await render();
    expect(text($('daily-test-hint'))).toBe('Try it: type any word.');
    expect(text($('lesson-try-it'))).toBe('Try it:');
    // Step 3 of the lesson (1 the name, 2 the tip before the album).
    expect($('daily-test-bar')!.querySelector('[data-testid="lesson-step-chip"]')!.textContent).toBe('3');
    expect(text($('daily-test-show'))).toBe('Type here');
    expect($('daily-test-show')!.className).not.toContain('bg-peach'); // not a second filled button
    const asked = vi.fn();
    window.addEventListener(TASK_TOOL_EVENT, asked);
    await act(async () => { $('daily-test-show')!.click(); });
    window.removeEventListener(TASK_TOOL_EVENT, asked);
    expect(actions.goToPage).toHaveBeenCalledWith(4);
    expect(actions.setWizardStep).toHaveBeenCalledWith('review_pages');
    expect(actions.setPhase).toHaveBeenCalledWith('edit');
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('the open book: in Preview its own button glows (none here); elsewhere, the way to Preview', async () => {
    made({}, 'openBook');
    actions.phase = 'preview';
    await render();
    expect(text($('daily-test-hint'))).toBe('Try it: see the open book.');
    expect($('daily-test-show')).toBeNull();
    actions.phase = 'edit';
    await render();
    expect(text($('daily-test-show'))).toBe('Open the preview');
    await act(async () => { $('daily-test-show')!.click(); });
    expect(actions.dispatch).toHaveBeenCalledWith({ type: 'preview_album', payload: { stay: true }, rawMessage: 'preview album' });
  });

  it('sees the task done in the album, then counts down; "You\'re done" is held until 60 s in front', async () => {
    made({ fgMs: 12_000 });
    await render();
    expect($('daily-test-bar')).not.toBeNull();
    // The new layout on page 5.
    actions.albumPages = pagesOf((i) => (i === 4 ? { templateId: 't88-other' } : {}));
    await render();
    expect(run().albumDone).toBe('new layout on page 5');
    expect($('daily-test-bar')).toBeNull();
    expect(text($('daily-test-countdown'))).toBe('Take a minute to look through your album: 0:48');
    await seconds(30);
    expect(text($('daily-test-left'))).toBe('0:18');
    expect(previews()).toBe(0);
    await seconds(17);
    expect(previews()).toBe(0);
    await seconds(2);
    // 60 s: "You're done" opens by itself, once.
    expect(previews()).toBe(1);
    expect(run().doneShown).toBe(true);
    expect($('daily-test-countdown')).toBeNull();
    await seconds(5);
    expect(previews()).toBe(1);
  });

  it('time in the background doesn\'t count', async () => {
    made({ albumDone: 'new layout on page 5', fgMs: 50_000 });
    await render();
    h.vis = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await seconds(300);
    expect(run().fgMs).toBe(50_000);
    expect(previews()).toBe(0);
    // Back in front: from then on.
    h.vis = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await seconds(9);
    expect(run().fgMs).toBeLessThan(MIN_FOREGROUND_MS);
    expect(previews()).toBe(0);
    await seconds(2);
    expect(previews()).toBe(1);
  });

  it('a reload, or leaving the album and coming back, carries on: never from zero, never skipped', async () => {
    made({ albumDone: 'new layout on page 5', fgMs: 38_000 });
    await render();
    expect(text($('daily-test-left'))).toBe('0:22');
    await seconds(4);
    expect(text($('daily-test-left'))).toBe('0:18');
    // Away from the album for five minutes: nothing counts.
    await act(async () => { root.unmount(); });
    await act(async () => { vi.advanceTimersByTime(5 * 60_000); });
    root = createRoot(host);
    await render();
    expect(text($('daily-test-left'))).toBe('0:18');
    expect(previews()).toBe(0);
  });

  it('never over an open sheet or while they type: it waits, then opens', async () => {
    made({ albumDone: 'words on page 7', fgMs: 59_000 });
    const box = document.createElement('textarea');
    document.body.appendChild(box);
    box.focus();
    await render();
    await seconds(5);
    expect(previews()).toBe(0);
    box.blur();
    box.remove();
    await seconds(1);
    expect(previews()).toBe(1);
  });

  it('in Preview: it turns to the last page', async () => {
    made({ albumDone: 'open book view', fgMs: 59_500 });
    actions.phase = 'preview';
    await render();
    await seconds(1);
    expect(actions.goToPage).toHaveBeenCalledWith(39);
    expect(previews()).toBe(0);
  });

  it('the coach mark: on the tool while it is open; closed, on the strip\'s button; gone once the task is done', async () => {
    made({ fgMs: 12_000 }, 'layout');
    const tool = document.createElement('div');
    tool.setAttribute('data-coach', 'layout-picker'); // the layout picker, open (lessonCoachMark.spec: the real one)
    document.body.appendChild(tool);
    await render();
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="layout-picker"]');
    expect(text($('coach-mark-text'))).toBe("This is where you change a page's layout. Pick any new one.");
    expect([...$('coach-mark-text')!.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['Pick any new one.']);
    // Closed: not on the button at once (a tool on its way in never flashes the button first)...
    tool.remove();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect($('coach-mark')).toBeNull();
    // ...then on the strip's button that opens it again.
    await act(async () => { vi.advanceTimersByTime(600); });
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="lesson-show"]');
    expect(document.querySelector('[data-coach="lesson-show"]')).toBe($('daily-test-show'));
    expect(text($('coach-mark-text'))).toBe('Tap Change layout to try it.');
    // Open again: back on the tool, at once.
    document.body.appendChild(tool);
    await act(async () => { vi.advanceTimersByTime(10); });
    expect($('coach-mark')!.dataset.coachTarget).toBe('[data-coach="layout-picker"]');
    // The new layout: the task is done, the coach mark is gone (the countdown).
    actions.albumPages = pagesOf((i) => (i === 4 ? { templateId: 't88-other' } : {}));
    await render();
    expect($('coach-mark')).toBeNull();
    expect($('daily-test-countdown')).not.toBeNull();
    tool.remove();
  });

  it('done and shown: no bar', async () => {
    made({ albumDone: 'new layout on page 5', fgMs: 61_000, doneShown: true });
    await render();
    expect(host.innerHTML).toBe('');
  });

  it('the website, TESTING_PHASE off, or another album: nothing, and no counting', async () => {
    for (const [native, testing] of [[false, true], [true, false]] as const) {
      h.native = native; h.testing = testing;
      made({ fgMs: 1000 });
      await act(async () => { root.unmount(); });
      root = createRoot(host);
      await render();
      expect(host.innerHTML).toBe('');
      await seconds(3);
      expect(run().fgMs).toBe(1000);
    }
    h.native = true; h.testing = true;
    made({ fgMs: 1000 });
    actions.albumPages = pagesOf(() => ({ madeAt: MADE + 5 }));
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    await render();
    expect(host.innerHTML).toBe('');
  });
});
