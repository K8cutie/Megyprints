/* Wizard step 1 — the album's NAME, then "What is this album about?" (occasion
   chips plus a free-text box). Unskippable: the parent gates Next on
   isStepOneReady(name, value). The name is the album's saved title (Your
   Projects, the resume prompt); the occasion seeds the AI quote pool — so both
   are asked before size, cover, or photos.
   A tap on Next before both are in (`nudge` counts the taps) flags what is
   missing and puts the cursor there: a greyed Next that ate the tap left an
   eager tester stuck (2026-10-04). */

import { useEffect, useRef, useState } from 'react';
import { PenLine } from 'lucide-react';
import { COMMON_THEMES, MAX_THEME_LENGTH, isAlbumThemeReady, isCommonTheme } from '../lib/albumTheme';
import { MAX_ALBUM_NAME_LENGTH, cleanAlbumName, isAlbumNameReady } from '../lib/albumName';

export default function AlbumThemeStep({ value, onChange, onContinue, name, onNameChange, nudge = 0 }: {
  value: string;
  onChange: (v: string) => void;
  /** Enter in either text box = Next, when the step is answered. */
  onContinue: () => void;
  /** The album's name. */
  name: string;
  onNameChange: (v: string) => void;
  /** How many times Next was tapped before the step was answered. */
  nudge?: number;
}) {
  // "Something else" stays open once chosen, even while the box is still empty.
  const [otherOpen, setOtherOpen] = useState(() => value !== '' && !isCommonTheme(value));
  const themeReady = isAlbumThemeReady(value);
  const nameReady = isAlbumNameReady(name);
  const ready = themeReady && nameReady;
  const custom = otherOpen ? value : '';
  const nudged = nudge > 0 && !ready;
  const nameRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Every tap points again: the name box first, else the first occasion.
  useEffect(() => {
    if (nudge === 0 || ready) return;
    const target = !nameReady ? nameRef.current : chipsRef.current?.querySelector<HTMLElement>('[role="radio"], input');
    target?.focus();
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    // Only a new tap re-points; typing must not pull the cursor away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudge]);
  const enterToContinue = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && ready) { e.preventDefault(); onContinue(); }
  };

  return (
    <div className="mb-4" data-step="pick_theme">
      <label htmlFor="album-name" className="block text-xs font-semibold text-dark mb-1.5">Album name</label>
      <input
        ref={nameRef}
        id="album-name"
        data-testid="album-name"
        aria-invalid={nudged && !nameReady}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={enterToContinue}
        maxLength={MAX_ALBUM_NAME_LENGTH}
        autoComplete="off"
        placeholder="e.g. Maria's Debut, Our Boracay Trip"
        className={`w-full border rounded-xl px-4 py-3 text-sm outline-none focus:border-peach transition-colors ${
          nudged && !nameReady ? 'border-peach ring-2 ring-peach/30' : 'border-line'
        }`}
      />
      <p className="text-[11px] text-light mt-1.5 mb-4">It's how you'll find this album again in Your Projects.</p>

      <p className="text-sm text-ink-mid leading-relaxed mb-3">
        Pick the occasion — Megy writes the quotes on your pages to match it. You can change it later, but not skip it.
      </p>
      <div
        ref={chipsRef}
        className={`flex flex-wrap gap-2 rounded-2xl transition-all ${nudged && !themeReady ? 'p-2 -m-2 ring-2 ring-peach/40 bg-peach/5' : ''}`}
        role="radiogroup"
        aria-label="Album occasion"
        data-missing={nudged && !themeReady}
      >
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
                active ? 'bg-peach text-white border-peach shadow-sm' : 'bg-white text-dark border-line hover:border-peach/60'
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
            otherOpen ? 'bg-peach text-white border-peach shadow-sm' : 'bg-white text-dark border-line hover:border-peach/60'
          }`}
        >
          <PenLine size={14} /> Something else
        </button>
      </div>
      {otherOpen && (
        <div className="mt-3">
          <label htmlFor="album-theme" className="block text-xs font-semibold text-dark mb-1.5">What is it about?</label>
          <input
            id="album-theme"
            value={custom}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={enterToContinue}
            maxLength={MAX_THEME_LENGTH}
            autoFocus
            autoComplete="off"
            placeholder="e.g. Beach trip, Debut, Reunion, Lola's 80th"
            className="w-full border border-line rounded-xl px-4 py-3 text-sm outline-none focus:border-peach transition-colors"
          />
          <p className="text-[11px] text-light mt-1.5">A few words is plenty — the quotes take their cue from this.</p>
        </div>
      )}
      <p className={`mt-3 text-xs ${nudged ? 'font-semibold' : 'font-medium'}`} aria-live="polite" data-testid="step-one-status" data-nudged={nudged}>
        {ready
          ? <span className="text-success"><b>{cleanAlbumName(name)}</b> · {value.trim()} — tap Next.</span>
          : <span className={nudged ? 'text-blush-pink' : 'text-taupe'}>
              {!nameReady && !themeReady ? 'Name your album and choose an occasion to continue.'
                : !nameReady ? 'Name your album to continue.'
                : 'Choose an occasion to continue.'}
            </span>}
      </p>
    </div>
  );
}
