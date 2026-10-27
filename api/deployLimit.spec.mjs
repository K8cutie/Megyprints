import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* Vercel deploys every file in api/ as a function, except names starting with
   "_" and what .vercelignore leaves out, and the Hobby plan allows 12 a
   deployment. PR #178 added /api/client-error and its test and the deploy
   failed at 14, so the tests are now left out and the count is checked here. */

const HOBBY_FUNCTION_LIMIT = 12;
const dir = join(__dirname);
const ignore = readFileSync(join(__dirname, '..', '.vercelignore'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

describe('api/ deploys within the Hobby plan', () => {
  it('tests next to the endpoints are not uploaded', () => {
    expect(ignore).toContain('api/*.spec.mjs');
  });
  it(`at most ${HOBBY_FUNCTION_LIMIT} functions`, () => {
    const deployed = readdirSync(dir).filter((f) =>
      /\.(m?js|ts)$/.test(f) && !f.startsWith('_') && !(ignore.includes('api/*.spec.mjs') && f.endsWith('.spec.mjs')));
    expect(deployed.length, deployed.join(', ')).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});
