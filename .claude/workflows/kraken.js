export const meta = {
  name: 'kraken',
  description: 'Kraken — fused offensive+correctness+behavioral audit: STATIC hunt (security vuln classes AND correctness/logic bugs) PROVEN by DYNAMIC persona-exploitation/repro (run the live backend as real users), cross-verified, consolidated to one root cause per repair, with drafted repairs. Names a target each run.',
  phases: [
    { title: 'Recon', detail: 'read the target + per-class positive controls (can each hunter fire?)' },
    { title: 'Hunt', detail: 'static hunters per class: security vuln classes + correctness/logic bugs' },
    { title: 'Prove', detail: 'dynamic persona-exploitation + negative control + behavioral assertions' },
    { title: 'Consolidate', detail: 'cluster the confirmed findings to one root cause each' },
    { title: 'Repair', detail: 'draft ONE fix per root cause, on a reserved migration number' },
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
  { key: 'declared_vs_running', desc: 'DEPLOYMENT DRIFT — the gap between what the repo DECLARES (migration chain, IaC, policies, grants, config) and what is actually RUNNING. FRAMING FIRST: every other class here reads the repo, so against this one they are structurally blind — a correct-looking migration file is exactly what a never-applied fix looks like. Judge by what the RUNNING system would answer; where you cannot ask it, mark the item UNVERIFIED rather than passing it. Hunt: (a) DECLARED BUT NOT RUNNING — a migration/policy/IaC change in the canonical chain with no evidence it was applied to live (no ledger row, no CI apply step, a runbook saying "run this by hand"/"paste into the SQL editor", or a doc/commit/memory asserting a fix is done with no live verification behind it); a committed, reviewed security fix that never ran is a live hole with a paper trail claiming otherwise. (b) RUNNING BUT NOT DECLARED — a hotfix applied out-of-band to live and MISSING from the chain/IaC; it re-opens on every fresh tenant, db reset, DR restore, and new environment. (c) NO LEDGER, OR ONE NOBODY TRUSTS — no authoritative applied-migration history (schema_migrations/migration_history table, terraform state, a CI apply job), or one that is uninitialized or routinely bypassed; if the ledger is absent, (a) and (b) are not risks but the DEFAULT, and undetectable. Highest-leverage item — it is the control that makes the others self-checking. (d) PARTIAL APPLY / SIBLING-SURFACE MISS — a fix that landed on the surface it was written for but not the ANALOGOUS one holding the same data or granting the same power: table policies fixed but OBJECT/BLOB-STORAGE policies not, one API route fixed but its RPC/GraphQL twin not, prod fixed but staging/DR not. Enumerate the twins explicitly — the most common way a real fix leaves a real hole. (e) PLATFORM-DEFAULT / PRIVILEGE DRIFT — grants, roles, env vars, feature flags, or function versions live that NO declared source asks for (a drop-and-recreate re-applying a framework default grant, a console-toggled setting); nobody wrote it, the platform did, and it never appears in a diff. (f) VERIFICATION READ THE WRONG THING — do the tests/CI/audit prove the FILES or the RUNNING system? A suite that builds a fresh DB from the chain validates the chain, the one artifact already known correct, and cannot catch (a)/(c)/(e) even in principle. Raise NOTHING for a repo with an initialized ledger, a CI apply step, and a live read-back check.' },
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
  next_migration_prefix: { type: 'string', description: 'if the repo has supabase/migrations, the NEXT UNUSED numeric filename prefix, in the exact width the repo already uses (e.g. "0021" where the newest is 0020_x.sql, or "20260730000000" for timestamp-style). Empty string if there is no migrations directory.' },
}, required: ['appSummary','roles','critical_flows','attack_surface'] }
const recon = await agent(
  `You are Kraken's recon. Read the target repo at ${REPO} (skip node_modules/dist/.git). Discover: the user ROLES (+ the auth/signup metadata each needs), the CRITICAL FLOWS (signup→pay→book→complete etc. with the real tables/RPCs/columns), the SIDE-EFFECTS each flow must produce, and the ATTACK SURFACE (riskiest files/tables/RPCs). This map feeds both a static vuln hunt and a live persona-simulation.${SCOPE}${SCOPE ? ' In attack_surface, list the EXACT files / tables / RPCs / realtime channels / storage buckets that implement THIS feature — that is precisely what the hunters and the live prover will target.' : ''}\n\n` +
  `ALSO: list supabase/migrations (if it exists) and report next_migration_prefix — the next unused numeric prefix in the width the repo already uses. Repair agents are each handed a distinct reserved number off this base so two drafted migrations can never collide on one prefix.`,
  { label: 'recon', phase: 'Recon', schema: RECON_SCHEMA })

