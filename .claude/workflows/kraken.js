export const meta = {
  name: 'kraken',
  description: 'Kraken — fused offensive+correctness+behavioral audit: STATIC hunt (security vuln classes AND correctness/logic bugs) PROVEN by DYNAMIC persona-exploitation/repro (run the live backend as real users), cross-verified, with drafted repairs. Names a target each run.',
  phases: [
    { title: 'Recon', detail: 'read the target — roles, flows, schema, attack surface' },
    { title: 'Hunt', detail: 'static hunters per class: security vuln classes + correctness/logic bugs' },
    { title: 'Prove', detail: 'dynamic persona-exploitation + behavioral assertions against the live backend' },
    { title: 'Repair', detail: 'draft a fix for each LIVE-confirmed or behavioral finding' },
  ],
}

// ── Target resolution (name each run): args = "<name>" | {target} | {repoPath} ──
// Optional live backend for the dynamic PROVE phase:
//   args.live = { url, anonKey, serviceKey }  (a LOCAL throwaway Supabase, never prod)
const KNOWN = {
  churchos:   'C:/app',
  yayamove:   'C:/megy-prints-flashdrive/V1/Yayamove',
  megyprints: 'C:/megy-prints-flashdrive/V1/Megyprints-Clean',
}
let A = args
if (typeof A === 'string') { const s = A.trim(); A = (s.startsWith('{') ? (() => { try { return JSON.parse(s) } catch { return { target: s } } })() : { target: s }) }
A = A || {}
const targetName = (A.target || A.name || '').toString().toLowerCase().trim()
const REPO = A.repoPath || KNOWN[targetName] || A.repo
const LIVE = A.live && A.live.url && A.live.serviceKey ? A.live : null
if (!REPO) { return { error: 'No target. Pass a known name (churchos/yayamove/megyprints) or {repoPath}.' } }
// Optional FEATURE scope — audit just one feature instead of the whole app.
//   args.feature = "real-time provider map tracking"   (and/or)
//   args.paths   = ["src/components/ProviderMap.tsx", "src/hooks/useTracking.ts", ...]
const FEATURE = (A.feature || A.scope || '').toString().trim() || null
const PATHS = Array.isArray(A.paths) ? A.paths : (A.paths ? [A.paths] : null)
const SCOPE = (FEATURE || PATHS)
  ? `\n\n🎯 SCOPE — audit ONLY this feature/area, NOT the whole app: ${FEATURE || '(see paths)'}${PATHS ? `\nKnown relevant files/dirs: ${PATHS.join(', ')}` : ''}\nConcentrate recon, every hunter, the live exploitation, and the behavioral sim on THIS feature's files, tables, RPCs, realtime channels, storage, and flow. Ignore unrelated parts of the repo.`
  : ''
log(`🦑 Kraken target: ${REPO}${FEATURE ? `  ·  feature: "${FEATURE}"` : '  ·  whole app'}${LIVE ? `  ·  LIVE: ${LIVE.url}` : '  ·  STATIC-ONLY'}`)

