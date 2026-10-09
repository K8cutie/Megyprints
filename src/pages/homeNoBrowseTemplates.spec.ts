import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   ONE WAY IN FROM THE HOME PAGE (owner, 2026-10-09): "browse templates first
   remove that option". The hero card under Start Creating and the bottom
   "Ready to Create" band both had an "Or browse templates first →" link to
   /templates. Both are gone, so the home page sends people into the builder.
   ══════════════════════════════════════════════════════════════════════════ */

describe('Home page (source guard)', () => {
  const src = readFileSync(resolve(__dirname, 'Home.tsx'), 'utf8');

  it('has no "browse templates first" link', () => {
    expect(src).not.toMatch(/browse templates first/i);
  });

  it('still sends people into the builder', () => {
    expect(src).toMatch(/Start Creating/);
    expect(src).toMatch(/to="\/builder"/);
  });
});
