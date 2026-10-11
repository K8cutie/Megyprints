// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   "START A NEW ALBUM" FROM WELCOME BACK GOES TO THE HOMEPAGE (owner,
   2026-10-11), where they pick a new album or an event. They already said
   new: Home's Start Creating must not ask "continue the album in progress?"
   a second time. Coming to Home any other way, it still asks (1-star
   testers, 2026-10-04: an album in progress was lost to Start Creating).
   ══════════════════════════════════════════════════════════════════════════ */

// GSAP's ScrollTrigger reads these when Home loads (jsdom has neither).
vi.hoisted(() => {
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
});
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, loading: false }) }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, supabaseConfigured: false }));
vi.mock('../components/UserProjectsSection', () => ({ UserProjectsSection: () => null, formatRelativeTime: () => '' }));
vi.mock('./BuilderDemoSection', () => ({ default: () => null }));

import Home from './Home';
import { DRAFT_STORAGE_KEY } from '../lib/localDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;

let host: HTMLDivElement;
let root: Root;
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function Where() {
  const l = useLocation();
  return createElement('output', { 'data-testid': 'where' }, l.pathname);
}
const mount = async (entry: string | { pathname: string; state: unknown }) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [entry] },
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement(Home) }),
        createElement(Route, { path: '*', element: createElement(Where) }))));
  });
};

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  // An album in progress on this phone.
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ title: 'HK Trip', accountId: 'u1', editedAt: 1, uploadedPhotos: [{}, {}, {}] }));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); });

describe('Home after "Start a new album" in Welcome back', () => {
  it('Start Creating goes straight to a new album: no second question', async () => {
    await mount({ pathname: '/', state: { choseNew: true } });
    await act(async () => { $('home-start-creating')!.click(); });
    expect($('start-new-continue')).toBeNull();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1'); // a NEW album, not the one in progress
  });

  it('Book your event is right there too', async () => {
    await mount({ pathname: '/', state: { choseNew: true } });
    expect($('home-events-book')!.getAttribute('href')).toBe('/events');
  });

  it('coming to Home any other way, Start Creating still asks about the album in progress', async () => {
    await mount('/');
    await act(async () => { $('home-start-creating')!.click(); });
    expect($('start-new-continue')).not.toBeNull();
    expect(sessionStorage.getItem('megy-fresh-start')).toBeNull();
  });
});
