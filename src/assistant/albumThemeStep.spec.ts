// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AlbumThemeStep from './AlbumThemeStep';

/* ══════════════════════════════════════════════════════════════════════════
   STEP 1 NEVER EATS A TAP (tester, 2026-10-04). Next on step 1 was greyed out
   until the album had a name and an occasion, so an eager tester tapping it
   got nothing back and was stuck. Next now always answers: the step stays
   unskippable, and a tap on it before it is answered (the `nudge` count goes
   up) points at what is missing and puts the cursor there.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(name: string, value: string, nudge: number) {
  act(() => root.render(createElement(AlbumThemeStep, {
    value, onChange: () => {}, onContinue: () => {}, name, onNameChange: () => {}, nudge,
  })));
  const nameBox = host.querySelector<HTMLInputElement>('[data-testid="album-name"]')!;
  const chips = host.querySelector<HTMLElement>('[role="radiogroup"]')!;
  const status = host.querySelector<HTMLElement>('[data-testid="step-one-status"]')!;
  return { nameBox, chips, status };
}

describe('AlbumThemeStep — a tap on Next before step 1 is answered', () => {
  it('before any tap: nothing is flagged', () => {
    const { nameBox, chips, status } = render('', '', 0);
    expect(nameBox.getAttribute('aria-invalid')).toBe('false');
    expect(chips.dataset.missing).toBe('false');
    expect(status.dataset.nudged).toBe('false');
    expect(status.textContent).toBe('Name your album and choose an occasion to continue.');
  });

  it('nothing filled in: flags the name AND the occasion, and puts the cursor in the name box', () => {
    const { nameBox, chips, status } = render('', '', 1);
    expect(nameBox.getAttribute('aria-invalid')).toBe('true');
    expect(chips.dataset.missing).toBe('true');
    expect(status.dataset.nudged).toBe('true');
    expect(document.activeElement).toBe(nameBox);
  });

  it('named but no occasion: flags only the occasion, and moves to the first occasion', () => {
    const { nameBox, chips, status } = render("Maria's Debut", '', 1);
    expect(nameBox.getAttribute('aria-invalid')).toBe('false');
    expect(chips.dataset.missing).toBe('true');
    expect(status.textContent).toBe('Choose an occasion to continue.');
    expect(document.activeElement).toBe(chips.querySelector('[role="radio"]'));
  });

  it('every tap points again (the count going up re-focuses the missing box)', () => {
    const { nameBox } = render('', 'Wedding', 1);
    expect(document.activeElement).toBe(nameBox);
    nameBox.blur();
    render('', 'Wedding', 2);
    expect(document.activeElement).toBe(nameBox);
  });

  it('answered: nothing is flagged even after taps', () => {
    const { nameBox, chips, status } = render("Maria's Debut", 'Wedding', 3);
    expect(nameBox.getAttribute('aria-invalid')).toBe('false');
    expect(chips.dataset.missing).toBe('false');
    expect(status.dataset.nudged).toBe('false');
  });
});
