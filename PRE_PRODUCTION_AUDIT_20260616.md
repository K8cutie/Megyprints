# Megy Prints — Pre-Production Audit
**Date:** 2026-06-16 · **Auditor:** Claude (4 parallel specialist passes: security, data integrity, infra/cost, readiness/compliance)
**Scope:** Production-readiness for taking real customer photos, accounts, and orders.

---

## VERDICT: 🔴 NO-GO

Not a close call. The app is a **polished album *designer*** with the entire *commerce and fulfillment half missing* — plus disqualifying legal, security, and observability gaps. It cannot take a real customer or fulfill a single order today.

The good news: infra is genuinely cheap and the design tool itself is solid. The work ahead is **building the missing half**, not fixing a broken one.

---

## The two STRUCTURAL showstoppers (read these first)

These aren't bugs — they're missing halves of the product.

### 1. Orders go nowhere — checkout is a façade
`Order.tsx:26-33`: "Submit Order" sets a local `submitted=true` and shows a "Thank You / we'll contact you in 24h" screen. **Nothing is written to a database, emailed, or POSTed.** No order record, no order ID, no payment, no merchant notification. The backend order route is commented out (`backend/server.js:40`); there is no Stripe/PayMongo/PayPal anywhere. The Order page doesn't even know *which album* is being bought — `navigate('/order')` passes no album reference, and the page re-asks for size/material/cover unrelated to what was built. The client-computed price (`Order.tsx:19-24`) is tamperable, but it doesn't matter because it's never transmitted. **Every "order" a real customer places is silently discarded.**

### 2. Customer photos can never reach the printer
By design, photo **bytes live only in the browser's IndexedDB**; only layout JSON + photo `{id, name}` sync to Supabase (`useAlbumSync.serializeAlbum:74-92`). The `album-photos` Storage bucket in the setup docs is **provisioned but never written to**. Consequences:
- Albums are **device-local** — they vanish on browser-data clear, different device, or incognito; the user is never warned.
- The **print-resolution source files physically cannot reach a print vendor.** There is no upload, no server to receive a render, no export-to-fulfillment path.

This is excellent for a *free, privacy-preserving design tool* (and why infra is so cheap), but **structurally incapable of fulfilling a physical print order.**

---

## Findings by domain (deduped, severity-tagged)

### 🔒 Security & Auth — NO-GO
- **[CRITICAL]** `.env` is **not gitignored** and contains a backend `JWT_SECRET`; `GITHUB_SETUP.md` literally instructs `git add -A && push` to a **public** repo → secret leak path. *(Anon key is public-by-design and OK; JWT_SECRET is not.)*
- **[CRITICAL]** Prod build ships with **empty Supabase config** — `deploy.yml` injects no `VITE_SUPABASE_*` secrets; `supabase.ts` falls back to `''`. Auth/save/load will fail in production. It only "works" locally because `.env` is on disk.
- **[HIGH]** RLS policies exist in `supabase-setup.sql` for `albums`/`user_profiles` (good), **but** storage bucket is documented **public**, and storage policies are manual dashboard clicks (skippable). RLS is the *only* access control with a public anon key — it must be verified live, not assumed.
- **[HIGH]** `npm audit`: **6 high** — `fabric@5.3.0` **Stored XSS via SVG/gradient export** (core canvas lib); `tar` path-traversal (dev chain from unmaintained `face-api.js@0.17`). Fabric is also **double-loaded** (npm dep + unpinned global `<script>` in `index.html`, no SRI). **No CSP** anywhere.
- **[MEDIUM]** Weak password rule (6 chars, no complexity). Base64 data-URL avatars stored in user metadata (token bloat); OAuth `avatar_url` rendered unvalidated.

