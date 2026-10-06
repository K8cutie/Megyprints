// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   "ADD TEXT … THAT SAYS …" ADDS THOSE WORDS, ON THE PAGE, AT A SIZE THAT FITS
   (1-star testers round 3, the Rule-Breaker; confirmed by the checker):
   "add text to this page that says 🦖🦖🦖 RAWR RAWR RAWR this is the longest
   caption ever written …" made the caption "to this page that says 🦖🦖🦖
   RAWR…", at the far right edge of the page in large type, cut off at the
   right and running past the bottom; no warning.
   ══════════════════════════════════════════════════════════════════════════ */

/** Canvas text measuring for jsdom: every character 0.6 em wide. */
const fake = () => {
  const m = { font: '', measureText: (s: string) => ({ width: [...s].length * 0.6 * Number(/(\d+(\.\d+)?)px/.exec(m.font)?.[1] ?? 16) }) as TextMetrics };
  return m as unknown as Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;
};
vi.mock('../pages/builder/textFit', async (importOriginal) => {
  const real = await importOriginal<typeof import('../pages/builder/textFit')>();
  return { ...real, captionFits: (t: string, s: Parameters<typeof real.captionFits>[1], b: Parameters<typeof real.captionFits>[2]) => real.captionFits(t, s, b, fake()) };
});
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../lib/useIndexedDBPhotos', () => {
  const idb = { store: async () => null, get: async () => null, getMany: async () => new Map(), deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [], loading: false, error: null, clearError: () => {} };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('../pages/builder/faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { parseIntent, wordsToAdd } from './intentParser';
import { ActionEngine } from './actionEngine';
import { useBuilderState, relayPageOnTemplate, type BuilderActions } from '../pages/builder/useBuilderState';
import { getTemplateById, getTemplatesForAlbum, photoSlotCount } from '../pages/builder/pageTemplates';
import { getCanvasDimensions } from '../pages/builder/layouts';
import { DRAFT_STORAGE_KEY } from '../lib/localDraft';
import type { AlbumPage, UploadedPhoto } from '../pages/builder/types';

const RAWR = '🦖🦖🦖 RAWR RAWR RAWR this is the longest caption ever written in the history of photo albums and it keeps going and going and going and going and going forever and ever amen 🎉🎉🎉';

describe('Megy takes the words, not the request', () => {
  it('"add text to this page that says …" → only what it says', () => {
    expect(parseIntent(`add text to this page that says ${RAWR}`).intent.payload?.text).toBe(RAWR);
  });
  it.each([
    ['add text: Happy 7th birthday, Kaye!', 'Happy 7th birthday, Kaye!'],
    ['add text that says "Lola\'s 80th"', "Lola's 80th"],
    ['add text on this page saying welcome home', 'welcome home'],
    ['add text to this photo which reads Day 1 in Hong Kong', 'Day 1 in Hong Kong'],
    ['add text Saying goodbye to summer', 'Saying goodbye to summer'], // a caption that starts with "Saying"
    ['add text Best day ever', 'Best day ever'],
  ])('%s → "%s"', (said, words) => { expect(parseIntent(said).intent.payload?.text).toBe(words); });
  it('the cleaning itself', () => {
    expect(wordsToAdd('to the page: "Under the same stars"')).toBe('Under the same stars');
  });
});

/* ── the real builder ── */
const solo = getTemplateById('t88-fb-solo')!;
const boxed = getTemplatesForAlbum('8x8').find((t) => photoSlotCount(t) === 3 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
// 44 one-photo pages + a 3-photo page = 47 photos placed.
const photos: UploadedPhoto[] = Array.from({ length: 47 }, (_, i) => ({ id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200 }));
const base = (i: number) => ({ id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [] } as unknown as AlbumPage);
function album(): AlbumPage[] {
  let next = 0;
  return Array.from({ length: 45 }, (_, i) => i === 10
    ? relayPageOnTemplate({ ...base(i), templateId: boxed.id, slotFills: [next++, next++, next++] } as unknown as AlbumPage, boxed)
    : relayPageOnTemplate({ ...base(i), templateId: solo.id, slotFills: [next++] } as unknown as AlbumPage, solo));
}
let builder!: BuilderActions;
function Probe() { const b = useBuilderState(); useEffect(() => { builder = b; }); return null; }
let root: Root | null = null;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos, albumPages: album(), currentPageIndex: 44, rejectedTemplateIds: [], title: 'Rawr', albumId: 'album-1', accountId: null }));
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });
const say = async (text: string) => {
  let r: { message: string; success: boolean } = { message: '', success: false };
  await act(async () => { r = await new ActionEngine(builder).execute(parseIntent(text).intent); });
  return r;
};

describe('on a full-photo page (page 45), from the chat', () => {
  /** The text box sits inside the page, centred, and its lines end above the page's bottom. */
  const insidePage = (t: { x: number; y: number; width?: number; fontSize: number; text: string }) => {
    const { width: W, height: H } = getCanvasDimensions('8x8');
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + (t.width ?? 0)).toBeLessThanOrEqual(W);
    expect(Math.abs(t.x + (t.width ?? 0) / 2 - W / 2)).toBeLessThanOrEqual(1); // centred
    expect(t.y).toBeGreaterThanOrEqual(0);
    const lines = Math.ceil(([...t.text].length * t.fontSize * 0.6) / (t.width ?? 1));
    expect(t.y + lines * t.fontSize * 1.25).toBeLessThanOrEqual(H);
  };
  it("the Rule-Breaker's words, only them, centred and inside the page (it was a 200-px box at the right edge)", async () => {
    const r = await say(`add text to this page that says ${RAWR}`);
    const t = builder.albumPages[44].textElements.at(-1)!;
    expect(t.text).toBe(RAWR);
    insidePage(t);
    expect(r).toMatchObject({ success: true, message: `Text added: "${RAWR}".` });
  });
  it('longer still: made smaller so it all fits on the page, and Megy says so', async () => {
    const LONG = [RAWR, RAWR, RAWR, RAWR].join(' ');
    const r = await say(`add text that says ${LONG}`);
    const t = builder.albumPages[44].textElements.at(-1)!;
    expect(t.fontSize).toBeLessThan(32);
    insidePage(t);
    expect(r).toMatchObject({ success: true, message: `Text added: "${LONG}", in smaller letters (size ${t.fontSize}) so it all fits.` });
  });
  it('a short line goes on as it is', async () => {
    const r = await say('add text Best day ever');
    expect(builder.albumPages[44].textElements.at(-1)).toMatchObject({ text: 'Best day ever', fontSize: 32 });
    expect(r.message).toBe('Text added: "Best day ever".');
  });
  it('too long to fit at all: nothing is added, and Megy says why', async () => {
    const r = await say(`add text: ${'and going '.repeat(2000)}`);
    expect(builder.albumPages[44].textElements).toHaveLength(0);
    expect(r).toMatchObject({ success: false, message: "That's too long to fit on the page, even in small letters. Try a shorter line." });
  });
});

describe('on a page with a text box (page 11)', () => {
  it('the caption goes in the box at the size that fits the box', async () => {
    await act(async () => { builder.goToPage(10); });
    const LONG = [RAWR, RAWR, RAWR].join(' ');
    await say(`add text that says ${LONG}`);
    const t = builder.albumPages[10].textElements.at(-1)!;
    expect(t).toMatchObject({ text: LONG, boxIndex: 0 });
    expect(t.fontSize).toBeLessThan(28);
  });
});
