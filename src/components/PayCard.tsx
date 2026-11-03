/* The pay card on checkout's payment step (owner's design, 2026-10-31): who
   you pay and the QR, the order number with a Copy button for the transfer
   note, and the steps with icons. The QR keeps its full size on a phone (it
   sits beside the name only on a wider screen), and the steps say how to pay
   with the same phone: a phone can't scan its own screen, so screenshot the
   QR, then Upload QR in the bank app. Plain words for the bank and InstaPay,
   not their logos. */

import { useState } from 'react';
import { Banknote, Check, Copy, Landmark, Paperclip, ScanLine, Smartphone } from 'lucide-react';
import type { ReactNode } from 'react';
import { PAYEE } from '../lib/payment';
import { copyText } from '../lib/copyText';

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid="pay-step">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-peach text-xs font-bold text-white">{n}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush text-[#C98A5E]" aria-hidden="true">{icon}</span>
      <span className="min-w-0 text-sm text-ink-mid">
        <span className="block font-semibold text-dark">{title}</span>
        {children}
      </span>
    </li>
  );
}

export default function PayCard({ amountLabel, orderNumber }: { amountLabel: string; orderNumber: string | null }) {
  const [qrMissing, setQrMissing] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  const copy = async () => {
    if (!orderNumber) return;
    const ok = await copyText(orderNumber);
    setCopied(ok ? 'yes' : 'no');
    if (ok) window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      {/* Who you pay, and the QR (any PH bank or e-wallet app, InstaPay / QR Ph). */}
      <div className="overflow-hidden rounded-xl border border-line-soft bg-[#FFFDFB]" data-testid="pay-card">
        <div className="flex items-center justify-center gap-2 bg-blush/60 px-4 py-2.5 text-medium">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white" aria-hidden="true"><Landmark size={15} /></span>
          <span className="text-[11px] font-semibold uppercase tracking-wider" data-testid="pay-bank">{PAYEE.bank} · {PAYEE.rail}</span>
        </div>
        <div className="flex flex-col items-center gap-3 p-4 sm:flex-row-reverse sm:justify-between">
          {!qrMissing ? (
            <img src={PAYEE.qrSrc} alt={`${PAYEE.bank} InstaPay QR for ${PAYEE.name}`} onError={() => setQrMissing(true)}
              className="h-56 w-56 shrink-0 rounded-lg bg-white object-contain sm:h-44 sm:w-44" draggable={false} data-testid="pay-qr" />
          ) : (
            <div className="flex h-56 w-56 shrink-0 items-center justify-center rounded-lg bg-[#F7F1EC] px-4 text-center text-xs text-taupe sm:h-44 sm:w-44">The QR code isn't available right now — message us and we'll send the account details.</div>
          )}
          <div className="text-center sm:text-left">
            <p className="text-base font-semibold tracking-wide text-dark" data-testid="pay-name">{PAYEE.name}</p>
            <p className="font-mono text-sm text-taupe" data-testid="pay-account">
              <span aria-hidden="true">•••••• </span><span className="sr-only">Account ending in </span>{PAYEE.accountLast4}
            </p>
          </div>
        </div>
        <p className="px-4 pb-3 text-center text-[11px] text-light">Your app may charge a small InstaPay fee. We don't add any.</p>
      </div>

      {/* The order number for the transfer note: one tap copies it. */}
      {orderNumber && (
        <>
          <button type="button" onClick={() => { void copy(); }} data-testid="pay-copy-order"
            aria-label={`Copy order number ${orderNumber}`}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-peach bg-blush px-4 py-3 text-cocoa transition hover:brightness-[1.02] active:scale-[0.99]">
            <span className="font-mono text-sm font-semibold text-dark">{orderNumber}</span>
            <span className="flex items-center gap-1.5 text-sm font-semibold" data-testid="pay-copy-label">
              {copied === 'yes' ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
            </span>
          </button>
          {copied === 'no' && (
            <p className="mt-1.5 text-center text-[11px] text-taupe" role="status" data-testid="pay-copy-failed">This phone didn't let us copy it. Type {orderNumber} in the note instead.</p>
          )}
        </>
      )}

      <ol className="mt-4 divide-y divide-line-soft rounded-xl bg-[#FFF8F3] px-4 py-4" data-testid="pay-steps">
        <Step n={1} icon={<Smartphone size={17} />} title="Open your bank or e-wallet app">
          <span className="block text-xs text-taupe">GCash, Maya, BPI, BDO, UnionBank…</span>
        </Step>
        <Step n={2} icon={<ScanLine size={17} />} title={<>Choose <b>Scan QR</b> / <b>InstaPay</b></>}>
          <span className="block text-xs text-taupe">and scan the code above.</span>
          <span className="mt-1 block text-xs text-taupe" data-testid="pay-same-phone">
            <b className="text-ink-mid">Paying with this phone?</b> Take a screenshot of the QR, then choose <b>Upload QR</b> in your bank app.
          </span>
        </Step>
        <Step n={3} icon={<Banknote size={17} />} title={<>Send exactly <span className="text-blush-pink">{amountLabel}</span></>}>
          {orderNumber && <span className="block text-xs text-taupe">and paste <span className="font-mono text-[#C98A5E]">{orderNumber}</span> in the note if your app asks.</span>}
        </Step>
        <Step n={4} icon={<Paperclip size={17} />} title="Attach your receipt below">
          <span className="block text-xs text-taupe">It speeds up confirmation.</span>
        </Step>
      </ol>
    </>
  );
}
