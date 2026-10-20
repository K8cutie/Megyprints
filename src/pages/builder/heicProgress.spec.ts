// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   "IT MAY LOOK LIKE IT HANGED" (owner, 2026-10-12): turning iPhone photos
   (HEIC) into JPEGs takes tens of seconds on an Android phone, and grey
   squares with no word read as a freeze. HeicProgress says what is happening
   and how far along it is, over every builder screen, then that they're ready.
   ══════════════════════════════════════════════════════════════════════════ */

import HeicProgress from './HeicProgress';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const show = (progress: { done: number; total: number } | null) => act(() => root.render(createElement(HeicProgress, { progress })));
const $ = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe('HeicProgress', () => {
  it('nothing to convert: nothing shown', () => {
    show(null);
    expect($('heic-progress')).toBeNull();
  });

  it('says what is happening and how far: "12 of 44", with a bar and a word about the wait', () => {
    show({ done: 12, total: 44 });
    expect($('heic-progress-text')!.textContent).toBe('Getting your photos ready: 12 of 44');
    expect($('heic-progress-bar')!.style.width).toBe('27%');
    expect(host.textContent).toContain('This can take a minute on a phone. Keep this page open.');
    expect(host.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
  });

  it('then says they are ready (one or many)', () => {
    show({ done: 44, total: 44 });
    expect($('heic-progress-text')!.textContent).toBe('Your photos are ready');
    expect($('heic-progress-bar')).toBeNull();
    show({ done: 1, total: 1 });
    expect($('heic-progress-text')!.textContent).toBe('Your photo is ready');
  });

  it('never says "iPhone": a Samsung saves HEIC too, and its owner was confused (owner, 2026-10-21)', () => {
    for (const progress of [{ done: 3, total: 9 }, { done: 9, total: 9 }]) {
      show(progress);
      expect(host.textContent).not.toMatch(/iphone/i);
    }
  });

  it('Megy\'s upload card says "photos added", not "ready", while they convert', () => {
    const megy = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(megy).toMatch(/builder\.heicProgress && builder\.heicProgress\.done < builder\.heicProgress\.total \? 'photos added' : 'photos ready 🎉'/);
    const state = readFileSync(resolve(__dirname, 'useBuilderState.ts'), 'utf8');
    expect(state).toMatch(/ready: !heicPending && checkIsReady\(uploadedPhotos\)/);
  });

  it('shows on the builder screens; while "Making your album" is up, that screen says it instead (one message)', () => {
    expect(readFileSync(resolve(__dirname, '../Builder.tsx'), 'utf8'))
      .toMatch(/<HeicProgress progress=\{actions\.generating \? null : actions\.heicProgress\} \/>/);
  });
});

/* Tapped "Generate Album" before the iPhone photos were ready (phone walk,
   2026-10-12): "Making your album" covered the count and said "This takes a
   few seconds" while 34 photos were still converting. */
const ctx: { generating: string | null; heicProgress: { done: number; total: number } | null } = { generating: null, heicProgress: null };
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => ctx }));

describe('"Making your album" waiting for iPhone photos', () => {
  const overlay = async () => (await import('./GeneratingOverlay')).default;
  it('says what it is waiting for, with the count, and that it can take a minute', async () => {
    Object.assign(ctx, { generating: 'measuring', heicProgress: { done: 10, total: 44 } });
    const O = await overlay();
    act(() => root.render(createElement(O)));
    expect($('generating-stage')!.textContent).toBe('Getting your photos ready: 10 of 44');
    expect(host.textContent).toContain('This can take a minute on a phone. Keep this page open.');
    expect(host.textContent).not.toContain('This takes a few seconds');
    expect(host.textContent).not.toMatch(/iphone/i); // a Samsung saves HEIC too
  });
  it('once they are ready (or with none): its own stages, as before', async () => {
    Object.assign(ctx, { generating: 'measuring', heicProgress: { done: 44, total: 44 } });
    const O = await overlay();
    act(() => root.render(createElement(O)));
    expect($('generating-stage')!.textContent).toBe('Looking at your photos…');
    expect(host.textContent).toContain('This takes a few seconds');
    Object.assign(ctx, { generating: 'laying_out', heicProgress: null });
    act(() => root.render(createElement(O)));
    expect($('generating-stage')!.textContent).toBe('Arranging them across the pages…');
  });
});
