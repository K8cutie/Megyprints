/* ══════════════════════════════════════════════════════════════════════════
   Today's test — the short screen Home's "Make today's sample album" opens,
   in the Android app while testing (lib/dailyTest):

     Today's test                                              ✕
     1  Type today's date as your album's name
        [ Oct 29            ]   For example: Oct 29
     2  Today's task
        Choose your cover: 12 of today's photos         (even days)
        For today, select Red for your album background  (odd days)
     [ Make my album ]

   ONE filled button, always tappable: with a step missing it says which
   ("Type today's date first."), never a greyed dead button. Done, it keeps
   the test for the builder (requestDailyTest) and Home opens the builder,
   which makes the album and opens it on "You're done".
   ══════════════════════════════════════════════════════════════════════════ */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X } from 'lucide-react';
import { useModalDialog } from '../../lib/useModalDialog';
import { PAGE_COLORS, inkOn } from '../builder/pageColors';
import { sameColor } from '../builder/textColors';
import {
  isTodaysDate, dateExample, dateRefusedMessage, todaysTask, todaysColour, wrongColourMessage,
  coverChoices, dailyTestMissing, requestDailyTest,
} from '../../lib/dailyTest';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 5px #B85C38';

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-peach text-[13px] font-bold text-white">{n}</span>
  );
}

export default function TodaysTest({ onMake, onClose }: {
  /** The test is done and kept: make the album. */
  onMake: () => void;
  onClose: () => void;
}) {
  // One moment for the whole screen: the example, the task and the check agree.
  const [now] = useState(() => new Date());
  const task = todaysTask(now);
  const colour = todaysColour(now);
  const [covers] = useState(() => coverChoices(now));
  const [name, setName] = useState('');
  // The refusal shows once they leave the box (not while they type).
  const [dateChecked, setDateChecked] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [colourWrong, setColourWrong] = useState(false);
  const [tried, setTried] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useModalDialog<HTMLDivElement>(true, onClose);

  const example = dateExample(now);
  const dateOk = isTodaysDate(name, now);
  const dateRefused = dateChecked && name.trim() !== '' && !dateOk;
  const pick = { name, cover, colour: picked };
  // After a tap on "Make my album": what is still missing, as they fix it.
  const missing = tried ? dailyTestMissing(pick, now) : null;

  const tapColour = (hex: string) => {
    if (sameColor(hex, colour.hex)) { setPicked(hex); setColourWrong(false); }
    else setColourWrong(true);
  };
  const make = () => {
    setTried(true);
    if (dailyTestMissing(pick, now)) {
      if (!dateOk) { setDateChecked(true); inputRef.current?.focus(); }
      return;
    }
    if (requestDailyTest(pick, now)) onMake();
  };

  return createPortal(
    <div className="fixed inset-0 z-[140] overflow-y-auto overscroll-contain bg-paper font-body" data-testid="todays-test">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="todays-test-title" tabIndex={-1}
        className="mx-auto min-h-full max-w-[480px] px-4 pb-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
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
        <section className="mt-2 rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
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

        {/* 2. Today's task: the cover on even days, today's colour on odd days. */}
        <section className="mt-3 rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)]" data-testid="todays-test-task" data-task={task}>
          <h3 className="flex gap-2 font-body text-[15px] font-semibold leading-snug text-dark"><StepNumber n={2} /> Today&apos;s task</h3>
          {task === 'cover' ? (
            <>
              <p className="mt-2 text-[15px] leading-snug text-dark" id="todays-test-task-line" data-testid="todays-test-task-line">
                <b>Choose your cover.</b> Tap the photo you want on the front of your album.
              </p>
              <div role="radiogroup" aria-labelledby="todays-test-task-line" className="mt-3 grid grid-cols-4 gap-2">
                {covers.map((photo, i) => {
                  const on = cover === photo;
                  return (
                    <button key={photo} type="button" role="radio" aria-checked={on} aria-label={`Photo ${i + 1}`}
                      onClick={() => setCover(photo)} data-testid="todays-test-cover" data-photo={photo}
                      className="relative aspect-square overflow-hidden rounded-xl bg-blush active:scale-[0.97] transition-transform"
                      style={{ boxShadow: on ? RING : 'none' }}>
                      <img src={`${import.meta.env.BASE_URL}sample-photos/${photo}`} alt="" className="h-full w-full object-cover" draggable={false} />
                      {on && (
                        <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-peach text-white shadow">
                          <Check size={15} strokeWidth={3} aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-[15px] leading-snug text-dark" id="todays-test-task-line" data-testid="todays-test-task-line">
                {/* colourTaskLine, with the colour in bold. */}
                For today, select <b>{colour.name}</b> for your album background.
              </p>
              <div role="radiogroup" aria-labelledby="todays-test-task-line" className="mt-3 grid grid-cols-3 gap-2">
                {PAGE_COLORS.map((c) => {
                  const on = !!picked && sameColor(picked, c.hex);
                  return (
                    <button key={c.hex} type="button" role="radio" aria-checked={on} onClick={() => tapColour(c.hex)}
                      data-testid="todays-test-colour" data-colour={c.name}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 active:scale-[0.97] transition-transform ${
                        on ? 'border-peach bg-blush' : 'border-line bg-white'}`}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ background: c.hex, border: '1px solid rgba(0,0,0,0.15)', boxShadow: on ? RING : 'none' }}>
                        {on && <Check size={16} strokeWidth={3} style={{ color: inkOn(c.hex) }} aria-hidden="true" />}
                      </span>
                      <span className="text-[13px] font-semibold text-dark">{c.name}</span>
                    </button>
                  );
                })}
              </div>
              {colourWrong && (
                <p role="alert" className="mt-2 text-[13px] font-semibold leading-snug text-red-700" data-testid="todays-test-colour-wrong">
                  {wrongColourMessage(colour)}
                </p>
              )}
            </>
          )}
        </section>

        {/* 3. ONE filled button, always tappable. */}
        <button type="button" onClick={make} data-testid="todays-test-make"
          className="mt-4 flex h-[52px] w-full items-center justify-center rounded-[14px] bg-peach text-[16px] font-bold text-white shadow-[0_6px_16px_rgba(184,92,56,0.3)] hover:bg-blush-pink active:scale-[0.98] transition-[transform,background-color]">
          Make my album
        </button>
        <div aria-live="polite">
          {missing && (
            <p role="alert" className="mt-2 text-center text-[14px] font-semibold text-red-700" data-testid="todays-test-missing">{missing}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
