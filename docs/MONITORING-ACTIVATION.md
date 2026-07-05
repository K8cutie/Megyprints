# Monitoring — Activation Checklist

> Owner: you (dashboard steps) · Code side: wired, DSN-gated · Last updated: 2026-07-06

This is the "flip the switches" guide. The **code** for error monitoring is
already in the repo and **inert until you set an env var** — so nothing here
touches code, it's all dashboard clicks. Work top to bottom; each section says
roughly how long it takes and, honestly, what it does and does NOT cover.

Framed against the three questions every monitoring audit asks:

1. **If it goes down right now, how would you find out?** → §2 (external uptime)
2. **Can you trace a failing request fast?** → §1 (Sentry) + existing structured logs
3. **Do you have SLOs?** → Megyprints: not yet. Yayamove: see its `docs/SLO.md`.

---

## What's already wired (no action needed)

| Piece | Megyprints | Yayamove |
|---|---|---|
| Sentry SDK + DSN-gated init | ✅ `src/lib/sentry.ts` | ✅ `src/lib/sentry.ts` |
| Central error sink (`reportError`) | ✅ `src/lib/report.ts` | ✅ `src/lib/report.ts` |
| App-level ErrorBoundary → sink | ✅ `src/components/ErrorBoundary.tsx` | ✅ `src/components/ErrorBoundary.tsx` |
| Global `error` / `unhandledrejection` handlers | ✅ `src/main.tsx` | ✅ `src/main.tsx` |
| CSP `connect-src` allows Sentry ingest | ✅ `vercel.json` (US + generic hosts) | verify in its own config |
| Structured JSON logs w/ request_id (backend) | partial (Express `morgan`) | ✅ edge `_shared/log.ts` |
| Written SLOs / error budgets | ❌ not yet | ✅ `docs/SLO.md` |

**Everything below is the activation you (and only you) can do — it needs
external accounts and secrets that don't belong in the repo.**

---

## §1 — Turn on Sentry error monitoring  ·  ~10 min  ·  both apps

Catches "app is up but throwing errors" (JS exceptions, failed API calls,
render crashes). Does **not** catch a hard-down site (see §2 for why).

1. Create a free account at <https://sentry.io>.
2. **New Project** → platform **React** → name it `megyprints`. Repeat for
   `yayamove` (separate project = separate error stream + quota).
3. Copy the **DSN** — looks like
   `https://<key>@o<org>.ingest.us.sentry.io/<projectid>`. This is the
   *publishable* client DSN: public by design, safe in the frontend bundle
   (same trust model as the Supabase anon key — it only authorizes *sending*).
4. **Set it in Vercel:** Project → Settings → Environment Variables →
   add `VITE_SENTRY_DSN` = the DSN (Production + Preview). Do this for **both**
   Vercel projects.
5. **Redeploy** so Vite inlines it at build time (`VITE_*` are build-time only —
   setting the var without redeploying does nothing).
6. **Alert rules** (Sentry → Project → Alerts) — create at least two:
   - *New issue* → email/Slack on the first occurrence of any new issue.
   - *Issue frequency* → notify when an issue fires >~10×/hour (catches spikes).
7. **Verify:** temporarily `throw new Error("sentry smoke test")` in a component
   (or run `Sentry.captureException(new Error("test"))` in the browser console),
   confirm it lands in Sentry → **Issues**, then remove the test.

> ⚠️ **Non-US region:** if you picked an EU/other Sentry region, its ingest host
> is e.g. `*.ingest.de.sentry.io`. Add that host to `connect-src` in
> `vercel.json`, or the app's CSP will silently block every event. US + generic
> hosts are already allowlisted.

> **Deferred (optional):** source-map upload for readable production stack traces
> needs a build-only `SENTRY_AUTH_TOKEN` secret + `@sentry/vite-plugin`. Skip
> until minified traces actually slow you down. (Yayamove's `docs/observability.md`
> has the exact steps.)

---

## §2 — External uptime check  ·  ~10 min  ·  THE most important one

This is the real answer to *"if it goes down, how do you find out?"* — and it's
the one thing that **must** live off-platform. Sentry runs inside the user's
browser, so if the whole app is unreachable (Supabase outage, bad deploy, DNS),
**no browser loads it and Sentry never fires.** Only an outside prober catches
that.

1. Create a free account at <https://uptimerobot.com> (or Better Stack / Checkly
   free tier — Checkly can probe from multiple regions, closer to the gold
   standard of "outside-in from more than one place").
2. **Add monitors:**
   - **Yayamove API:** HTTP(s) monitor →
     `https://<project-ref>.supabase.co/functions/v1/health` → expect `200`.
     (The `health` edge function exists exactly for this — no auth, no DB hit.)
   - **Yayamove frontend:** HTTP(s) monitor → the live site URL → keyword check
     on a word you know is on the homepage.
   - **Megyprints frontend:** HTTP(s) monitor → `https://megyprints.vercel.app`
     → keyword check. (Megyprints has no public health endpoint in prod — the
     Express `/health` is an unshipped scaffold — so monitor the real URL.)
3. **Interval:** 5 min (free tier). **Alert contacts:** your email + a phone
   push (UptimeRobot app) so a 3am outage actually wakes someone.
4. Optionally publish a **public status page** (both tools offer one free).

> **Honest scope:** free single-region checks answer "is it up from *somewhere*."
> True multi-region synthetic monitoring (the video's "users in Singapore can't
> reach it") is a paid/Checkly feature — reasonable to defer pre-scale, but know
> that's the gap.

---

## §3 — Cron health/SLO alert (task "b")  ·  PENDING your input

A Vercel cron that periodically checks Supabase + app-level signals (e.g. 5xx
rate, and for Yayamove the `payouts_escalated` count) and pushes an alert. The
**code isn't in yet** — it needs one decision from you:

- **Alert channel:** Slack webhook, Discord webhook, or email API key?

Give me that and I'll add `api/health-check.mjs` + the `vercel.json` cron with
the secret as an env var. Note this complements §2 rather than replacing it: a
Vercel cron pinging a Vercel-hosted app is partly "the server asking itself," so
it's best for cross-service checks (Vercel → Supabase, business invariants), not
as your only outside-in prober.

---

## Two things only you can confirm right now

Neither is visible from the codebase — check your dashboards:

1. **Is `VITE_SENTRY_DSN` set in Vercel** for each app? (If blank, Sentry is a
   no-op no matter how good the wiring is.)
2. **Is any external monitor currently hitting the apps?** (If not, you're one
   Supabase outage away from finding out via a customer message.)

If both are "no," do §1 and §2 — together they're ~20 minutes and they close the
"alert theater" gap for real.
