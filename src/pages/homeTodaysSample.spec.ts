// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   "MAKE TODAY'S SAMPLE ALBUM" ON THE APP'S HOME SCREEN (tester, 2026-10-29:
   "maybe a little less text in the steps [too many things to read hah]";
   owner: he meant a faster way to the sample album). In the Android app
   while testing, the first thing on Home is one filled button that makes
   today's sample album at once, the way "Welcome back" does (#208). It never
   throws a guest's own album away without asking. The website: no change.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => {
  // GSAP's ScrollTrigger reads these when Home loads (jsdom has neither).
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  return { native: true, testing: true, user: null as { id: string } | null };
});
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../lib/testingPhase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, get TESTING_PHASE() { return h.testing; } };
});
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, supabaseConfigured: false }));
vi.mock('../components/UserProjectsSection', () => ({ UserProjectsSection: () => null, formatRelativeTime: () => '' }));
vi.mock('./BuilderDemoSection', () => ({ default: () => null }));

import Home from './Home';
import { asksBeforeTodaysSample } from './home/TodaysSampleAlbum';
import { DRAFT_STORAGE_KEY, readLocalDraftSummary, type LocalDraftSummary } from '../lib/localDraft';
import { samplePhotoName } from '../lib/samplePhotos';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;

let host: HTMLDivElement;
let root: Root;
// The question is a portal on <body>, so look in the whole page.
const $ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function Where() {
  const l = useLocation();
  return createElement('output', { 'data-testid': 'where' }, l.pathname);
}
const mount = async () => {
  await act(async () => { root.render(null); });
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement(Home) }),
        createElement(Route, { path: '*', element: createElement(Where) }))));
  });
};
const tap = async (id: string) => { await act(async () => { $(id)!.click(); }); };
const storage = () => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } });

const own = Array.from({ length: 45 }, (_, i) => ({ id: `o${i}`, name: `IMG_${3000 + i}.jpg` }));
const samples = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: samplePhotoName(i + 1) }));
const YESTERDAY = Date.now() - 24 * 3600e3;
const seedDraft = (d: Record<string, unknown>) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ editedAt: 1, ...d }));

