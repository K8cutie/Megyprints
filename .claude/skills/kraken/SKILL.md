---
name: kraken
description: >-
  Release the Kraken — the fused offensive+behavioral auditor (Red Team × Dynamic Verifier) on a
  NAMED target. Trigger when the user says "release the kraken [on <target>]" or "/kraken <target>".
  It hunts security vuln classes AND correctness/logic bugs in the code, proves each by live
  persona-exploitation/repro against a throwaway backend, surfaces silent side-effect/behavioral bugs,
  and drafts repairs. Name the target each run (e.g. churchos, yayamove, megyprints, or a repo path).
---

# 🦑 Kraken — release-the-kraken

Kraken fuses the two auditors so they cover each other's blind spots:
- **Static hunt:** reads code, hunts security vuln *classes* (secrets/deps/xss/log-injection/authz-rls/business-logic/api-exposure/**cost-exposure** — denial-of-wallet: a public unauth route that triggers paid or unbounded work with no rate-limit/body-cap — /**data-retention** — retention-aware deletion: a delete/erasure flow that hard-destroys records the law requires kept after the relationship ends, or its inverse, a deletion that leaves PII live) **+ correctness/logic bugs** (off-by-one, null/edge-cases, error paths, races — the bug-catching half of a code review). Blind to runtime truth on its own.
- **Verifier (dynamic):** runs the live backend as personas, proves what *actually* happens. Blind to code-level classes.
- **Kraken = hunt statically → PROVE dynamically (execute the exploit as a real persona) → cross-verify → draft repairs.** A finding is only "confirmed" once it is BOTH code-identified AND live-demonstrated.

## Trigger
Fire this skill when the user says **"release the kraken"**, with a target ("release the kraken on churchos", "/kraken yayamove"). The user names a target each run; if none is named, ask which.

**Feature scoping (preferred for "I just built/changed X"):** the user can scope Kraken to ONE feature instead of the whole app — e.g. *"release the kraken on yayamove's maps tracking feature"* or *"...on the new checkout flow."* Parse the feature phrase into `args.feature` (a short description), and if you can identify the implementing files, pass `args.paths` too. Scoped runs are faster, cheaper, and ideal as a per-feature security+behavioral review right after building it.

## Procedure
1. **Resolve the target** → repo path. Known: `churchos`→`C:/app`, `yayamove`→`C:/megy-prints-flashdrive/V1/Yayamove`, `megyprints`→`C:/megy-prints-flashdrive/V1/Megyprints-Clean`. Otherwise treat the argument as a repo path.
2. **Stand up the LIVE backend for dynamic proof (strongly preferred).** Kraken is far stronger with a live backend — it's the difference between "code says this is exploitable" and "I just exploited it." For a Supabase app: bring up a **LOCAL throwaway** Supabase (`npx supabase start`; apply the schema/migrations + a seed if needed), then capture the local creds via `npx supabase status` (API URL, anon key, service_role key). **LOCAL throwaway only — NEVER point Kraken at a hosted/production backend.** If a live backend genuinely can't be stood up, proceed STATIC-ONLY and say so explicitly.
3. **Launch the engine:** run the `kraken` workflow (`.claude/workflows/kraken.js`) via the Workflow tool with
   `args = { target: "<name>", repoPath: "<path>", feature: "<feature desc or omit>", paths: ["<file>", ...] | omit, live: { url, anonKey, serviceKey } }`
   (omit `live` for a static-only run; omit `feature`/`paths` for a whole-app run). It recons → hunts (the security-vuln + correctness classes in the workflow's `CLASSES` list) → proves each finding live → runs a behavioral persona-sim → drafts repairs — all concentrated on the feature scope when given.
4. **Report by ROOT CAUSE, not by raw finding count.** Ten class-specialized hunters mean one defect
   gets reported many times over — the first Megyprints run turned one unguarded RPC into four
   confirmed findings plus a behavioral one. The workflow now consolidates after the prove step, so:
   - **Lead with `result.root_causes`** — one entry per distinct defect, each carrying `confirmed_by`
     (how many independent lenses proved it) and `classes`. Multiple lenses on one root cause is
     **corroboration, not duplication** — say "confirmed by 4 independent lenses," don't report it four times.
   - `result.findings.live_confirmed` is the **evidence trail** behind those root causes, not the headline.
     Still group it by proof strength when showing detail: 🔴 live-confirmed (exploit actually executed) ·
     behavioral (persona-sim side-effect/lifecycle bugs) · static-only (code-flagged, NOT live-proven — say so) ·
     blocked/false-positive (the backend correctly refused).
   - `result.repairs` is one drafted fix per root cause. Each carries a `migration_prefix` **reserved for it
     alone this run** — when applying, keep that number. Two migrations sharing a numeric prefix make the
     ledger silently skip one.
   - **Detector admissibility — read `result.detector` before reporting anything as clean.** Two gates:
     - **Positive control (per class):** every class has its own planted vuln that its own hunter must catch.
       `detector.clean_unverified` lists classes that reported 0 findings *and* whose control did not fire —
       those are **UNVERIFIED, not clean.** Name them and re-run; never report a false all-clear.
       `detector.clean_verified` are the ones genuinely admissible as clean.
     - **Negative control (the prover):** decoy findings that the platform mitigates in every Supabase install
       are slipped into the prove queue. If `detector.negative_control.proverDiscriminates` is false, the prover
       never demonstrated it can return live-blocked, so **this run's confirmations were not filtered by
       anything** — report them with that caveat rather than as proven.
   - **Environment parity caveat:** live-confirmed means confirmed *against the local throwaway stack*. When a
     finding depends on backend config rather than app code (auth auto-confirm, exposed schemas, open signup),
     say which local setting it rested on — prod may differ, and that cuts both ways.
5. **Offer to close the loop:** apply the repairs for confirmed findings, then **re-release the Kraken** to prove they're fixed (find → fix → re-prove).

## Scan state & incremental runs (resume / new-only)
Kraken remembers what it has scanned **per target** so a later run can cover **the whole target** or **only what's new/changed since last time** (much cheaper — fewer files → fewer agents → fewer tokens; ideal when conserving budget).

**State file (per target):** `Megyprints-Clean/.claude/kraken-state/<target>.json`
```json
{ "target": "yayamove", "repoPath": "C:/.../Yayamove", "lastRun": "<ISO>",
  "lastScannedCommit": "<git sha>", "lastMode": "full|new",
  "scannedFiles": { "<repo-rel path>": "<sha when last scanned>" },
  "openFindings": [ "...carried-over unresolved findings..." ],
  "runs": [ { "date": "", "mode": "", "commit": "", "files": 0, "findings": 0 } ] }
```

**On each run, pick a mode** — if the user doesn't say, ask: *"whole target, or only the new/unscanned since last run?"*
- **full** → scan the whole target (or feature). After: set every current file's entry in `scannedFiles` to current HEAD; `lastScannedCommit = HEAD`.
- **new** (incremental) → read the state, compute the scan set with git:
  - never-scanned = `git -C <repo> ls-files` **minus** the keys already in `scannedFiles`
  - changed-since = `git -C <repo> diff --name-only <lastScannedCommit>..HEAD`
  - **scan set = (never-scanned ∪ changed-since)** → pass it to the workflow as `args.paths` so only those files are hunted + proven.
  - If the set is empty → tell the user *"nothing new since <lastRun> @ <sha7> — everything current is already scanned; run **full** to re-scan."*
  - If there's **no prior state** → first run; do **full** and say so.

**After every run:** update `scannedFiles` for the covered files (→ HEAD sha), set `lastRun`/`lastScannedCommit`/`lastMode`, append a `runs` entry, carry forward still-open findings, and write the JSON back.

**Always report the coverage picture:** *"Last scan: \<date\> (\<mode\>, \<sha7\>). This run: \<mode\>, N files. Ever-scanned: X/Y current files. Never-scanned remaining: \<list/count\>."* — so you always know what's covered and what's still pending.

## Safety rails
- Live backend = **LOCAL throwaway only**, never production. Hunt is read-only. Repairs are **drafted, not auto-applied** (apply only on the user's go, on a branch, verified).
- `npx supabase stop` the local stack when done.
- Honesty: a static-only run is clearly weaker — say "code-flagged, NOT live-proven" and offer the dynamic re-run.
