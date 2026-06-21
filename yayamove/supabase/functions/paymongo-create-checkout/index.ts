// Supabase Edge Function: paymongo-create-checkout
//
// Creates a PayMongo Checkout Session server-side (the SECRET key never reaches
// the browser) and records a PENDING payment row. The seeker is redirected to
// the returned checkout_url; the webhook flips the payment to 'held' (escrow)
// once PayMongo confirms it's paid.
//
// Deploy:  supabase functions deploy paymongo-create-checkout
// Secrets: supabase secrets set PAYMONGO_SECRET_KEY=sk_test_xxx
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const paymongoKey = Deno.env.get("PAYMONGO_SECRET_KEY")!;
  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return json({ error: "Unauthorized" }, 401);

  const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json();
  const { bookingId, providerId, amountTotal, commissionRate, commissionAmount, providerAmount } = body;
  if (!providerId || !amountTotal || amountTotal <= 0) return json({ error: "Invalid request" }, 400);

  // Create the PayMongo Checkout Session (amounts are in centavos).
  const pmRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${paymongoKey}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        attributes: {
          payment_method_types: ["gcash", "card", "paymaya"],
          line_items: [
            {
              name: "Yayamove booking",
              quantity: 1,
              amount: Math.round(amountTotal * 100),
              currency: "PHP",
            },
          ],
          description: `Yayamove escrow payment (booking ${bookingId ?? "n/a"})`,
          success_url: `${appUrl}/dashboard?payment=success`,
          cancel_url: `${appUrl}/dashboard?payment=cancelled`,
        },
      },
    }),
  });

  const pm = await pmRes.json();
  if (!pmRes.ok) return json({ error: pm?.errors?.[0]?.detail ?? "PayMongo error" }, 502);

  const sessionId = pm.data.id as string;
  const checkoutUrl = pm.data.attributes.checkout_url as string;

  // Record the pending payment (service role bypasses RLS, but we set seeker_id
  // to the authenticated user so ownership is correct).
  const admin = createClient(url, service);
  const { data: payment, error } = await admin
    .from("payments")
    .insert({
      booking_id: bookingId ?? null,
      seeker_id: user.id,
      provider_id: providerId,
      gateway: "paymongo",
      gateway_ref: sessionId,
      checkout_url: checkoutUrl,
      amount_total: amountTotal,
      commission_rate: commissionRate,
      commission_amount: commissionAmount,
      provider_amount: providerAmount,
      status: "pending",
    } as any)
    .select("id")
    .single();

  if (error) return json({ error: error.message }, 500);

  return json({
    paymentId: payment.id,
    checkoutUrl,
    status: "pending",
    split: { amountTotal, commissionRate, commissionAmount, providerAmount },
  });
});
