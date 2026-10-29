/* ══════════════════════════════════════════════════════════════════════════
   Today's test in the album (lib/dailyTest, lib/dailyTestRun): one plain bar
   at the top of the pages and of Preview, in the Android app while testing,
   on the album Today's test made.

     Today's task: Pick a new layout for this page.      [ Change layout ]
       (the tool is already open: MobileReview; the button opens it again,
       on the right page)
     Look through your album: You're done in 0:23
       (the task is done, the minute isn't up: Next page and Previous work)

   It sees the task done in the album itself (dailyAlbumTask), counts the
   minute while the app is in front, and once both are done opens "You're
   done" by itself: Preview on the last page. Never over an open sheet or
   while they type: it waits for that to close.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import { isNativeShell } from '../../lib/nativeShell';
import { showSamplePhotos } from '../../lib/samplePhotos';
import { ALBUM_TASK_HINTS, ALBUM_TASK_BUTTONS } from '../../lib/dailyTest';
import {
  useDailyTestRun, useForegroundClock, runFor, runComplete, remainingMs, formatCountdown, markAlbumTaskDone, markDoneShown,
} from '../../lib/dailyTestRun';
import { openDialogCount } from '../../lib/useModalDialog';
import { detectAlbumTask } from './dailyAlbumTask';

/** The bar's button: the pages screen opens the task's tool again. */
export const TASK_TOOL_EVENT = 'megy-daily-task-tool';

/** Someone is typing (a text box has the keyboard). */
function typingNow(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

export default function DailyTestBar({ actions }: { actions: BuilderContextValue }) {
  const [inApp] = useState(() => showSamplePhotos(isNativeShell()));
  const run = useDailyTestRun();
  const mine = inApp ? runFor(run, actions.albumPages) : null;
  const complete = runComplete(mine);
  // The minute: counts until "You're done" has opened.
  useForegroundClock(!!mine && !mine.doneShown);

  // The task, done: read from the album (the open book: Preview says so).
  useEffect(() => {
    if (!mine || mine.albumDone || !mine.task || !mine.start) return;
    const label = detectAlbumTask(mine.task, mine.start, actions.albumPages, mine.target?.page);
    if (label) markAlbumTaskDone(label);
  }, [mine, actions.albumPages]);

  // Both done: "You're done", by itself, once. Checked again each second (the
  // minute's tick) while a sheet is open or they type.
  useEffect(() => {
    if (!mine || !complete || mine.doneShown) return;
    if (openDialogCount() > 0 || typingNow()) return;
    markDoneShown();
    const last = Math.max(0, actions.albumPages.length - 1);
    if (actions.phase === 'preview') actions.goToPage(last);
    else void actions.dispatch({ type: 'preview_album', rawMessage: 'preview album' });
  }, [mine, complete, actions]);

  if (!mine || complete) return null;
  const task = mine.task!;

  // The button: back to the task's page and its tool (the open book: Preview).
  const showTask = () => {
    if (task === 'openBook') {
      if (actions.phase !== 'preview') {
        actions.goToPage(mine.target!.page);
        void actions.dispatch({ type: 'preview_album', payload: { stay: true }, rawMessage: 'preview album' });
      }
      return;
    }
    actions.goToPage(mine.target!.page);
    if (actions.phase !== 'edit') { actions.setWizardStep('review_pages'); actions.setPhase('edit'); }
    window.dispatchEvent(new Event(TASK_TOOL_EVENT));
  };

  if (!mine.albumDone) {
    const button = ALBUM_TASK_BUTTONS[task];
    // In Preview the open book's own button glows; elsewhere, a way to it.
    const label = task === 'openBook' && actions.phase !== 'preview' ? 'Open the preview' : button;
    return (
      <div role="status" data-testid="daily-test-bar" data-task={task}
        className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-blush border-b border-peach/30 font-body">
        <Sparkles size={18} className="shrink-0 text-peach" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-[15px] leading-snug text-dark" data-testid="daily-test-hint">
          <b>Today&apos;s task:</b> {ALBUM_TASK_HINTS[task]}
        </p>
        {label && (
          <button type="button" onClick={showTask} data-testid="daily-test-show"
            className="shrink-0 rounded-xl border border-peach bg-white px-3 py-2 text-[13px] font-semibold text-blush-pink active:scale-[0.97] transition-transform">
            {label}
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="timer" aria-live="off" data-testid="daily-test-countdown"
      className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-cream border-b border-line font-body text-[14px] text-dark">
      <Clock size={16} className="shrink-0 text-peach" aria-hidden="true" />
      <span>Look through your album: You&apos;re done in <b className="tabular-nums" data-testid="daily-test-left">{formatCountdown(remainingMs(mine))}</b></span>
    </div>
  );
}
