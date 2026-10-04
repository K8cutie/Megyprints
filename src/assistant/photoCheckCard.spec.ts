// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import PhotoCheckCard from './PhotoCheckCard';
import type { UploadedPhoto } from '../pages/builder/types';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PHOTO CHECK ON THE UPLOAD STEP — "Suggest, one tap" (owner,
   2026-10-04): while it checks it says so; then it shows the blurry and
   repeat shots it found with Leave them out / Keep all (a tap on one photo
   keeps just that one); left-out photos can be brought back; a clean set
   gets a quiet ✓.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const photo = (id: string, extra: Partial<UploadedPhoto> = {}) =>
  ({ id, name: `${id}.jpg`, previewUrl: `blob:${id}`, type: 'image/jpeg', size: 1, width: 4032, height: 3024, ...extra }) as UploadedPhoto;
const none = { blurry: [], repeats: [], keeperOf: {} };

function render(photos: UploadedPhoto[], check: Parameters<typeof PhotoCheckCard>[0]['check']) {
  const h = { onLeaveOut: vi.fn(), onKeep: vi.fn(), onBringBack: vi.fn() };
  act(() => root.render(createElement(PhotoCheckCard, { photos, check, ...h })));
  const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { h, q, text: () => host.textContent!.replace(/\s+/g, ' ') };
}

describe('PhotoCheckCard', () => {
  it('while checking: says so, with how far it is', () => {
    const { q, text } = render([photo('a'), photo('b')], { ready: false, progress: { done: 1, total: 2 }, suggestion: none });
    expect(q('photo-check-running')).not.toBeNull();
    expect(text()).toContain('Megy is checking your photos for blur and repeats… 1 of 2');
  });

  it('suggests the blurry and repeat shots; one tap leaves them all out, one keeps them all', () => {
    const photos = [photo('a'), photo('b'), photo('c'), photo('d')];
    const { h, q, text } = render(photos, { ready: true, progress: { done: 4, total: 4 }, suggestion: { blurry: ['a'], repeats: ['c', 'd'], keeperOf: { c: 'b', d: 'b' } } });
    expect(text()).toContain('Megy found 1 blurry and 2 repeat shots');
    expect([...host.querySelectorAll('[data-testid="photo-check-thumb"]')].map((b) => b.textContent)).toEqual(['Blurry', 'Repeat', 'Repeat']);
    act(() => q('photo-check-leave-out')!.click());
    expect(h.onLeaveOut).toHaveBeenCalledWith(['a', 'c', 'd']);
    act(() => q('photo-check-keep-all')!.click());
    expect(h.onKeep).toHaveBeenCalledWith(['a', 'c', 'd']);
  });

  it('a tap on one photo keeps just that one', () => {
    const { h } = render([photo('a'), photo('c')], { ready: true, progress: { done: 2, total: 2 }, suggestion: { blurry: [], repeats: ['c'], keeperOf: { c: 'a' } } });
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="photo-check-thumb"]')!.click());
    expect(h.onKeep).toHaveBeenCalledWith(['c']);
    expect(h.onLeaveOut).not.toHaveBeenCalled();
  });

  it('nothing found: a quiet ✓; after leaving some out: "N photos left out · Bring them back"', () => {
    const clean = render([photo('a'), photo('b')], { ready: true, progress: { done: 2, total: 2 }, suggestion: none });
    expect(clean.text()).toContain('✓ Megy checked your photos: all sharp, no repeats.');
    const withOut = render([photo('a'), photo('b', { leftOut: true }), photo('c', { leftOut: true })], { ready: true, progress: { done: 1, total: 1 }, suggestion: none });
    expect(withOut.text()).toContain('2 photos left out · Bring them back');
    expect(withOut.text()).not.toContain('all sharp');
    act(() => withOut.q('photo-check-bring-back')!.click());
    expect(withOut.h.onBringBack).toHaveBeenCalledTimes(1);
  });
});
