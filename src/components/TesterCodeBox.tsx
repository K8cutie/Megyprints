import { useState } from 'react';
import { Check, Loader2, Ticket } from 'lucide-react';
import { checkTesterCode, testerLine, type TesterCode } from '../lib/testerCode';

/* The tester code at checkout (0057). Closed, it is one line: "Have a tester
   code?". Open, a box and "Use code"; the database answers. Once a code works
   it shows what it does, and "Remove" — until the order is placed: the order
   row keeps its code (`locked`). */
export default function TesterCodeBox({ tester, onChange, locked }: {
  tester: TesterCode | null;
  onChange: (next: TesterCode | null) => void;
  /** An order is placed: the code is on it now and can't be changed here. */
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  if (tester) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#CDE5D3] bg-[#EEF7F0] px-3 py-2.5" data-testid="tester-code-on">
        <p className="text-sm font-semibold text-[#2E6B3F] flex items-center gap-1.5"><Check size={15} className="shrink-0" />{testerLine(tester)}</p>
        {!locked && (
          <button type="button" onClick={() => { onChange(null); setTyped(''); setError(''); }} data-testid="tester-code-remove"
            className="text-xs font-semibold text-medium underline shrink-0">Remove</button>
        )}
      </div>
    );
  }
  if (locked) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="tester-code-open"
        className="mt-3 text-xs font-semibold text-medium underline flex items-center gap-1.5">
        <Ticket size={14} className="shrink-0" /> Have a tester code?
      </button>
    );
  }
  const use = async () => {
    if (checking) return;
    setError('');
    setChecking(true);
    const r = await checkTesterCode(typed);
    setChecking(false);
    if (r.ok) onChange(r.tester);
    else setError(r.message);
  };
  return (
    <div className="mt-3" data-testid="tester-code-box">
      <label htmlFor="tester-code" className="text-xs font-semibold text-dark block mb-1">Tester code</label>
      <div className="flex gap-2">
        <input id="tester-code" value={typed} maxLength={30} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={(e) => { setTyped(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void use(); } }}
          aria-invalid={!!error} data-testid="tester-code-input"
          className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm font-mono uppercase ${error ? 'border-red-400' : 'border-line'}`} />
        <button type="button" onClick={() => void use()} data-testid="tester-code-apply"
          className="shrink-0 px-4 py-2 bg-peach text-white text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5">
          {checking ? <><Loader2 size={14} className="animate-spin" /> Checking…</> : 'Use code'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1" role="alert" data-testid="tester-code-error">{error}</p>}
    </div>
  );
}
