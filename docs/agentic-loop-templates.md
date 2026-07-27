# Agentic Loop Templates

A reusable catalog of agentic loops. Every loop below starts from the **same skeleton** so a new
loop is a fill-in-the-blanks exercise, not a blank page.

---

## The universal skeleton

```
observe → reason → act (via tools) → observe result → repeat until a stopping condition
                                   wrapped in guardrails
```

Every template specifies the same seven fields:

| Field | Question it answers |
|-------|---------------------|
| **Trigger / cadence** | What fires the loop? (cron, new commit, new event, threshold crossed) |
| **Observe (state)** | What does it look at each tick? |
| **Act (tools)** | What actions can it take? |
| **Observe result** | How does it know if the action worked? |
| **Stop / converge** | When does it stop, and why can't it spin forever? |
| **Guardrails** | What keeps it safe? (verification, human escalation, caps) |
| **Effort / payoff** | Build cost vs. business win. |

---

## When is something worth a loop? (the filter)

A concern deserves an agentic loop **only if it has all three**:

1. **A recurring trigger** — new commit, new error, nightly, new event in a queue.
2. **An observable signal** — coverage %, error rate, vuln count, p95 latency, a queue depth.
3. **A convergence / stop condition** — green, zero-new, below-threshold, or escalate-to-human.

If a thing is **set once** (auth model, initial HTTPS/headers, legal terms), it is *not* a loop —
though it often deserves a **Guardian loop** that watches it for regression.

---

## Three families

- **Product loops** — built *into* the app; fired by user/business events. Operate the business.
- **Build loops** — fired by *your own commits*; help build & maintain the codebase.
- **Guardian loops** — fired by *the world* (new CVEs, live errors, real traffic); keep prod healthy.

---

# Family 1 — Product loops

### P1. Verification / Triage Loop  *(Yayamove #1)*
Turns a queue of pending sign-ups into approve / reject / escalate decisions.
- **Trigger:** new provider application submitted.
- **Observe:** uploaded NBI clearance, ID, selfie.
- **Act:** OCR docs, validate ID format/number, face-match selfie ↔ ID, check blocklists.
- **Observe result:** confidence score per check.
- **Stop / converge:** auto-approve high-confidence, auto-reject clear fails, escalate the middle band to a human. Queue drains.
- **Guardrails:** confidence thresholds; human-in-loop for ambiguous; never auto-reject without a logged reason.
- **Effort / payoff:** Medium / **Huge**.
- *First cheap version:* OCR + format validation only; escalate everything else.

### P2. Fraud / AML Investigation Loop  *(Yayamove #2)*
Turns a raw risk score into an actual decision instead of just an alert.
- **Trigger:** transaction/account flagged above a risk threshold.
- **Observe:** the flagged entity + related history, velocity, device/IP overlap.
- **Act:** pull context, run policy checks.
- **Observe result:** updated risk verdict.
- **Stop / converge:** clear / hold / escalate to compliance — each flag reaches a terminal state.
- **Guardrails:** holds are reversible; every action logged for audit; cap auto-holds before forcing human review.
- **Effort / payoff:** Med-High / **High**.

### P3. Dispute / Refund Resolution Loop  *(Yayamove #3)*
Resolves customer–provider disputes against policy instead of dumping them on staff.
- **Trigger:** new dispute opened.
- **Observe:** both parties' claims + order evidence (delivery proof, timestamps, chat logs).
- **Act:** apply refund policy, propose a split.
- **Observe result:** policy match / contested?
- **Stop / converge:** auto-resolve clear-cut cases; escalate contested ones. Dispute closes or routes to human.
- **Guardrails:** money movement uses idempotent payout call; contested cases always escalate; proposed splits capped.
- **Effort / payoff:** Medium / **High**.

