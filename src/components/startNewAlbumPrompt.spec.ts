// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import StartNewAlbumPrompt from './StartNewAlbumPrompt';
import { albumInProgress, type LocalDraftSummary } from '../lib/localDraft';

/* ══════════════════════════════════════════════════════════════════════════
   "START CREATING" ASKS BEFORE IT THROWS AN ALBUM AWAY (1-star testers,
   2026-10-04: the Quitter lost an album in progress to Home's Start
   Creating). And the thank-you screen's "Create Another" starts a NEW album
   instead of reopening the one just ordered, ready to order again.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const draft = (over: Partial<LocalDraftSummary> = {}): LocalDraftSummary =>
  ({ title: 'HK Trip', photoCount: 45, accountId: null, editedAt: 1, hasContent: true, ...over });

describe('albumInProgress — what is worth asking about', () => {
  it('photos or a page with something on it, or just a name', () => {
    expect(albumInProgress(draft())).toBe(true);
    expect(albumInProgress(draft({ hasContent: false, photoCount: 0, title: 'Maria\'s Debut' }))).toBe(true);
  });
  it('nothing at all → no question, straight to a new album', () => {
    expect(albumInProgress(null)).toBe(false);
    expect(albumInProgress(draft({ hasContent: false, photoCount: 0, title: '  ' }))).toBe(false);
  });
});

describe('StartNewAlbumPrompt', () => {
  const show = (d: LocalDraftSummary, signedIn: boolean) => {
    const h = { onContinue: vi.fn(), onStartNew: vi.fn(), onClose: vi.fn() };
    act(() => root.render(createElement(StartNewAlbumPrompt, { draft: d, signedIn, ...h })));
    const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    return { h, q };
  };

  it('names the album and its photos; Continue is the way on, Start new is the other choice', () => {
    const { h, q } = show(draft(), true);
    expect(q('start-new-album-name').textContent).toBe('HK Trip');
    expect(host.textContent).toContain('45 photos · on this device');
    expect(q('start-new-continue').className).toContain('bg-peach');
    act(() => q('start-new-continue').click());
    expect(h.onContinue).toHaveBeenCalledTimes(1);
    act(() => q('start-new-confirm').click());
    expect(h.onStartNew).toHaveBeenCalledTimes(1);
  });

  it('says plainly what happens to the album in progress', () => {
    expect(show(draft(), false).q('start-new-note').textContent).toBe('Starting a new one deletes this album from this device. Sign in first to keep it.');
    expect(show(draft(), true).q('start-new-note').textContent).toBe('This one stays in Your Projects.');
    expect(show(draft({ hasContent: false, photoCount: 0 }), true).q('start-new-note').textContent).toBe("This one has no photos yet, so it won't be kept.");
  });
});

describe('wired in (source guards)', () => {
  it('Home\'s Start Creating asks when an album is in progress, else starts fresh', () => {
    const home = readFileSync(resolve(__dirname, '../pages/Home.tsx'), 'utf8');
    expect(home).toMatch(/case 'go-builder': \{\s*const draft = readLocalDraftSummary\(\);\s*if \(albumInProgress\(draft\)\) setInProgress\(draft\);\s*else startNew\(\);/);
  });
  it('the thank-you screen\'s Create Another starts a new album', () => {
    const order = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
    expect(order).toMatch(/onClick=\{\(\) => \{ startFreshAlbum\(user\?\.id\); navigate\('\/builder'\); \}\} data-testid="order-create-another"/);
  });
});
