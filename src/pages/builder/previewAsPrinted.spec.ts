// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PageView } from './BuilderPreview';
import { getTemplatesForAlbum, photoSlotCount } from './pageTemplates';
import type { AlbumPage, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE PREVIEW SHOWS WHAT PRINTS (1-star testers round 2, PPR2-1): after "let
   Megy finish", 18 of 20 spreads still showed a pink "Tap to add" panel — in
   the preview checkout calls "printed as they look in your preview". An empty
   caption box prints as open space (the quote cadence keeps about half of
   them empty on purpose), so that is how the preview shows it now: still a
   place to tap, its outline and hint only on hover or keyboard focus.
   ══════════════════════════════════════════════════════════════════════════ */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; host?.remove(); });

const photos: UploadedPhoto[] = Array.from({ length: 3 }, (_, i) => ({
  id: `p${i}`, name: `p${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1, width: 1200, height: 1200,
}));
const withBox = getTemplatesForAlbum('8x8').find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0)!;
const page: AlbumPage = {
  id: 'pg', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [],
  templateId: withBox.id, slotFills: [0, 1, 2],
} as AlbumPage;
const render = (props: Record<string, unknown>) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(createElement(PageView, { page, photos, singleW: 400, H: 400, pageIndex: 0, ...props } as never)); });
};

describe('an empty caption box in the "as printed" preview', () => {
  it('is open space: no fill, no visible label — and still a place to tap (a real button, named)', () => {
    const tap = vi.fn();
    render({ asPrinted: true, onTextSlotTap: tap });
    const box = host.querySelector<HTMLButtonElement>('[data-testid="preview-empty-box"]')!;
    expect(box).not.toBeNull();
    expect(box.tagName).toBe('BUTTON');
    expect(box.getAttribute('aria-label')).toBeTruthy();
    const hint = box.querySelector('span')!;
    expect(hint.className).toMatch(/\bopacity-0\b/);
    expect(hint.className).toMatch(/group-hover:opacity-100/);
    expect(hint.className).toMatch(/group-focus-visible:opacity-100/);
    expect((hint as HTMLElement).style.background).toBe('');
    act(() => { box.click(); });
    expect(tap).toHaveBeenCalledWith(0);
  });
  it('the editing views keep the visible "Tap to add text" panel', () => {
    render({ onTextSlotTap: vi.fn() });
    expect(host.querySelector('[data-testid="preview-empty-box"]')).toBeNull();
    expect(host.textContent).toContain('Tap to add');
  });
  it('the preview\'s two spread pages are drawn as printed (source guard)', () => {
    const src = readFileSync(resolve(__dirname, 'BuilderPreview.tsx'), 'utf8');
    expect(src.match(/pageIndex=\{spreadLeftIndex(?: \+ 1)?\} asPrinted/g)).toHaveLength(2);
  });
});
