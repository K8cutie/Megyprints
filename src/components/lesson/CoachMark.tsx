import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MegyMascot from '../MegyMascot';
import { splitBold } from '../../assistant/boldText';

/* ══════════════════════════════════════════════════════════════════════════
   A COACH MARK (owner, 2026-10-29: the daily test should "look like its a
   tutorial"): a small speech bubble, with Megy beside the words and an arrow
   pointing at a control on screen, and a soft terracotta ring around it.

     steps: where to point, in order: the first one on screen wins. So a tool
     that is open is pointed at; once it is closed, the next one (say, the
     button that opens it again) is, after a short wait, so a tool still on
     its way in never flashes the second one first.

   It never covers a tap: nothing in it takes taps, they go to the app under
   it. It follows its control as it moves (a sheet sliding up, the keyboard
   opening), and it is gone when no step's control is on screen. `keepClear`:
   things above the control it must not sit on (the lesson strip): with no
   room between them, the bubble slides down over the control's top edge.

   REUSE FOR CUSTOMERS LATER (not on now). Everything that makes the daily
   lesson a TESTER's lives outside this folder: the date check, today's answer,
   the minute, the proof line on the done page and the "For Testing purposes"
   stamp are in lib/dailyTest, lib/dailyTestRun, pages/builder/DailyTestBar
   and the sample album's notes. These parts know none of that: LessonCard,
   StepChip, TryIt and LessonProgressLine (components/lesson/LessonParts)
   draw a lesson, CoachMark points at a control, lib/lessonTips says what each
   feature does and which control (data-coach="…") shows it, and
   lib/lessonProgress counts features tried under any key. A "learn the app"
   tour for new customers would be its own small component that, on a
   customer's first album (and only behind its own switch), shows one
   ALBUM_TIPS entry at a time as <CoachMark steps={[{ target:
   coachSelector(tip.control), text: coachText(tip) }]} /> once that tool is
   open, offers a "Got it" or "Skip the tour" way out (the tester's lesson has
   none, on purpose), and keeps its progress under its own key with
   lessonProgress. No date, no minute, no stamp, no proof line.
   ══════════════════════════════════════════════════════════════════════════ */

export interface CoachStep {
  /** A CSS selector for the control, e.g. coachSelector('layout-picker'). */
  target: string;
  /** What the bubble says; **bold** for what to do. */
  text: string;
}

/** How long the first step's control must be gone before a later step shows. */
export const COACH_FALLBACK_MS = 700;
/** How often it looks again where its control is (it also looks on every change to the page). */
const LOOK_MS = 150;

interface Spot {
  step: number; left: number; top: number; width: number; height: number; vw: number; vh: number;
  /** The lowest bottom edge of the things to keep clear that are above the control (0: none). */
  clear: number;
}

const same = (a: Spot | null, b: Spot | null) =>
  a === b || (!!a && !!b && a.step === b.step && ['left', 'top', 'width', 'height', 'vw', 'vh', 'clear'].every((k) => Math.abs(a[k as keyof Spot] - b[k as keyof Spot]) < 0.5));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Where the first control on screen is, or null. */
function useSpot(steps: CoachStep[], keepClear: string | undefined): Spot | null {
  const key = steps.map((s) => s.target).join('\n');
  const [spot, setSpot] = useState<Spot | null>(null);
  useEffect(() => {
    const targets = key.split('\n');
    // Since when the first step's control has been off screen (from the start: none yet).
    let firstGoneSince: number | null = Date.now();
    let last: Spot | null = null;
    let queued = false;
    const spotOf = (step: number, el: Element): Spot => {
      const r = el.getBoundingClientRect();
      let clear = 0;
      if (keepClear) {
        document.querySelectorAll(keepClear).forEach((k) => {
          const b = k.getBoundingClientRect();
          if (b.bottom <= r.top + 2) clear = Math.max(clear, b.bottom);
        });
      }
      return { step, left: r.left, top: r.top, width: r.width, height: r.height, vw: window.innerWidth, vh: window.innerHeight, clear };
    };
    const look = () => {
      queued = false;
      let next: Spot | null = null;
      const first = document.querySelector(targets[0]);
      if (first) {
        firstGoneSince = null;
        next = spotOf(0, first);
      } else {
        const now = Date.now();
        if (firstGoneSince == null) firstGoneSince = now;
        if (now - firstGoneSince >= COACH_FALLBACK_MS) {
          for (let i = 1; i < targets.length && !next; i++) {
            const el = document.querySelector(targets[i]);
            if (el) next = spotOf(i, el);
          }
        }
      }
      if (!same(last, next)) { last = next; setSpot(next); }
    };
    const soon = () => { if (!queued) { queued = true; window.setTimeout(look, 0); } };
    look();
    const id = window.setInterval(look, LOOK_MS);
    // A control coming or going: look at once (moving ones: the interval).
    const watch = typeof MutationObserver === 'function' ? new MutationObserver(soon) : null;
    watch?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-coach'] });
    window.addEventListener('resize', soon);
    window.addEventListener('scroll', soon, true);
    return () => {
      window.clearInterval(id);
      watch?.disconnect();
      window.removeEventListener('resize', soon);
      window.removeEventListener('scroll', soon, true);
    };
  }, [key, keepClear]);
  return spot;
}

