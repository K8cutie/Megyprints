// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import EndOfAlbumPrompt from './EndOfAlbumPrompt';
import { useEndOfAlbumPrompt } from './useEndOfAlbumPrompt';

/* ══════════════════════════════════════════════════════════════════════════
   END OF THE PREVIEW (owner, 2026-10-02):
   1. "every time it reaches the end the pop up appears" — it showed once per
      visit to Preview, so after one ✕ the only order button was in a corner.
   2. "Check your cover" — by Preview every customer has been through the
      cover step; "Design your cover / Give it a cover" read as if they hadn't.
   3. "Continue editing" — was "Back to my pages — I want to change something".
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe('useEndOfAlbumPrompt — open on every arrival at the last spread', () => {
  let api: { open: boolean; close: () => void };
  function Harness({ atEnd, rev }: { atEnd: boolean; rev: number }) {
    const p = useEndOfAlbumPrompt(atEnd);
    useEffect(() => { api = p; });
    return createElement('i', { 'data-rev': rev });
  }
  const show = (atEnd: boolean, rev = 0) => act(() => root.render(createElement(Harness, { atEnd, rev })));

  it('opens when the reader pages onto the last spread', () => {
    show(false);
    expect(api.open).toBe(false);
    show(true);
    expect(api.open).toBe(true);
  });

  it('opens AGAIN every time they come back to the end after closing it', () => {
    show(false); show(true);
    act(() => api.close());
    expect(api.open).toBe(false);
    for (let visit = 0; visit < 3; visit++) {
      show(false); // back one spread
      expect(api.open).toBe(false);
      show(true); // forward to the end again
      expect(api.open).toBe(true);
      act(() => api.close());
    }
  });

  it('✕ sticks while they stay on the last spread (an edit there re-renders, no pop)', () => {
    show(false); show(true);
    act(() => api.close());
    show(true, 1); show(true, 2); // same spread, new renders (e.g. a caption edited)
    expect(api.open).toBe(false);
  });

  it('opening Preview already on the last spread (a short album) shows it', () => {
    show(true);
    expect(api.open).toBe(true);
  });
});

describe('EndOfAlbumPrompt — the wording and the buttons', () => {
  const render = () => {
    const h = { onClose: vi.fn(), onCheckCover: vi.fn(), onOrder: vi.fn(), onContinueEditing: vi.fn() };
    act(() => root.render(createElement(EndOfAlbumPrompt, h)));
    const btn = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
    return { h, btn };
  };

  it('says "Check your cover" and "Continue editing", never the old wording', () => {
    render();
    const text = host.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain("You've reached the end");
    expect(text).toContain('Check your cover, then make it real.');
    const labels = [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()).filter(Boolean);
    expect(labels).toEqual(['🎨 Check your cover', 'ORDER ALBUM', 'Continue editing']);
    expect(text).not.toMatch(/Design your cover|Give it a cover|Back to my pages/);
  });

  it('each button does its one job', () => {
    const { h, btn } = render();
    act(() => btn('end-prompt-cover').click());
    act(() => btn('end-prompt-order').click());
    act(() => btn('end-prompt-back').click());
    expect([h.onCheckCover, h.onOrder, h.onContinueEditing].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(h.onClose).not.toHaveBeenCalled(); // taps inside the card don't close it
  });

  it('✕ or a tap outside the card closes it (keep browsing)', () => {
    const { h } = render();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Keep browsing"]')!.click());
    act(() => host.querySelector<HTMLDivElement>('[data-testid="end-prompt"]')!.click());
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
});

describe('the preview uses them', () => {
  it('BuilderPreview opens EndOfAlbumPrompt through useEndOfAlbumPrompt — no once-only latch', () => {
    const s = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(s).toContain('useEndOfAlbumPrompt(');
    expect(s).toContain('<EndOfAlbumPrompt');
    expect(s).not.toMatch(/ctaSeen/);
  });
});
