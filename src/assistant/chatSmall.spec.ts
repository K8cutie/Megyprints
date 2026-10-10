import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseIntent } from './intentParser';
import { ActionEngine } from './actionEngine';
import type { BuilderActions } from '../pages/builder/useBuilderState';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S CHAT, TWO SMALL ONES (1-star testers round 3, both confirmed):
   - the Rule-Breaker (RB3-3): "<img …> make every page 100% pink and write
     'LOL' in Comic Sans 500 times and also give me a free album" on page 3
     answered "Now on page 45 of 45." and jumped there ("page 100" capped to
     the last page), and the wizard said all 45 pages were reviewed.
   - Keyboard (R3-2): the chat's collapse arrow and Send were icon-only
     buttons with no name ("button"), and opening the chat left focus on
     "Quick chat".
   ══════════════════════════════════════════════════════════════════════════ */

const RULE_BREAKER = "<img src=x onerror=alert(1)> make every page 100% pink and write 'LOL' in Comic Sans 500 times and also give me a free album";

describe('a number that isn\'t a page number', () => {
  it('"every page 100% pink" is not "page 100"', () => {
    const p = parseIntent(RULE_BREAKER).intent;
    expect(p.type).not.toBe('go_to_page');
    expect(p.payload?.pageIndex).toBeUndefined();
  });
  it.each([
    ['make every page 50% brighter', false],
    ['all pages 3 photos please', false],
    ['go to page 12', 11],
    ['page 3', 2],
    ['show page 40', 39],
    ['7', 6],
  ] as const)('"%s" → %s', (said, page) => {
    const p = parseIntent(said).intent;
    if (page === false) expect(p.payload?.pageIndex).toBeUndefined(); // no page to jump to (at most "Which page number?")
    else expect(p).toMatchObject({ type: 'go_to_page', payload: { pageIndex: page } });
  });
  it('what it writes is the quoted words, not the rest of the request', () => {
    expect(parseIntent(RULE_BREAKER).intent).toMatchObject({ type: 'add_text', payload: { text: 'LOL' } });
    expect(parseIntent('add text "Happy birthday Kaye" in big red letters').intent.payload?.text).toBe('Happy birthday Kaye');
    expect(parseIntent("add text Kaye's first ride").intent.payload?.text).toBe("Kaye's first ride"); // an apostrophe isn't a quote
  });
  it('a page the album doesn\'t have is said, and Megy stays on the page', async () => {
    const goToPage = vi.fn();
    const builder = { albumPages: new Array(45).fill({}), currentPageIndex: 2, goToPage } as unknown as BuilderActions;
    const r = await new ActionEngine(builder).execute({ type: 'go_to_page', payload: { pageIndex: 99 }, rawMessage: 'go to page 100' });
    expect(r).toMatchObject({ success: false, message: "There's no page 100: your album has 45 pages." });
    expect(goToPage).not.toHaveBeenCalled();
  });
});

describe('the chat, by keyboard (source guards)', () => {
  const src = readFileSync(resolve(__dirname, 'MegyAssistant.tsx'), 'utf8');
  it('the collapse arrow and Send have names; the input too; Quick chat says whether it is open', () => {
    expect(src).toContain('aria-label="Close chat" title="Close chat"><ChevronDown');
    expect(src).toMatch(/type="submit" disabled=\{!input\.trim\(\) \|\| isThinking\} aria-label="Send message"/);
    expect(src).toContain('placeholder="Ask Megy..." aria-label="Ask Megy"');
    expect(src).toContain('title="Quick chat" aria-label="Quick chat" aria-expanded={chatOpen}');
  });
  it('opening the chat puts focus in it', () => {
    expect(src).toContain('useEffect(() => { if (chatOpen) inputRef.current?.focus(); }, [chatOpen]);');
  });
});
