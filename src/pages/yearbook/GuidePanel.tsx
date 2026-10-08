/* The step guide: where the adviser is, what to do, and one button to do it. */
import { Check, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { currentStep, type GuideAction, type GuideStep } from '@/yearbook/guide';

interface Props {
  steps: GuideStep[];
  onAction: (a: GuideAction) => void;
  onShowMe: (step: GuideStep) => void;
}

export default function GuidePanel({ steps, onAction, onShowMe }: Props) {
  const now = currentStep(steps);
  const doneCount = steps.filter((s) => s.done).length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold">Your guide</h2>
        <span className="text-xs text-muted-foreground">{doneCount} of {steps.length} done</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => {
          const active = now?.id === s.id;
          return (
            <li key={s.id} className={`rounded-lg border ${active ? 'border-primary/40 bg-card p-3 shadow-sm' : 'border-transparent px-3 py-1.5'}`}>
              <div className="flex items-center gap-2">
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${s.done ? 'bg-primary text-primary-foreground' : active ? 'border-2 border-primary text-primary' : 'border border-border text-muted-foreground'}`}>
                  {s.done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className={`text-sm ${active ? 'font-semibold' : s.done ? 'text-muted-foreground' : ''}`}>{s.title}{s.optional ? <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span> : null}</span>
              </div>
              {s.progress && !active ? <p className="ml-7 text-xs text-muted-foreground">{s.progress}</p> : null}
              {active ? (
                <div className="ml-7 mt-2 flex flex-col gap-2">
                  <p className="text-sm leading-snug text-foreground/80">{s.say}</p>
                  {s.progress ? <p className="text-xs font-medium text-primary">{s.progress}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onAction(s.action.do)}>{s.action.label}</Button>
                    <Button size="sm" variant="outline" onClick={() => onShowMe(s)}><MousePointerClick /> Show me</Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!now ? <p className="rounded-lg bg-secondary p-3 text-sm">Every step is done. Your print files are ready for the press.</p> : null}
    </div>
  );
}