/** Reserve the i-th migration number after the repo's next free prefix, preserving zero-padded width.
 *  BigInt so 14-digit timestamp-style prefixes don't lose precision. */
const bumpPrefix = (p, i) => {
  const s = String(p || '').trim()
  if (!/^\d+$/.test(s)) return null
  return (BigInt(s) + BigInt(i)).toString().padStart(s.length, '0')
}
const ctx = `APP: ${recon?.appSummary}\nROLES: ${(recon?.roles||[]).join(', ')}\nFLOWS: ${(recon?.critical_flows||[]).join(' | ')}\nATTACK SURFACE: ${(recon?.attack_surface||[]).join(' | ')}`

// ── POSITIVE CONTROL (L001) — prove the hunters can still FIRE before trusting any "clean" ──
// A class that returns zero findings is only admissible as "clean" if, THIS run, the same hunter
// pipeline caught a KNOWN planted vuln OF THAT CLASS.
//
// The earlier version planted three vulns (secrets/xss/authz_rls), required all three, and then
// licensed ALL classes off that single verdict — so business_logic, cost_exposure, data_retention,
// correctness, log_injection and dependencies were each certified "clean" on the strength of a
// control that never exercised their hunter. The gate overclaimed exactly where it mattered.
//
// Now every class carries its OWN plant and earns its OWN verdict, and the controls run
// class-specialized — the same shape as the real hunters — so admissibility is per-class.
// A control agent that dies leaves no entry, which reads as NOT fired: fail-closed.
const PLANTS = [
  { cls: 'secrets', file: 'supabaseAdmin.ts', code: [
      "import { createClient } from '@supabase/supabase-js';",
      'const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLANTED_service_role_secret_canary.sig";',
      "export const admin = createClient('https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY);",
    ], hit: (t) => t.includes('service_role') || t.includes('service role') || t.includes('hardcoded') || t.includes('committed') || (t.includes('secret') && t.includes('key')) },

  { cls: 'dependencies', file: 'package.json', code: [
      '{',
      '  "dependencies": {',
      '    "lodash": "4.17.4",',
      '    "reqeusts": "^1.0.0",',
      '    "left-pad": "0.0.3"',
      '  }',
      '}',
    ], hit: (t) => t.includes('lodash') || t.includes('typosquat') || t.includes('slopsquat') || t.includes('reqeusts') || t.includes('cve') || t.includes('prototype pollution') || t.includes('left-pad') || t.includes('unmaintained') || t.includes('abandoned') || t.includes('vulnerable version') },

  { cls: 'xss', file: 'Comment.tsx', code: [
      'export function Comment({ userInput }) {',
      '  return <div dangerouslySetInnerHTML={{ __html: userInput }} />;',
      '}',
    ], hit: (t) => t.includes('dangerouslysetinnerhtml') || t.includes('innerhtml') || t.includes('xss') || t.includes('sanitiz') },

  { cls: 'log_injection', file: 'auth.js', code: [
      "app.post('/login', (req, res) => {",
      "  console.log('login attempt for user: ' + req.body.username);",
      "  logger.info('failed login, agent=' + req.headers['user-agent']);",
      '});',
    ], hit: (t) => t.includes('log injection') || t.includes('cwe-117') || t.includes('log forg') || t.includes('unsanitized') || t.includes('newline') || t.includes('crlf') || t.includes('log poison') },

  { cls: 'authz_rls', file: 'orders.js', code: [
      "app.get('/api/orders/:id', async (req, res) => {",
      "  const { data } = await supabase.from('orders').select('*').eq('id', req.params.id);",
      '  res.json(data);',
      '});',
    ], hit: (t) => t.includes('idor') || t.includes('ownership') || t.includes('authoriz') || t.includes('any order') || t.includes('any authenticated') || t.includes('broken access') || t.includes('bola') },

  { cls: 'business_logic', file: 'checkout.ts', code: [
      'export async function checkout(req) {',
      '  const { itemId, quantity, unitPrice } = req.body;',
      '  const total = unitPrice * quantity;',
      "  await supabase.from('orders').insert({ item_id: itemId, quantity, total, status: 'paid' });",
      '}',
    ], hit: (t) => t.includes('price') || t.includes('amount') || t.includes('client-controlled') || t.includes('client-supplied') || t.includes('manipulat') || t.includes('tamper') || t.includes('total') },

  { cls: 'api_exposure', file: 'api/staff.ts', code: [
      '// PUBLIC endpoint — no auth required',
      "app.get('/api/staff', async (_req, res) => {",
      "  const { data } = await supabase.from('staff').select('*'); // row carries password_hash, pay_rate, home_address",
      '  res.json(data);',
      '});',
    ], hit: (t) => t.includes('excessive') || t.includes('over-expos') || t.includes('overexpos') || t.includes('pii') || t.includes('password_hash') || t.includes('pay_rate') || t.includes('select(') || t.includes('all columns') || t.includes('more fields') },

  { cls: 'cost_exposure', file: 'api/summarize.mjs', code: [
      '// public, unauthenticated serverless route',
      'export default async function handler(req, res) {',
      "  const r = await fetch('https://api.anthropic.com/v1/messages', {",
      "    method: 'POST',",
      "    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY },",
      "    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: req.body.text }] }),",
      '  });',
      '  res.json(await r.json());',
      '}',
    ], hit: (t) => t.includes('rate limit') || t.includes('rate-limit') || t.includes('denial of wallet') || t.includes('denial-of-wallet') || t.includes('unbounded') || t.includes('throttl') || t.includes('spend') || t.includes('body size') || t.includes('cost') },

  { cls: 'data_retention', file: '0005_payments.sql', code: [
      'create table payments (',
      '  id uuid primary key,',
      '  user_id uuid references auth.users(id) on delete cascade,',
      '  amount numeric not null,',
      '  issued_at timestamptz not null default now()',
      ');',
      'create function delete_account(p_user uuid) returns void language sql as $$',
      '  delete from auth.users where id = p_user;',
      '$$;',
    ], hit: (t) => t.includes('retention') || t.includes('cascade') || t.includes('regulated') || t.includes('financial record') || t.includes('destroy') || t.includes('tax') || t.includes('erasure') || t.includes('audit trail') || t.includes('books') },

  { cls: 'declared_vs_running', file: '0042_orders_rls.sql', code: [
      '-- committed to supabase/migrations/, and referenced in DEPLOY.md as "applied"',
      'alter table public.orders enable row level security;',
      'create policy "owner only" on public.orders for all',
      "  using ((auth.jwt() ->> 'email') = 'owner@example.com');",
      '-- CI has no apply step; migrations are run by hand from the dashboard',
      '-- when convenient, and supabase_migrations.schema_migrations has no row',
      '-- for 0042 on the live project.',
    ], hit: (t) => t.includes('drift') || t.includes('not applied') || t.includes('never applied') || t.includes('unapplied') || t.includes('ledger') || t.includes('declared') || t.includes('running') || t.includes('by hand') || t.includes('manual') },
  { cls: 'correctness', file: 'render.ts', code: [
      'export function renderNames(rows: { name: string }[]) {',
      '  const out: string[] = [];',
      '  for (let i = 0; i <= rows.length; i++) {',
      '    out.push(rows[i].name.toUpperCase());',
      '  }',
      '  return out;',
      '}',
    ], hit: (t) => t.includes('off-by-one') || t.includes('off by one') || t.includes('out of bounds') || t.includes('out-of-bounds') || t.includes('undefined') || t.includes('<=') || t.includes('length') },
]
const descOf = (k) => (CLASSES.find((c) => c.key === k) || {}).desc || ''
const controls = await parallel(PLANTS.map((p) => () =>
  agent(
    `You are a Kraken hunter for the **${p.cls}** class (${descOf(p.cls)}).\n\n` +
    `Below is a SELF-CONTAINED synthetic fixture — treat it as the single file "${p.file}". It is NOT real app code. Find every problem of YOUR class in it and return findings with file:line, the offending snippet as evidence, and an exploit_hypothesis. It is only a few lines; do not skip anything obvious.\n\n\`\`\`\n${p.code.join('\n')}\n\`\`\``,
    { label: `control:${p.cls}`, phase: 'Recon', schema: FINDINGS })
    .then((r) => {
      const fs = (r && r.findings) || []
      const txt = fs.map((f) => `${f.title} ${f.evidence} ${f.exploit_hypothesis || ''}`.toLowerCase()).join(' \n ')
      return { cls: p.cls, fired: fs.length > 0 && p.hit(txt), returned: fs.length }
    })
))
const controlByClass = Object.fromEntries(controls.filter(Boolean).map((c) => [c.cls, c]))
const controlFiredFor = (k) => !!(controlByClass[k] && controlByClass[k].fired)
const controlsBlind = CLASSES.map((c) => c.key).filter((k) => !controlFiredFor(k))
log(controlsBlind.length === 0
  ? `✅ positive control FIRED for all ${CLASSES.length} classes — any class reporting 0 findings is admissible as CLEAN`
  : `⚠ positive control did NOT fire for: ${controlsBlind.join(', ')} — if any of those report 0 findings, that is UNVERIFIED, not clean`)

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

