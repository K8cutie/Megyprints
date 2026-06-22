// ──────────────────────────────────────────────────────────────────────────
// Journey-completion loop — the runnable harness.
//
// Goal (the verifier): every persona should be able to reach the FULFILLMENT
// screen (an order_number). Each persona attacks the build→order funnel with a
// different behavior; the loop records the first roadblock each one hits.
//
// HOW THE SELF-HEALING LOOP WORKS HERE
//   1. Run:    npm run test:loop
//   2. Read:   the printed journey report shows where each persona stalls.
//   3. Fix:    patch the app code for one roadblock.
//   4. Re-run: the matching `it.fails` "loop target" flips from pass→fail,
//              which means "fixed!" — then delete its `.fails` to lock it in.
//   Repeat until no loop targets remain. See README.md.
// ──────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, vi } from 'vitest';

// Redirect the order logic's Supabase import to our in-memory double.
vi.mock('../lib/supabase', async () => await import('./mockSupabase'));

import { PERSONAS } from './personas';
import { runJourney, type JourneyResult } from './journey';

const results = new Map<string, JourneyResult>();

beforeAll(async () => {
  for (const p of PERSONAS) {
    results.set(p.id, await runJourney(p));
  }
  printReport([...results.values()]);
});

const get = (id: string): JourneyResult => {
  const r = results.get(id);
  if (!r) throw new Error(`no journey result for ${id}`);
  return r;
};

describe('funnel control path', () => {
  it('a fully-prepared persona CAN reach fulfillment (proves the funnel works)', () => {
    const r = get('happy');
    expect(r.reached).toBe('FULFILLMENT');
    expect(r.orderNumber).toMatch(/^MEGY-/);
    expect(r.viewedAlbumId).toBe(r.orderedAlbumId);
  });
});

describe('documented current roadblocks (expected gates)', () => {
  it('Guest Gary is stopped by the sign-in gate', () => {
    expect(get('ghost').roadblock).toBe('AUTH_REQUIRED');
  });

  it('Rushing Rico is stopped by shipping validation', () => {
    expect(get('rusher').roadblock).toBe('VALIDATION');
  });
});

describe('LOOP TARGETS — fixed, now locked in', () => {
  // These were `it.fails` while the bugs were live. The fix (Builder stashes the
  // active album id + local snapshot in sessionStorage; createOrderFromLatestAlbum
  // orders that specific album, or falls back to the snapshot for a never-synced
  // build) drove them green, so they are now ordinary passing assertions.

  it('Late-Binder Lena reaches fulfillment after signing in at checkout', () => {
    // FIXED: a build-before-login album now rides along as a snapshot, so it is
    // no longer lost. (Was: NO_ALBUM.)
    expect(get('late').reached).toBe('FULFILLMENT');
    expect(get('late').orderNumber).toMatch(/^MEGY-/);
  });

  it('Serial Sofia orders the album she was viewing, not the latest-updated one', () => {
    // FIXED: checkout orders the explicit active album id, not "latest updated".
    const r = get('serial');
    expect(r.reached).toBe('FULFILLMENT');
    expect(r.orderedAlbumId).toBe(r.viewedAlbumId);
  });
});

// ── Pretty journey report, printed once per run ──
function printReport(rs: JourneyResult[]): void {
  const line = '─'.repeat(78);
  const rows = rs.map((r) => {
    const status = r.reached === 'FULFILLMENT' ? '🎯 FULFILLMENT' : `🚧 ${r.roadblock}`;
    return `  ${r.persona.name.padEnd(20)} ${r.reached.padEnd(12)} ${status}`;
  });
  // eslint-disable-next-line no-console
  console.log(
    [
      '',
      line,
      '  JOURNEY-COMPLETION LOOP — persona report',
      line,
      `  ${'Persona'.padEnd(20)} ${'Reached'.padEnd(12)} Outcome`,
      ...rows,
      line,
      rs
        .filter((r) => r.reached !== 'FULFILLMENT')
        .map((r) => `  • ${r.persona.name}: ${r.detail}`)
        .join('\n'),
      line,
      '',
    ].join('\n'),
  );
}
