import { useState } from 'react';
import { Check, Loader2, Ticket } from 'lucide-react';
import { testerLine, type TesterCode } from '../lib/testerCode';
import { affiliateLine, checkCheckoutCode, type AffiliateCode } from '../lib/affiliates';

/* The code box at checkout: the tester code (0057) or an affiliate code
   (0061), one box for both. Closed, it is one line: "Have a code?". Open, a
   box and "Use code"; the database answers which kind it is. Once a code
   works it shows what it does, and "Remove" — until the order is placed: the
   order row keeps its code (`locked`). */
export default function CheckoutCodeBox({ tester, affiliate, onTester, onAffiliate, locked }: {
  tester: TesterCode | null;
  affiliate: AffiliateCode | null;
  onTester: (next: TesterCode | null) => void;
  /** `removed` = the customer took it off (so a kept link isn't put back). */
  onAffiliate: (next: AffiliateCode | null, removed?: boolean) => void;
  /** An order is placed: the code is on it now and can't be changed here. */
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const on = tester ? testerLine(tester) : affiliate ? affiliateLine(affiliate) : null;
  if (on) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#CDE5D3] bg-[#EEF7F0] px-3 py-2.5"
        data-testid={tester ? 'tester-code-on' : 'affiliate-code-on'}>
        <p className="text-sm font-semibold text-[#2E6B3F] flex items-center gap-1.5"><Check size={15} className="shrink-0" />{on}</p>
        {!locked && (
          <button type="button" data-testid={tester ? 'tester-code-remove' : 'affiliate-code-remove'}
            onClick={() => { if (tester) onTester(null); else onAffiliate(null, true); setTyped(''); setError(''); }}
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
        <Ticket size={14} className="shrink-0" /> Have a code?
      </button>
    );
  }
  const use = async () => {
    if (checking) return;
    setError('');
    setChecking(true);
    const r = await checkCheckoutCode(typed);
    setChecking(false);
    if (!r.ok) { setError(r.message); return; }
    if ('tester' in r) { onAffiliate(null); onTester(r.tester); }
    else { onTester(null); onAffiliate(r.affiliate); }
  };
  return (
    <div className="mt-3" data-testid="tester-code-box">
      <label htmlFor="tester-code" className="text-xs font-semibold text-dark block mb-1">Your code</label>
      <div className="flex gap-2">
        {/* Its own border and fill, not border-line: on a white summary card a
            hairline box with no text inside read as no box at all, and the
            soft-glass look turns border-line white (live, 2026-10-26). */}
        <input id="tester-code" value={typed} maxLength={30} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={(e) => { setTyped(e.target.value); if (error) setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void use(); } }}
          aria-invalid={!!error} data-testid="tester-code-input" placeholder="Type your code"
          className={`flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm font-mono uppercase bg-[#FFFAF6] placeholder:font-sans placeholder:normal-case placeholder:text-light focus:outline-none focus:ring-2 focus:ring-peach/30 ${error ? 'border-red-400' : 'border-[#C9BBAF] focus:border-peach'}`} />
        <button type="button" onClick={() => void use()} data-testid="tester-code-apply"
          className="shrink-0 px-4 py-2 bg-peach text-white text-sm font-semibold rounded-lg hover:brightness-105 flex items-center gap-1.5">
          {checking ? <><Loader2 size={14} className="animate-spin" /> Checking…</> : 'Use code'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-1" role="alert" data-testid="tester-code-error">{error}</p>}
    </div>
  );
}
