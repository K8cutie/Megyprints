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

## Before real users (gates)
- 🔜 Privacy Policy + Terms of Service, linked at signup/footer.
- 🔜 Error monitoring (e.g. Sentry) + basic analytics.
- 🔜 Content Security Policy header.
- 🔜 `npm audit` clean; pinned Node via `.nvmrc` (✅ added).
- 🔜 Rate-limiting / abuse protection on auth and job posting.
- 🔜 Automated tests for auth, RLS, and the onboarding flow.