const provePrompt = (f) =>
  `You are Kraken's DYNAMIC prover. A static hunter flagged a ${f.cls} finding in ${REPO}:\n` +
  `  title: ${f.title}\n  file: ${f.file}:${f.line || '?'}\n  evidence: ${f.evidence}\n  exploit_hypothesis: ${f.exploit_hypothesis}\n\n` +
  `PROVE it against the LIVE backend (LOCAL throwaway Supabase): url=${LIVE.url}, anonKey=${LIVE.anonKey}, serviceKey=${LIVE.serviceKey}. ` +
  `Using Bash + node/@supabase/supabase-js (or curl), provision the relevant persona (service-role admin createUser + sign in) and ACTUALLY ATTEMPT it — exploit the vuln, OR for a correctness bug feed the triggering input/flow (empty/boundary/duplicate input, the error path, the race). ` +
  `Run the illegitimate action under the PERSONA'S OWN token, never the service key — the service key is for provisioning and for reading ground truth back, and an "exploit" that only succeeds while holding it proves nothing. State in your evidence which credential performed the action. ` +
  `Return proof=live-confirmed ONLY if the illegitimate action succeeded OR the bug actually reproduced (cite the rows/result/error/wrong state), live-blocked if the backend correctly rejected it or the bug did NOT reproduce (false positive / already handled), or not-live-testable if it genuinely can't be reached via the API. Do not damage data beyond the throwaway test. Be honest — a blocked/non-reproducing attempt is a real result, and hypotheses that do not survive contact with the backend are exactly what this step exists to kill.`

