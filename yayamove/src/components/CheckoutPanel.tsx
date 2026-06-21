import { useState } from "react";
import { toast } from "sonner";
import { Lock, ShieldCheck, Wallet, CreditCard, Smartphone } from "lucide-react";
import { Button } from "./ui/button";
import {
  createCheckout,
  computeSplit,
  PLATFORM_COMMISSION_RATE,
  type PaymentMethod,
  type CheckoutResult,
} from "@/lib/payments";
import type { CategorySlug } from "@/types/database";
import { formatPHP, cn } from "@/lib/utils";

const METHODS: { id: PaymentMethod; label: string; icon: typeof Wallet }[] = [
  { id: "gcash", label: "GCash", icon: Smartphone },
  { id: "maya", label: "Maya", icon: Wallet },
  { id: "card", label: "Card", icon: CreditCard },
];

interface Props {
  providerName: string;
  providerId: string;
  category: CategorySlug;
  amount: number;
  bookingId?: string;
  onPaid: (result: CheckoutResult) => void;
}

export function CheckoutPanel({ providerName, providerId, category, amount, bookingId, onPaid }: Props) {
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [paying, setPaying] = useState(false);
  const split = computeSplit(amount);

  const pay = async () => {
    setPaying(true);
    try {
      const result = await createCheckout({ bookingId, providerId, category, amountTotal: amount, method });
      // Live PayMongo returns a hosted checkout URL to redirect to.
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      onPaid(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment could not be started.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      {/* escrow explainer */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-800">
          <ShieldCheck className="size-4" /> Protected by Yayamove escrow
        </p>
        <p className="mt-1 text-xs text-brand-900/70">
          Your payment is held securely and only released to {providerName.split(" ")[0]} once
          you mark the job complete.
        </p>
      </div>

      {/* split breakdown */}
      <div className="mt-4 space-y-2 rounded-xl border border-border p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">You pay</span>
          <span className="font-bold">{formatPHP(split.amountTotal)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>To {providerName.split(" ")[0]} on completion</span>
          <span>{formatPHP(split.providerAmount)}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Platform fee ({Math.round(PLATFORM_COMMISSION_RATE * 100)}%)</span>
          <span>{formatPHP(split.commissionAmount)}</span>
        </div>
      </div>

      {/* method picker */}
      <p className="mt-4 text-sm font-semibold">Pay with</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {METHODS.map((m) => {
          const Icon = m.icon;
          const active = method === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-semibold transition-all",
                active ? "border-brand-500 bg-brand-50 text-brand-700 shadow-soft" : "border-border hover:border-brand-300",
              )}
            >
              <Icon className="size-5" />
              {m.label}
            </button>
          );
        })}
      </div>

      <Button variant="gradient" size="lg" className="mt-5 w-full" onClick={pay} disabled={paying}>
        <Lock /> {paying ? "Starting payment…" : `Pay ${formatPHP(amount)} securely`}
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Payments processed by PayMongo · GCash, Maya &amp; cards · sandbox in demo
      </p>
    </div>
  );
}
