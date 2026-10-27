import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* An endpoint that spends money per call must know who is calling (audit
   2026-10-27). /api/theme-quotes needed no sign-in and had only an in-memory
   per-IP limit, so a script could run up the AI bill with no ceiling; it was
   deleted. This keeps the next one honest: every deployed function that holds
   the AI key checks the caller's sign-in on the server (auth.getUser) and keeps
   its limits in the database (an rpc), not only in memory. */

const dir = __dirname;
// Subfolders deploy too (api/x/y.mjs → /api/x/y); "_" names (files or folders) don't.
const deployed = readdirSync(dir, { recursive: true })
  .map((f) => String(f).replace(/\\/g, '/'))
  .filter((f) => /\.(m?js|ts)$/.test(f) && !f.split('/').some((part) => part.startsWith('_')) && !f.endsWith('.spec.mjs'));

describe('endpoints that spend money', () => {
  it('/api/theme-quotes stays gone', () => {
    expect(existsSync(join(dir, 'theme-quotes.mjs'))).toBe(false);
  });
  it('every function that holds the AI key checks the sign-in and keeps its limits in the database', () => {
    const paid = deployed.filter((f) => /ANTHROPIC_API_KEY|api\.anthropic\.com|@anthropic-ai\/sdk/.test(readFileSync(join(dir, f), 'utf8')));
    expect(paid.length).toBeGreaterThan(0);
    for (const f of paid) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, `${f} must check the caller with auth.getUser(token)`).toMatch(/\.auth\.getUser\(/);
      expect(src, `${f} must keep its limits in the database`).toMatch(/\.rpc\(/);
    }
  });
});
