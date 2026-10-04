// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PageTurnBar from './PageTurnBar';
import { SETTLE_MS } from '../../lib/settleGuard';

/* ══════════════════════════════════════════════════════════════════════════
   A DOUBLE TAP IS ONE TAP (1-star testers, 2026-10-04): on page 39 a double
   tap on "Next page" hit "Done — Preview my album" (same spot) and skipped
   page 40; "Let's Get Started →" twice picked the occasion under the finger.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let now = 1000;
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

function Album({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(38); // page 39 of 40
  return createElement('div', null,
    createElement('span', { 'data-testid': 'at' }, String(index + 1)),
    createElement(PageTurnBar, { index, total: 40, variant: 'phone', onPrev: () => setIndex((i) => i - 1), onNext: () => setIndex((i) => i + 1), onDone }));
}
const tap = (id: string) => act(() => { host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click(); });
const at = () => host.querySelector('[data-testid="at"]')!.textContent;

describe('PageTurnBar: a double tap turns one page', () => {
  it('page 39: tap Next, tap again 120 ms later on the "Done" that took its place → page 40, NOT the preview', () => {
    const onDone = vi.fn();
    act(() => root.render(createElement(Album, { onDone })));
    now += SETTLE_MS + 1; // the album has been open a while
    tap('next-page');
    expect(at()).toBe('40');
    now += 120;
    tap('done-preview');
    expect(onDone).not.toHaveBeenCalled();
    expect(at()).toBe('40');
  });

  it('a real tap on Done after the pause works', () => {
    const onDone = vi.fn();
    act(() => root.render(createElement(Album, { onDone })));
    now += SETTLE_MS + 1;
    tap('next-page');
    now += SETTLE_MS + 50;
    tap('done-preview');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Previous: a double tap goes back one page', () => {
    act(() => root.render(createElement(Album, { onDone: vi.fn() })));
    now += SETTLE_MS + 1;
    tap('prev-page');
    now += 100;
    tap('prev-page');
    expect(at()).toBe('38');
  });
});

describe('Megy\'s card ignores the tail of a double tap (source guard)', () => {
  it('the card drops clicks for a moment after it changes', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/const cardTooSoon = useSettleGuard\(wizardKey\);/);
    expect(src).toMatch(/key=\{wizardKey\}\s*onClickCapture=\{\(e\) => \{ if \(cardTooSoon\(\)\) \{ e\.stopPropagation\(\); e\.preventDefault\(\); \} \}\}/);
  });
});
