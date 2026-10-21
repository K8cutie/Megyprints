import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateAlbum, dealAlbumBoxes, DEAL_BANK_QUOTES, QUOTE_CADENCE, type BoxContentOptions } from './generateAlbum';
import type { UploadedPhoto } from './types';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom(); // same albums every run (generateAlbum deals with Math.random)

/* ══════════════════════════════════════════════════════════════════════════
   NO BANK QUOTES IN THE BOXES (owner, 2026-10-21: "disable the quote bank
   first", choosing "stop filling boxes"). A box rolled 'quote' is made EMPTY
   and stays a quote box — the roll, the 70/30 odds and the cadence are kept —
   so it can wait for "Write a line for this photo", a line written from the
   page's own photos ("short ones feels like your guessing how it relates").
   "let Megy finish" no longer fills empty boxes with bank lines.
   Then the WHOLE bank (owner, same day: "disable it since haiku is now
   dynamically doing the quotes"): the picker shows only lines written for the
   page's photos (photoQuotePicker.spec), Step 1 asks for no theme lines, and a
   new occasion clears Megy's old lines (occasionQuotes.spec). One switch:
   DEAL_BANK_QUOTES.
   ══════════════════════════════════════════════════════════════════════════ */

const roll = (n: number): UploadedPhoto[] => Array.from({ length: n }, (_, i) => {
  const portrait = i % 5 >= 3;
  return { id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1000, width: portrait ? 3024 : 4032, height: portrait ? 4032 : 3024, capturedAt: i };
});
const OFF: BoxContentOptions = {
  quotePool: ['Two hearts, one journey', 'Forever starts today', 'To have and to hold'],
  quoteFontFamily: 'Playfair Display',
  quoteColor: '#2D2D2D',
  fillQuotes: false,
};

describe('making the album with bank quotes off', () => {
  const pages = generateAlbum(roll(120), '8x8', undefined);
  dealAlbumBoxes(pages, OFF);
  const quoteBoxPages = pages.filter((p) => (p.textSlotRoll ?? []).includes('quote'));

  it('the switch is off (the owner turned the bank off for boxes)', () => {
    expect(DEAL_BANK_QUOTES).toBe(false);
  });
  it('no box gets a bank line: no caption is dealt anywhere', () => {
    expect(pages.flatMap((p) => p.textElements).filter((t) => t.boxIndex != null)).toEqual([]);
  });
  it('quote boxes are still made: they wait, empty, for a line from the photos', () => {
    expect(quoteBoxPages.length).toBeGreaterThan(pages.length / 8);
  });
  it('the cadence holds: at most one quote box a page, never on two pages in a row', () => {
    for (const p of pages) expect((p.textSlotRoll ?? []).filter((r) => r === 'quote').length).toBeLessThanOrEqual(QUOTE_CADENCE.maxPerPage);
    pages.forEach((p, i) => {
      if (i === 0) return;
      const here = (p.textSlotRoll ?? []).includes('quote');
      const before = (pages[i - 1].textSlotRoll ?? []).includes('quote');
      expect(here && before).toBe(false);
    });
  });
  it('with the switch on, the bank deals again exactly as before', () => {
    const again = generateAlbum(roll(120), '8x8', undefined);
    dealAlbumBoxes(again, { ...OFF, fillQuotes: undefined });
    expect(again.flatMap((p) => p.textElements).some((t) => t.quote && t.boxIndex != null)).toBe(true);
  });
});

describe('wired in: every place that filled boxes with bank lines follows the switch', () => {
  const state = readFileSync(resolve(__dirname, 'useBuilderState.ts'), 'utf8');
  const preview = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
  it('making the album (also Surprise me and a new size) deals no line, and skips the bank wait', () => {
    expect(state).toMatch(/fillQuotes: DEAL_BANK_QUOTES,/);
    expect(state).toMatch(/if \(DEAL_BANK_QUOTES\) \{\s*setGenerating\('quotes'\);\s*quotePool = await ensureThemeQuotes/);
  });
  it('"let Megy finish" fills nothing, and its "boxes waiting" button does not show', () => {
    expect(state).toMatch(/if \(!DEAL_BANK_QUOTES\) return \{ filled: 0, remaining: 0, heldBack: 0, noLine: 0 \};/);
    expect(preview).toMatch(/DEAL_BANK_QUOTES \? fillableBoxCount\(pages\) : 0/);
  });
});

describe('wired in: nothing else asks for or places a bank line while the switch is off', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it("Step 1 no longer asks /api/theme-quotes for the occasion's lines (on the page and in the chat)", () => {
    const setup = src('BuilderSetup.tsx');
    expect(setup.match(/fetchThemeQuotes\(/g)).toHaveLength(2);
    expect(setup.match(/if \(DEAL_BANK_QUOTES\) void fetchThemeQuotes\(/g)).toHaveLength(2);
    const chat = src('../../assistant/MegyAssistant.tsx');
    expect(chat.match(/fetchThemeQuotes\(/g)).toHaveLength(1);
    expect(chat).toMatch(/if \(DEAL_BANK_QUOTES\) void fetchThemeQuotes\(albumTheme\.trim\(\)\);/);
  });
  it('the picker loads no theme lines', () => {
    expect(src('QuotePickerModal.tsx')).toMatch(/useEffect\(\(\) => \{\s*if \(!DEAL_BANK_QUOTES\) return;\s*void Promise\.resolve\(\)\.then\(\(\) => load\(theme\)\);/);
  });
  it('a new occasion finds no bank lines to swap in, and "add a themed quote" places none', () => {
    const state = src('useBuilderState.ts');
    expect(state).toMatch(/const pool = DEAL_BANK_QUOTES \? await ensureThemeQuotes\(occasion, [^\n]*\) : \[\];/);
    expect(state).toMatch(/const quote = DEAL_BANK_QUOTES \? pickQuote\(selectedTemplate, used\) : null;/);
  });
  it('"Add Quote" says where the line comes from now, and the Step 4 tip no longer promises dealt quotes', () => {
    expect(src('SlotChooser.tsx')).toContain("desc: 'Megy writes a line from the photos on this page'");
    const wizard = src('../../assistant/wizard.ts');
    expect(wizard).not.toContain('Quotes are 60 % of the little boxes');
    expect(wizard).toContain('Tap an empty quote box and Megy writes a line from the photos on that page');
  });
});
