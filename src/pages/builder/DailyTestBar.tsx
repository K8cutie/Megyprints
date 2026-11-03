/* ══════════════════════════════════════════════════════════════════════════
   Today's lesson in the album (lib/dailyTest, lib/dailyTestRun): one slim
   lesson strip at the top of the pages and of Preview, in the Android app
   while testing, on the album Today's lesson made. Owner, 2026-10-29: the
   daily test "becomes a tutorial of sorts", "make it look like its a
   tutorial".

     (3) TRY IT  pick a new layout.                    [ Change layout ]
       + a coach mark at the tool, already open (MobileReview): Megy and a
         speech bubble, an arrow, a soft ring: "This is where you change a
         page's layout. Pick any new one." Closed, it points at the strip's
         button: "Tap Change layout to try it."
     Take a minute to look through your album: 0:23
       (the task is done, the minute isn't up: Next page and Previous work)

   It sees the task done in the album itself (dailyAlbumTask), counts the
   minute while the app is in front, and once both are done opens "You
   finished today's lesson!" by itself: Preview on the last page. Never over
   an open sheet or while they type: it waits for that to close.

   The tester's parts are here (the task of the day, the minute, opening the
   done page); the lesson's look is components/lesson (StepChip, TryIt,
   CoachMark) and what each tool is for is lib/lessonTips.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { BuilderContextValue } from './BuilderContext';
import { isNativeShell } from '../../lib/nativeShell';
import { showSamplePhotos } from '../../lib/samplePhotos';
import { ALBUM_TASK_HINTS, ALBUM_TASK_BUTTONS } from '../../lib/dailyTest';
import {
  useDailyTestRun, useForegroundClock, runFor, runComplete, remainingMs, formatCountdown, markAlbumTaskDone, markDoneShown,
} from '../../lib/dailyTestRun';
import { openDialogCount } from '../../lib/useModalDialog';
import { detectAlbumTask, coachStepsFor } from './dailyAlbumTask';
import { StepChip, TryIt } from '../../components/lesson/LessonParts';
import CoachMark from '../../components/lesson/CoachMark';

/** The strip's button: the pages screen opens the task's tool again. */
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
  // The minute: counts until "You finished today's lesson!" has opened.
  useForegroundClock(!!mine && !mine.doneShown);

  // The task, done: read from the album (the open book: Preview says so).
  useEffect(() => {
    if (!mine || mine.albumDone || !mine.task || !mine.start) return;
    const label = detectAlbumTask(mine.task, mine.start, actions.albumPages, mine.target?.page);
    if (label) markAlbumTaskDone(label);
  }, [mine, actions.albumPages]);

  // Both done: the done page, by itself, once. Checked again each second (the
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
      <>
        <div role="status" data-testid="daily-test-bar" data-task={task}
          className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-white border-b border-peach/30 font-body">
          {/* Step 3 of the lesson: 1 the name, 2 the tip before the album (Today's lesson). */}
          <StepChip n={3} />
          <p className="flex-1 min-w-0 text-[15px] leading-snug text-dark" data-testid="daily-test-hint">
            <TryIt />{ALBUM_TASK_HINTS[task]}
          </p>
          {label && (
            <button type="button" onClick={showTask} data-testid="daily-test-show" data-coach="lesson-show"
              className="shrink-0 rounded-xl border border-peach bg-white px-3 py-2 text-[13px] font-semibold text-blush-pink active:scale-[0.97] transition-transform">
              {label}
            </button>
          )}
        </div>
        {/* The bubble never sits on the strip: with a tall sheet below it, it slides onto the sheet's top edge. */}
        <CoachMark steps={coachStepsFor(task, label)} keepClear='[data-testid="daily-test-bar"]' />
      </>
    );
  }
  return (
    <div role="timer" aria-live="off" data-testid="daily-test-countdown"
      className="shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-cream border-b border-line font-body text-[14px] text-dark">
      <Clock size={16} className="shrink-0 text-peach" aria-hidden="true" />
      <span>Take a minute to look through your album: <b className="tabular-nums" data-testid="daily-test-left">{formatCountdown(remainingMs(mine))}</b></span>
    </div>
  );
}