// ── NEGATIVE CONTROL — prove the PROVER can still say NO ──────────────────────
// The positive control proves the hunters can fire. Nothing proved the prover can REFUSE.
// Over the first three targets only 9 of 111 candidates ever came back live-blocked, and a block
// rate that low is unreadable: it looks identical whether the hunters are unusually precise or
// the prover simply agrees with whatever hypothesis it is handed. The prompt above says "PROVE
// it", which is a confirmation-shaped instruction — so the risk is real and needs measuring.
//
// So we slip decoys into the same prove queue: findings that are plausible, concretely testable,
// and MITIGATED BY THE PLATFORM ITSELF in every Supabase install — PostgREST exposes only the
// `public` schema (never `auth`), and /auth/v1/admin/* demands the service role. A prover doing
// real work returns live-blocked on both. They carry ordinary class names, cite a file that
// genuinely exists, and ride the same queue under the same concurrency, so the prover cannot
// tell them from real work. If a decoy comes back live-confirmed, this run's confirmations are
// suspect and the report must say so out loud.
const DECOYS = !LIVE ? [] : [
  { cls: 'authz_rls', decoyKey: 'auth-schema-anon-read', file: 'supabase/config.toml', line: '?',
    severity: 'critical', title: 'PostgREST exposes the auth schema, so the anon key reads auth.users directly — every email and encrypted_password',
    evidence: "The exposed-schema configuration does not restrict PostgREST to `public`, so the auth schema is reachable over REST. A plain supabase-js client built with the bundled anon key can select email and encrypted_password straight off auth.users.",
    exploit_hypothesis: "As an anonymous visitor holding only the public anon key, select email and encrypted_password from auth.users through PostgREST (REST path /rest/v1/users with Accept-Profile: auth, or .schema('auth').from('users')) and receive every registered account's credentials." },
  { cls: 'api_exposure', decoyKey: 'gotrue-admin-anon', file: 'supabase/config.toml', line: '?',
    severity: 'critical', title: 'GoTrue admin endpoints accept the anon key — anyone can enumerate every registered user',
    evidence: 'Nothing restricts which GoTrue endpoints the publishable anon key may call, so the admin user-directory route answers a request that presents the anon key as both apikey and bearer token.',
    exploit_hypothesis: 'As an anonymous caller, GET /auth/v1/admin/users with the anon key as both the apikey header and the Authorization bearer, and receive the complete list of registered users with their emails and metadata.' },
]