beforeEach(() => {
  h.native = true; h.testing = true; h.user = null;
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

describe('who sees it', () => {
  it('the Android app while testing: one filled button, first on Home, and what to send', async () => {
    await mount();
    const box = $('home-todays-sample')!;
    const make = $('home-todays-sample-make')!;
    expect(text(make)).toBe("Make today's sample album");
    expect(make.className).toContain('bg-peach');
    expect(text($('home-todays-sample-how'))).toBe('Testers: tap it, turn to the last page, and screenshot "You\'re done".');
    // Above "Turn your photos into a printed album" (the Albums card).
    expect(box.compareDocumentPosition($('home-albums-card')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One filled button in the box, nothing greyed.
    expect(box.querySelectorAll('button')).toHaveLength(1);
    expect(make.hasAttribute('disabled')).toBe(false);
  });

  it('the website, or the app with TESTING_PHASE off: nothing (Home as it was)', async () => {
    for (const [native, testing] of [[false, true], [true, false], [false, false]]) {
      h.native = native; h.testing = testing;
      await mount();
      expect($('home-todays-sample')).toBeNull();
      expect($('home-albums-card')).not.toBeNull();
    }
  });
});

describe('one tap', () => {
  it("sets #208's two flags and opens the builder, with no sign-in nudge over the album", async () => {
    await mount();
    await tap('home-todays-sample-make');
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1'); // a new album
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1'); // made as the builder opens
    expect(sessionStorage.getItem('megy_soft_auth_dismissed')).toBe('1');
  });

  it('a sample album in progress, from yesterday or today: just makes today\'s', async () => {
    for (const made of [YESTERDAY, Date.now()]) {
      sessionStorage.clear();
      seedDraft({ title: 'Sample Album · Oct 28', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: made }] });
      await mount();
      await tap('home-todays-sample-make');
      expect($('todays-sample-ask')).toBeNull();
      expect($('where')!.textContent).toBe('/builder');
      expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
    }
  });

  it('signed in with their own album: no question (the builder saves it to the account as it puts it away)', async () => {
    h.user = { id: 'u1' };
    seedDraft({ title: 'HK Trip', accountId: 'u1', uploadedPhotos: own });
    await mount();
    await tap('home-todays-sample-make');
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
  });
});

describe('signed out, with their own album on this phone', () => {
  beforeEach(() => seedDraft({ title: 'HK Trip', uploadedPhotos: own }));

  it('asks first, in plain words: one filled way on, and "Keep my album"', async () => {
    await mount();
    await tap('home-todays-sample-make');
    const ask = $('todays-sample-ask')!;
    expect(ask).not.toBeNull();
    expect(ask.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(text(ask.querySelector('h2'))).toBe('You have an album in progress on this phone.');
    expect(text(ask.querySelector('p'))).toBe('A sample album starts a new one. Sign in first to keep yours.');
    expect(text($('todays-sample-ask-make'))).toBe('Make the sample album');
    expect($('todays-sample-ask-make')!.className).toContain('bg-peach');
    expect(text($('todays-sample-ask-keep'))).toBe('Keep my album');
    expect($('todays-sample-ask-keep')!.className).not.toContain('bg-peach');
    // Nothing happened yet.
    expect($('where')).toBeNull();
    expect(sessionStorage.getItem('megy-fresh-start')).toBeNull();
    expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();
  });

  it('"Keep my album" changes nothing: the album, the flags, the page', async () => {
    await mount();
    const before = storage();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask-keep');
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')).toBeNull(); // still on Home
    expect($('home-todays-sample')).not.toBeNull();
    expect(storage()).toBe(before);
    expect(readLocalDraftSummary()).toMatchObject({ title: 'HK Trip', photoCount: 45 });
  });

  it('Escape or a tap outside keeps it too', async () => {
    await mount();
    const before = storage();
    await tap('home-todays-sample-make');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('todays-sample-ask')).toBeNull();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask');
    expect($('todays-sample-ask')).toBeNull();
    expect(storage()).toBe(before);
  });

  it('"Make the sample album": the same new album as one tap', async () => {
    await mount();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask-make');
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
  });
});

describe('asksBeforeTodaysSample — when a tap asks first', () => {
  const draft = (over: Partial<LocalDraftSummary> = {}): LocalDraftSummary =>
    ({ title: 'HK Trip', photoCount: 45, accountId: null, editedAt: 1, hasContent: true, isSample: false, ...over });
  it('only for a guest\'s own album', () => {
    expect(asksBeforeTodaysSample(draft(), false)).toBe(true);
    expect(asksBeforeTodaysSample(draft({ hasContent: false, photoCount: 0 }), false)).toBe(true); // just a name
    expect(asksBeforeTodaysSample(draft(), true)).toBe(false);
    expect(asksBeforeTodaysSample(draft({ isSample: true }), false)).toBe(false);
    expect(asksBeforeTodaysSample(null, false)).toBe(false);
  });
});

describe('readLocalDraftSummary — isSample', () => {
  const read = (d: Record<string, unknown>) => { seedDraft(d); return readLocalDraftSummary()!.isSample; };
  it('every photo a sample, made or not', () => {
    expect(read({ title: 'Sample Album · Oct 28', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: YESTERDAY }] })).toBe(true);
    expect(read({ title: 'Sample Album', uploadedPhotos: samples })).toBe(true);
  });
  it('any photo of their own, and it is theirs', () => {
    expect(read({ title: 'Sample Album', uploadedPhotos: [...samples, own[0]] })).toBe(false);
    expect(read({ title: 'HK Trip', uploadedPhotos: own })).toBe(false);
  });
  it("no photos: the sample album's name (its photos didn't come in) is a sample; any other name is theirs", () => {
    expect(read({ title: 'Sample Album · Oct 29', uploadedPhotos: [] })).toBe(true);
    expect(read({ title: 'HK Trip', uploadedPhotos: [] })).toBe(false);
  });
});
