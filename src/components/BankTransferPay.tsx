import { useState } from 'react';
import { Landmark, Paperclip, Check, Loader2 } from 'lucide-react';
import { PAYEE, checkProof, referenceProblem } from '../lib/payment';

/* ══════════════════════════════════════════════════════════════════════════
   "Send ₱X by bank transfer": the GoTyme InstaPay QR, what to type in the
   note, an optional receipt and reference, and one button, "I've sent ₱X".
   The same rail and wording as checkout (Order.tsx), for event bookings'
   deposit and balance. The caller records the payment (onSent); this only
   collects it.
   ══════════════════════════════════════════════════════════════════════════ */

export default function BankTransferPay({ amount, note, what, onSent }: {
  amount: number;
  /** Shown as the transfer note to type (the booking number). */
  note: string;
  /** "deposit" / "balance": named on the button so the host knows which. */
  what: string;
  /** Upload + record. Throws with a sentence when it fails. */
  onSent: (receipt: File | null, reference: string) => Promise<void>;
}) {
  const [qrMissing, setQrMissing] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptErr, setReceiptErr] = useState('');
  const [ref, setRef] = useState('');
  const [refErr, setRefErr] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const amountLabel = `₱${amount.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

  const pick = (f: File | null) => {
    if (!f) return;
    const bad = checkProof(f);
    if (bad) { setReceiptErr(bad); setReceipt(null); return; }
    setReceiptErr('');
    setReceipt(f);
  };

  const send = async () => {
    const bad = referenceProblem(ref);
    if (bad) { setRefErr(bad); return; }
    setSending(true);
    setErr('');
    try {
      await onSent(receipt, ref.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'We couldn’t record your payment. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3" data-testid="bank-transfer-pay">
      <div className="rounded-xl border border-line-soft bg-[#FFFDFB] p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-medium mb-2"><Landmark size={16} /> <span className="text-xs font-semibold uppercase tracking-wide">{PAYEE.bank} · {PAYEE.rail}</span></div>
        {!qrMissing ? (
          <img src={PAYEE.qrSrc} alt={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} onError={() => setQrMissing(true)}
            className="mx-auto w-48 h-48 object-contain rounded-lg bg-white" draggable={false} />
        ) : (
          <div className="mx-auto w-48 h-48 rounded-lg bg-[#F7F1EC] flex items-center justify-center text-xs text-taupe px-4">The QR code isn’t available right now. Message us and we’ll send the account details.</div>
        )}
        <p className="mt-3 text-base font-semibold text-dark">{PAYEE.name}</p>
        <p className="text-xs text-taupe">Account ending in <span className="font-mono">{PAYEE.accountLast4}</span></p>
        <p className="mt-2 font-display text-2xl font-bold text-blush-pink" data-testid="pay-amount">{amountLabel}</p>
      </div>

      <ol className="mt-3 space-y-1.5 text-xs text-ink-mid list-decimal pl-4">
        <li>Open your bank or e-wallet app (GCash, Maya, BPI, BDO, UnionBank…).</li>
        <li>Choose <b>Scan QR</b> / <b>InstaPay</b> and scan the code above.</li>
        <li>Send exactly <b className="text-dark">{amountLabel}</b> and put <span className="font-mono text-[#C98A5E]">{note}</span> in the note if your app asks.</li>
        <li>Attach your receipt below. It speeds up confirmation.</li>
      </ol>
      <p className="mt-2 text-[11px] text-light">Your app may charge a small InstaPay fee. We don’t add any.</p>

      <div className="mt-3 rounded-xl border border-line-soft p-3 bg-white">
        <p className="block text-xs font-semibold text-dark mb-1.5">Receipt screenshot <span className="font-normal text-light">(optional)</span></p>
        <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-peach bg-cream text-xs text-cocoa cursor-pointer hover:bg-blush focus-within:ring-2 focus-within:ring-peach focus-within:ring-offset-1">
          <Paperclip size={14} className="shrink-0" />
          <span className="truncate">{receipt ? `${receipt.name} · ${Math.max(1, Math.round(receipt.size / 1024))} KB` : 'Attach the transfer receipt (JPG, PNG or PDF)'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" data-testid="pay-receipt-input"
            onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </label>
        {receiptErr && <p className="mt-1.5 text-[11px] text-red-500">{receiptErr}</p>}
        <label htmlFor={`pay-ref-${note}`} className="block text-xs font-semibold text-dark mt-3 mb-1.5">Reference no. <span className="font-normal text-light">(optional, from your bank’s receipt)</span></label>
        <input id={`pay-ref-${note}`} value={ref} onChange={(e) => { setRef(e.target.value); setRefErr(''); }} inputMode="text" autoComplete="off"
          placeholder="e.g. 2026091012345678" maxLength={64} aria-invalid={!!refErr} data-testid="pay-reference"
          className={`w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-peach ${refErr ? 'border-red-400' : 'border-line'}`} />
        {refErr && <p className="mt-1.5 text-[11px] text-red-500" data-testid="pay-reference-error">{refErr}</p>}
      </div>

      <button type="button" onClick={() => void send()} disabled={sending} data-testid="pay-sent"
        className="w-full mt-3 py-3.5 bg-blush-pink text-white text-base font-bold rounded-xl hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait">
        {sending ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Check size={16} /> I’ve sent the {amountLabel} {what}</>}
      </button>
      <p className="mt-2 text-[11px] text-light text-center">We confirm transfers in our bank app during business hours. Nothing is charged automatically.</p>
      {err && <p className="mt-2 text-xs text-red-600 text-center" role="alert" data-testid="pay-error">{err}</p>}
    </div>
  );
}
