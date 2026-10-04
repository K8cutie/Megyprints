import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   A LONG WORD WRAPS IN MEGY'S CHAT (1-star testers, 2026-10-04, the
   Rule-Breaker): "change the text to: OMGGGGGGGG…GGG best trip ever 😂" —
   the long word ran past the bubble (clientWidth 299px, content 469px) and
   was cut off at the panel edge. The bubble now breaks a word that can't fit.
   ══════════════════════════════════════════════════════════════════════════ */

describe("Megy's chat bubble (source guard; the walk measures it)", () => {
  it('breaks a word too long for the bubble', () => {
    const src = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
    const bubble = src.match(/data-testid="chat-bubble" className=\{`([^`]*)/)?.[1] ?? '';
    expect(bubble).toMatch(/\[overflow-wrap:anywhere\]/);
    expect(bubble).toMatch(/whitespace-pre-line/); // line breaks Megy writes still show
  });
});
