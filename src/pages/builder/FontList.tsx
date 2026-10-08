/* ══════════════════════════════════════════════════════════════════════════
   FontList — the font choices, each name written IN ITS OWN FONT, so you see
   what you're picking. The page text editor (MobileTextEditor) opened this
   list from day one; the cover title used a plain <select>, and Android draws
   a <select>'s list itself in the system font — every name looked the same
   (owner, 2026-10-02: "the fonts don't look like how the fonts look").
   Now both editors show this one list — and since 2026-10-08 the desktop
   text panels too (they had their own 31-font grid of "Aa" tiles), grouped
   by mood with a heading per group.

   FontSelect — a font box + this list in a pop-up, for forms (the cover).
   Portalled to <body> with fixed coordinates so a scrolling panel can't clip
   it; opens below the box, or above it when there's more room there.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { FONTS, FONT_GROUPS, fontName, isSameFont } from './fonts';

/* A row draws (and so downloads its font) only once it scrolls near view —
   74 names in their own faces would otherwise fetch every font the moment
   the list opens. The intrinsic size keeps the scrollbar honest meanwhile. */
const LAZY_ROW = { contentVisibility: 'auto', containIntrinsicSize: 'auto 46px' } as const;

export function FontList({ value, onPick }: { value: string; onPick: (family: string) => void }) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  // Open on the current font, not at the top of a 74-name list.
  useEffect(() => { selectedRef.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  return (
    <div role="listbox" aria-label="Fonts">
      {FONT_GROUPS.map((g) => (
        <div key={g.id} role="group" aria-label={g.label}>
          <div role="presentation" data-font-group={g.id}
            className="sticky top-0 z-[1] px-4 pt-2.5 pb-1 bg-white text-[11px] font-bold uppercase tracking-wider text-medium">{g.label}</div>
          {FONTS.filter((f) => f.group === g.id).map((f) => {
            const on = isSameFont(f.family, value);
            return (
              <button key={f.name} type="button" role="option" aria-selected={on} data-font={f.name}
                ref={on ? selectedRef : undefined} onClick={() => onPick(f.family)} style={LAZY_ROW}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-left ${on ? 'bg-blush' : 'active:bg-paper hover:bg-paper'}`}>
                <span className="text-[18px] text-dark truncate" style={{ fontFamily: f.family }}>{f.name}</span>
                {on && <Check size={16} className="text-blush-pink shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type Place = { left: number; width: number; maxH: number; top?: number; bottom?: number };

export function FontSelect({ value, onChange, className = '' }: {
  value: string;
  onChange: (family: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const boxRef = useRef<HTMLButtonElement>(null);

  const measure = () => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 4, edge = 8;
    const below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
    const down = below >= 240 || below >= above;
    const width = Math.min(vw - edge * 2, Math.max(r.width, 240));
    const left = Math.min(Math.max(edge, r.left), vw - width - edge);
    const maxH = Math.max(120, Math.min(288, down ? below : above));
    setPlace(down ? { left, width, maxH, top: r.bottom + gap } : { left, width, maxH, bottom: vh - r.top + gap });
  };

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', measure);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <button ref={boxRef} type="button" data-testid="font-select" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full px-3 py-2.5 rounded-xl border bg-white text-[14px] text-dark outline-none flex items-center justify-between gap-1.5 ${open ? 'border-blush-pink' : 'border-line'} ${className}`}>
        <span className="truncate" style={{ fontFamily: value }}>{fontName(value)}</span>
        <ChevronDown size={14} className={`text-light shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && place && createPortal(
        <>
          {/* tap anywhere else to close, like the page editor's list */}
          <div className="fixed inset-0 z-[130]" onClick={() => setOpen(false)} />
          <div data-testid="font-list" className="fixed z-[131] overflow-y-auto bg-white rounded-xl border border-line shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
            style={{ left: place.left, width: place.width, maxHeight: place.maxH, top: place.top, bottom: place.bottom }}>
            <FontList value={value} onPick={(f) => { onChange(f); setOpen(false); }} />
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
