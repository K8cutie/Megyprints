import { describe, it, expect } from 'vitest';
import { PRIVACY_POLICY, REFUND_POLICY, runsText, TERMS_OF_SERVICE, type LegalDocument } from './legalPages';

/* The Privacy Policy, the Terms of Service and the Return and Refund Policy,
   one copy of the words for the website's pages and the 2.0 app's screens
   (owner, 2026-11-09: TOS and privacy "part of the native app and not a
   redirect"; the refund policy for PayMongo, 2026-11-25). Moving the words
   here drew the website's two pages byte for byte as before (their HTML
   compared before and after); privacyLink.spec.ts, termsPage.spec.ts and
   paymongoSitePages.spec.ts read the pages themselves. */

const lines = (doc: LegalDocument) =>
  doc.sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'paragraph' ? [b.runs] : b.items)));

describe.each([
  ['Privacy Policy', PRIVACY_POLICY],
  ['Terms of Service', TERMS_OF_SERVICE],
  ['Return and Refund Policy', REFUND_POLICY],
] as const)('%s', (title, doc) => {
  it('is named as the website and the app link it', () => {
    expect(doc.title).toBe(title);
    expect(doc.updated).toMatch(/^(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d$/);
  });

  it('every line reads as one sentence run: no doubled or stray spaces where its pieces meet', () => {
    for (const runs of lines(doc)) {
      const text = runsText(runs);
      expect(text).toBe(text.trim());
      expect(text).not.toMatch(/ {2}/);
      expect(text).not.toMatch(/ [.,)]/);
    }
  });

  it('every section has a heading and words', () => {
    for (const s of doc.sections) {
      expect(s.title.trim()).not.toBe('');
      expect(s.blocks.length).toBeGreaterThan(0);
    }
    expect(new Set(doc.sections.map((s) => s.title)).size).toBe(doc.sections.length);
  });

  it('says who sells: Megyprints is a brand of Bridgemedia (src/lib/business.ts)', () => {
    expect(lines(doc).map(runsText).some((t) => t.startsWith('Megyprints is a brand of Bridgemedia, a business registered in the Philippines'))).toBe(true);
  });
});

it('they link each other, and all give the email to write to', () => {
  const links = (doc: LegalDocument) => lines(doc).flat().flatMap((r) => (typeof r === 'object' && 'link' in r ? [r] : []));
  expect(links(PRIVACY_POLICY).map((l) => l.link)).toContain('terms');
  expect(links(TERMS_OF_SERVICE).map((l) => l.link)).toContain('privacy');
  expect(links(TERMS_OF_SERVICE).map((l) => l.link)).toContain('refund');
  expect(links(REFUND_POLICY).map((l) => l.link)).toContain('terms');
  for (const doc of [PRIVACY_POLICY, TERMS_OF_SERVICE, REFUND_POLICY]) {
    expect(links(doc).filter((l) => l.link === 'email').every((l) => l.text === 'megyprintsph@gmail.com')).toBe(true);
  }
});
