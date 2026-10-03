// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import SpreadTurnButton, { SPREAD_TURN_W } from './SpreadTurnButton';

/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW TURNS PAGES IN WORDS TOO (owner, 2026-10-04: "make it look like
   a next or prev button but dont make it take too much space"). The book
   preview turned spreads with bare ‹ › arrows — the same trap as #50 — and
   greyed the one with nowhere to go. Now each side is a small labelled button
   in the same 56-px column the arrows had, so the book is just as big:
     first spread → [      ]  book  [ › Next ]
     middle       → [ ‹ Previous ]  book  [ › Next ]
     last spread  → [ ‹ Previous ]  book  [      ]
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(dir: 'prev' | 'next', show: boolean) {
  const onClick = vi.fn();
  act(() => root.render(createElement(SpreadTurnButton, { dir, show, onClick })));
  const button = host.querySelector('button');
  return { onClick, button, words: (button?.textContent ?? '').replace(/\s+/g, ' ').trim() };
}

describe('SpreadTurnButton', () => {
  it('Next says "Next" and turns the page', () => {
    const { button, words, onClick } = render('next', true);
    expect(words).toBe('Next');
    act(() => button!.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Previous says "Previous" and turns back', () => {
    const { button, words, onClick } = render('prev', true);
    expect(words).toBe('Previous');
    act(() => button!.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Next is the filled button; Previous is the quiet one', () => {
    expect(render('next', true).button!.className).toContain('bg-peach');
    expect(render('prev', true).button!.className).not.toContain('bg-peach');
  });

  it('nowhere to go: no button at all (not a greyed one) — but the column stays, so the book does not jump', () => {
    for (const dir of ['prev', 'next'] as const) {
      const { button } = render(dir, false);
      expect(button, dir).toBeNull();
      const spacer = host.firstElementChild as HTMLElement;
      expect(spacer.getAttribute('aria-hidden')).toBe('true');
      expect(spacer.style.width).toBe(`${SPREAD_TURN_W}px`);
    }
  });

  it('the button takes the same column the bare arrows did (no space lost)', () => {
    expect(SPREAD_TURN_W).toBe(56);
    expect(render('next', true).button!.style.width).toBe('56px');
  });

  it('a shown button is never disabled', () => {
    expect(render('next', true).button!.disabled).toBe(false);
    expect(render('prev', true).button!.disabled).toBe(false);
  });
});

describe('the book preview turns spreads with SpreadTurnButton — no bare ‹ › left', () => {
  const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
  it('uses the button on both sides', () => {
    expect(src).toContain('<SpreadTurnButton dir="prev"');
    expect(src).toContain('<SpreadTurnButton dir="next"');
  });
  it('the old 40-px chevrons and greyed arrows are gone', () => {
    expect(src).not.toMatch(/Chevron(Left|Right) size=\{40\}/);
    expect(src).not.toMatch(/disabled=\{!has(Prev|Next)\}/);
  });
  it('the fit math reserves the button column, so the book keeps its size', () => {
    expect(src).toMatch(/2 \* SPREAD_TURN_W/);
  });
});
