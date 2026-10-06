// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   OFFLINE, YOUR PROJECTS SAYS IT COULDN'T LOAD, AND LOADS AGAIN BY ITSELF
   (1-star testers round 3, the Connection Drop; confirmed by the checker):
   with the connection cut, Home said "No projects yet. Create your first
   photo album" with "Create Your First Album", and 22 seconds after the
   connection came back it still did: no error, no retry, no new request. A
   returning customer would think the album was deleted.
   ══════════════════════════════════════════════════════════════════════════ */

const AUTH = { user: { id: 'u1' } };
vi.mock('../lib/authContext', () => ({ useAuth: () => AUTH }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) } }));
const listAccountAlbums = vi.fn();
vi.mock('../lib/useAlbumSync', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listAccountAlbums: (id: string) => listAccountAlbums(id),
  useAlbumSync: () => ({ deleteAlbum: async () => ({ success: true }) }),
}));

import { UserProjectsSection } from './UserProjectsSection';
import { ALBUMS_RETRY_MS } from '../lib/useAccountAlbums';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
const OFFLINE = Object.assign(new TypeError('Failed to fetch'), { message: 'TypeError: Failed to fetch' });
const ALBUM = { id: 'a1', title: 'Dead WiFi Hong Kong', sizePreset: '8x8', pages: [], photos: [], updatedAt: '2026-10-06T00:00:00Z' };

let host: HTMLDivElement;
let root: Root;
const text = () => host.textContent ?? '';
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
beforeEach(async () => {
  vi.useFakeTimers();
  listAccountAlbums.mockReset();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.useRealTimers(); });
const mount = async () => { await act(async () => { root.render(createElement(MemoryRouter, null, createElement(UserProjectsSection))); }); await flush(); };

describe('Your Projects, offline', () => {
  it('a failed load says it couldn\'t load, with Try again: never "No projects yet"', async () => {
    listAccountAlbums.mockRejectedValue(OFFLINE);
    await mount();
    expect(host.querySelector('[data-testid="albums-load-failed"]')).not.toBeNull();
    expect(text()).toContain("We couldn't load your albums");
    expect(text()).toContain("Couldn't load your albums");
    expect(text()).not.toContain('No projects yet');
    expect(text()).not.toContain('Create Your First Album');
  });
  it('the connection back ("online"): it loads again by itself, and the album is there', async () => {
    listAccountAlbums.mockRejectedValueOnce(OFFLINE).mockResolvedValue([ALBUM]);
    await mount();
    expect(text()).toContain("We couldn't load your albums");
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(listAccountAlbums).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Dead WiFi Hong Kong');
    expect(text()).toContain('1 saved album');
  });
  it('a Wi-Fi the browser still calls online: it tries again every so often, and keeps saying "couldn\'t load" meanwhile', async () => {
    listAccountAlbums.mockRejectedValueOnce(OFFLINE).mockRejectedValueOnce(OFFLINE).mockResolvedValue([ALBUM]);
    await mount();
    await act(async () => { vi.advanceTimersByTime(ALBUMS_RETRY_MS); });
    await flush();
    expect(listAccountAlbums).toHaveBeenCalledTimes(2);
    expect(text()).not.toContain('No projects yet'); // never a flash of the empty state
    await act(async () => { vi.advanceTimersByTime(ALBUMS_RETRY_MS); });
    await flush();
    expect(listAccountAlbums).toHaveBeenCalledTimes(3);
    expect(text()).toContain('Dead WiFi Hong Kong');
  });
  it('"Try again" tries again', async () => {
    listAccountAlbums.mockRejectedValueOnce(OFFLINE).mockResolvedValue([ALBUM]);
    await mount();
    await act(async () => { (host.querySelector('[data-testid="albums-retry"]') as HTMLButtonElement).click(); });
    await flush();
    expect(text()).toContain('Dead WiFi Hong Kong');
  });
  it('really no albums: the empty state, as before', async () => {
    listAccountAlbums.mockResolvedValue([]);
    await mount();
    expect(text()).toContain('No projects yet');
    expect(host.querySelector('[data-testid="albums-load-failed"]')).toBeNull();
  });
});
