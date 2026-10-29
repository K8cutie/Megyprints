/* ══════════════════════════════════════════════════════════════════════════
   Today's test — the short screen that Home's "Make today's sample album"
   and Step 1's "Make a sample album" open, in the Android app while testing
   (lib/dailyTest):

     Today's test                                              ✕
     1  Type today's date as your album's name
        [ Oct 29            ]   For example: Oct 29
     2  Today's task, one of 10 (by the day), e.g.
        For today, pick the font Dancing Script for your album's title.
        [the fonts, each in its own face]
     [ Make my album ]

   One tap (or the date, typed) for each step, on a list already shown; a
   wrong pick says "Today's font is Dancing Script. Tap Dancing Script." ONE
   filled button, always tappable, kept at the bottom of the screen: with a
   step missing it says which, in the order of the steps ("Type today's date
   first." / "Pick today's font first: Dancing Script."), and shows that
   step; never a greyed dead button. Done, it keeps the test for the builder
   (requestDailyTest) and the caller opens the builder, which makes the album
   with it. The minute in the app starts here (lib/dailyTestRun).
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
import { startRun, addTestTime, useForegroundClock } from '../../lib/dailyTestRun';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 5px #B85C38';
const CARD = 'rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)] scroll-mt-4 transition-shadow';
// The step "Make my album" is waiting on: a red ring, so it is easy to find.
const WAITING = ' ring-2 ring-red-600/70';

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-peach text-[13px] font-bold text-white">{n}</span>
  );
}

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
  // The minute in the app starts as Today's test opens.
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="todays-test-title" tabIndex={-1}
        className="mx-auto flex min-h-full max-w-[480px] flex-col px-4" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <div className="flex items-center justify-between py-2">
          <h2 id="todays-test-title" tabIndex={-1} data-autofocus className="font-display text-[22px] font-semibold text-dark outline-none">
            Today&apos;s test
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" data-testid="todays-test-close"
            className="-mr-2 rounded-full p-2 text-medium hover:bg-line-soft">
            <X size={22} />
          </button>
        </div>

        {/* 1. Today's date as the album's name. */}
        <section className={`mt-2 ${CARD}${waitingOn === 'date' ? WAITING : ''}`} data-testid="todays-test-name-step">
          <label htmlFor="todays-test-name" className="flex gap-2 text-[15px] font-semibold leading-snug text-dark">
            <StepNumber n={1} /> Type today&apos;s date as your album&apos;s name
          </label>
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
        </section>

        {/* 2. Today's task: one tap on the list. */}
        <section ref={taskRef} className={`mt-3 ${CARD}${waitingOn === 'task' ? WAITING : ''}`} data-testid="todays-test-task" data-task={task.id}>
          <h3 id="todays-test-task-line" className="flex gap-2 font-body text-[15px] font-semibold leading-snug text-dark" data-testid="todays-test-task-line">
            <StepNumber n={2} />{' '}
            <span>{splitBold(task.line).map((run, i) => (run.bold ? <b key={i} className="text-peach">{run.text}</b> : <span key={i}>{run.text}</span>))}</span>
          </h3>
          {task.hint && <p className="mt-1 pl-8 text-[14px] leading-snug text-medium" data-testid="todays-test-task-hint">{task.hint}</p>}
          <div role="radiogroup" aria-labelledby="todays-test-task-line" className={`mt-3 grid gap-2 ${cols}`}>
            {task.options.map((o) => (
              <Option key={o.value} option={o} look={task.look} on={!!answer && isTodaysAnswer({ ...task, answer: o.value }, answer)} onTap={() => tap(o.value)} />
            ))}
          </div>
          {wrong && task.wrong && (
            <p role="alert" className="mt-2 text-[13px] font-semibold leading-snug text-red-700" data-testid="todays-test-wrong">{task.wrong}</p>
          )}
        </section>

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