### P4. Reconciliation Loop  *(shipped — payout reconciler)*
Keeps two systems in agreement (released funds vs. actually-paid) without manual chasing.
- **Trigger:** cron, ~every 10 min.
- **Observe:** `payouts_outstanding` view — released, unpaid, past backoff.
- **Act:** POST to idempotent `xendit-payout`; record paid/failed.
- **Observe result:** returned status; failures record a backoff timestamp.
- **Stop / converge:** failures re-surface after backoff; escalate after 6 attempts so a row can't spin forever.
- **Guardrails:** atomic `claim_payout()` (no double-pay); exponential backoff; BATCH=50/tick.
- **Effort / payoff:** Medium / **High** (and it's your canonical worked example).

### P5. Moderation Loop  *(Yayamove #4 — cheapest, best teaching loop)*
Screens user-generated content before it goes live.
- **Trigger:** new content submitted (listing, review, photo, message).
- **Observe:** the pending item.
- **Act:** classify against policy (spam, abuse, prohibited items, PII), score severity.
- **Observe result:** severity score + category.
- **Stop / converge:** auto-approve clean, auto-hold clear violations, escalate gray-area. Nothing sits unscreened.
- **Guardrails:** bias toward escalate-not-delete; log every decision; human override.
- **Effort / payoff:** Low-Med / Medium — **best first build** (low blast radius).

### P6. Matching / Dispatch Loop  *(Yayamove #5)*
Pairs demand with supply (a job with the right provider).
- **Trigger:** new job request, or unmatched jobs on an interval.
- **Observe:** open jobs + available providers (location, rating, capacity).
- **Act:** rank candidates, offer the job, await accept/decline.
- **Observe result:** accepted / declined / timed out.
- **Stop / converge:** matched, or exhausted candidates → escalate / widen radius.
- **Guardrails:** fairness caps (don't starve providers); timeout per offer; cap re-offers.
- **Effort / payoff:** High / High — *defer until volume justifies it.*

### P7. Support / Deflection Loop  *(Yayamove #6)*
Answers common questions before they reach a human agent.
- **Trigger:** new support message / chat.
- **Observe:** the question + user context (order, account).
- **Act:** retrieve from knowledge base, draft an answer, optionally take an action (resend receipt, check status).
- **Observe result:** resolved? user satisfied?
- **Stop / converge:** answered & confirmed, or escalate to human with full context.
- **Guardrails:** never guess on money/legal; hand off cleanly; log what it couldn't answer (feeds the KB).
- **Effort / payoff:** Medium / Medium — *defer until ticket volume justifies it.*

### P8. Re-engagement / Lifecycle Loop
Wins back dormant users / providers.
- **Trigger:** scheduled (daily), segment by inactivity.
- **Observe:** users crossing an inactivity threshold.
- **Act:** choose an incentive/message, send via the right channel.
- **Observe result:** re-engaged? converted?
- **Stop / converge:** re-engaged, or marked churned after N attempts.
- **Guardrails:** frequency caps (no spamming); respect opt-out; budget cap on incentives.
- **Effort / payoff:** Low-Med / Medium.

### P9. Anomaly Monitoring Loop *(business metrics, not infra — see Guardian for infra)*
Watches business KPIs and acts on anomalies.
- **Trigger:** interval (hourly/daily).
- **Observe:** key metrics (orders, GMV, signups, cancellation rate).
- **Act:** detect deviation, diagnose likely cause, alert the right owner.
- **Observe result:** confirmed anomaly vs. noise.
- **Stop / converge:** alert raised with context, or noise suppressed.
- **Guardrails:** suppress duplicate alerts; threshold tuning to avoid alert fatigue.
- **Effort / payoff:** Medium / Medium.

---

# Family 2 — Build loops (fired by your commits)

### B1. Test-Gap / Red-Green Loop  *(from "Tests")*
- **Trigger:** new/changed files; or on demand.
- **Observe:** changed code with no/low coverage, or failing tests.
- **Act:** write or repair tests → run them.
- **Observe result:** pass/fail + coverage delta.
- **Stop / converge:** all green + coverage target met; escalate if a test reveals a real bug.
- **Guardrails:** never delete/weaken a test just to make it pass; cap iterations.
- **Effort / payoff:** Medium / High.

### B2. Code Review Loop  *(from "Code review")*
- **Trigger:** open diff / PR.
- **Observe:** the changeset.
- **Act:** fan out reviewers by dimension (bugs, security, perf, simplification), then adversarially verify each finding.
- **Observe result:** verified vs. refuted findings.
- **Stop / converge:** report confirmed findings only; drop the unverified.
- **Guardrails:** majority-vote before flagging; no auto-merge.
- **Effort / payoff:** Medium / High. *(You already use a version of this.)*

### B3. Doc / Schema Drift Loop  *(from "Documentation" + "Migrations")*
- **Trigger:** code changes that touch documented behavior or DB schema.
- **Observe:** stale docs / missing migrations.
- **Act:** update docs; generate the migration.
- **Observe result:** docs match code; schema reproducible from migrations.
- **Stop / converge:** in sync.
- **Guardrails:** migrations reviewed before prod; never auto-run destructive ones.
- **Effort / payoff:** Low-Med / Medium.

### B4. Migration Sweep Loop  *(large mechanical change across many files)*
- **Trigger:** on demand (rename, API change, framework upgrade).
- **Observe:** discover all call sites.
- **Act:** transform each site (isolated worktree to avoid conflicts) → verify each.
- **Observe result:** compiles/tests per site.
- **Stop / converge:** all sites migrated & verified; log any skipped.
- **Guardrails:** per-site verification; no silent truncation (log what was dropped).
- **Effort / payoff:** Medium / High for big sweeps.

### B5. Research / Spec Loop  *(from "before you build")*
- **Trigger:** on demand (a hard question or new feature).
- **Observe:** the question + existing code/docs/web.
- **Act:** multi-modal sweep (search by container, content, entity), deep-read, synthesize.
- **Observe result:** claims gathered + verified against sources.
- **Stop / converge:** cited answer; flag what couldn't be verified.
- **Guardrails:** adversarially verify claims; cite sources; mark uncertainty.
- **Effort / payoff:** Low-Med / High (kills rework).

---

# Family 3 — Guardian loops (fired by the world)

### G1. Dependency & Vuln Loop  *(from "Security" + "Ops")*
- **Trigger:** nightly, or on new CVE / package release.
- **Observe:** outdated packages, known CVEs.
- **Act:** bump → run tests → open PR.
- **Observe result:** tests pass? still vulnerable?
- **Stop / converge:** clean tree, no known vulns; escalate breaking majors to human.
- **Guardrails:** never auto-merge majors; tests must pass first.
- **Effort / payoff:** Low / High.

### G2. Error-Triage Loop  *(from "Observability")*
- **Trigger:** new error clusters in logs / Sentry.
- **Observe:** grouped new errors.
- **Act:** diagnose root cause, file an issue or propose a fix.
- **Observe result:** fixed / filed / known-benign.
- **Stop / converge:** every new cluster reaches a terminal state.
- **Guardrails:** rate-limit auto-fixes; humans own anything touching money/auth.
- **Effort / payoff:** Medium / High.

### G3. Performance Regression Loop  *(from "Performance & scale")*
- **Trigger:** p95 latency / slow-query threshold crossed.
- **Observe:** the slow path.
- **Act:** profile, identify bottleneck (often a missing index), propose fix.
- **Observe result:** measured before/after.
- **Stop / converge:** back under threshold; escalate if it needs an architecture change.
- **Guardrails:** measure before/after; no premature optimization.
- **Effort / payoff:** Medium / High.

### G4. Security-Posture Watcher  *(guards your "set-once" security work)*
- **Trigger:** on commit / deploy, or nightly.
- **Observe:** security headers present? CORS still locked? secrets committed? RLS intact?
- **Act:** alert (and/or block the deploy) on regression.
- **Observe result:** posture matches baseline?
- **Stop / converge:** posture green, or deploy blocked + human alerted.
- **Guardrails:** fail-closed (block on uncertainty); never auto-loosen a control.
- **Effort / payoff:** Low / High — *cheapest insurance for the red-team work you already did.*

### G5. Backup / Restore Verification Loop  *(from "Reliability")*
- **Trigger:** scheduled (e.g. weekly).
- **Observe:** latest backup.
- **Act:** restore it into a scratch environment, run a smoke check.
- **Observe result:** restore succeeded & data intact?
- **Stop / converge:** verified good, or alert that backups are broken.
- **Guardrails:** restore into isolated env only; never touch prod.
- **Effort / payoff:** Low / High — *an untested backup is not a backup.*

### G6. Monitoring / Observability-Readiness Audit  *(WIRED into Overseer — `src/agents/audit.ts` → `stackChecklist`)*
The "three questions every monitoring audit asks" turned into an enumerated pass, so Overseer catches *alert theater* on any deployable app instead of hoping the model happens to notice.
- **Trigger:** Overseer audits/onboards a deployable app (frontend or network service — gated by `isDeployedService`), or on deploy / nightly.
- **Observe:** (a) an EXTERNAL uptime probe (off-platform, not a self-reported `/health`); (b) CORRELATED telemetry — logs+metrics+traces tied by one request ID (OTel); (c) error capture (Sentry/equiv) actually LIVE — incl. the two traps we hit: a DSN-gated sink **blocked by the app's own CSP**, and monitoring **wired but never activated** (no DSN/env, no monitor pointed at it); (d) defined SLOs + error budgets.
- **Act:** enumerate each MISSING item as an `observability` finding → FIND → FIX → VERIFY (brother fixes; verify by tsc / boot / deploy).
- **Observe result:** is each of the four present AND activated?
- **Stop / converge:** all four green, or explicitly deferred with a written reason (e.g. multi-region / full OTel out of scope pre-scale).
- **Guardrails:** don't flag items genuinely present+wired; "outside-in only" (a server pinging itself doesn't count); activation lives in dashboards, so flag it — Overseer can't set the DSN or create the external monitor.
- **Effort / payoff:** Low / High — *cheapest defense against "we have monitoring" that goes quiet in a room.*

### G7. Declared-vs-Running Drift Audit  *(WIRED into Overseer — `src/modules/declared-vs-running.ts` + `declared_vs_running` red-team class)*
The one audit that refuses to read the repo. Every other loop here proves the *files* are right; this one asks whether the thing actually running matches them — because a committed, reviewed, never-applied migration is bit-for-bit identical to a fixed one.
- **Trigger:** Overseer audits a deployable app (`isDeployedService`), and on every deploy of a schema/policy/IaC change.
- **Observe:** (a) DECLARED BUT NOT RUNNING — a migration/policy in the chain with no evidence it was applied (no ledger row, no CI apply step, a runbook saying "run this by hand"); (b) RUNNING BUT NOT DECLARED — a live hotfix missing from the chain, which re-opens on every fresh tenant / reset / DR restore; (c) NO LEDGER — no authoritative applied-migration history, which makes (a) and (b) the *default* rather than a risk; (d) PARTIAL APPLY — the fix landed on its surface but not the twin holding the same data (table policies fixed, object-storage policies not); (e) PLATFORM-DEFAULT DRIFT — grants/env/flags live that no declared source asks for; (f) VERIFICATION READ THE WRONG THING — a suite that rebuilds a fresh DB from the chain and asserts on it can't catch (a)/(c)/(e) even in principle.
- **Act:** each missing item is an `ops` finding, severity set by what the drifted artifact GUARDS (a drifted security control is HIGH/CRITICAL) → FIND → FIX → VERIFY, where VERIFY means querying the live catalog, not re-reading the file.
- **Observe result:** does the running system's own state confirm the control? Where you can't ask it, mark the item **UNVERIFIED** — never pass it.
- **Stop / converge:** ledger initialized and authoritative, a CI apply step exists, and at least one live read-back check gates deploy-affecting changes.
- **Guardrails:** stay silent on a repo that already has all three. Don't fake the live diff — without production credentials the honest output is UNVERIFIED, and a repo-only "live" check reproduces the exact blindness this loop exists to name.
- **Effort / payoff:** Low / **Critical** — *the ChurchOS case: a HIGH-severity PII fix sat committed and unapplied for a week while every artifact a reviewer would consult said it was closed.*

---

## Universal guardrails (apply to every loop)

1. **Iteration / budget cap** — a hard ceiling so a loop can never spin forever.
2. **Human escalation path** — the loop's job is to *converge or escalate*, never to silently give up.
3. **Idempotency** — retries must not double-act (double-pay, double-send).
4. **Audit log** — every decision recorded with its reason.
5. **Fail-safe default** — when uncertain, do the *safe* thing (escalate, hold, block), not the convenient one.
6. **Reversibility** — prefer reversible actions; gate irreversible ones behind a human.

## How to choose what to build next

Score by **business win ÷ (effort × risk)**, and prefer a **low-blast-radius first build** so you
learn the anatomy before betting on a high-stakes loop.

- *Learning a new loop type?* Start with **P5 Moderation** or **G4 Security-Posture Watcher** — low risk, real value.
- *Highest business value?* **P1 Verification Triage** and **P2 Fraud/AML**.
- *Cheapest insurance?* **G1 Dependency/Vuln** and **G4 Security-Posture Watcher**.
