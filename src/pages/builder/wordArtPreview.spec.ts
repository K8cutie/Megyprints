// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { PageView } from './BuilderPreview';
import type { AlbumPage } from './types';

/* The website has no buttons for WordArt, but it shows and prints what the app
   made. Outline and glow are CSS on the title; a two-colour fill and a curve are
   drawn on a canvas by print's own code. */
vi.mock('./wordArt', async (real) => {
  const mod = await real<typeof import('./wordArt')>();
  return { ...mod, drawCurvedWordArtText: vi.fn(), drawWrappedWordArtText: vi.fn() };
});

const page = (extra: object): AlbumPage => ({
  id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [],
  background: { type: 'solid', solid: '#1F2A44' },
  textElements: [{ id: 't', boxIndex: 0, text: 'Our Days', fontSize: 60, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0, rotation: 0, opacity: 100, ...extra }],
} as unknown as AlbumPage);

describe('the DOM preview of WordArt on a cover', () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); });
  const show = (extra: object) => act(() => root.render(createElement(PageView, { page: page(extra), photos: [], singleW: 500, H: 500, pageIndex: 0, coverMode: true } as never)));
  const canvas = () => host.querySelector('[data-testid="wordart-canvas"]');
  const title = () => [...host.querySelectorAll('span')].find((s) => s.textContent === 'Our Days') as HTMLElement | undefined;

  it('plain words, an outline and a glow stay ordinary text', () => {
    show({});
    expect(canvas()).toBeNull();
    expect(title()).toBeTruthy();
    show({ outlineColor: '#000000', outlineWidth: 8 });
    expect(canvas()).toBeNull();
    show({ glow: '#FF8A3D' });
    expect(canvas()).toBeNull();
    expect(title()!.style.textShadow).toContain('#FF8A3D');
  });

  it('a two-colour fill and a curve are drawn on a canvas, named for screen readers; a curve is not clipped to the box', () => {
    show({ fillTo: '#E8772E' });
    expect(canvas()?.getAttribute('aria-label')).toBe('Our Days');
    expect(title()).toBeUndefined();
    expect((canvas()!.parentElement as HTMLElement).style.overflow).toBe('hidden');
    show({ curve: 'arch' });
    expect(canvas()).toBeTruthy();
    expect((canvas()!.parentElement as HTMLElement).style.overflow).toBe('visible');
  });
});
