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

/* ══════════════════════════════════════════════════════════════════════════
   BACK TO PREVIEW FROM ANY PAGE (owner, 2026-10-11: "editing in preview then
   closing to go back in preview"). From the Preview, "Edit pages" opened the
   editor and the only way back was Done on the LAST page: fix page 12, page
   through to 40. Once the album has been previewed, every other page offers
   "Back to preview", which opens the Preview on that same page.
   ══════════════════════════════════════════════════════════════════════════ */

describe.each(['phone', 'desktop'] as const)('Back to preview (%s)', (variant) => {
  const withBack = (index: number, total: number) => {
    const onBackToPreview = vi.fn();
    act(() => root.render(createElement(PageTurnBar, { variant, index, total, onPrev: () => {}, onNext: () => {}, onDone: () => {}, onBackToPreview })));
    const btn = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    const words = [...host.querySelectorAll('button')].map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
    return { onBackToPreview, btn, words };
  };

  it('a middle page offers it, in words; Next page stays the filled button', () => {
    const { btn, words, onBackToPreview } = withBack(11, 40);
    expect(words).toEqual(['Previous page', 'Next page', 'Back to preview']);
    expect(btn('back-to-preview')!.className).not.toMatch(/\bbg-(peach|success)\b/);
    expect(btn('next-page')!.className).toMatch(/\bbg-peach\b/);
    act(() => btn('back-to-preview')!.click());
    expect(onBackToPreview).toHaveBeenCalledTimes(1);
  });

  it('page 1 offers it too', () => {
    expect(withBack(0, 40).words).toEqual(['Next page', 'Back to preview']);
  });

  it('the last page: no second way, Done already goes to the Preview', () => {
    const { btn, words } = withBack(39, 40);
    expect(btn('back-to-preview')).toBeNull();
    expect(words).toEqual(['Previous page', 'Done — Preview my album']);
  });

  it('before the album has been previewed (no handler): not shown', () => {
    expect(render(variant, 11, 40).btn('back-to-preview')).toBeNull();
  });
});

describe('Back to preview, wired (source guards)', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
  it('both editors offer it only once the album has been previewed, and it keeps the page', () => {
    expect(src('BuilderEdit.tsx')).toMatch(/onBackToPreview=\{actions\.previewSeen \? \(\) => \{ void dispatch\(\{ type: 'preview_album', payload: \{ stay: true \}/);
    expect(src('MobileReview.tsx')).toMatch(/onBackToPreview=\{actions\.previewSeen && onBackToPreview \? handleBack : undefined\}/);
    expect(src('../Builder.tsx')).toMatch(/onBackToPreview=\{\(\) => \{ void actions\.dispatch\(\{ type: 'preview_album', payload: \{ stay: true \}/);
  });
  it('the Preview opens on page 1 from Done (a sample album in the app: on its last page), on the same page from Back to preview', () => {
    // sampleAlbumNotes.spec runs it: page 1 for any other album, the last page for a sample album.
    expect(src('../../assistant/actionEngine.ts')).toMatch(/if \(!intent\.payload\?\.stay\) \{\s*const last = showSampleAlbumNotes\(isNativeShell\(\), this\.builder\.uploadedPhotos\);\s*this\.builder\.goToPage\(last \? Math\.max\(0, this\.builder\.albumPages\.length - 1\) : 0\);/);
  });
  it('"previewed" is set by opening the Preview, and a new album clears it', () => {
    const s = src('useBuilderState.ts');
    expect(s).toMatch(/useEffect\(\(\) => \{ if \(phase === 'preview'\) setPreviewSeen\(true\); \}, \[phase\]\);/);
    expect(s).toMatch(/setPreviewSeen\(false\); \/\/ a new album hasn't been previewed/);
  });
});
