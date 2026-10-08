/* "Show me": a ring around the real control on screen, with a short note. */
import { useEffect, useState } from 'react';

export interface SpotlightTarget { name: string; note: string; key: number }

export default function Spotlight({ target, onDone }: { target: SpotlightTarget | null; onDone: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-guide="${target.name}"]`);
    if (!el) { setRect(null); onDone(); return; }
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const measure = () => setRect(el.getBoundingClientRect());
    const t0 = window.setTimeout(measure, 120);
    const t1 = window.setTimeout(onDone, 4500);
    window.addEventListener('resize', measure);
    return () => { window.clearTimeout(t0); window.clearTimeout(t1); window.removeEventListener('resize', measure); };
  }, [target, onDone]);

  if (!target || !rect) return null;
  const below = rect.bottom + 70 < window.innerHeight;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      <div
        className="absolute rounded-lg ring-4 ring-primary ring-offset-2 ring-offset-background transition-all"
        style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <div
        className="absolute max-w-[260px] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg"
        style={{ left: Math.max(12, Math.min(rect.left, window.innerWidth - 272)), top: below ? rect.bottom + 12 : rect.top - 56 }}
      >
        {target.note}
      </div>
    </div>
  );
}
