export const meta = {
  name: 'red-team',
  description: 'Red team: hunt → verify → repair across attack classes on one or more repos (static/code-level, read-only, fixes drafted not applied)',
  whenToUse: 'Periodic deep security audit of a codebase. Finds business-logic / RLS / auth / secrets / dependency / XSS issues, adversarially verifies each, and drafts a fix. Pass a repo path (or array, or {repos,classes}) as args; defaults to Megyprints + Yayamove.',
  phases: [
    { title: 'Hunt', detail: 'parallel offensive hunters per repo × attack class' },
    { title: 'Verify', detail: 'adversarially confirm each finding is real' },
    { title: 'Repair', detail: 'draft a fix/hardening for each confirmed finding' },
  ],
}

// ── Defaults (used when no args given) ──────────────────────────────────────
const DEFAULT_REPOS = [
  { name: 'Megyprints', path: 'C:/megy-prints-flashdrive/V1/Megyprints-Clean' },
  { name: 'Yayamove',   path: 'C:/megy-prints-flashdrive/V1/Yayamove' },
]

const ALL_CLASSES = [
  { key: 'secrets', desc: 'Committed API keys, tokens, passwords; .env files tracked in git; the Supabase SERVICE_ROLE key exposed to the frontend bundle; any credential in client-shipped code.' },
  { key: 'dependencies', desc: 'package.json deps that are hallucinated/nonexistent or typosquatted (slopsquatting), abandoned, or pinned to versions with known CVEs. Flag anything not a well-known package; if web tools are available, verify the package exists on the npm registry.' },
  { key: 'xss', desc: 'dangerouslySetInnerHTML / innerHTML / outerHTML / document.write / insertAdjacentHTML fed by user-controlled or stored data; rendering raw HTML/SVG; unsanitized content reflected into the DOM. React auto-escapes by default, so focus on the explicit raw-HTML sinks.' },
  { key: 'log_injection', desc: 'User-controlled input written to console/logger/audit records without sanitization (CWE-117) — newline/format injection into logs.' },
  { key: 'authz_rls', desc: 'Code-level authorization gaps: reliance on client-side checks, missing ownership checks, service_role used where anon should be, RLS assumptions not matched by policy, IDOR via predictable ids.' },
  { key: 'business_logic', desc: 'Pricing/amount manipulation, state-machine bypass (e.g. self-marking paid/completed), escrow/refund strands, quota/rate bypass, trust-flag self-elevation.' },
  { key: 'api_exposure', desc: 'Three-door "every endpoint is a door" API/data-exposure audit — the angles authz_rls/business_logic miss. DOOR 1 EXCESSIVE DATA EXPOSURE: endpoints / RPCs / views / edge functions / select("*") returning MORE FIELDS than the client needs (PII, internal ids, other-users\' columns, secrets, pay/margin fields), relying on the client to filter — e.g. a public route leaking a teacher\'s pay rate, a public directory view re-joining private phone/legal-name columns. DOOR 2 ENUMERABLE IDs + INTRA-TENANT HORIZONTAL AUTHZ: (a) sequential/guessable ids (serial PKs, incrementing order/invoice numbers) that leak business VOLUME by inference even when RLS blocks the fetch (German-tank), and enable BOLA when ownership is unchecked; (b) the high-value probe — ROLE-WITHIN-TENANT horizontal scoping: does a policy let role A read role B\'s peers\' rows INSIDE the same tenant (a teacher reading another teacher\'s students; one staffer another\'s records)? A cross-tenant-only RLS test stays green over this, and a scoping fix on one table often leaves a SIBLING table (roster vs grades) tenant-wide. DOOR 3 API-CONTRACT / VERSIONING MATURITY: unversioned/undocumented public contracts (webhooks, printed/QR codes, partner endpoints), missing request/response schema validation, breaking-change risk. Also flag MIGRATION↔LIVE DRIFT: a fix applied out-of-band to the live DB but MISSING from the canonical migration chain silently re-opens on every fresh tenant / db reset.' },
  { key: 'data_retention', desc: 'RETENTION-AWARE DELETION / compliance-destruction. SCOPE GATE FIRST: applies ONLY if the app persists user/customer records server-side; raise NOTHING for purely local/client-side data. Hunt: (a) account-delete / admin-purge paths, ON DELETE CASCADE chains from users/accounts, delete-by-user_id sweeps, and storage purges that HARD-DESTROY records the law requires kept AFTER the relationship ends (payment/invoice/ledger rows, tax-relevant transactions, signed agreements, medical/school/sacramental registers, security audit logs) — the user wants it gone, the law says keep it; (b) NO user-data vs compliance-data split (one active/deleted toggle or full-row deletes, no anonymize-vs-retain path, no retention layer with an expiry); (c) NO retention schedule mapped to the app\'s ACTUAL industry + jurisdiction per record type (not a blanket "7 years" — e.g. PH: BIR books-of-accounts, Data Privacy Act 2012 proportionality); (d) NO erasure/retention audit trail proving what was retained vs anonymized vs destroyed and when each clock started/expires; (e) the INVERSE bug — deletion CLAIMED but PII still live/readable (soft-delete flag only, orphaned storage, PII left in logs). The correct shape is a policy engine: classify → anonymize user data → retain regulated records with an expiry → log; note its absence as the root finding.' },
]

