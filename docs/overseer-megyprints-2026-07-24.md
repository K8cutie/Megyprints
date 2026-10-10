# 🛠 Overseer suite — Megyprints (2026-07-24)

**Loop:** FIND → **FIX** → VERIFY. Output is *fixed*, not *found*.
**Branch:** `overseer/megyprints-suite-2026-07-24` (not pushed — reviewable).
**Gates:** `tsc -b` ✅ · `vite build` ✅ · `vitest run` ✅ 13/13 · live experiential walk ✅

---

## Phase 0 — precondition discovery
- Build passed at baseline; app runs. React+Vite SPA (HashRouter) + Supabase (20 migrations) + 4 Vercel serverless handlers + small Express backend.
- **Security organ NOT re-hunted:** the Kraken ran full on HEAD `7417209` (2026-07-21, 63 agents, 23 live-confirmed → fixed in `0019`/`0020`, re-proven). Only a CI-workflow deletion has landed since, so a fresh Kraken would report *"nothing new."* Folded in as a reconciliation lens instead of ~5M wasted tokens.
- Dynamic testers: browser experiential walk ✅ · Simworld **skipped-loudly** (no Megyprints world) · Mobile crew **skipped-loudly** (no M0).

## Phase 1 — static hunt (9-lens Critique panel → fail-closed adversarial verify)
35 agents, 2.1M tokens. **22 findings confirmed**, 4 refuted (nginx-mount misread, over-claimed parity test, 2 overstated test gaps). Plus 1 live-caught in the walk.

## Phase 2 — FIXED (this branch)

### 🔴 High
1. **About route + catch-all** *(live-caught)* — `About.tsx` existed and Navbar+Footer linked `/about`, but no route was registered → blank screen. Added the route + a `*`→home catch-all. `App.tsx`. **Verified live.**
2. **Builder toolbar "Order" skipped `setPendingPrintJob`** → checkout priced the wrong album + shipped a mismatched cover PDF. Lifted both entry points through one `handleOrder`. `BuilderPreview.tsx`.
3. **Print text scaled by a hardcoded `576`** instead of the true `getCanvasDimensions()` authoring width (750 for squares/landscape) → captions/quotes printed ~1.3× oversized. Now scales by `W/uiW`. `printPipeline.ts`. ⚠️ *changes printed output — see "needs physical proof".*
4. **Checkout swallowed all failures** — never reached `reportError`/Sentry. Instrumented the 3 catch sites. `Order.tsx`.
5. **Builder error boundary console-only** — crashes never reached Sentry. Routed through `reportError`. `BuilderErrorBoundary.tsx`.
6. **Zero pricing tests** → added `vitest` + `pricing.spec.ts` (13 assertions: items sum == total across the size×binding×page matrix, non-negative, monotonic, surcharge isolation).

### 🟠 Medium
- **Contact form silently discarded every message** behind a fake "Message Sent!" → now inserts to a `contact_messages` table with honest success/error states. `Contact.tsx` + migration `0021`.
- **Operator "Set price" stored `NaN`→`null`** (order looked priced, wasn't) → sanitized parse + validation. `OrdersPanel.tsx`.
- **Iconify clipart fetches had no timeout** (permanent spinner) → `AbortSignal.timeout(8000)`. `clipart.ts`.
- **3 MB face-api chunk shipped eagerly on Home/checkout** → lazy-loaded the whole builder subtree (`BuilderRoute`) + Admin. **Entry chunk 2,990 KB → 1,538 KB (−49%).** `App.tsx` + `BuilderRoute.tsx`.
- **Fabric.js (313 KB) render-blocked every page** → `defer`. `index.html`.
- **QR resolver swallowed DB errors** → structured `console.error` (code only, never the destination URL). `api/m.mjs`.
- **No transition-machine regression guard** → added a static guard to `regression-checks.sql`. Contact-normalization tests → `contact.spec.ts`.

### 🟡 Low
- **`status_history` client-supplied on insert** → BEFORE-INSERT trigger seeds it server-side. Migration `0022`.
- **Theme proxies swallowed errors** → logged. `theme-quotes.mjs`, `theme-keywords.mjs`.
- **Checkout could price at default 3× before store-settings loaded** → readiness gate blocks Pay/Proceed until loaded. `storeSettings.ts` + `Order.tsx`.

## Phase 3 — dynamic proof (verified live on the dev server)
- `/about` renders "We're Megy Prints" (was blank). ✅
- Unknown hash `#/this-route-does-not-exist` → redirected home. ✅
- Builder mounts under lazy-load (full size-picker wizard). ✅
- Console clean across the walk (only the headless-sandbox WebGL warnings, environmental). ✅
- Build + 13 tests green; entry chunk halved. ✅

---

## ⚠️ Needs your decision (surfaced, NOT auto-applied)

**Owner authority = mintable JWT email claim** (HIGH, carried open from the Kraken).
`config.toml:226` has `enable_confirmations = false` and every owner gate keys off `auth.jwt() ->> 'email'` against two hardcoded Gmails (`0007:41`). With auto-confirm + open signup, if an owner Gmail is ever unregistered on the project, anyone can `signUp({email: <owner>})` and mint an owner session. The drafted fix was never applied because it's a **prod auth change with real trade-offs**:
- **Option A (surgical):** re-pin owner authority to a verified `auth.uid()` allowlist (new migration). *Risk: seed it wrong → owner locked out of the live console.*
- **Option B (config):** set `enable_confirmations = true` (kills the mint) — but forces email verification on **all** customer signups (a UX change on a low-friction builder), and must also be flipped in the linked project's dashboard.

I left both undone deliberately. Tell me which and I'll apply + verify.

## Next steps (mechanical, on your go)
- `npm run db:push` — applies `0021_contact_messages` + `0022_orders_status_history_pin` to the linked project (both additive/low-risk; the contact form's happy path needs `0021`).
- Deploy the branch. Follow-up (not done — editor-risk): make Fabric.js load **on-demand** so its 313 KB isn't downloaded on non-builder pages (only `defer`'d here).
