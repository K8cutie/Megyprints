// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   THE SIDEWAYS HINT COVERS NOTHING (1-star testers, 2026-10-04, the Memory
   Maker): on a portrait phone the preview's "Hold your phone sideways to
   view" pill floated over the toolbar and sat on the start of "10 boxes
   waiting — let Megy finish". It is now its own row under the toolbar.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock('./BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('./CoverEditor', () => ({ default: () => null }));
vi.mock('../../hooks/use-mobile', () => ({ useIsMobile: () => true, useIsPortrait: () => true }));

import BuilderPreview from './BuilderPreview';
import type { AlbumPage } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const pages = Array.from({ length: 40 }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i], photos: [], textElements: [],
  background: { type: 'solid', solid: '#FFFFFF' },
})) as unknown as AlbumPage[];

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); });

describe('portrait phone preview', () => {
  it('the sideways hint is its own row under the toolbar — not floating over it', async () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    h.ctx = { setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront: undefined, finishBoxesWithQuotes: vi.fn(), getAlbumId: () => 'a' };
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(createElement(BuilderPreview, { pages, currentIndex: 0, photos: [], albumSize: '8x8', onGoToPage: () => {}, onBack: () => {}, onOrder: () => {} } as never)); });
    const hint = host.querySelector<HTMLElement>('[data-testid="preview-rotate-hint"]')!;
    const toolbar = host.querySelector<HTMLElement>('[data-testid="preview-edit-pages"]')!.closest('.border-b') as HTMLElement;
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('Hold your phone sideways to view');
    expect(hint.className).not.toMatch(/\babsolute\b/);
    expect(hint.querySelector('.absolute')).toBeNull();
    expect(toolbar.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(toolbar.contains(hint)).toBe(false);
  });
});
