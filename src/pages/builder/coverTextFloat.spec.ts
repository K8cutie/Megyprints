// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   THE COVER'S WORDS FLOAT (owner, 2026-10-21: "The text on the cover page can
   you add a floating effect so there is a distinction"). A soft shadow sized
   from the letters drops below them, so the title sits lifted off the cover.
   It is on by default — old covers too — and the cover designer's Shadow
   switch turns it off. Inside pages are unchanged. All three renderers (the
   DOM preview, the Fabric editor, print) take it from one rule: wordArtShadow.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { wordArtShadow, wordArtDomStyle, drawWordArtText, WORDART_SHADOW, WORDART_FLOAT } from './wordArt';
import { PageView } from './BuilderPreview';
import { useBuilderState, type BuilderActions } from './useBuilderState';
import { deriveSpine } from './coverLayout';
import { coverWrapGeometry } from './coverGeometry';
import type { AlbumPage } from './types';

const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');

describe('the shadow rule (wordArtShadow)', () => {
  it('cover text floats by default, on a shadow sized from its letters', () => {
    expect(wordArtShadow({ fontSize: 60 }, true)).toEqual({
      color: WORDART_FLOAT.color, offsetX: 0, offsetY: 60 * WORDART_FLOAT.offsetY, blur: 60 * WORDART_FLOAT.blur,
    });
    // bigger letters, bigger lift
    expect(wordArtShadow({ fontSize: 90 }, true)!.offsetY).toBeGreaterThan(wordArtShadow({ fontSize: 30 }, true)!.offsetY);
    expect(wordArtShadow({ fontSize: 60, shadow: true }, true)).toEqual(wordArtShadow({ fontSize: 60 }, true));
  });
  it('the Shadow switch turned off (false) means no shadow on the cover', () => {
    expect(wordArtShadow({ fontSize: 60, shadow: false }, true)).toBeNull();
  });
  it('inside pages are unchanged: the small caption shadow, only when switched on', () => {
    expect(wordArtShadow({ fontSize: 60 })).toBeNull();
    expect(wordArtShadow({ fontSize: 60, shadow: false })).toBeNull();
    expect(wordArtShadow({ fontSize: 60, shadow: true })).toBe(WORDART_SHADOW);
  });
});

describe('the preview draws it (PageView)', () => {
  const page = (shadow?: boolean): AlbumPage => ({
    id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [],
    background: { type: 'solid', solid: '#1F2A44' },
    textElements: [{ id: 't', boxIndex: 0, text: 'Batangas field trip', fontSize: 60, fontFamily: 'Georgia', color: '#FFFFFF', bold: true, italic: false, underline: false, alignment: 'center', x: 0, y: 0, rotation: 0, opacity: 100, ...(shadow === undefined ? {} : { shadow }) }],
  } as unknown as AlbumPage);
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); });
  const titleSpan = () => [...host.querySelectorAll('span')].find((s) => s.textContent === 'Batangas field trip') as HTMLElement;

  it('on the cover the title floats; switched off, it doesn\'t', () => {
    act(() => root.render(createElement(PageView, { page: page(), photos: [], singleW: 500, H: 500, pageIndex: 0, coverMode: true } as never)));
    const sx = 500 / 750;
    const want = wordArtDomStyle({ fontSize: 60 }, sx, true).textShadow as string;
    expect(want).toMatch(/px .*px .*px rgba/);
    expect(titleSpan().style.textShadow.replace(/\s/g, '')).toBe(want.replace(/\s/g, ''));
    act(() => root.render(createElement(PageView, { page: page(false), photos: [], singleW: 500, H: 500, pageIndex: 0, coverMode: true } as never)));
    expect(titleSpan().style.textShadow).toBe('');
  });
});

