// Supabase Edge Function: paymongo-webhook
//
// Receives PayMongo webhook events and is the ONLY thing that moves a payment
// into escrow ('held'). It verifies the signature, then updates the payment row
// with the service-role client. Never trust the client for money state.
//
// Deploy:  supabase functions deploy paymongo-webhook --no-verify-jwt
// Secrets: supabase secrets set PAYMONGO_WEBHOOK_SECRET=whsk_xxx
// Register the function URL in the PayMongo dashboard for
//   `checkout_session.payment.paid` (and payment.failed).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// HMAC-SHA256 verification of PayMongo's `Paymongo-Signature` header
// (format: `t=<ts>,te=<sig>` for test, `li=<sig>` for live).
async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
    const ts = parts["t"];
    const sig = parts["te"] ?? parts["li"];
    if (!ts || !sig) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${payload}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === sig;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const secret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET")!;

  const raw = await req.text();
  const header = req.headers.get("Paymongo-Signature") ?? "";
  if (!(await verify(raw, header, secret))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw);
  const type = event?.data?.attributes?.type as string;
  // The checkout session id we stored as gateway_ref.
  const sessionId =
    event?.data?.attributes?.data?.attributes?.checkout_session_id ??
    event?.data?.attributes?.data?.id;

  const admin = createClient(url, service);

  if (type === "checkout_session.payment.paid") {
    await admin
      .from("payments")
      .update({ status: "held", paid_at: new Date().toISOString() } as any)
      .eq("gateway_ref", sessionId);
  } else if (type === "payment.failed") {
    await admin.from("payments").update({ status: "failed" } as any).eq("gateway_ref", sessionId);
  }

  return new Response("ok", { status: 200 });
});
