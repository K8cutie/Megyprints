import { describe, it, expect } from 'vitest';
import { QUOTE_BANK, PUBLIC_DOMAIN_SOURCES } from './quoteBank';
import { THEME_QUOTES } from './themeQuotes';
import { MAX_QUOTE_CHARS, matchedTheme } from '../../lib/quotes';
import { COMMON_THEMES } from '../../lib/albumTheme';

/* ══════════════════════════════════════════════════════════════════════════
   THE PRE-LOADED QUOTE BANK (owner, 2026-10-02): 100 lines per occasion,
   original or public domain, every one printable.
   ══════════════════════════════════════════════════════════════════════════ */

const BIG = ['wedding', 'baptism', 'birthday', 'baby', 'graduation', 'family', 'travel', 'classic'] as const;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

describe('quote bank', () => {
  it('holds exactly 100 lines for each occasion and the general set', () => {
    for (const k of BIG) expect(QUOTE_BANK[k].length, k).toBe(100);
  });

  it('every quick pick on the occasion step lands on a 100-line set', () => {
    for (const pick of COMMON_THEMES) {
      const t = matchedTheme(pick);
      expect(t, pick).not.toBeNull();
      expect(QUOTE_BANK[t!].length, pick).toBe(100);
    }
  });

  it('every line prints cleanly: 6–46 characters, no quotation marks, emoji, hashtags or trailing full stop', () => {
    for (const [k, lines] of Object.entries(QUOTE_BANK)) {
      for (const l of lines) {
        expect(l.length, `${k}: ${l}`).toBeLessThanOrEqual(MAX_QUOTE_CHARS);
        expect(l.length, `${k}: ${l}`).toBeGreaterThanOrEqual(6);
        expect(l, `${k}: ${l}`).not.toMatch(/["“”#]|\p{Extended_Pictographic}/u);
        expect(l, `${k}: ${l}`).not.toMatch(/\.\s*$/);
        expect(l, `${k}: ${l}`).toBe(l.trim());
      }
    }
  });

  it('no line repeats within a set — or across sets', () => {
    const seen = new Map<string, string>();
    for (const [k, lines] of Object.entries(QUOTE_BANK)) {
      for (const l of lines) {
        const key = norm(l);
        expect(seen.get(key), `"${l}" in ${k} and ${seen.get(key)}`).toBeUndefined();
        seen.set(key, k);
      }
    }
  });

  it('every public-domain line names its source, and is in the bank', () => {
    const all = new Set(Object.values(QUOTE_BANK).flat());
    const sources = Object.entries(PUBLIC_DOMAIN_SOURCES);
    expect(sources.length).toBeGreaterThan(50);
    for (const [line, src] of sources) {
      expect(all.has(line), line).toBe(true);
      expect(src.trim().length, line).toBeGreaterThan(5);
    }
  });

  it('is the bank the app deals from', () => {
    expect(THEME_QUOTES).toBe(QUOTE_BANK);
  });
});