const CLASSES = [
  { key: 'secrets', desc: 'committed keys/tokens/passwords, .env in git, service_role key in the client bundle' },
  { key: 'dependencies', desc: 'hallucinated/typosquatted (slopsquatting), abandoned, or known-CVE deps' },
  { key: 'xss', desc: 'dangerouslySetInnerHTML/innerHTML/document.write fed user/stored data; raw HTML sinks' },
  { key: 'log_injection', desc: 'user input written to console/logger/audit unsanitized (CWE-117)' },
  { key: 'authz_rls', desc: 'client-only checks, missing ownership checks, service_role misuse, RLS not matched by policy, IDOR, dead SECURITY-DEFINER guards gating on current_user/session_user' },
  { key: 'business_logic', desc: 'price/amount manipulation, state-machine bypass, escrow/refund strands, quota bypass, trust-flag self-elevation / tenant-hop' },
  { key: 'api_exposure', desc: 'three-door "every endpoint is a door" API/data-exposure audit (distinct from authz_rls/business_logic — focus on the three angles those miss). DOOR 1 EXCESSIVE DATA EXPOSURE: endpoints / RPCs / views / edge functions / select("*") returning MORE FIELDS than the client needs — PII, internal ids, other-users\' columns, secrets, pay/margin fields — relying on the client to filter (e.g. a public route leaking a teacher\'s pay rate; a "public directory" view re-joining private phone/legal-name columns). DOOR 2 ENUMERABLE IDs + INTRA-TENANT HORIZONTAL AUTHZ: (a) sequential/guessable ids (serial PKs, incrementing order/invoice numbers) leaking business VOLUME by inference even when RLS blocks the fetch (German-tank), and enabling BOLA when ownership is unchecked; (b) the high-value probe — ROLE-WITHIN-TENANT horizontal scoping: can role A read role B\'s peers\' rows INSIDE the same tenant (a teacher reading another teacher\'s students; one staffer another\'s records)? cross-tenant-only checks stay GREEN over this, and a fix applied to one table often leaves a SIBLING table (roster vs grades) open. DOOR 3 API-CONTRACT / VERSIONING MATURITY: unversioned/undocumented public contracts (webhooks, printed/QR codes, partner endpoints), missing request/response schema validation, breaking-change risk. ALSO flag MIGRATION↔LIVE DRIFT: a security fix applied out-of-band to the live DB but MISSING from the canonical migration chain silently re-opens on every fresh tenant / db reset. exploit_hypothesis must name the role, the exact object id/field enumerated or swapped, and the illegitimate rows/fields/inference returned.' },
  { key: 'cost_exposure', desc: 'DENIAL-OF-WALLET / resource-abuse — a PUBLIC, reachable-without-auth route that triggers PAID or UNBOUNDED work per request (the AI-era DoS). SCOPE GATE FIRST: raise NOTHING unless a route that anyone can hit without auth (api/, edge/serverless function, backend proxy) either (i) calls a metered pay-per-request API — api.anthropic.com / api.openai.com, a claude-* / gpt-* model string — or (ii) spins an unbounded loop / large fan-out / heavy query per request. When it does, flag each MISSING guardrail: (a) NO per-IP / per-session / per-user RATE LIMIT in front of the paid/unbounded call, so a scripted loop from browser devtools runs up the bill; (b) NO REQUEST-BODY / INPUT-SIZE CAP, so a giant payload balloons token spend; (c) the provider API KEY shipped to the CLIENT (VITE_ / NEXT_PUBLIC_ prefix, or bundled) = uncapped direct abuse; (d) client retry-on-error with no cap hammering the endpoint. An EXISTING throttle/rate-limit is the app protecting itself — respect it, NEVER flag its presence (same rule the dynamic verifier uses); this class is strictly about its ABSENCE on a metered/unbounded public surface. Mirrors the audit-side cost-operability module (b)+(e). exploit_hypothesis: the concrete unauth request loop (which route, from where) and the runaway cost / timeout / token-blowup it proves.' },
  { key: 'data_retention', desc: 'RETENTION-AWARE DELETION / compliance-destruction — deletion and "right-to-erasure" flows that HARD-DESTROY records the law requires kept after the relationship ends, plus the missing machinery around them. SCOPE GATE FIRST: applies ONLY if the app persists user/customer records server-side; raise NOTHING for purely local/client-side data. Hunt: (a) account-delete / admin-purge paths, ON DELETE CASCADE chains from users/accounts, delete-by-user_id sweeps, and storage-bucket purges that destroy REGULATED records (payment/invoice/ledger rows, tax-relevant transactions, signed agreements, medical/school/sacramental registers, security audit logs) — the user wants the data gone, the law says keep it; (b) NO user-data vs compliance-data split: one active/deleted toggle or full-row deletes, no anonymize-vs-retain path, no retention layer with an expiry attached; (c) NO retention schedule mapped to the app\'s ACTUAL industry + jurisdiction per record type (not one folk "7 years" for everything — e.g. PH: BIR books-of-accounts, Data Privacy Act 2012 proportionality); (d) NO erasure/retention audit trail proving what was retained vs anonymized vs destroyed and when each clock started/expires; (e) the INVERSE privacy bug — deletion CLAIMED but PII still live/readable afterward (soft-delete flag only, orphaned storage objects, PII left in logs). exploit_hypothesis cuts both ways: (1) as a persona with completed PAID orders, invoke the deletion path, then as service role count that persona\'s payment/ledger rows — zero rows = regulated records destroyed; (2) after a "successful" deletion, read the profile/PII back as service role — still-readable PII = a deletion lie.' },
  { key: 'correctness', desc: 'logic/correctness bugs (NOT security): off-by-one, null/undefined unhandled, wrong conditionals, missed edge cases (empty/large/duplicate/boundary input), unhandled error/rejection paths, await/async mistakes, race conditions, incorrect API usage, state left inconsistent. The "is this code actually right?" review — the bug-catching half of a code review.' },
]

const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, severity: { type: 'string', enum: ['critical','high','medium','low','info'] },
  file: { type: 'string' }, line: { type: 'string' }, evidence: { type: 'string' },
  exploit_hypothesis: { type: 'string', description: 'the concrete live action that PROVES it — security finding: the exploit (who/op/illegitimate result); correctness bug: the input/flow that triggers the wrong result, crash, or stuck state' },
}, required: ['title','severity','file','evidence','exploit_hypothesis'] } } }, required: ['findings'] }

