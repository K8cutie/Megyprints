// Supabase Edge Function: delete-account
//
// Implements the RA 10173 "right to erasure". Deploy with:
//   supabase functions deploy delete-account
//
// It authenticates the caller from their JWT, then uses the SERVICE ROLE key
// (server-only — never shipped to the client) to delete the auth user. ON DELETE
// CASCADE on every table's user FK removes the profile, provider profile, skills,
// experience, certificates, NBI clearance, jobs, bookings, messages and reviews.
// Storage objects under the user's folder are removed explicitly.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) return new Response("Unauthorized", { status: 401, headers: cors });

  // Identify the caller from their token.
  const asUser = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) {
    return new Response("Unauthorized", { status: 401, headers: cors });
  }

  // Privileged client for the actual deletion.
  const admin = createClient(url, service);

  // Remove the user's private storage objects first.
  for (const bucket of ["nbi-clearances", "certificates", "avatars", "portfolio"]) {
    const { data: files } = await admin.storage.from(bucket).list(user.id);
    if (files?.length) {
      await admin.storage.from(bucket).remove(files.map((f: any) => `${user.id}/${f.name}`));
    }
  }

  // Deleting the auth user cascades across all tables (ON DELETE CASCADE).
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
