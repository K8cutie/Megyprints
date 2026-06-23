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

return { scope: REPOS.map((r) => r.name), confirmedCount: flat.length, byRepo, findings: flat }