### 🧮 Data Integrity & Money — NO-GO
- **[CRITICAL]** Fake orders + local-only photos (the two showstoppers above).
- **[HIGH]** **Slot fills are positional indices, not IDs** (`useBuilderState`): `removePhoto` shifts the array but doesn't remap `slotFills`, silently re-pointing every later slot to the wrong photo (off-by-one cascade).
- **[HIGH]** **Last-write-wins clobbering:** cloud `upsert` has no `updated_at`/version guard; two tabs/devices overwrite each other. The "skip cloud load if local has content" guard lets a stale device overwrite newer cloud data.
- **[HIGH]** **"All blob URLs dead → wipe IndexedDB"** path (the #3 bug from the prior session) — triggers on normal reloads, deletes recoverable photos.
- **[MEDIUM]** localStorage quota failures swallowed silently; 3s debounce means edits in the last 3s before tab-close are lost; ordered album stays editable (no snapshot/freeze at order time).

### 🏗️ Infra, Deploy & Cost — functional but gated
- **[CRITICAL]** (same as security) CI ships empty Supabase config.
- **[HIGH]** Node drift (CI 22 vs local 24, docs say 20; no `.nvmrc`/`engines`); `npm install --legacy-peer-deps` (not `npm ci`) masks React-19 peer conflicts — non-reproducible builds.
- **[MEDIUM]** face-api model weights load from a **third-party CDN at runtime** (jsdelivr), unpinned, version-mismatched (lib 0.17 vs weights 0.22) — external uptime/privacy dependency.
- **[MEDIUM]** **1.69 MB single un-split JS bundle** + 313 KB global fabric loaded on *every* page (incl. marketing home); `dist` is 24 MB with ~23 MB of unoptimized images (`megy-character.png` alone 1.5 MB).
- **[NOTE]** Supabase Free **auto-pauses after 7 days inactivity** — a pre-launch low-traffic project's backend will go dark.

### ✅ Readiness & Compliance — NO-GO
- **[CRITICAL]** **No Privacy Policy, no Terms of Service, no data-deletion/account-erasure path, no cookie/consent.** The app collects **personal photos (sensitive PII)** + names/emails/phones/addresses. This violates GDPR Arts. 13–14 & 17 and CCPA notice/erasure. Hard legal gate.
- **[CRITICAL]** **Zero observability** — no Sentry/analytics/logging. Crashes, failed orders, auth failures are invisible to the operator. Only `console.error` in one boundary.
- **[CRITICAL]** **Zero automated tests**; CI quality gate is build-only; every push to main auto-deploys to prod.
- **[HIGH]** Error boundary wraps **only** `/builder` — a render error on Home/Order/auth = white screen. No global `unhandledrejection`/`error` handlers. Blocking global fabric `<script>` with no load-failure fallback.
- **[HIGH]** **`/about` is linked (nav + footer) but unrouted → blank page**; no 404 catch-all. Hard reliance on IndexedDB with no quota/unavailable fallback (Safari Private Mode evicts it).
- **[MEDIUM]** Minimal SEO (no meta description/OG/favicon/robots); HashRouter `/#/` URLs; modals lack focus trap/Esc/`role=dialog`; Order form labels not associated; dead footer links.

---

## 💰 Cost Analysis

**Why it's cheap:** the expensive thing (photo bytes) never touches paid infrastructure — it stays in the browser. Supabase rows are KB-sized JSON; egress is tiny; hosting is static.

| Resource | 100 users | 1,000 users | 10,000 users |
|---|---|---|---|
| GitHub Pages hosting | $0 | $0 | $0 |
| Pages bandwidth (~2 MB JS + ~2–4 MB images/first visit) | <1 GB ✓ | 5–15 GB ✓ | 50–150 GB ⚠ brushes ~100 GB soft cap |
| Supabase DB rows | <1 MB ✓ | 5–20 MB ✓ | 50–200 MB ✓ (<500 MB) |
| Supabase Auth (MAU) | Free (cap 50k) | Free | Free |
| Supabase egress (metadata only) | <0.1 GB ✓ | ~0.5 GB ✓ | 2–5 GB ⚠ near 5 GB Free cap |
| **Monthly infra total** | **$0** | **$0** | **$0–25** |
| **Binding constraint** | Free-tier 7-day auto-pause | none | Supabase egress → then Pages bandwidth |

**You don't leave free tiers until ~10k+ active users**, and the first trigger is Supabase egress → **Pro ~$25/mo**.

**The catch — this $0 model is an artifact of the missing half.** The moment you build real order/photo-upload/fulfillment infrastructure (which you *must* to sell anything), costs change:
- **Photo storage** (print-res originals) → Supabase Storage / S3 / R2: meaningful $ per GB at scale (this is the big new line item).
- **A backend** (orders, payments, webhooks, print-vendor API) → serverless or a small always-on host.
- **Payment processing** → ~2.9% + fixed per transaction (Stripe/PayMongo).
- **Email/notifications** → transactional email service.

**Real unit economics (out of codebase scope, but the actual business cost):** print **fulfillment COGS — paper, binding, ink, packaging, shipping — typically $10–40+ per album.** That dwarfs the $0–25/mo infra bill. *Nothing in the codebase models this.*

---

## Recommendations (prioritized roadmap)

### Phase 0 — Immediate safety (minutes, do regardless)
1. **Add `.env` to `.gitignore`**, remove `JWT_SECRET` from the frontend env, rotate it, confirm it's not in git history.
2. **Move Supabase config to GitHub repo Secrets** and inject them in `deploy.yml`; make the build **fail loudly** if they're missing (drop the `?? ''` fallback). Fix the `git add -A → public repo` instruction in `GITHUB_SETUP.md`.
3. **Verify RLS is actually enabled** in the live Supabase project for `albums` + `user_profiles`; make the storage bucket private or codify its policies in SQL.

### Phase 1 — Legal & observability gates (cannot launch without)
4. Publish **Privacy Policy + Terms of Service**, link in footer + signup + order; add **account/data-deletion** (GDPR Art. 17) and a **cookie/consent** notice.
5. Add **error monitoring (Sentry)** + basic order-funnel analytics. Wrap **all** routes in an app-level error boundary; add global `unhandledrejection`/`error` handlers.

### Phase 2 — Build the missing half (the actual product)
6. **Real order pipeline:** server-validated `orders` table (RLS) with order ID, album reference, **frozen album snapshot**, and merchant notification. Recompute **price server-side** (never trust the client); tie price to album size.
7. **Upload print-resolution photos to durable cloud storage** so albums survive device changes and there's something to print. Then **export-to-fulfillment** for the print vendor.
8. **Payment integration** (or an explicit "request a quote" pre-payment flow), with the album frozen against edits after ordering.

### Phase 3 — Correctness & hardening
9. Fix slot-fill index→ID referential integrity; add `updated_at` version guard to cloud upserts; remove the IndexedDB "stale wipe" path (the prior session's #3).
10. Remediate fabric XSS (upgrade + drop the duplicate global), `npm audit fix` the tar chain, plan removal of `face-api.js`; add a CSP (via `<meta>` or a header-capable host/CDN).
11. Add tests (order flow, auth, pricing) + lint/type-check/test gates in CI; use `npm ci`; pin Node via `.nvmrc`/`engines`; add a staging step instead of push-to-prod.

### Phase 4 — Polish
12. Route `/about` + add a 404; favicon + SEO meta/OG; fix dead footer links; accessible modals/forms (use the already-installed Radix Dialog); **code-split** builder-only heavy libs and compress images; warn users that photos are device-local until upload exists.

---

## Bottom line
- **As a free design tool:** ~80% there; cheap to run; fix Phase 0 + the legal basics and it could ship as a *demo/portfolio piece*.
- **As a business that takes money and prints albums:** the commerce + fulfillment half doesn't exist yet. That's Phase 2 — and it's where real infra cost (and the $10–40/order COGS) begins.
- **Hard gates before ANY real customer data/money:** Phase 0 + Phase 1, then Phase 2 #6–#8.
