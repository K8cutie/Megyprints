/**
 * Gateway-agnostic payment layer (mirrors lib/api.ts).
 *
 * - Commission + escrow split is computed here and snapshotted onto the payment.
 * - In demo mode, checkout is simulated so the whole flow is clickable with no
 *   keys. In live mode it calls a Supabase Edge Function that talks to PayMongo
 *   with the SECRET key server-side — the secret never touches the browser.
 * - PayMongo is acceptance-only (no native split), so disbursement to the
 *   provider is modelled as a separate step (released → payout), not assumed.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { formatPHP } from "./utils";
import type { CategorySlug } from "@/types/database";

/** Platform take rate. Snapshotted per-payment so changing it never rewrites history. */
export const PLATFORM_COMMISSION_RATE = 0.12; // 12%

export type PaymentMethod = "gcash" | "card" | "maya";

export interface EscrowSplit {
  amountTotal: number;
  commissionRate: number;
  commissionAmount: number;
  providerAmount: number;
}

/** Compute the escrow split. Rounds commission to centavos; provider gets the rest. */
export function computeSplit(
  amountTotal: number,
  rate: number = PLATFORM_COMMISSION_RATE,
): EscrowSplit {
  const commissionAmount = Math.round(amountTotal * rate * 100) / 100;
  return {
    amountTotal,
    commissionRate: rate,
    commissionAmount,
    providerAmount: Math.round((amountTotal - commissionAmount) * 100) / 100,
  };
}

export function describeSplit(split: EscrowSplit): string {
  return `${formatPHP(split.providerAmount)} to provider · ${formatPHP(
    split.commissionAmount,
  )} platform fee`;
}

export interface CheckoutRequest {
  bookingId?: string;
  providerId: string;
  category: CategorySlug;
  amountTotal: number;
  method: PaymentMethod;
}

export interface CheckoutResult {
  paymentId: string;
  /** URL to redirect the seeker to (PayMongo-hosted checkout). Demo: null. */
  checkoutUrl: string | null;
  status: "pending" | "held";
  split: EscrowSplit;
}

/**
 * Start a checkout. Demo mode simulates an instantly-held escrow payment so the
 * UI flow works end-to-end. Live mode delegates to the `paymongo-create-checkout`
 * Edge Function, which creates the PayMongo session and the `payments` row.
 */
export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
  const split = computeSplit(req.amountTotal);

  if (!isSupabaseConfigured || !supabase) {
    // Demo: pretend the seeker paid and funds are now held in escrow.
    await new Promise((r) => setTimeout(r, 700));
    return {
      paymentId: `demo_${Math.random().toString(36).slice(2, 10)}`,
      checkoutUrl: null,
      status: "held",
      split,
    };
  }

  const { data, error } = await supabase.functions.invoke<CheckoutResult>(
    "paymongo-create-checkout",
    { body: { ...req, ...split } },
  );
  if (error || !data) throw error ?? new Error("Checkout failed.");
  return data;
}

export const PAYMENT_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Awaiting payment", tone: "warning" },
  processing: { label: "Processing", tone: "warning" },
  held: { label: "In escrow", tone: "default" },
  released: { label: "Released", tone: "success" },
  refunded: { label: "Refunded", tone: "muted" },
  failed: { label: "Failed", tone: "muted" },
};