export default function CoachMark({ steps, mascot = true, keepClear, testId = 'coach-mark' }: {
  steps: CoachStep[];
  /** Megy beside the words. */
  mascot?: boolean;
  /** A CSS selector for things above the control the bubble must not cover. */
  keepClear?: string;
  testId?: string;
}) {
  const spot = useSpot(steps, keepClear);
  // The bubble's height, measured once drawn (to put it right above the control).
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(72);
  // Its height changes with its words and the screen's width.
  const words = spot ? steps[spot.step]?.text : null;
  const screenW = spot?.vw;
  useLayoutEffect(() => {
    const h = bubbleRef.current?.offsetHeight;
    if (h != null && Math.abs(h - bubbleH) > 0.5) setBubbleH(h);
  }, [bubbleH, words, screenW]);
  if (!spot) return null;
  const step = steps[spot.step];
  const { vw, vh } = spot;
  // The bubble goes on the side of the control with more room; a control that
  // fills the screen gets it inside, near its top.
  const topLimit = Math.max(8, spot.clear + 6);
  const roomAbove = spot.top - topLimit;
  const roomBelow = vh - (spot.top + spot.height);
  const above = roomAbove >= roomBelow;
  const inside = Math.max(roomAbove, roomBelow) < 48;
  const width = Math.max(0, Math.min(340, vw - 32));
  const centre = spot.left + spot.width / 2;
  const left = clamp(centre - width / 2, 16, Math.max(16, vw - 16 - width));
  const arrowX = clamp(centre - left, 24, Math.max(24, width - 24));
  const GAP = 14;
  const top = inside
    ? Math.max(topLimit, spot.top + 12)
    : above ? Math.max(topLimit, spot.top - GAP - bubbleH) : spot.top + spot.height + GAP;
  // The ring, a little outside the control, kept on screen.
  const ringLeft = Math.max(2, spot.left - 4);
  const ringTop = Math.max(2, spot.top - 4);
  const ringRight = Math.min(vw - 2, spot.left + spot.width + 4);
  const ringBottom = Math.min(vh - 2, spot.top + spot.height + 4);

  return createPortal(
    <div data-testid={testId} data-coach-target={step.target} data-coach-step={spot.step}
      className="pointer-events-none fixed inset-0 z-[130] font-body">
      <div data-testid={`${testId}-ring`} aria-hidden="true"
        className="coach-ring fixed rounded-2xl"
        style={{
          left: ringLeft, top: ringTop, width: Math.max(0, ringRight - ringLeft), height: Math.max(0, ringBottom - ringTop),
          boxShadow: '0 0 0 3px rgba(184, 92, 56, 0.85), 0 0 0 9px rgba(184, 92, 56, 0.2)',
        }} />
      <div ref={bubbleRef} data-testid={`${testId}-bubble`} role="status" aria-live="polite"
        className="fixed flex items-center gap-2.5 rounded-2xl border-2 border-peach bg-white px-3 py-2.5 shadow-[0_10px_30px_rgba(42,33,28,0.22)] transition-[top,left] duration-200"
        style={{ left, width, top }}>
        {mascot && <MegyMascot size={40} alt="" className="shrink-0" />}
        <p data-testid={`${testId}-text`} className="min-w-0 flex-1 text-[14px] leading-snug text-dark">
          {splitBold(step.text).map((run, i) => (run.bold ? <b key={i} className="text-blush-pink">{run.text}</b> : <span key={i}>{run.text}</span>))}
        </p>
        {!inside && (
          <span aria-hidden="true" data-testid={`${testId}-arrow`} data-side={above ? 'below' : 'above'}
            className={`absolute h-3.5 w-3.5 rotate-45 border-peach bg-white ${above ? '-bottom-[9px] border-b-2 border-r-2' : '-top-[9px] border-l-2 border-t-2'}`}
            style={{ left: arrowX - 7 }} />
        )}
      </div>
    </div>,
    document.body,
  );
}