const proveQueue = [
  ...staticFindings.map((f) => ({ isDecoy: false, f })),
  ...DECOYS.map((f) => ({ isDecoy: true, f })),
]
const proveResults = await parallel(proveQueue.map(({ isDecoy, f }) => () => {
  if (LIVE) {
    return agent(provePrompt(f), { label: `prove:${f.cls}:${f.file}`, phase: 'Prove', schema: PROOF })
      .then((p) => ({ ...f, ...p, isDecoy }))
  }
  // static-only: code-level adversarial verify (no live backend)
  return agent(
    `Adversarially verify this ${f.cls} finding in ${REPO} at the CODE level (no live backend available).\n` +
    `  title: ${f.title}\n  file: ${f.file}:${f.line || '?'}\n  evidence: ${f.evidence}\n\n` +
    `Open the file; default to live-blocked (false positive) if mitigated (server-side RLS, framework escaping, value not user-controlled, file not client-shipped). Set proof=static-only with your confidence; note this was NOT live-proven.`,
    { label: `verify:${f.cls}:${f.file}`, phase: 'Prove', schema: PROOF })
    .then((p) => ({ ...f, ...p, proof: p.proof === 'live-blocked' ? 'live-blocked' : 'static-only', isDecoy }))
}))
const proven = proveResults.filter(Boolean).filter((r) => !r.isDecoy).map(({ isDecoy, ...f }) => f)
const decoyRuns = proveResults.filter(Boolean).filter((r) => r.isDecoy)
const decoysPassed = decoyRuns.filter((d) => d.proof === 'live-blocked')
const decoysFailed = decoyRuns.filter((d) => d.proof === 'live-confirmed')
const negControl = !LIVE
  ? { ran: false, reason: 'static-only run — no backend for a decoy to be refused by; the code-level verify path is already adversarially framed (defaults to false-positive)' }
  : {
      ran: true, decoys: decoyRuns.length, blocked: decoysPassed.length, wrongly_confirmed: decoysFailed.length,
      // Only a clean sweep licenses the confirmations. Inconclusive (not-live-testable) is not a pass.
      proverDiscriminates: decoyRuns.length > 0 && decoysFailed.length === 0 && decoysPassed.length === decoyRuns.length,
      detail: decoyRuns.map((d) => ({ decoy: d.decoyKey, proof: d.proof, evidence: (d.evidence || '').slice(0, 400) })),
    }