// ── Normalize args → { repos, classes } ─────────────────────────────────────
// args forms:
//   undefined                              → default repos, all classes
//   "C:/path/to/repo"                      → that one repo, all classes
//   ["C:/a", "C:/b"]                       → those repos, all classes
//   { repos: [...paths or {name,path}], classes: ["xss","secrets"] }
function repoFromPath(p) {
  const name = (String(p).split(/[\\/]/).filter(Boolean).pop()) || String(p)
  return { name, path: p }
}
function normRepos(a) {
  if (!a) return DEFAULT_REPOS
  if (typeof a === 'string') return [repoFromPath(a)]
  if (Array.isArray(a)) return a.map((x) => (typeof x === 'string' ? repoFromPath(x) : x))
  if (typeof a === 'object') {
    if (Array.isArray(a.repos)) return a.repos.map((x) => (typeof x === 'string' ? repoFromPath(x) : x))
    if (a.path) return [{ name: a.name || repoFromPath(a.path).name, path: a.path }]
  }
  return DEFAULT_REPOS
}
function normClasses(a) {
  if (a && typeof a === 'object' && Array.isArray(a.classes) && a.classes.length) {
    const want = new Set(a.classes)
    const picked = ALL_CLASSES.filter((c) => want.has(c.key))
    if (picked.length) return picked
  }
  return ALL_CLASSES
}

// Coerce args: accept a real object/array, OR a JSON string (some callers
// stringify it), OR a bare repo path string. A non-JSON string is treated as a path.
let ARGS = args
if (typeof ARGS === 'string') {
  const s = ARGS.trim()
  if (s.startsWith('{') || s.startsWith('[')) {
    try { ARGS = JSON.parse(s) } catch (e) { ARGS = args }
  }
}

const REPOS = normRepos(ARGS)
const CLASSES = normClasses(ARGS)

// ── Schemas ─────────────────────────────────────────────────────────────────
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          file: { type: 'string', description: 'repo-relative path' },
          line: { type: 'string', description: 'line number or range, or "" if not applicable' },
          description: { type: 'string' },
          evidence: { type: 'string', description: 'the offending code snippet or fact' },
          exploitability: { type: 'string', description: 'how an attacker would actually use this' },
        },
        required: ['title', 'severity', 'file', 'description', 'evidence'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean', description: 'true only if genuinely exploitable / a real defect — default to false if uncertain' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
  },
  required: ['isReal', 'confidence', 'reasoning'],
}

const REPAIR = {
  type: 'object',
  properties: {
    fixTitle: { type: 'string' },
    approach: { type: 'string', description: 'how the fix works' },
    patch: { type: 'string', description: 'concrete diff, code, or SQL migration to apply' },
    requiresHuman: { type: 'boolean', description: 'true if this fix is risky/ambiguous and a human must review before applying' },
    riskOfFix: { type: 'string', enum: ['safe', 'moderate', 'risky'] },
  },
  required: ['fixTitle', 'approach', 'patch', 'requiresHuman', 'riskOfFix'],
}

