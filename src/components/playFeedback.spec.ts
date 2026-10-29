// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/* ══════════════════════════════════════════════════════════════════════════
   LEAVE FEEDBACK ON GOOGLE PLAY (owner, 2026-10-28: "as long as it leads
   testers where to find the feedback area"). A button that opens the app's
   Play page and three steps to "Private feedback to developer", in the
   Android app while testing, under the sample album's "You're done with
   today's test!" page. The real BuilderPreview over a sample album.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({ ctx: null as unknown, mobile: true, native: true, testing: true }));
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../lib/testingPhase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, get TESTING_PHASE() { return h.testing; } };
});
vi.mock('../pages/builder/BuilderContext', () => ({ useBuilderContext: () => h.ctx }));
vi.mock('../pages/builder/CoverEditor', () => ({ default: () => null }));
vi.mock('../hooks/use-mobile', () => ({ useIsMobile: () => h.mobile, useIsPortrait: () => h.mobile }));

import PlayFeedbackCard from './PlayFeedbackCard';
import { PLAY_LISTING_URL, showPlayFeedback } from '../lib/playFeedback';
import BuilderPreview from '../pages/builder/BuilderPreview';
import type { AlbumPage } from '../pages/builder/types';
import { samplePhotoName } from '../lib/samplePhotos';
import { attachRun, RUN_KEY } from '../lib/dailyTestRun';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const MADE = new Date(2026, 9, 28, 14, 5).getTime();
const photo = (name: string, i: number) => ({ id: `p${i}`, previewUrl: GIF, name, type: 'image/jpeg', size: 1, width: 1200, height: 1200 });
const samples = Array.from({ length: 40 }, (_, i) => photo(samplePhotoName(i + 1), i));
const own = Array.from({ length: 40 }, (_, i) => photo(`IMG_${2000 + i}.jpg`, i));
const album = (n = 40) => Array.from({ length: n }, (_, i) => ({
  id: `page-${i}`, layout: 'single', size: '8x8', templateId: 't88-solo-square', slotFills: [i],
  photos: [], textElements: [], background: { type: 'solid', solid: '#FFFFFF' }, madeAt: MADE,
})) as unknown as AlbumPage[];
const coverFront = {
  id: 'cover-front', layout: 'freeform', size: '8x8', templateId: 'cover-plain', slotFills: [], photos: [], textElements: [],
  background: { type: 'solid', solid: '#1F2A44' },
} as unknown as AlbumPage;

let host: HTMLDivElement;
let root: Root;
let clock = 0;
beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  h.mobile = true; h.native = true; h.testing = true;
  clock = 0;
  // Today's test done on this album (both tasks and the minute): "You're done" shows (lib/dailyTestRun).
  localStorage.clear();
  attachRun({ day: 20754, name: 'Oct 28', before: 'occasion', answer: 'Birthday', album: 'layout' }, MADE, 'layout', { page: 4, slot: null }, []);
  localStorage.setItem(RUN_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(RUN_KEY)!), albumDone: 'new layout on page 5', fgMs: 60_000 }));
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 10_000));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });

h.ctx = {
  setBoxText: vi.fn(), updateTextElement: vi.fn(), setQrFill: vi.fn(), coverDesign: undefined, coverFront,
  finishBoxesWithQuotes: vi.fn(async () => ({ filled: 0, remaining: 0, heldBack: 0, noLine: 0 })), getAlbumId: () => 'album-1',
  deletePages: () => 0,
};
function Preview({ photos, start }: { photos: typeof samples; start: number }) {
  const [index, setIndex] = useState(start);
  return createElement(BuilderPreview, {
    pages: album(), currentIndex: index, photos, albumSize: '8x8', onBack: vi.fn(), onOrder: vi.fn(), onGoToPage: setIndex, turnAnimation: false,
  } as never);
}
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const preview = (photos: typeof samples, start = 39) => act(() => { root.render(createElement(Preview, { photos, start })); });

describe('the feedback box', () => {
  it('in the app, while testing: a button to the app on Google Play, and where to tap there', () => {
    act(() => { root.render(createElement(PlayFeedbackCard)); });
    const open = q('play-feedback-open') as HTMLAnchorElement;
    expect(text(open)).toBe('Leave feedback on Google Play');
    expect(open.getAttribute('href')).toBe('https://play.google.com/store/apps/details?id=com.megyprints.app');
    expect(PLAY_LISTING_URL).toBe(open.getAttribute('href'));
    // A plain link: in the app Capacitor hands another site to Android, which opens the Play Store.
    expect(open.getAttribute('target')).toBeNull();
    expect([...q('play-feedback-steps')!.querySelectorAll('li')].map(text)).toEqual([
      'Tap the button. Megy Prints opens on Google Play.',
      'Scroll down to Private feedback to developer.',
      'Tap the stars, then Write feedback. Only we can see it.',
    ]);
  });
  it('on the website, or with the testing switch off: nothing', () => {
    h.native = false;
    act(() => { root.render(createElement(PlayFeedbackCard)); });
    expect(q('play-feedback')).toBeNull();
    h.native = true; h.testing = false;
    act(() => { root.render(createElement('div', null, createElement(PlayFeedbackCard))); });
    expect(q('play-feedback')).toBeNull();
    expect(showPlayFeedback(true, true)).toBe(true);
    expect(showPlayFeedback(false, true)).toBe(false);
    expect(showPlayFeedback(true, false)).toBe(false);
  });
});

describe('under the sample album\'s "You\'re done" page', () => {
  it('on the last page: the box, under the book (not on the page the tester screenshots)', () => {
    preview(samples);
    expect(text(q('tester-page-note-title'))).toBe("You're done with today's test!");
    const box = q('preview-play-feedback');
    expect(box).not.toBeNull();
    expect(box!.querySelector('[data-testid="play-feedback-open"]')).not.toBeNull();
    expect(q('preview-stage')!.contains(box)).toBe(false);
  });
  it('desktop (the open book) too', () => {
    h.mobile = false;
    preview(samples);
    const box = q('preview-play-feedback');
    expect(box).not.toBeNull();
    expect(box!.querySelector('[data-testid="play-feedback-open"]')).not.toBeNull();
  });
  it('not before the last page, not on an album of your own photos, not on the website', () => {
    preview(samples, 10);
    expect(q('preview-play-feedback')).toBeNull();
    preview(own);
    expect(q('preview-play-feedback')).toBeNull();
    h.native = false;
    preview(samples);
    expect(q('preview-play-feedback')).toBeNull();
  });
});
