import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { Check } from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════
   THE LESSON'S LOOK (owner, 2026-10-29: "make it look like its a tutorial"):
   numbered step chips, a "Try it" label, lesson cards, and the lesson count.
   Plain parts with no tester logic in them: the tester's daily lesson
   (pages/home/TodaysTest) fills them with today's date step and today's
   answer; a "learn the app" tour for new customers could fill them with its
   own steps (components/lesson/CoachMark.tsx says how). Megy's terracotta
   (peach, #B85C38) and the app's own fonts.
   ══════════════════════════════════════════════════════════════════════════ */

/** A step's number in a circle: filled for the step to do now, outlined for
 *  one still to come, a check once done. */
export function StepChip({ n, state = 'now' }: { n: number; state?: 'now' | 'next' | 'done' }) {
  const look = state === 'next'
    ? 'border-2 border-peach/50 bg-white text-peach'
    : state === 'done' ? 'bg-success text-white' : 'bg-peach text-white';
  return (
    <span aria-hidden="true" data-testid="lesson-step-chip" data-step={n}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] font-bold ${look}`}>
      {state === 'done' ? <Check size={15} strokeWidth={3} /> : n}
    </span>
  );
}

/** "Try it", before what to do (followed by a space). Screen readers hear "Try it:". */
export function TryIt() {
  return (
    <>
      <span data-testid="lesson-try-it"
        className="inline-flex items-center rounded-full bg-blush px-2 py-0.5 align-[1px] text-[12px] font-bold uppercase tracking-wide text-blush-pink">
        Try it<span className="sr-only">:</span>
      </span>{' '}
    </>
  );
}

/** A lesson card: the step's chip beside its head (what it teaches, what to
 *  do), then the choices, the width of the card. `waiting` rings it red: the
 *  step the one button is waiting on. */
export function LessonCard({ step, head, children, waiting = false, cardRef, className = '', ...rest }: {
  step: number;
  head: ReactNode;
  children?: ReactNode;
  waiting?: boolean;
  cardRef?: Ref<HTMLElement>;
} & Omit<ComponentPropsWithoutRef<'section'>, 'children'>) {
  return (
    <section ref={cardRef} {...rest}
      className={`rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(0,0,0,0.06)] scroll-mt-4 transition-shadow${waiting ? ' ring-2 ring-red-600/70' : ''} ${className}`.trim()}>
      <div className="flex gap-3">
        <StepChip n={step} />
        <div className="min-w-0 flex-1">{head}</div>
      </div>
      {children}
    </section>
  );
}

/** "Lesson 4 · You've tried 7 of 15 features", small, with a thin bar. */
export function LessonProgressLine({ line, tried, total }: { line: string; tried: number; total: number }) {
  const share = total > 0 ? Math.min(1, tried / total) : 0;
  return (
    <div data-testid="lesson-progress" className="mt-0.5">
      <p data-testid="lesson-progress-line" className="text-[13px] font-semibold text-medium">{line}</p>
      <div aria-hidden="true" className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-line-soft">
        <div data-testid="lesson-progress-bar" className="h-full rounded-full bg-peach transition-[width] duration-500"
          style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}
