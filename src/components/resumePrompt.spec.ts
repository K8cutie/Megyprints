// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   "WELCOME BACK" IS THE FIRST SCREEN, WITH THE LAST 3 ALBUMS (owner,
   2026-10-11, with a phone screenshot): for people who have used the app
   before, the box popped up over Home a second after Home showed, with Home's
   moving cards behind it. "It becomes confusing." Now, for a customer with
   albums, it is the first thing they see, on a plain background, listing
   their last 3 albums: the newest chosen, a tap chooses another, and
   "Yes, resume" opens the chosen one. Home shows after "Not now".
   ══════════════════════════════════════════════════════════════════════════ */

const AUTH: { user: { id: string; user_metadata: Record<string, string>; email: string } | null; loading: boolean } =
  { user: null, loading: true };
vi.mock('../lib/authContext', () => ({ useAuth: () => AUTH }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, supabaseConfigured: true }));
const listAccountAlbums = vi.fn();
vi.mock('../lib/useAlbumSync', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAccountAlbums: (id: string) => listAccountAlbums(id),
}));

import { ResumePrompt, RESUME_HOLD_MS } from './ResumePrompt';
import { RESUME_CACHE_KEY, readResumeCache, writeResumeCache } from '../lib/resumeCache';
import { DRAFT_STORAGE_KEY } from '../lib/localDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

