// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PageTurnBar, { type PageTurnVariant } from './PageTurnBar';

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE TURN IS IN WORDS, BOTH WAYS (owner, 2026-10-02): "the first page
   doesn't have a previous button but we would need a previous button for the
   previous page" — and the desktop "of course it needs that" too.
     page 1      →                     [ Next page › ]
     page 2 on   → [ ‹ Previous page ] [ Next page › ]
     last page   → [ ‹ Previous page ] [ ✓ Done — Preview my album ]
   Before this, Previous was a bare ‹ circle (greyed on page 1) on the phone,
   and both ways were bare ‹ › circles on desktop.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function render(variant: PageTurnVariant, index: number, total: number) {
  const onPrev = vi.fn(), onNext = vi.fn(), onDone = vi.fn();
  act(() => root.render(createElement(PageTurnBar, { variant, index, total, onPrev, onNext, onDone })));
  const btn = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  const words = [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
  return { onPrev, onNext, onDone, btn, words };
}

describe.each(['phone', 'desktop'] as const)('PageTurnBar (%s)', (variant) => {
  it('page 1: no Previous at all — only "Next page"', () => {
    const { btn, words, onNext } = render(variant, 0, 40);
    expect(btn('prev-page')).toBeNull();
    expect(words).toEqual(['Next page']);
    act(() => btn('next-page')!.click());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('a middle page: "Previous page" in words, then "Next page"', () => {
    const { btn, words, onPrev, onNext } = render(variant, 1, 40);
    expect(words).toEqual(['Previous page', 'Next page']);
    act(() => btn('prev-page')!.click());
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    act(() => btn('next-page')!.click());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('the last page: "Previous page" + "Done — Preview my album" (no Next)', () => {
    const { btn, words, onPrev, onDone } = render(variant, 39, 40);
    expect(btn('next-page')).toBeNull();
    expect(words).toEqual(['Previous page', 'Done — Preview my album']);
    act(() => btn('done-preview')!.click());
    expect(onDone).toHaveBeenCalledTimes(1);
    act(() => btn('prev-page')!.click());
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('a one-page album: just Done', () => {
    expect(render(variant, 0, 1).words).toEqual(['Done — Preview my album']);
  });

  it('every button is enabled — nothing greyed out to read as a dead end', () => {
    for (const [i, n] of [[0, 40], [5, 40], [39, 40]]) {
      render(variant, i, n);
      host.querySelectorAll('button').forEach((b) => expect(b.disabled).toBe(false));
    }
  });
});

describe('both builders turn pages with PageTurnBar — no icon-only ‹ › left', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it.each([['MobileReview.tsx', 'phone'], ['BuilderEdit.tsx', 'desktop']])('%s uses the %s bar', (file, variant) => {
    const s = src(file);
    expect(s).toContain(`<PageTurnBar variant="${variant}"`);
    // the old bare-arrow buttons were labelled only for screen readers
    expect(s).not.toMatch(/aria-label="(Previous|Next) page"/);
  });
});
