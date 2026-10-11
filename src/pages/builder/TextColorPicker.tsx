/* ══════════════════════════════════════════════════════════════════════════
   TextColorPicker — the text colours (textColors.ts) as swatches, 4 rows of
   7, then "Any color" for anything else (the phone's own colour picker). The
   chosen colour is ringed and ticked, and its name is said under the
   swatches. Used by the cover title and the phone text editor.
   ══════════════════════════════════════════════════════════════════════════ */

import { Check } from 'lucide-react';
import { TEXT_COLORS, sameColor, textColorName, toColorInputValue } from './textColors';

const RING = '0 0 0 2px #FFFFFF, 0 0 0 4px #9A4A2C';
const RAINBOW = 'conic-gradient(#C62828, #E8772E, #D4A017, #2E7D4A, #1F7A7A, #3A6EA5, #9B5DE5, #C2185B, #C62828)';

/** A tick that shows on the swatch: dark on light colours, white on dark. */
function tickOn(hex: string): string {
  const h = toColorInputValue(hex);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#2D2D2D' : '#FFFFFF';
}

export default function TextColorPicker({ value, onChange, onPicked }: {
  value: string;
  onChange: (hex: string) => void;
  /** After a swatch is tapped (the phone editor closes its panel). */
  onPicked?: () => void;
}) {
  const name = textColorName(value);
  const own = !name && !!value;
  return (
    <div data-testid="text-color-picker">
      <div role="radiogroup" aria-label="Text color" className="grid grid-cols-7 gap-2 justify-items-center">
        {TEXT_COLORS.map((c) => {
          const on = sameColor(c.hex, value);
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              data-testid="text-color"
              onClick={() => { onChange(c.hex); onPicked?.(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95"
              style={{ background: c.hex, border: '1px solid rgba(0,0,0,0.15)', boxShadow: on ? RING : 'none' }}
            >
              {on && <Check size={16} strokeWidth={3} style={{ color: tickOn(c.hex) }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {/* Any other colour: the phone's own colour picker. Words on it, not just
          a rainbow (a bare icon doesn't say what it does). */}
      <label
        data-testid="text-color-any"
        className="relative mt-2.5 flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border bg-white text-[13px] font-semibold text-dark"
        style={{ borderColor: own ? '#9A4A2C' : 'rgba(0,0,0,0.15)', boxShadow: own ? '0 0 0 1px #9A4A2C' : 'none' }}
      >
        <span className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center" aria-hidden="true"
          style={{ background: own ? value : RAINBOW, border: '1px solid rgba(0,0,0,0.15)' }}>
          {own && <Check size={12} strokeWidth={3} style={{ color: tickOn(value) }} />}
        </span>
        Any color
        <input
          type="color"
          aria-label="Any color"
          value={toColorInputValue(value)}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <p className="mt-1.5 text-center text-[11px] text-taupe" data-testid="text-color-name" aria-live="polite">
        {name ?? (own ? 'Your own color' : '')}
      </p>
    </div>
  );
}
