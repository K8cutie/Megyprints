import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { referenceProblem, cleanReference } from './payment';

/* ══════════════════════════════════════════════════════════════════════════
   A JUNK REFERENCE NUMBER IS SAID, NOT QUIETLY STORED (1-star testers,
   2026-10-04, the Rule-Breaker): "lol nope 🙃 <script>alert(4)</script> !!!!"
   went through to the thank-you screen; it was stripped to "lol nope
   scriptalert4/script" and handed to the operator as the bank reference. The
   field is optional — empty is fine — but what's typed must look like a
   reference from a bank's receipt.
   ══════════════════════════════════════════════════════════════════════════ */

describe('referenceProblem', () => {
  it("the tester's input: told, not stored", () => {
    expect(cleanReference('lol nope 🙃 <script>alert(4)</script> !!!!')).toBe('lol nope  scriptalert4/script'); // what used to reach the operator
    expect(referenceProblem('lol nope 🙃 <script>alert(4)</script> !!!!')).toBe("Use only the letters and numbers on your bank's receipt (e.g. 2026091012345678).");
  });
  it('words with no number in them', () => {
    expect(referenceProblem('lol nope')).toMatch(/^A reference number has digits in it/);
  });
  it.each(['', '   ', '2026091012345678', 'FT2410ABCD1234', '1234 5678 9012', 'GC-2026-0001.23'])('fine: %j', (ref) => {
    expect(referenceProblem(ref)).toBe('');
  });
});

describe('the payment step asks before "I\'ve sent" (source guard)', () => {
  it('a bad reference stops the submit and shows why, under the field', () => {
    const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(src).toMatch(/const refBad = referenceProblem\(payRef\);\s*if \(refBad\) \{ setRefError\(refBad\); return; \}/);
    expect(src).toMatch(/data-testid="pay-reference-error">\{refError\}/);
  });
});
