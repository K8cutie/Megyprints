/* Wizard step 1 — "What is this album about?" Occasion chips plus a free-text
   box. Unskippable: the parent gates Next on isAlbumThemeReady(value). The
   answer seeds the AI quote pool, so it is asked before size, cover, or photos. */

import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { COMMON_THEMES, MAX_THEME_LENGTH, isAlbumThemeReady, isCommonTheme } from '../lib/albumTheme';

export default function AlbumThemeStep({ value, onChange, onContinue }: {
  value: string;
  onChange: (v: string) => void;
  /** Enter in the text box = Next, when the value is ready. */
  onContinue: () => void;
}) {
  // "Something else" stays open once chosen, even while the box is still empty.
  const [otherOpen, setOtherOpen] = useState(() => value !== '' && !isCommonTheme(value));
  const ready = isAlbumThemeReady(value);
  const custom = otherOpen ? value : '';

  return (
    <div className="mb-4" data-step="pick_theme">
      <p className="text-sm text-[#5A5A5A] leading-relaxed mb-3">
        Pick the occasion — Megy writes the quotes on your pages to match it. You can change it later, but not skip it.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Album occasion">
        {COMMON_THEMES.map((t) => {
          const active = !otherOpen && value === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => { setOtherOpen(false); onChange(t); }}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all active:scale-[0.98] ${
                active ? 'bg-[#F4C2A1] text-white border-[#F4C2A1] shadow-sm' : 'bg-white text-[#2D2D2D] border-[#E8E8E8] hover:border-[#F4C2A1]/60'
              }`}
            >
              {t}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={otherOpen}
          onClick={() => { setOtherOpen(true); if (isCommonTheme(value)) onChange(''); }}
          className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all active:scale-[0.98] flex items-center gap-1.5 ${
            otherOpen ? 'bg-[#F4C2A1] text-white border-[#F4C2A1] shadow-sm' : 'bg-white text-[#2D2D2D] border-[#E8E8E8] hover:border-[#F4C2A1]/60'
          }`}
        >
          <PenLine size={14} /> Something else
        </button>
      </div>
      {otherOpen && (
        <div className="mt-3">
          <label htmlFor="album-theme" className="block text-xs font-semibold text-[#2D2D2D] mb-1.5">What is it about?</label>
          <input
            id="album-theme"
            value={custom}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) { e.preventDefault(); onContinue(); } }}
            maxLength={MAX_THEME_LENGTH}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Beach trip, Debut, Reunion, Lola's 80th"
            className="w-full border border-[#E8E8E8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#F4C2A1] transition-colors"
          />
          <p className="text-[11px] text-[#9B9B9B] mt-1.5">A few words is plenty — the quotes take their cue from this.</p>
        </div>
      )}
      <p className="mt-3 text-xs font-medium" aria-live="polite">
        {ready
          ? <span className="text-[#2E7D4A]">Theme: <b>{value.trim()}</b> — tap Next.</span>
          : <span className="text-[#8B7E7A]">Choose one to continue.</span>}
      </p>
    </div>
  );
}