const PROOF = { type: 'object', properties: {
  proof: { type: 'string', enum: ['live-confirmed','live-blocked','not-live-testable','static-only'] },
  confidence: { type: 'string', enum: ['high','medium','low'] },
  evidence: { type: 'string', description: 'what actually happened when the exploit was attempted live (or why not testable)' },
}, required: ['proof','confidence','evidence'] }

const BEHAVIOR = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, severity: { type: 'string', enum: ['critical','high','medium','low','info'] },
  category: { type: 'string', description: 'side-effect|reliability|validation|integrity|lifecycle' },
  evidence: { type: 'string', description: 'the run signal: a required side-effect that did not fire / bad input accepted / happy-path break' },
}, required: ['title','severity','category','evidence'] } } }, required: ['findings'] }

const REPAIR = { type: 'object', properties: {
  fixTitle: { type: 'string' }, approach: { type: 'string' },
  patch: { type: 'string', description: 'concrete diff / code / SQL' },
  riskOfFix: { type: 'string', enum: ['safe','moderate','risky'] }, requiresHuman: { type: 'boolean' },
}, required: ['fixTitle','approach','patch','riskOfFix','requiresHuman'] }

// ── RECON ────────────────────────────────────────────────────────────────────
phase('Recon')
const RECON_SCHEMA = { type: 'object', properties: {
  appSummary: { type: 'string' },
  roles: { type: 'array', items: { type: 'string' }, description: 'user roles + the signup metadata each needs' },
  critical_flows: { type: 'array', items: { type: 'string' } },
  attack_surface: { type: 'array', items: { type: 'string' }, description: 'the riskiest files/tables/RPCs to focus the hunt on' },
}, required: ['appSummary','roles','critical_flows','attack_surface'] }
const recon = await agent(
  `You are Kraken's recon. Read the target repo at ${REPO} (skip node_modules/dist/.git). Discover: the user ROLES (+ the auth/signup metadata each needs), the CRITICAL FLOWS (signup→pay→book→complete etc. with the real tables/RPCs/columns), the SIDE-EFFECTS each flow must produce, and the ATTACK SURFACE (riskiest files/tables/RPCs). This map feeds both a static vuln hunt and a live persona-simulation.${SCOPE}${SCOPE ? ' In attack_surface, list the EXACT files / tables / RPCs / realtime channels / storage buckets that implement THIS feature — that is precisely what the hunters and the live prover will target.' : ''}`,
  { label: 'recon', phase: 'Recon', schema: RECON_SCHEMA })
const ctx = `APP: ${recon?.appSummary}\nROLES: ${(recon?.roles||[]).join(', ')}\nFLOWS: ${(recon?.critical_flows||[]).join(' | ')}\nATTACK SURFACE: ${(recon?.attack_surface||[]).join(' | ')}`

// ── HUNT (static) × ── PROVE (dynamic cross-verify) per finding, pipelined ─────
phase('Hunt')
const hunts = await parallel(CLASSES.map((c) => () =>
  agent(
    `You are an offensive red-teamer hunting the **${c.key}** class (${c.desc}) in ${REPO}. Read the ACTUAL source (skip node_modules/dist/.git). Context:\n${ctx}${SCOPE}\n\nReturn only concrete, real instances with repo-relative file:line, the offending snippet as evidence, and a precise exploit_hypothesis: the live action a persona would take to exploit it (which role, which op/table/RPC, what illegitimate result proves it). Read-only.`,
    { label: `hunt:${c.key}`, phase: 'Hunt', schema: FINDINGS })
    .then((r) => ({ cls: c.key, findings: (r?.findings) || [] }))
))
const staticFindings = hunts.flatMap((h) => h.findings.map((f) => ({ ...f, cls: h.cls })))
log(`🦑 static hunt: ${staticFindings.length} candidate findings across ${CLASSES.length} classes`)

