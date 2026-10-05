// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AlbumPage, TextElement, UploadedPhoto } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S QUOTES FOLLOW THE OCCASION (1-star testers round 3, the Indecisive
   One; confirmed by the checker): a "Family" album switched to "Vacation" on
   Step 1 kept "The table is always full" and "Sunday lunches and big hugs",
   while Step 1 says "Megy writes the quotes on your pages to match it. You
   can change it later". Only a full regenerate changed them, and that threw
   away every page edit. Now each quote Megy deals carries its occasion; Next
   on Step 1 swaps those for the new occasion's lines, keeps the customer's
   own, says so, and Undo puts them back.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('../../lib/authContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => ({}), auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock('../../lib/useIndexedDBPhotos', () => {
  const idb = {
    store: async () => null, get: async () => null, getMany: async () => new Map(),
    deletePhoto: async () => {}, deleteMany: async () => {}, list: async () => [],
    loading: false, error: null, clearError: () => {},
  };
  return { useIndexedDBPhotos: () => idb, getImageDimensions: async () => ({ width: 0, height: 0 }) };
});
vi.mock('./faceDetection', () => ({ initFaceApi: async () => {}, detectFaceCenter: async () => null }));

import { useBuilderState, relayPageOnTemplate, type BuilderActions } from './useBuilderState';
import { generateAlbum, dealAlbumBoxes } from './generateAlbum';
import { getTemplatesForAlbum, getTemplateById, photoSlotCount } from './pageTemplates';
import { DRAFT_STORAGE_KEY } from '../../lib/localDraft';
import { quotesForThemeNow } from '../../lib/quotes';
import { occasionQuotesMessage } from '../../assistant/rebuildQuestion';
import { seedMathRandom } from '../../test/seededRandom';

seedMathRandom();

const FAMILY = quotesForThemeNow('Family');
const VACATION = new Set(quotesForThemeNow('Vacation'));

describe('every quote Megy deals carries its occasion', () => {
  it('generation marks its quotes with the occasion the pool was written for', () => {
    const photos: UploadedPhoto[] = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, previewUrl: '', name: `p${i}.jpg`, type: 'image/jpeg', size: 1, width: 1440, height: 1440 }));
    const pages = generateAlbum(photos, '8x8', undefined);
    dealAlbumBoxes(pages, { quotePool: FAMILY, quoteFontFamily: 'Georgia', quoteColor: '#2D2D2D', occasion: 'Family' });
    const quotes = pages.flatMap((p) => p.textElements);
    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) expect(q).toMatchObject({ fromOccasion: 'Family' });
  });
});

/* ── the real builder ── */
const boxed = getTemplatesForAlbum('8x8').find((t) => photoSlotCount(t) === 2 && (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))
  ?? getTemplatesForAlbum('8x8').find((t) => (t.textSlots?.length ?? 0) > 0 && !t.slots.some((s) => s.kind === 'qr'))!;
const solo = getTemplateById('t88-fb-solo')!;
const quote = (id: string, text: string, fromOccasion?: string): TextElement => ({
  id, text, x: 0, y: 0, fontSize: 28, fontFamily: 'Georgia', color: '#2D2D2D', bold: false, italic: true, underline: false,
  alignment: 'center', rotation: 0, opacity: 100, boxIndex: 0, ...(fromOccasion ? { fromOccasion } : {}),
});
const photos: UploadedPhoto[] = Array.from({ length: 50 }, (_, i) => ({ id: `photo-${i}`, name: `photo-${i}.jpg`, previewUrl: `https://photos.test/${i}.jpg`, type: 'image/jpeg', size: 1000, width: 1200, height: 1200 }));
/** 40 pages; pages 22 and 29 carry Megy's Family quotes, page 10 a line the customer wrote. */
function album(): AlbumPage[] {
  let next = 0;
  const base = (i: number) => ({ id: `page-${i}`, layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' }, photos: [], textElements: [] } as unknown as AlbumPage);
  return Array.from({ length: 40 }, (_, i) => {
    const words = i === 21 ? quote('q22', FAMILY[0], 'Family') : i === 28 ? quote('q29', FAMILY[1], 'Family') : i === 9 ? quote('mine', 'Grandma turns 80!') : null;
    if (words) return relayPageOnTemplate({ ...base(i), templateId: boxed.id, slotFills: Array.from({ length: photoSlotCount(boxed) }, () => next++), textElements: [words] } as unknown as AlbumPage, boxed);
    return relayPageOnTemplate({ ...base(i), templateId: solo.id, slotFills: [next++] } as unknown as AlbumPage, solo);
  });
}
const lineOn = (b: BuilderActions, i: number) => b.albumPages[i].textElements[0];

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
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    albumType: 'standard', albumSize: '8x8', selectedTemplate: 'classic', uploadedPhotos: photos,
    albumPages: album(), currentPageIndex: 0, rejectedTemplateIds: [], title: 'HK Vacation 2026', albumId: 'album-1', accountId: null,
  }));
  root = createRoot(document.createElement('div'));
  await act(async () => { root!.render(createElement(Probe)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => { root?.unmount(); }); root = null; });

