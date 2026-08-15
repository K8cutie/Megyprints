# Idea: MedSpaOS — per-client analytics addon

**Captured:** 2026-08-15 · **Status:** idea only, nothing built · **Home repo:** `K8cutie/medspaos`
(Parked here because Megyprints is the working hub; move to the medspaos repo when it gets picked up.)

> "Show the website traffic for each client, number of bookings, etc." — a paid analytics
> addon on top of the multi-tenant platform, one dashboard per tenant.

"Client" here = **tenant** (one med-spa = one client of the agency), not the walk-in customer.

---

## Verdict: yes — but it's two features, not one

Checked against `medspaos@7cf08b6`. The two halves cost very different amounts:

| Half | Feasible today? | Why |
|---|---|---|
| **Bookings per client** | **Already sitting in the DB** | `inquiries` carries `tenant_id` + `created_at`. This is a query, not a feature. |
| **Website traffic per client** | **Needs new capture** | Nothing records a visit anywhere — no pageview table, no analytics script, no counter. |

### The bookings half is nearly free — with one honesty caveat

`public.inquiries` is already tenant-scoped, already RLS'd to members via `is_member(tenant_id)`,
already deduped by the `(tenant_id, idem_key)` unique constraint (so a double-submitted form
can't inflate the count — the number is trustworthy by construction).

Caveat: **inquiries are not bookings.** There's no appointments/scheduling model yet — the form
is a consult request. Label it "consult requests" in the UI until an appointments table exists,
or the first client who reconciles it against their calendar loses trust in the whole dashboard.

### The traffic half needs one new capture point — and there's a good one

Nothing tracks visits today. But `api/ssr.mjs` is already a chokepoint every public tenant page
flows through (the `vercel.json` catch-all rewrite sends everything that isn't `/portal`,
`/quality`, `/api/*` or a static asset to it), and it has **already resolved the tenant** by the
time it renders. Record the view there.

Server-side capture beats a client script here on every axis that matters:

- No third-party script — the existing CSP (`script-src 'self'`, `connect-src 'self' https://*.supabase.co`)
  would have to be widened for Plausible/GA/Fathom. First-party needs no CSP change.
- Ad-blocker-proof, so the numbers don't quietly under-report by 20–40%.
- No cookie, so no consent banner.
- **You own the data** — which is what makes it sellable as an addon rather than a link to someone
  else's dashboard.

---

## Sketch (follows existing schema doctrine: RLS on every table + explicit GRANTs)

```sql
create table public.page_views (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  path          text not null,
  referrer_host text,                 -- host only, never the full referring URL
  device        text,                 -- 'mobile' | 'desktop' | 'bot'
  visitor_hash  text,                 -- sha256(ip + ua + daily-rotating salt)
  created_at    timestamptz not null default now()
);
alter table public.page_views enable row level security;
```

RLS shape — **stricter than `inquiries`**, both directions:

- **No anon SELECT, ever.** Tenant A's traffic must not be readable by tenant B or the public.
  This is a tenant-bleed surface of exactly the kind the isolation witness exists to catch —
  add a row for it there.
- **No anon INSERT either.** Unlike `inquiries` (where public write *is* the product), writes come
  from the SSR function via the service role. Nobody should be able to forge traffic for a
  competitor's tenant, or spam-inflate their own numbers before a renewal conversation.
- Member read via `is_member(tenant_id)`; explicit GRANTs per doctrine.

`visitor_hash` with a **daily-rotating salt** gives unique-visitor counts without storing an IP,
and the rotation makes cross-day re-identification impossible by construction.

### Rollups, because raw rows grow fast

Add `page_view_daily (tenant_id, day, path, views, visitors)` and have the portal read **only**
the rollup. `vercel.json` already runs crons (`/api/ping` 09:00, `/api/reset` 08:30) — the rollup
job slots in beside them. Drop raw rows past 30–60 days.

### Portal surface

An **Analytics** tab inside the existing tenant switcher, so it inherits per-tenant scoping for free:
views · unique visitors · top pages · top referrers · consult requests · trend vs. previous period.

The number that makes it worth money:

> **conversion = consult requests ÷ unique visitors**

That's what turns "we built your site" into "your site turned M visitors into N leads last month."
It's the monthly value proof — the anti-churn artifact, and the natural commercial sequel to
`/quality`'s reliability receipts.

---

## Gotchas to remember

1. **Health-adjacent data.** These are med-spas. A path like `/aurora-skin/services/botox` plus an
   identifiable visitor is a health inference. Never join `visitor_hash` to `inquiries`, never store
   raw IP or full referrer URL, and keep the salt rotating.
2. **Bots will inflate everything.** Filter on UA and classify to `device='bot'` rather than dropping
   silently — a client comparing against their own tracker needs the discrepancy explainable.
3. **Layer 13 interaction.** Decide explicitly whether analytics rows belong in
   `snapshot_tenant`/`restore_tenant` blobs. Default: **exclude** — otherwise blobs bloat without
   bound and a restore replays stale traffic.
4. **The nightly `/api/reset` would wipe or skew demo analytics.** For the demo, seed synthetic
   traffic rather than showing three real-but-empty dashboards.
5. **Per-IP limiter is in-memory per instance** (`api/_lib/ratelimit.mjs`) — fine for its job, but
   don't reuse that store for dedupe/counting. Analytics must go to Postgres.

## Rough effort

- **~½ day** — table + migration, capture in `api/ssr.mjs`, basic portal panel reading raw rows.
- **~½ day** — daily rollup + retention, bot filtering, isolation-witness row, tests.

Small. The expensive part isn't the code — it's deciding what counts as a "booking" before a
client counts it for you.
