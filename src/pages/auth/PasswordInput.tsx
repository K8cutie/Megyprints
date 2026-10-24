import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

// =============================================================================
// A password box with "Show" / "Hide" (the eye), so people can check what
// they typed — a missed key on a phone keyboard is easy and the dots hide it.
// Sign in, sign up (both boxes) and "Make a new password" all use this one.
// =============================================================================

export interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: 'current-password' | 'new-password';
  /** The dialog puts focus here first. */
  autoFocus?: boolean;
}

export function PasswordInput({ id, value, onChange, placeholder, autoComplete, autoFocus = false }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe" />
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-autofocus={autoFocus || undefined}
        autoComplete={autoComplete}
        // Shown as text, a phone keyboard would capitalize or "correct" it.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-xl border-2 border-blush-deep bg-white py-2.5 pl-10 pr-20 text-sm text-ink-warm placeholder-taupe/50 focus:border-blush-pink focus:outline-none focus:ring-2 focus:ring-blush-pink/20 transition-all"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        // Keep focus (and the phone keyboard) on the box while tapping.
        onMouseDown={(e) => e.preventDefault()}
        aria-controls={id}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex items-center gap-1 rounded-r-xl px-3 text-xs font-medium text-taupe hover:text-ink-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush-pink/40"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

export default PasswordInput;