if (LIVE) {
  log(negControl.proverDiscriminates
    ? `✅ negative control PASSED — the prover refused ${decoysPassed.length}/${decoyRuns.length} planted decoys, so live-blocked is a verdict it can actually reach`
    : `⚠ negative control DID NOT PASS — ${decoysFailed.length} decoy(s) came back live-confirmed, ${decoyRuns.length - decoysPassed.length - decoysFailed.length} inconclusive. Treat every live-confirmed finding this run as unfiltered.`)
}

// Behavioral persona-sim (only meaningful with a live backend) — Verifier-style side-effect/lifecycle check
let behavioral = []
if (LIVE) {
  const b = await agent(
    `You are Kraken's behavioral Verifier against the LIVE backend (LOCAL Supabase): url=${LIVE.url}, anonKey=${LIVE.anonKey}, serviceKey=${LIVE.serviceKey}. Context:\n${ctx}${SCOPE}\n\n` +
    `Using Bash + node/@supabase/supabase-js: provision one authenticated user per role, then run 4-6 high-value scenarios across the critical flows as personas (diligent + a clumsy one feeding bad/edge inputs). After each, ASSERT via the service role that the required SIDE-EFFECTS fired (notifications to all parties, escrow/ledger rows, status transitions, audit entries). Clean up the synthetic users. Report findings ONLY for real signals: a required side-effect that silently didn't fire, bad input wrongly accepted, or a happy-path step that errored. Honest — "0 findings" is fine if true.`,
    { label: 'behavioral-sim', phase: 'Prove', schema: BEHAVIOR })
  behavioral = (b?.findings) || []
}

const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const sevSort = (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
const worstOf = (sevs) => sevs.slice().sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9))[0] || 'info'

// ── CONSOLIDATE — one root cause per repair ───────────────────────────────────
// Ten class-specialized hunters looking at one codebase means one defect gets reported many
// times over. On the first Megyprints run a single unguarded RPC came back as four separate
// confirmed findings (authz_rls, business_logic, api_exposure, correctness) plus a behavioral
// one; the paid-proxy weakness came back three times. That inflates the count, buries the real
// shape of the problem, and — worst — sends four repair agents off to draft four overlapping
// migrations, every one of them numbered 0019. Two migrations sharing a numeric prefix make the
// ledger silently skip one.
//
// Consolidation runs AFTER prove on purpose. Deduping before would be cheaper, but four lenses
// independently exploiting the same defect is corroboration, and corroboration is evidence worth
// keeping. So we prove everything, then cluster: the members stay attached to their cluster, and
// exactly one repair is drafted per root cause, on a migration number reserved for it alone.
phase('Consolidate')
const confirmed = proven.filter((f) => f.proof === 'live-confirmed' || (!LIVE && f.proof === 'static-only' && (f.severity === 'critical' || f.severity === 'high')))

const CLUSTERS = { type: 'object', properties: { clusters: { type: 'array', items: { type: 'object', properties: {
  root_cause: { type: 'string', description: 'the single underlying defect, named so a fixer knows what to change' },
  primary_file: { type: 'string', description: 'the file where the fix belongs' },
  member_ids: { type: 'array', items: { type: 'number' }, description: 'ids of every finding this root cause explains' },
}, required: ['root_cause','primary_file','member_ids'] } } }, required: ['clusters'] }

/** Rebuild the agent's clustering so it cannot lose or double-count a finding: unknown and
 *  repeated ids are dropped, and anything left unassigned survives as its own cluster.
 *  Severity is recomputed as the worst among members, which also settles the case where the
 *  same root cause came back HIGH from one lens and MEDIUM from another. */
