import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* Attack-class parity between the two auditors.
 *
 * kraken.js and red-team.js are FORKS, not composition. Workflow scripts run in
 * a sandbox with no filesystem or import access, so neither file can read the
 * other — each declares its own CLASSES array inline. Parity has therefore been
 * maintained by hand, and by hand it has failed twice, in opposite directions:
 *
 *   c6918b6  added cost_exposure        -> kraken only
 *   d1473a3  added declared_vs_running  -> red-team only
 *
 * Neither miss was noticed for weeks, because a missing class doesn't error —
 * it just quietly never looks. The cost_exposure gap is how an unauthenticated
 * paid proxy shipped unflagged; the declared_vs_running gap meant Kraken never
 * hunted deployment drift, which was exactly the lens for the two findings the
 * 2026-08-03 audit had to reach by hand.
 *
 * This test is the poka-yoke: adding a class to one file and forgetting the
 * other now fails at commit time instead of surfacing months later as a finding
 * nobody made. Discipline already failed twice; this doesn't rely on it.
 */

const WORKFLOWS = join(process.cwd(), '.claude', 'workflows');

/** Pull the ordered class keys out of a workflow's inline CLASSES array.
 *  Deliberately text-based: these files have top-level `return` and can't be
 *  imported, and a parser that needs them to run would defeat the purpose. */
function classKeys(file: string, arrayName: string): string[] {
  const src = readFileSync(join(WORKFLOWS, file), 'utf8');
  const start = src.indexOf(`${arrayName} = [`);
  if (start < 0) throw new Error(`${file}: could not find "${arrayName} = ["`);
  // The array ends at the first `]` that starts a line — every entry is indented.
  const end = src.indexOf('\n]', start);
  if (end < 0) throw new Error(`${file}: could not find the end of ${arrayName}`);
  const block = src.slice(start, end);
  return [...block.matchAll(/\bkey:\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Differences that are DESIGN, not drift. Anything not listed here is a bug.
 *  Keep this list short and justified — it is the escape hatch, so every entry
 *  should read like a decision someone would defend. */
const INTENTIONAL_ONLY_IN_KRAKEN = new Set([
  // Kraken deliberately fuses security hunting with the bug-catching half of a
  // code review. The red team is security-only by design, so this one asymmetry
  // is the point of Kraken existing rather than an oversight.
  'correctness',
]);
const INTENTIONAL_ONLY_IN_RED_TEAM = new Set<string>([]);

describe('kraken / red-team attack-class parity', () => {
  const kraken = classKeys('kraken.js', 'const CLASSES');
  const redTeam = classKeys('red-team.js', 'const ALL_CLASSES');

  it('both workflows actually declare classes (the extractor still works)', () => {
    // Guards against the regex silently matching nothing after a refactor and
    // turning this whole suite into a vacuous pass.
    expect(kraken.length).toBeGreaterThan(5);
    expect(redTeam.length).toBeGreaterThan(5);
  });

  it('no class exists in red-team but is missing from kraken', () => {
    const missing = redTeam.filter(
      (k) => !kraken.includes(k) && !INTENTIONAL_ONLY_IN_RED_TEAM.has(k),
    );
    expect(missing, `Add these to CLASSES in .claude/workflows/kraken.js — or, if the `
      + `asymmetry is deliberate, add them to INTENTIONAL_ONLY_IN_RED_TEAM with a reason: `
      + missing.join(', ')).toEqual([]);
  });

  it('no class exists in kraken but is missing from red-team', () => {
    const missing = kraken.filter(
      (k) => !redTeam.includes(k) && !INTENTIONAL_ONLY_IN_KRAKEN.has(k),
    );
    expect(missing, `Add these to ALL_CLASSES in .claude/workflows/red-team.js — or, if the `
      + `asymmetry is deliberate, add them to INTENTIONAL_ONLY_IN_KRAKEN with a reason: `
      + missing.join(', ')).toEqual([]);
  });

  it('every declared intentional difference is real (no stale allowlist entries)', () => {
    // A allowlist entry for a class that now exists in both means someone fixed
    // the drift and left the exemption behind, which would hide the NEXT miss.
    for (const k of INTENTIONAL_ONLY_IN_KRAKEN) {
      expect(kraken.includes(k) && !redTeam.includes(k),
        `INTENTIONAL_ONLY_IN_KRAKEN lists "${k}" but that is no longer the situation — remove it`)
        .toBe(true);
    }
    for (const k of INTENTIONAL_ONLY_IN_RED_TEAM) {
      expect(redTeam.includes(k) && !kraken.includes(k),
        `INTENTIONAL_ONLY_IN_RED_TEAM lists "${k}" but that is no longer the situation — remove it`)
        .toBe(true);
    }
  });

  it('every kraken class has a positive-control plant', () => {
    // The same forgot-the-other-half mistake, one level down — and it happened
    // immediately: adding declared_vs_running to CLASSES without a matching
    // PLANT left that class permanently unable to prove it can fire, so a clean
    // result from it could never be admissible. Fails closed, but silently.
    const src = readFileSync(join(WORKFLOWS, 'kraken.js'), 'utf8');
    const start = src.indexOf('const PLANTS = [');
    const end = src.indexOf('\n]', start);
    const plants = [...src.slice(start, end).matchAll(/\bcls:\s*'([a-z_]+)'/g)].map((m) => m[1]);

    expect(plants.length).toBeGreaterThan(5);
    const noPlant = kraken.filter((k) => !plants.includes(k));
    expect(noPlant, `These kraken CLASSES have no entry in PLANTS, so they can never be `
      + `admissible as clean: ${noPlant.join(', ')}`).toEqual([]);
    const noClass = plants.filter((p) => !kraken.includes(p));
    expect(noClass, `These PLANTS have no matching class: ${noClass.join(', ')}`).toEqual([]);
  });

  it('no duplicate keys within a single workflow', () => {
    expect(new Set(kraken).size, 'duplicate class key in kraken.js').toBe(kraken.length);
    expect(new Set(redTeam).size, 'duplicate class key in red-team.js').toBe(redTeam.length);
  });
});
