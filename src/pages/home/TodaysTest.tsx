/* ══════════════════════════════════════════════════════════════════════════
   Today's lesson — the "User tutorial" screen that Home's "Start the User
   tutorial" and Step 1's offer open, in the Android app while testing
   (lib/dailyTest). The daily test, shown as a short lesson that teaches the
   app (owner, 2026-10-29: "it becomes a tutorial of sorts", "make it look
   like its a tutorial"; and "Can we call it User tutorial instead of sample
   album").

     (Megy) User tutorial                                        ✕
            Today's lesson
            Lesson 4 · You've tried 7 of 15 features   ▬▬▬▬▭▭▭▭
     (1) Your album's name goes on its front cover.
         Type today's date as your album's name
         [ Oct 29            ]   For example: Oct 29
     (2) Your cover title can use many fonts.
         TRY IT  pick Great Vibes.
         [the fonts, each in its own face]
     (3) Next: one more tip inside your album.
     [ Make my album ]

   The mechanics are #229's: one tap (or the date, typed) for each step, on a
   list already shown; a wrong pick says "Today's font is Great Vibes. Tap
   Great Vibes." ONE filled button, always tappable, kept at the bottom of the
   screen: with a step missing it says which, in the order of the steps
   ("Type today's date first." / "Pick today's font first: Great Vibes."), and
   shows that step; never a greyed dead button. Done, it keeps the test for
   the builder (requestDailyTest) and the caller opens the builder, which
   makes the album with it. The minute in the app starts here
   (lib/dailyTestRun).

   The lesson's look (step chips, the "Try it" card, the lesson count) is
   components/lesson; what is the tester's here is the date step, today's
   answer and the minute.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';
import { inkOn } from '../builder/pageColors';
import { splitBold } from '../../assistant/boldText';
import { sampleDayNumber } from '../../lib/samplePhotos';
import {
  isTodaysDate, dateExample, dateRefusedMessage, beforeTaskFor, isTodaysAnswer, dailyTestMissing, requestDailyTest, WANT_DATE,
  type TaskOption,
} from '../../lib/dailyTest';
import { startRun, addTestTime, useForegroundClock, dailyLessonProgress } from '../../lib/dailyTestRun';
import { progressLine } from '../../lib/lessonProgress';
import { LessonCard, LessonProgressLine, StepChip, TryIt } from '../../components/lesson/LessonParts';
import MegyMascot from '../../components/MegyMascot';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 5px #B85C38';

/** Bring a step into view (not in jsdom, which has no scrolling). */
function show(el: HTMLElement | null) {
  el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

/** One option, drawn the way its list shows things. */
function Option({ option, look, on, onTap }: { option: TaskOption; look: string; on: boolean; onTap: () => void }) {
  const common = { type: 'button' as const, role: 'radio', 'aria-checked': on, onClick: onTap, 'data-testid': 'todays-test-option', 'data-value': option.value };
  if (look === 'photos') {
    return (
      <button {...common} aria-label={option.label}
        className="relative aspect-square overflow-hidden rounded-xl bg-blush active:scale-[0.97] transition-transform"
        style={{ boxShadow: on ? RING : 'none' }}>
        <img src={`${import.meta.env.BASE_URL}sample-photos/${option.photo}`} alt="" className="h-full w-full object-cover" draggable={false} />
        {on && (
          <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-peach text-white shadow">
            <Check size={15} strokeWidth={3} aria-hidden="true" />
          </span>
        )}
      </button>
    );
  }
  if (look === 'swatches') {
    return (
      <button {...common}
        className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 active:scale-[0.97] transition-transform ${on ? 'border-peach bg-blush' : 'border-line bg-white'}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: option.hex, border: '1px solid rgba(0,0,0,0.15)', boxShadow: on ? RING : 'none' }}>
          {on && <Check size={16} strokeWidth={3} style={{ color: inkOn(option.hex ?? '#FFFFFF') }} aria-hidden="true" />}
        </span>
        <span className="text-[13px] font-semibold text-dark">{option.label}</span>
      </button>
    );
  }
  return (
    <button {...common}
      className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center active:scale-[0.97] transition-transform ${on ? 'border-peach bg-blush' : 'border-line bg-white'}`}>
      {on && <Check size={15} strokeWidth={3} className="shrink-0 text-peach" aria-hidden="true" />}
      <span className={look === 'fonts' ? 'text-[19px] leading-tight text-dark' : 'text-[15px] font-semibold text-dark'}
        style={option.font ? { fontFamily: option.font } : undefined}>{option.label}</span>
    </button>
  );
}

export default function TodaysTest({ onMake, onClose }: {
  /** The test is done and kept: make the album. */
  onMake: () => void;
  onClose: () => void;
}) {
  // One moment for the whole screen: the example, the task and its answer agree.
  const [now] = useState(() => new Date());
  const [task] = useState(() => beforeTaskFor(now));
  // Which lesson this is, and the features tried so far (read as it opens).
  const [progress] = useState(() => dailyLessonProgress(sampleDayNumber(now)));
  // The minute in the app starts as Today's lesson opens.
  useEffect(() => { startRun(sampleDayNumber(now)); }, [now]);
  useForegroundClock(true, addTestTime);
  const [name, setName] = useState('');
  // The refusal shows once they leave the box (not while they type).
  const [dateChecked, setDateChecked] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  const [tried, setTried] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taskRef = useRef<HTMLElement>(null);
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);

  const example = dateExample(now);
  const dateOk = isTodaysDate(name, now);
  const dateRefused = dateChecked && name.trim() !== '' && !dateOk;
  const pick = { name, answer };
  // After a tap on "Make my album": what is still missing, as they fix it.
  const missing = tried ? dailyTestMissing(pick, now) : null;
  const waitingOn = missing === WANT_DATE ? 'date' : missing ? 'task' : null;

  const tap = (value: string) => {
    if (isTodaysAnswer(task, value)) { setAnswer(value); setWrong(false); }
    else setWrong(true);
  };
  const make = () => {
    setTried(true);
    const want = dailyTestMissing(pick, now);
    if (want === WANT_DATE) { setDateChecked(true); show(inputRef.current); inputRef.current?.focus(); return; }
    if (want) { show(taskRef.current); return; }
    if (requestDailyTest(pick, now)) onMake();
  };
  const cols = task.look === 'photos' ? 'grid-cols-4' : task.look === 'swatches' ? 'grid-cols-3' : task.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return createPortal(
    <div className="fixed inset-0 z-[140] overflow-y-auto overscroll-contain bg-paper font-body" data-testid="todays-test">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="todays-test-title" aria-describedby="todays-test-subtitle" tabIndex={-1}
        className="mx-auto flex min-h-full max-w-[480px] flex-col px-4" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-start gap-3 py-2">
          <MegyMascot size={40} alt="" className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 id="todays-test-title" tabIndex={-1} data-autofocus className="font-display text-[22px] font-semibold leading-tight text-dark outline-none">
              User tutorial
            </h2>
            <p id="todays-test-subtitle" data-testid="todays-test-subtitle" className="text-[15px] font-semibold text-blush-pink">Today&apos;s lesson</p>
            <LessonProgressLine line={progressLine(progress.lesson, progress.tried, progress.total)} tried={progress.tried} total={progress.total} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="todays-test-close"
            className="-mr-2 rounded-full p-2 text-medium hover:bg-line-soft">
            <X size={22} />
          </button>
        </div>

        {/* 1. Today's date as the album's name (the tester's step). */}
        <LessonCard step={1} className="mt-2" waiting={waitingOn === 'date'} data-testid="todays-test-name-step"
          head={(
            <>
              <p className="text-[14px] leading-snug text-medium" data-testid="todays-test-name-teach">Your album&apos;s name goes on its front cover.</p>
              <label htmlFor="todays-test-name" className="mt-0.5 block text-[15px] font-semibold leading-snug text-dark">
                Type today&apos;s date as your album&apos;s name
              </label>
            </>
          )}>
          <input id="todays-test-name" ref={inputRef} data-testid="todays-test-name" value={name}
            onChange={(e) => { setName(e.target.value); setDateChecked(false); }}
            onBlur={() => setDateChecked(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
            placeholder={example} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" maxLength={40}
            aria-invalid={dateRefused || undefined} aria-describedby="todays-test-name-help"
            className={`mt-3 h-12 w-full rounded-xl border bg-white px-3 text-[17px] text-dark outline-none focus:ring-2 focus:ring-peach/40 ${
              dateRefused ? 'border-red-600' : dateOk ? 'border-success' : 'border-line'}`} />
          <div id="todays-test-name-help" aria-live="polite" className="mt-2 text-[13px] leading-snug">
            {dateRefused ? (
              <p role="alert" className="font-semibold text-red-700" data-testid="todays-test-date-refused">{dateRefusedMessage(now)}</p>
            ) : dateOk ? (
              <p className="flex items-center gap-1 font-semibold text-success" data-testid="todays-test-date-ok">
                <Check size={15} strokeWidth={3} aria-hidden="true" /> That&apos;s today&apos;s date.
              </p>
            ) : (
              <p className="text-taupe">For example: {example}</p>
            )}
          </div>
        </LessonCard>

        {/* 2. Today's tip: what the feature does, then "Try it", one tap on the list. */}
        <LessonCard step={2} className="mt-3" waiting={waitingOn === 'task'} cardRef={taskRef}
          data-testid="todays-test-task" data-task={task.id}
          head={(
            <>
              <p className="text-[15px] font-semibold leading-snug text-dark" data-testid="todays-test-task-teach">{task.teach}</p>
              <p id="todays-test-task-line" className="mt-1 text-[15px] leading-snug text-dark" data-testid="todays-test-task-line">
                <TryIt />
                {splitBold(task.line).map((run, i) => (run.bold ? <b key={i} className="text-blush-pink">{run.text}</b> : <span key={i}>{run.text}</span>))}
              </p>
            </>
          )}>
          <div role="radiogroup" aria-labelledby="todays-test-task-line" className={`mt-3 grid gap-2 ${cols}`}>
            {task.options.map((o) => (
              <Option key={o.value} option={o} look={task.look} on={!!answer && isTodaysAnswer({ ...task, answer: o.value }, answer)} onTap={() => tap(o.value)} />
            ))}
          </div>
          {wrong && task.wrong && (
            <p role="alert" className="mt-2 text-[13px] font-semibold leading-snug text-red-700" data-testid="todays-test-wrong">{task.wrong}</p>
          )}
        </LessonCard>

        {/* 3. What comes next: one more tip, inside the album. */}
        <div className="mt-3 flex items-center gap-3 px-4" data-testid="todays-test-next">
          <StepChip n={3} state="next" />
          <p className="text-[14px] leading-snug text-medium">Next: one more tip inside your album.</p>
        </div>

        {/* ONE filled button, always tappable, always in reach at the bottom.
            What is missing shows just above it, so the button never moves. */}
        <div className="min-h-4 flex-1" aria-hidden="true" />
        <div className="sticky bottom-0 -mx-4 border-t border-line-soft bg-paper px-4 pt-3"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div aria-live="polite">
            {missing && (
              <p role="alert" className="mb-2 text-center text-[14px] font-semibold text-red-700" data-testid="todays-test-missing">{missing}</p>
            )}
          </div>
          <button type="button" onClick={make} data-testid="todays-test-make"
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-peach text-[16px] font-bold text-white shadow-[0_6px_16px_rgba(184,92,56,0.3)] hover:bg-blush-pink active:scale-[0.98] transition-[transform,background-color]">
            Make my album
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