const normalizeClusters = (raw, items) => {
  const out = []
  const seen = new Set()
  for (const c of (Array.isArray(raw) ? raw : [])) {
    const ids = [...new Set((Array.isArray(c && c.member_ids) ? c.member_ids : []).map(Number))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < items.length && !seen.has(i))
    if (!ids.length) continue
    ids.forEach((i) => seen.add(i))
    out.push({ root_cause: c.root_cause || items[ids[0]].title, primary_file: c.primary_file || items[ids[0]].file,
               severity: worstOf(ids.map((i) => items[i].severity)), member_ids: ids })
  }
  for (let i = 0; i < items.length; i++) {
    if (!seen.has(i)) out.push({ root_cause: items[i].title, primary_file: items[i].file, severity: items[i].severity, member_ids: [i], unclustered: true })
  }
  return out.sort(sevSort)
}

let clusters = []
if (confirmed.length > 1) {
  const c = await agent(
    `You are Kraken's consolidator. The ${confirmed.length} findings below were each independently confirmed against ${REPO}. They came from ten class-specialized hunters, and several lenses routinely flag THE SAME underlying defect from different angles — one unguarded RPC can surface as an authz finding, a business-logic finding, a data-exposure finding and a correctness bug all at once.\n\n` +
    confirmed.map((f, i) => `#${i} [${f.severity}] (${f.cls}) ${f.file}:${f.line || '?'}\n    ${f.title}\n    evidence: ${(f.evidence || '').slice(0, 300)}`).join('\n\n') +
    `\n\nGroup these into ROOT CAUSES — one cluster per underlying defect that a SINGLE fix would close. Two findings belong together when the same edit closes both, even when they cite different files (a client-side gate and the RLS policy behind it are one root cause). Keep them apart when closing one would leave the other open, even when they cite the same file. Name each root cause so a fixer knows what to change, and point primary_file at where the fix belongs.\n\n` +
    `Every id 0..${confirmed.length - 1} must appear in exactly one cluster. Do not drop any, and do not invent ids.`,
    { label: 'consolidate', phase: 'Consolidate', schema: CLUSTERS })
  clusters = normalizeClusters(c && c.clusters, confirmed)
} else {
  clusters = confirmed.map((f) => ({ root_cause: f.title, primary_file: f.file, severity: f.severity, member_ids: [0] }))
}
log(`🦑 consolidated ${confirmed.length} confirmed findings → ${clusters.length} distinct root cause(s)`)

// ── REPAIR — one fix per root cause, on a reserved migration number ────────────
phase('Repair')
const repairs = await parallel(clusters.map((cl, idx) => () => {
  const members = cl.member_ids.map((i) => confirmed[i])
  const migPrefix = bumpPrefix(recon && recon.next_migration_prefix, idx)
  return agent(
    `Draft ONE concrete fix for this ${LIVE ? 'LIVE-CONFIRMED' : 'static'} root cause in ${REPO}.\n\n` +
    `ROOT CAUSE: ${cl.root_cause}\n  severity: ${cl.severity}  ·  fix belongs in: ${cl.primary_file}\n\n` +
    `${members.length} independent hunter lens(es) confirmed it. Fix the CAUSE once, in a way that closes every symptom below:\n` +
    members.map((m) => `  • [${m.cls}] ${m.file}:${m.line || '?'} — ${m.title}\n    proof (${m.proof}): ${(m.evidence || '').slice(0, 500)}`).join('\n') +
    `\n\nRead the surrounding code and produce ONE apply-able diff/code/SQL that fits the existing style and closes all of the above. ` +
    (migPrefix
      ? `If the fix needs a Supabase migration it MUST be a NEW file named exactly ${migPrefix}_<slug>.sql. That number is reserved for this root cause alone this run — do not reuse any other prefix and do not renumber, because two migrations sharing a numeric prefix make the ledger silently skip one. `
      : '') +
    `requiresHuman=true for anything touching auth/money/data. Do NOT modify files — draft only.`,
    { label: `repair:${cl.primary_file}`, phase: 'Repair', schema: REPAIR })
    .then((r) => ({ rootCause: cl.root_cause, severity: cl.severity, primary_file: cl.primary_file,
                    migration_prefix: migPrefix, confirmedBy: members.length, findings: members, repair: r }))
}))