// ── Run ─────────────────────────────────────────────────────────────────────
const tasks = []
for (const repo of REPOS) for (const cls of CLASSES) tasks.push({ repo, cls })

log(`Red team scope: ${REPOS.map((r) => r.name).join(', ')} × ${CLASSES.map((c) => c.key).join(', ')} = ${tasks.length} hunters`)

// ── POSITIVE CONTROL (L001) — prove the hunters can FIRE before trusting any "clean" repo/class ──
// A repo/class that returns no findings is admissible as "clean" only if, this run, the same hunter
// pipeline caught a KNOWN planted vuln. One hunter gets an inline canary with three unambiguous
// plants (committed service_role key / raw-HTML sink fed user input / ownership-free IDOR fetch);
// it must catch all three. If not, the detector is blind this run and clean results are UNVERIFIED.
const CANARY = [
  '// SYNTHETIC CANARY FIXTURE — not real app code; three planted vulns the hunter MUST catch.',
  'const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PLANTED_service_role_secret_canary.sig"; // committed secret',
  'export function Comment({ userInput }) {',
  '  return <div dangerouslySetInnerHTML={{ __html: userInput }} />; // raw HTML sink fed user-controlled input',
  '}',
  "app.get('/api/orders/:id', async (req, res) => {",
  '  // no ownership check — any authenticated user reads ANY order by guessable id (IDOR / broken authz)',
  "  const { data } = await supabase.from('orders').select('*').eq('id', req.params.id);",
  '  res.json(data);',
  '});',
].join('\n')
const control = await agent(
  `You are an offensive security red-teamer. Below is a SELF-CONTAINED code fixture (treat it as one file "canary.tsx"). Find every security vulnerability in it and return findings with file:line, the offending snippet as evidence, and how an attacker would exploit it. Do not skip anything obvious.\n\n\`\`\`tsx\n${CANARY}\n\`\`\``,
  { label: 'positive-control', phase: 'Hunt', schema: FINDINGS })
const cf = (control?.findings || []).map((f) => `${f.title} ${f.description || ''} ${f.evidence} ${f.exploitability || ''}`.toLowerCase())
const caught = {
  secrets: cf.some((t) => t.includes('service_role') || t.includes('service role') || (t.includes('secret') && t.includes('key')) || t.includes('committed')),
  xss: cf.some((t) => t.includes('dangerouslysetinnerhtml') || t.includes('innerhtml') || t.includes('xss')),
  authz_rls: cf.some((t) => t.includes('idor') || t.includes('ownership') || t.includes('authoriz') || t.includes('any order') || t.includes('any authenticated')),
}
const controlFired = caught.secrets && caught.xss && caught.authz_rls
const controlOutcome = { plant: 'canary: service_role key + dangerouslySetInnerHTML + IDOR fetch', fired: controlFired, caught, observed: `caught ${Object.entries(caught).filter(([,v])=>v).map(([k])=>k).join(', ') || 'nothing'} of secrets/xss/authz_rls` }
log(controlFired
  ? `✅ positive control FIRED — hunters proven this run (${controlOutcome.observed})`
  : `❌ positive control DID NOT FIRE — ${controlOutcome.observed}. Detector unproven → a repo/class with 0 confirmed findings is UNVERIFIED, not clean.`)

