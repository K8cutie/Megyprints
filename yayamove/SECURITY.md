# Yayamove — Security Checklist

Carried over from the Megyprints pre-production audit so we fix it early
("out of sight, out of mind"). Status: ✅ done · ⏳ before real users · 🔜 later.

## Access control
- ✅ RLS enabled on **every** public table, each with `USING` and `WITH CHECK`.
- ✅ Public-readable marketplace data (provider listings, reviews) is explicitly
  read-only to others; writes are owner-scoped.
- ✅ `nbi_clearances` is owner-read-only (not public); status changes frozen to
  `service_role` via trigger.
- ✅ Server-controlled columns (`verification_status`, `rating_avg`,
  `rating_count`, `jobs_completed`) frozen for normal users by DB triggers —
  no client can self-verify or inflate ratings.

## Secrets & config
- ✅ `.env` is gitignored; only `.env.example` is committed.
- ✅ No `service_role` key in the frontend — anon key only (public by design).
- ✅ Supabase client **fails loudly** when unconfigured (no silent `?? ''`).
- 🔜 Inject `VITE_SUPABASE_*` via host/CI secrets; fail the build if missing.

## Sensitive data (NBI clearance = high-risk PII)
- ✅ Stored in a **private** bucket, path-prefixed by `auth.uid()`.
- ✅ Explicit Data Privacy Act 2012 (RA 10173) consent checkbox before upload.
- ✅ Consent persisted (`nbi_clearances.consent_given`, enforced in RLS insert).
- 🔜 Short-lived signed URLs for the verification team (never public links).
- 🔜 Account/data-deletion (erasure) path.

## App resilience
- ✅ App-level `ErrorBoundary` (not just one route) + global
  `unhandledrejection` handler.
- ✅ 404 catch-all route.
- ✅ Hardened password policy (10+ chars, mixed case + number).

## Messaging & bookings (added in pass 2)
- ✅ `conversations`/`messages` RLS: only the two participants can read or write
  a thread; sender must equal `auth.uid()`.
- ✅ Realtime enabled on `messages` only (least exposure + cost control).
- ✅ `bookings` RLS scoped to the seeker who created it and the provider it's for.

## Admin verification (added in pass 2)
- ✅ `admins` table has **no client policies** — membership is granted only in
  the SQL editor; `is_admin()` is `security definer`.
- ✅ Only admins (or `service_role`) can read all NBI clearances and flip a
  provider's `verification_status`; guard triggers enforce this even on direct
  REST calls.
- ✅ Ratings & `jobs_completed` are computed by DB triggers from real reviews /
  completed bookings — never settable by a client.

## Audit remediation (pass 4 — security/QA/quality auditors)
- ✅ **Admin route gated** (`AdminRoute` + `is_admin()` RPC) in addition to RLS —
  the admin surface no longer renders for non-admins.
- ✅ **Messages immutable except `read_at`** (guard trigger) — a participant can
  no longer rewrite the other person's message.
- ✅ **Providers can't self-complete bookings** (guard trigger) — only the seeker
  or an admin can mark `completed`, closing the `jobs_completed` inflation path.
- ✅ **Reviews require a completed booking** (RLS) — blocks review-bombing.
- ✅ **NBI/cert uploads validated** (MIME + 10MB) client-side and via bucket
  `allowed_mime_types` / `file_size_limit`.
- ✅ **`provider_profiles.user_id` no longer exposed** to public SELECT
  (column-level GRANT); the auth UUID can't be scraped via the anon key.
- ✅ **CSP** added (meta floor; prefer a host header in prod).
- ✅ **Account deletion** wired to a real `delete-account` Edge Function
  (cascade + storage wipe); **password reset** wired; storage policy names
  de-collided.

## Still open / recommended before real users (gates)
- 🔜 Auth + posting **rate limits / captcha** (Supabase dashboard config).
- 🔜 Serve **CSP as a response header** (adds `frame-ancestors`) at the host/CDN.
- 🔜 Public **VIEW** excluding `certificates.file_path`; coarsen stored `lat/lng`.
- 🔜 Wire the real error reporter (Sentry) into `reportError` (hook point ready).
- 🔜 CI secret injection for `VITE_SUPABASE_*` with build-fail-on-missing.

## Before real users (gates)
- 🔜 Privacy Policy + Terms of Service, linked at signup/footer.
- 🔜 Error monitoring (e.g. Sentry) + basic analytics.
- 🔜 Content Security Policy header.
- 🔜 `npm audit` clean; pinned Node via `.nvmrc` (✅ added).
- 🔜 Rate-limiting / abuse protection on auth and job posting.
- 🔜 Automated tests for auth, RLS, and the onboarding flow.