const ME = { id: 'u1', user_metadata: { full_name: 'Archie Garcia' }, email: 'a@example.test' };
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}T00:00:00Z`;
const album = (id: string, d: number, extra: Record<string, unknown> = {}) =>
  ({ id, title: id, sizePreset: '8x8', pages: [], photos: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, name: 'x' })), updatedAt: day(d), ...extra });

let host: HTMLDivElement;
let root: Root;
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const rows = () => [...host.querySelectorAll<HTMLElement>('[data-testid="resume-album"]')];
const names = () => rows().map((r) => r.querySelector('[data-testid="resume-album-name"]')!.textContent);
const checked = () => rows().map((r) => r.getAttribute('aria-checked'));
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

function Where() {
  const l = useLocation();
  return createElement('output', { 'data-testid': 'where' }, `${l.pathname}${l.search}`);
}
const mount = async (path = '/') => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] },
      createElement(ResumePrompt),
      createElement(Routes, null, createElement(Route, { path: '*', element: createElement(Where) }))));
  });
};
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-11T00:00:00Z') });
  localStorage.clear(); sessionStorage.clear();
  AUTH.user = null; AUTH.loading = true;
  listAccountAlbums.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.useRealTimers(); });

// Re-render with the current AUTH (the provider would, when the session is known).
const rerender = async (path = '/') => mount(path);
const keepSession = () => localStorage.setItem('sb-proj-auth-token', '{"access_token":"t"}');

describe('the first screen for a customer with albums', () => {
  it('before the session is even checked: a plain screen, not Home flashing first', async () => {
    keepSession();
    writeResumeCache('u1', [{ id: 'a', title: 'Debut Album', updatedAt: day(5), photoCount: 40 }]);
    await mount();
    expect($('resume-holding')).not.toBeNull();
    expect($('resume-holding')!.className).toMatch(/\bfixed\b.*\binset-0\b.*\bbg-cream\b/);
    expect(host.textContent).not.toContain('Debut'); // no album names until we know whose session it is
  });

  it('nobody signed in on this device: nothing held, nothing shown', async () => {
    await mount();
    expect($('resume-holding')).toBeNull();
    AUTH.loading = false;
    await rerender();
    expect($('resume-prompt')).toBeNull();
    expect(listAccountAlbums).not.toHaveBeenCalled();
  });

  it('albums this device remembers: Welcome back at once, the last 3, newest chosen, on a plain screen', async () => {
    keepSession();
    writeResumeCache('u1', [
      { id: 'old', title: 'Old', updatedAt: day(1), photoCount: 40 },
      { id: 'debut', title: "Maria's Debut", updatedAt: day(9), photoCount: 40 },
      { id: 'lola', title: "Lola's 80th", updatedAt: day(7), photoCount: 40 },
      { id: 'baptism', title: 'Baptism', updatedAt: day(3), photoCount: 40 },
    ]);
    listAccountAlbums.mockReturnValue(new Promise(() => {})); // the account is slow
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    expect($('resume-prompt')).not.toBeNull();
    expect(host.textContent).toContain('Welcome back, Archie!');
    expect(names()).toEqual(["Maria's Debut", "Lola's 80th", 'Baptism']);
    expect(checked()).toEqual(['true', 'false', 'false']);
    // A screen of its own: solid, nothing of Home showing through.
    const screen = $('resume-prompt')!.className;
    expect(screen).toMatch(/\bfixed\b/);
    expect(screen).toMatch(/\binset-0\b/);
    expect(screen).toMatch(/\bbg-cream\b/);
    expect(screen).not.toMatch(/bg-black\//);
    expect($('resume-holding')).toBeNull();
  });

  it('nothing remembered: holds a plain screen while the albums load, then Welcome back', async () => {
    keepSession();
    let land!: (v: unknown) => void;
    listAccountAlbums.mockReturnValue(new Promise((r) => { land = r; }));
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    expect($('resume-holding')).not.toBeNull();
    expect($('resume-prompt')).toBeNull();
    await act(async () => { land([album('a', 1), album('d', 9, { coverPhoto: 'data:image/jpeg;base64,BIG' }), album('b', 3), album('c', 5)]); });
    await flush();
    expect($('resume-holding')).toBeNull();
    expect(names()).toEqual(['d', 'c', 'b']);
    // Remembered for next time: names and dates only, never the pictures.
    expect(readResumeCache('u1')!.map((a) => a.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(localStorage.getItem(RESUME_CACHE_KEY)).not.toContain('coverPhoto');
  });

  it('the account is slow: after a few seconds Home shows, and NOTHING pops up over it later', async () => {
    keepSession();
    let land!: (v: unknown) => void;
    listAccountAlbums.mockReturnValue(new Promise((r) => { land = r; }));
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    await act(async () => { vi.advanceTimersByTime(RESUME_HOLD_MS); });
    expect($('resume-holding')).toBeNull();
    await act(async () => { land([album('a', 1)]); });
    await flush();
    expect($('resume-prompt')).toBeNull(); // the old confusing pop-up over Home
  });

  it('an account with no albums: Home, and next time no plain screen at all', async () => {
    keepSession();
    listAccountAlbums.mockResolvedValue([]);
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    await flush();
    expect($('resume-prompt')).toBeNull();
    expect($('resume-holding')).toBeNull();
    // Next visit (a new session in this browser):
    await act(async () => { root.unmount(); });
    root = createRoot(host);
    sessionStorage.clear();
    AUTH.user = null; AUTH.loading = true;
    await mount();
    expect($('resume-holding')).toBeNull();
  });
});

describe('choosing among the last 3', () => {
  const show = async (list: unknown[]) => {
    keepSession();
    listAccountAlbums.mockResolvedValue(list);
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    await flush();
  };

  it('"Yes, resume" opens the newest (chosen to start with)', async () => {
    await show([album('a', 1), album('b', 2)]);
    await click($('resume-yes')!);
    expect($('where')!.textContent).toBe('/builder?album=b');
    expect($('resume-prompt')).toBeNull();
  });

  it('a tap chooses another album (it does not open it); "Yes, resume" opens the chosen one', async () => {
    await show([album('a', 1), album('b', 2), album('c', 3)]);
    await click(rows()[2]);
    expect(checked()).toEqual(['false', 'false', 'true']);
    expect($('where')!.textContent).toBe('/'); // nothing opened by the tap
    expect($('resume-prompt')).not.toBeNull();
    await click($('resume-yes')!);
    expect($('where')!.textContent).toBe('/builder?album=a');
  });

  it('the album on this device opens the builder as it is', async () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
      title: 'On this phone', albumId: 'x', accountId: 'u1', editedAt: Date.parse(day(10)), uploadedPhotos: [{}, {}],
    }));
    await show([album('x', 1), album('b', 2)]);
    expect(names()).toEqual(['On this phone', 'b']);
    expect(host.textContent).toContain('2 photos · on this device');
    await click($('resume-yes')!);
    expect($('where')!.textContent).toBe('/builder');
  });

  it('"Not now" shows Home, and it is not asked again this visit', async () => {
    await show([album('a', 1)]);
    await click($('resume-not-now')!);
    expect($('resume-prompt')).toBeNull();
    await rerender('/templates');
    await flush();
    expect($('resume-prompt')).toBeNull();
    expect(listAccountAlbums).toHaveBeenCalledTimes(1);
  });

  it('"Start a new album" opens a new one', async () => {
    await show([album('a', 1)]);
    await click($('resume-new')!);
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
  });

  it('shown from this device\'s memory, then brought up to date from the account, keeping the choice', async () => {
    keepSession();
    writeResumeCache('u1', [
      { id: 'a', title: 'a', updatedAt: day(3), photoCount: 40 },
      { id: 'b', title: 'b', updatedAt: day(2), photoCount: 40 },
    ]);
    let land!: (v: unknown) => void;
    listAccountAlbums.mockReturnValue(new Promise((r) => { land = r; }));
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    await click(rows()[1]); // chose b
    await act(async () => { land([album('a', 3, { coverPhoto: 'data:image/jpeg;base64,AAA' }), album('b', 2), album('n', 1)]); });
    await flush();
    expect(names()).toEqual(['a', 'b', 'n']);
    expect(checked()).toEqual(['false', 'true', 'false']);
    expect(rows()[0].querySelector('img')!.getAttribute('src')).toBe('data:image/jpeg;base64,AAA');
  });

  it('says each action in words, with ONE filled button', async () => {
    await show([album('a', 1), album('b', 2)]);
    expect($('resume-yes')!.textContent).toBe('Yes, resume');
    expect($('resume-new')!.textContent).toContain('Start a new album');
    expect($('resume-not-now')!.textContent).toBe('Not now');
    const filled = [...host.querySelectorAll('button')].filter((b) => /\bbg-peach\b/.test(b.className) && !b.getAttribute('role'));
    expect(filled).toEqual([$('resume-yes')]);
    // A button centres its words unless told: the album names line up on the left.
    for (const r of rows()) expect(r.className).toMatch(/\btext-left\b/);
  });
});

describe('where it never interrupts', () => {
  it.each([
    ['a guest\'s camera from a table QR', '/e/ABC123'],
    ['the venue screen', '/e/ABC123/screen'],
    ['the host\'s event', '/events/ev-1'],
    ['the table cards', '/events/ev-1/cards'],
    ['checkout', '/order'],
    ['a link to one album', '/builder?album=zz'],
  ])('%s', async (_what, path) => {
    keepSession();
    writeResumeCache('u1', [{ id: 'a', title: 'a', updatedAt: day(3), photoCount: 40 }]);
    listAccountAlbums.mockResolvedValue([album('a', 3)]);
    await mount(path);
    expect($('resume-holding')).toBeNull();
    AUTH.user = ME; AUTH.loading = false;
    await rerender(path);
    await flush();
    expect($('resume-prompt')).toBeNull();
    expect(listAccountAlbums).not.toHaveBeenCalled();
  });

  it('the Events and booking pages are ordinary pages: it is asked there', async () => {
    keepSession();
    listAccountAlbums.mockResolvedValue([album('a', 3)]);
    await mount('/events/book');
    AUTH.user = ME; AUTH.loading = false;
    await rerender('/events/book');
    await flush();
    expect($('resume-prompt')).not.toBeNull();
  });
});

describe('another person on the same device', () => {
  it('albums remembered for another account are never shown', async () => {
    keepSession();
    writeResumeCache('someone-else', [{ id: 'theirs', title: 'Their Album', updatedAt: day(3), photoCount: 40 }]);
    listAccountAlbums.mockReturnValue(new Promise(() => {}));
    await mount();
    AUTH.user = ME; AUTH.loading = false;
    await rerender();
    expect(host.textContent).not.toContain('Their Album');
  });

  it('signing out forgets the album names (authContext)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../lib/authContext.tsx'), 'utf8');
    const forget = src.slice(src.indexOf('function forgetAccountInTab'), src.indexOf('}', src.indexOf('function forgetAccountInTab')));
    expect(forget).toContain('forgetResumeCache()');
    expect(src).toMatch(/event === 'SIGNED_OUT'\) forgetAccountInTab\(\)/);
  });
});