const results = await pipeline(
  tasks,
  // STAGE 1 — HUNT
  (item) => agent(
    `You are an offensive security red-teamer. Target repo: ${item.repo.name} at ${item.repo.path}.\n` +
    `Attack class: ${item.cls.key} — ${item.cls.desc}\n\n` +
    `Read the ACTUAL source code (skip node_modules, dist, build, .git). Find concrete, real instances only — ` +
    `no speculative padding. For each, give repo-relative file path, line, the offending snippet as evidence, ` +
    `and how an attacker would exploit it. This is READ-ONLY reconnaissance — do NOT modify any files. ` +
    `If you find nothing real, return an empty findings array.`,
    { label: `hunt:${item.repo.name}:${item.cls.key}`, phase: 'Hunt', schema: FINDINGS }
  ),
  // STAGE 2 — VERIFY each finding adversarially
  (huntResult, item) => {
    const findings = (huntResult && huntResult.findings) || []
    if (!findings.length) return { item, verified: [] }
    return parallel(findings.map((f) => () =>
      agent(
        `Adversarially verify this ${item.cls.key} finding in ${item.repo.name} (${item.repo.path}).\n` +
        `Open the cited file and judge whether it is GENUINELY exploitable or a false positive.\n` +
        `Finding: ${f.title}\nFile: ${f.file}:${f.line || '?'}\nClaim: ${f.description}\nEvidence: ${f.evidence}\n\n` +
        `Be skeptical — default to isReal=false if the threat is mitigated (e.g. server-side RLS, framework escaping, ` +
        `value not actually user-controlled, file not shipped to client). Read-only.`,
        { label: `verify:${item.repo.name}:${f.file}`, phase: 'Verify', schema: VERDICT }
      ).then((v) => ({ finding: f, verdict: v }))
    )).then((verified) => ({ item, verified: verified.filter(Boolean) }))
  },
  // STAGE 3 — REPAIR confirmed findings
  (stage2, item) => {
    const confirmed = (stage2.verified || []).filter((x) => x.verdict && x.verdict.isReal)
    if (!confirmed.length) return { repo: item.repo.name, cls: item.cls.key, repairs: [] }
    return parallel(confirmed.map((x) => () =>
      agent(
        `Draft a concrete fix/hardening for this confirmed ${item.cls.key} vulnerability in ${item.repo.name} (${item.repo.path}).\n` +
        `Finding: ${x.finding.title}\nFile: ${x.finding.file}:${x.finding.line || '?'}\n` +
        `Detail: ${x.finding.description}\nEvidence: ${x.finding.evidence}\n\n` +
        `Read the surrounding code so the patch fits the existing style. Produce an apply-able diff, code block, or SQL migration. ` +
        `Set requiresHuman=true for anything that changes auth, deletes data, or is ambiguous. Do NOT modify files — only draft.`,
        { label: `repair:${item.repo.name}:${x.finding.file}`, phase: 'Repair', schema: REPAIR }
      ).then((r) => ({ ...x, repair: r }))
    )).then((repairs) => ({ repo: item.repo.name, cls: item.cls.key, repairs: repairs.filter(Boolean) }))
  }
)

// ── Aggregate ───────────────────────────────────────────────────────────────
const all = results.filter(Boolean)
const flat = []
for (const r of all) for (const item of (r.repairs || [])) {
  flat.push({
    repo: r.repo, attackClass: r.cls,
    severity: item.finding.severity, title: item.finding.title,
    file: item.finding.file, line: item.finding.line,
    confidence: item.verdict.confidence,
    fixTitle: item.repair.fixTitle, riskOfFix: item.repair.riskOfFix,
    requiresHuman: item.repair.requiresHuman, patch: item.repair.patch,
    description: item.finding.description, exploitability: item.finding.exploitability,
  })
}
const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
flat.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))

const byRepo = {}
for (const r of REPOS) byRepo[r.name] = flat.filter((f) => f.repo === r.name).length

return {
  scope: REPOS.map((r) => r.name),
  detector: {
    verified: controlFired,
    control: controlOutcome,
    admissibility: controlFired
      ? 'positive control fired — a repo/class with 0 confirmed findings is admissible as CLEAN this run'
      : `⚠ positive control did NOT fire (${controlOutcome.observed}) — any repo/class reporting 0 confirmed findings is UNVERIFIED, not clean`,
  },
  confirmedCount: flat.length,
  byRepo,
  findings: flat,
  note: controlFired ? undefined : '⚠ DETECTOR UNVERIFIED THIS RUN (L001): the positive control did not fire; treat every "0 findings" result as unverified, not clean.',
}