// L001 — per class: did it report anything, and if not, did ITS OWN control fire this run?
// A class that reported findings needs no control; it demonstrably fired on real code. A class
// that reported nothing is "clean" only where its own plant was caught.
const perClass = CLASSES.map((c) => {
  const found = staticFindings.filter((f) => f.cls === c.key).length
  const ctl = controlFiredFor(c.key)
  return { class: c.key, findings: found, control_fired: ctl,
           status: found > 0 ? 'reported-findings' : (ctl ? 'clean-verified' : 'clean-UNVERIFIED') }
})
const cleanVerified = perClass.filter((p) => p.status === 'clean-verified').map((p) => p.class)
const cleanUnverified = perClass.filter((p) => p.status === 'clean-UNVERIFIED').map((p) => p.class)

const warnings = []
if (cleanUnverified.length) warnings.push(`⚠ DETECTOR BLIND ON ${cleanUnverified.length} CLASS(ES) (L001): ${cleanUnverified.join(', ')} reported 0 findings AND their own positive control did not fire, so they are UNVERIFIED — not clean. Re-run before treating them as covered.`)
if (LIVE && !negControl.proverDiscriminates) warnings.push(`⚠ NEGATIVE CONTROL DID NOT PASS: the prover did not refuse all ${negControl.decoys} planted decoys (${negControl.wrongly_confirmed} wrongly confirmed). Its live-confirmed verdicts were not filtered by anything this run — downgrade confidence accordingly.`)

return {
  target: REPO, live: !!LIVE,
  detector: {
    // Verified means BOTH halves held: every hunter proved it can fire, and the prover proved it can refuse.
    verified: cleanUnverified.length === 0 && (!LIVE || negControl.proverDiscriminates),
    per_class: perClass,
    positive_control: { fired_for: CLASSES.map((c) => c.key).filter(controlFiredFor), blind_for: controlsBlind },
    negative_control: negControl,
    clean_verified: cleanVerified,
    clean_unverified: cleanUnverified,
    admissibility: cleanUnverified.length === 0
      ? `every class either reported findings or passed its own positive control — the ${cleanVerified.length} class(es) with 0 findings are admissible as CLEAN`
      : `⚠ ${cleanUnverified.length} class(es) reported 0 findings with no working control this run (${cleanUnverified.join(', ')}) — UNVERIFIED, not clean`,
  },
  static_hunt: { candidates: staticFindings.length, confirmed: confirmed.length, distinct_root_causes: clusters.length },
  findings: {
    live_confirmed: proven.filter((f) => f.proof === 'live-confirmed').sort(sevSort),
    blocked_false_positive: proven.filter((f) => f.proof === 'live-blocked'),
    static_only_unproven: proven.filter((f) => f.proof === 'static-only').sort(sevSort),
    not_live_testable: proven.filter((f) => f.proof === 'not-live-testable'),
    behavioral: behavioral.sort(sevSort),
  },
  // One entry per root cause, each carrying the findings that corroborate it. Report these —
  // the raw live_confirmed list above is the evidence trail, not the headline count.
  root_causes: clusters.map((cl) => ({ root_cause: cl.root_cause, severity: cl.severity, primary_file: cl.primary_file,
    confirmed_by: cl.member_ids.length, classes: [...new Set(cl.member_ids.map((i) => confirmed[i].cls))],
    unclustered: !!cl.unclustered })),
  repairs: repairs.filter(Boolean),
  note: warnings.join(' ') + (warnings.length ? ' ' : '') +
    (LIVE ? 'Dynamic proof ran: live-confirmed findings were demonstrated by executing the exploit as a real persona.' : 'STATIC-ONLY run — no live backend passed, so findings are code-flagged but NOT live-proven. Re-run with args.live={url,anonKey,serviceKey} against a local throwaway Supabase for dynamic proof.'),
}