phase('Prove')
const proven = await parallel(staticFindings.map((f) => () => {
  if (LIVE) {
    return agent(
      `You are Kraken's DYNAMIC prover. A static hunter flagged a ${f.cls} finding in ${REPO}:\n` +
      `  title: ${f.title}\n  file: ${f.file}:${f.line || '?'}\n  evidence: ${f.evidence}\n  exploit_hypothesis: ${f.exploit_hypothesis}\n\n` +
      `PROVE it against the LIVE backend (LOCAL throwaway Supabase): url=${LIVE.url}, anonKey=${LIVE.anonKey}, serviceKey=${LIVE.serviceKey}. ` +
      `Using Bash + node/@supabase/supabase-js (or curl), provision the relevant persona (service-role admin createUser + sign in) and ACTUALLY ATTEMPT it — exploit the vuln, OR for a correctness bug feed the triggering input/flow (empty/boundary/duplicate input, the error path, the race). ` +
      `Return proof=live-confirmed ONLY if the illegitimate action succeeded OR the bug actually reproduced (cite the rows/result/error/wrong state), live-blocked if the backend correctly rejected it or the bug did NOT reproduce (false positive / already handled), or not-live-testable if it genuinely can't be reached via the API. Do not damage data beyond the throwaway test. Be honest — a blocked/non-reproducing attempt is a real result.`,
      { label: `prove:${f.cls}:${f.file}`, phase: 'Prove', schema: PROOF })
      .then((p) => ({ ...f, ...p }))
  }
  // static-only: code-level adversarial verify (no live backend)
  return agent(
    `Adversarially verify this ${f.cls} finding in ${REPO} at the CODE level (no live backend available).\n` +
    `  title: ${f.title}\n  file: ${f.file}:${f.line || '?'}\n  evidence: ${f.evidence}\n\n` +
    `Open the file; default to live-blocked (false positive) if mitigated (server-side RLS, framework escaping, value not user-controlled, file not client-shipped). Set proof=static-only with your confidence; note this was NOT live-proven.`,
    { label: `verify:${f.cls}:${f.file}`, phase: 'Prove', schema: PROOF })
    .then((p) => ({ ...f, ...p, proof: p.proof === 'live-blocked' ? 'live-blocked' : 'static-only' }))
}))

// Behavioral persona-sim (only meaningful with a live backend) — Verifier-style side-effect/lifecycle check
let behavioral = []
if (LIVE) {
  const b = await agent(
    `You are Kraken's behavioral Verifier against the LIVE backend (LOCAL Supabase): url=${LIVE.url}, anonKey=${LIVE.anonKey}, serviceKey=${LIVE.serviceKey}. Context:\n${ctx}${SCOPE}\n\n` +
    `Using Bash + node/@supabase/supabase-js: provision one authenticated user per role, then run 4-6 high-value scenarios across the critical flows as personas (diligent + a clumsy one feeding bad/edge inputs). After each, ASSERT via the service role that the required SIDE-EFFECTS fired (notifications to all parties, escrow/ledger rows, status transitions, audit entries). Clean up the synthetic users. Report findings ONLY for real signals: a required side-effect that silently didn't fire, bad input wrongly accepted, or a happy-path step that errored. Honest — "0 findings" is fine if true.`,
    { label: 'behavioral-sim', phase: 'Prove', schema: BEHAVIOR })
  behavioral = (b?.findings) || []
}

// ── REPAIR confirmed (live-confirmed static + all behavioral) ──────────────────
phase('Repair')
const confirmed = proven.filter(Boolean).filter((f) => f.proof === 'live-confirmed' || (!LIVE && f.proof === 'static-only' && (f.severity === 'critical' || f.severity === 'high')))
const repairs = await parallel(confirmed.map((f) => () =>
  agent(
    `Draft a concrete fix for this ${LIVE ? 'LIVE-CONFIRMED' : 'static'} ${f.cls} vuln in ${REPO}.\n  ${f.title}\n  ${f.file}:${f.line || '?'}\n  evidence: ${f.evidence}\n  proof: ${f.proof} — ${f.evidence}\n\nRead surrounding code; produce an apply-able diff/code/SQL that fits the style. requiresHuman=true for anything touching auth/money/data. Do NOT modify files — draft only.`,
    { label: `repair:${f.cls}:${f.file}`, phase: 'Repair', schema: REPAIR })
    .then((r) => ({ finding: f, repair: r }))
))

const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const sevSort = (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
return {
  target: REPO, live: !!LIVE,
  static_hunt: { candidates: staticFindings.length },
  findings: {
    live_confirmed: proven.filter((f) => f.proof === 'live-confirmed').sort(sevSort),
    blocked_false_positive: proven.filter((f) => f.proof === 'live-blocked'),
    static_only_unproven: proven.filter((f) => f.proof === 'static-only').sort(sevSort),
    not_live_testable: proven.filter((f) => f.proof === 'not-live-testable'),
    behavioral: behavioral.sort(sevSort),
  },
  repairs: repairs.filter(Boolean),
  note: LIVE ? 'Dynamic proof ran: live-confirmed findings were demonstrated by executing the exploit as a real persona.' : 'STATIC-ONLY run — no live backend passed, so findings are code-flagged but NOT live-proven. Re-run with args.live={url,anonKey,serviceKey} against a local throwaway Supabase for dynamic proof.',
}