describe('Family → Vacation on a made album', () => {
  it('Megy\'s two Family quotes become Vacation lines, in the same boxes; the customer\'s own line stays', async () => {
    expect(lineOn(builder, 21).text).toBe(FAMILY[0]);
    let r = { changed: 0, cleared: 0 };
    await act(async () => { r = await builder.requoteForOccasion('Vacation'); });
    expect(r).toEqual({ changed: 2, cleared: 0 });
    for (const i of [21, 28]) {
      expect(VACATION.has(lineOn(builder, i).text), `page ${i + 1}: "${lineOn(builder, i).text}"`).toBe(true);
      expect(lineOn(builder, i)).toMatchObject({ boxIndex: 0, fontFamily: 'Georgia', fromOccasion: 'Vacation' });
    }
    expect(lineOn(builder, 21).text).not.toBe(lineOn(builder, 28).text); // never the same line twice
    expect(lineOn(builder, 9)).toMatchObject({ text: 'Grandma turns 80!' });
    expect(lineOn(builder, 9).fromOccasion).toBeUndefined();
  });
  it('Undo puts the Family quotes back', async () => {
    await act(async () => { await builder.requoteForOccasion('Vacation'); });
    await act(async () => { builder.undo(); });
    expect(lineOn(builder, 21).text).toBe(FAMILY[0]);
    expect(lineOn(builder, 28).text).toBe(FAMILY[1]);
  });
  it('the same occasion again changes nothing', async () => {
    let r = { changed: -1, cleared: -1 };
    await act(async () => { r = await builder.requoteForOccasion('family'); });
    expect(r).toEqual({ changed: 0, cleared: 0 });
    expect(lineOn(builder, 21).text).toBe(FAMILY[0]);
  });
  it('a quote the customer rewrote or picked is theirs: it stays when the occasion changes', async () => {
    await act(async () => { builder.goToPage(21); });
    await act(async () => { builder.setBoxText(0, { text: 'Our big Hong Kong week' }); });
    await act(async () => { builder.goToPage(28); });
    await act(async () => { builder.updateTextElement('q29', { fontFamily: 'Playfair Display' }); }); // style only: still Megy's
    let r = { changed: 0, cleared: 0 };
    await act(async () => { r = await builder.requoteForOccasion('Vacation'); });
    expect(r).toEqual({ changed: 1, cleared: 0 });
    expect(lineOn(builder, 21)).toMatchObject({ text: 'Our big Hong Kong week' });
    expect(VACATION.has(lineOn(builder, 28).text)).toBe(true);
    expect(lineOn(builder, 28).fontFamily).toBe('Playfair Display'); // the customer's style stays
  });
});

describe('Megy says what changed', () => {
  it('the toast after Step 1', () => {
    expect(occasionQuotesMessage('Vacation', 9, 0)).toBe('Your album is about Vacation now, so Megy changed 9 quotes she wrote to Vacation ones. Lines you wrote or picked stay. Undo puts the old ones back.');
    expect(occasionQuotesMessage('Vacation', 1, 2)).toBe('Your album is about Vacation now, so Megy changed 1 quote she wrote to Vacation ones and cleared 2 quotes she had no new line for. Lines you wrote or picked stay. Undo puts the old ones back.');
  });
  it('Step 1\'s Next swaps the quotes on a made album (source guard)', () => {
    const src = readFileSync(resolve(__dirname, '../../assistant/MegyAssistant.tsx'), 'utf8');
    expect(src).toMatch(/if \(albumIsMade\(builder\.albumPages\)\) setRequoteFor\(\{ occasion: albumTheme\.trim\(\) \}\);/);
    expect(src).toMatch(/void builder\.requoteForOccasion\(occasion\)\.then\(\(\{ changed, cleared \}\) => \{\s*if \(changed \+ cleared > 0\) showToast\(occasionQuotesMessage\(occasion, changed, cleared\), 7000\);/);
    const state = readFileSync(resolve(__dirname, 'useBuilderState.ts'), 'utf8');
    expect(state.match(/occasion: currentAlbumTheme\(\)/g)).toHaveLength(2); // generation and "let Megy finish" both mark their quotes
  });
});