describe('print draws it (drawWordArtText)', () => {
  /** A canvas that remembers the shadow each fillText was drawn with. */
  const fakeCtx = () => {
    const drawn: { blur: number; dy: number; color: string }[] = [];
    const ctx = {
      shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
      fillText() { drawn.push({ blur: ctx.shadowBlur, dy: ctx.shadowOffsetY, color: ctx.shadowColor }); },
      strokeText() {}, save() {}, restore() {},
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
  };
  it('cover text prints on the floating shadow, scaled like the letters; inside pages print none', () => {
    const scale = 4; // print px per design px
    const a = fakeCtx();
    drawWordArtText(a.ctx, 'Batangas', 0, 0, { fontSize: 60 }, scale, true);
    expect(a.drawn[0]).toEqual({ blur: 60 * WORDART_FLOAT.blur * scale, dy: 60 * WORDART_FLOAT.offsetY * scale, color: WORDART_FLOAT.color });
    const b = fakeCtx();
    drawWordArtText(b.ctx, 'Batangas', 0, 0, { fontSize: 60 }, scale);
    expect(b.drawn[0].blur).toBe(0);
    const c = fakeCtx();
    drawWordArtText(c.ctx, 'Batangas', 0, 0, { fontSize: 60, shadow: false }, scale, true);
    expect(c.drawn[0].blur).toBe(0);
  });
});

describe('every renderer passes "this is the cover" (source guard)', () => {
  it('the preview, print and the editor canvas', () => {
    const p = src('BuilderPreview.tsx');
    expect(p).toContain('...wordArtDomStyle(st, sx, coverMode),');
    expect(p).toContain('...wordArtDomStyle(t, sx, coverMode),');
    expect(p).toContain('...wordArtDomStyle(boxed, sx, coverMode),');
    const pr = src('printPipeline.ts');
    expect(pr).toContain('renderTextElement(ctx, text, W, H, slot, uiW, coverMode);');
    expect(pr).toContain('renderSlotText(ctx, st, sx, sy, sw, sh, W, uiW, coverMode);');
    expect(pr).toContain('fontSize, text, W / uiW, coverMode);');
    expect(pr).toContain('drawWordArtText(ctx, line, cx, step / 2 + i * step, text, eff, coverMode)');
    expect(pr).toContain('fontSize, st, W / uiW, coverMode);');
    const f = src('useCanvasEngine.ts');
    expect(f).toContain('shadow: fabricShadow(fab, text, coverMode),');
    expect(f).toContain('shadow: fabricShadow(fab, st, coverMode),');
    // Off (false) and unset draw differently on the cover: the canvas must repaint between them.
    expect(f).toContain("${t.shadow === undefined ? '' : t.shadow ? 1 : 0}");
  });
  it('the spine and the branded back keep their own text: no float there', () => {
    expect(src('printPipeline.ts')).toContain('drawWordArtText(ctx, st.text, 0, 0, st, 1);');
  });
});

describe('the cover designer\'s Shadow switch', () => {
  let builder!: BuilderActions;
  function Probe() {
    const b = useBuilderState();
    useEffect(() => { builder = b; });
    return null;
  }
  let root: Root | null = null;
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear(); sessionStorage.clear();
    root = createRoot(document.createElement('div'));
    await act(async () => { root!.render(createElement(Probe)); });
  });
  afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });
  const title = () => builder.coverFront.textElements?.find((t) => t.boxIndex === 0);

  it('off is kept as off; on again goes back to floating; the spine never picks it up', async () => {
    await act(async () => { builder.setAlbumTitle('Batangas field trip'); });
    expect(title()?.shadow).toBeUndefined();                       // floats
    await act(async () => { builder.setEditScope('coverFront'); });
    await act(async () => { builder.setBoxText(0, { text: 'Batangas field trip', shadow: false } as never); });
    expect(title()?.shadow).toBe(false);                           // the switch, off
    expect(wordArtShadow({ ...title()!, fontSize: title()!.fontSize }, true)).toBeNull();
    await act(async () => { builder.setBoxText(0, { text: 'Batangas field trip', shadow: undefined } as never); });
    expect(title()?.shadow).toBeUndefined();                       // on again
    expect(deriveSpine(builder.coverFront, coverWrapGeometry('8x8', 40, 'hardboundLinen')).text.shadow).toBeFalsy();
  });
  it('the button reads and writes that rule (source guard)', () => {
    const e = src('CoverEditor.tsx');
    expect(e).toContain('shadow: titleEl?.shadow !== false,');
    expect(e).toContain('onClick={() => updateTitle({ shadow: title.shadow ? false : undefined })}');
    expect(e).toContain('data-testid="cover-title-shadow"');
  });
});
