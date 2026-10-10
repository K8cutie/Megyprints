// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   MEGYPRINTS EVENTS, THE TWO PHONES (0044/0045). A guest scans the table QR,
   joins with a name and shares; the host sees what came in, picks, removes
   a guest, and makes the album from the picks. These walk both screens with
   the real page code against a fake database.
   ══════════════════════════════════════════════════════════════════════════ */

type Rpc = (args: Record<string, unknown>) => { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  rpc: {} as Record<string, Rpc>,
  calls: [] as [string, unknown][],
  uploads: [] as string[],
  downloads: [] as string[],
  booking: null as unknown,
  fresh: vi.fn(),
  // One object, as the real auth context gives: a new one each render loops the page's effects.
  auth: { user: { id: 'host-1', email: 'host@example.test' }, loading: false },
}));
vi.mock('../lib/supabase', () => {
  const q = {
    select: () => q, eq: () => q,
    maybeSingle: async () => ({ data: h.booking, error: null }),
  };
  return {
    supabaseConfigured: true,
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        h.calls.push([name, args]);
        return h.rpc[name] ? h.rpc[name](args) : { data: null, error: null };
      },
      from: () => q,
      storage: {
        from: (bucket: string) => ({
          upload: async (name: string) => { h.uploads.push(`${bucket}/${name}`); return { error: null }; },
          download: async (name: string) => { h.downloads.push(`${bucket}/${name}`); return { data: new Blob(['jpg']), error: null }; },
          getPublicUrl: (name: string) => ({ data: { publicUrl: `https://x/${bucket}/${name}` } }),
        }),
      },
    },
  };
});
vi.mock('../lib/eventImage', () => ({
  makePhotoCopies: async () => ({ original: new Blob(['o']), view: new Blob(['v']), thumb: new Blob(['t']), width: 3600, height: 2400 }),
  videoFacts: async () => ({ thumb: new Blob(['t']), durationS: 5, width: 1080, height: 1920 }),
}));
vi.mock('../lib/videoTranscode', () => ({ transcodeSupported: () => false, transcodeToMp4: vi.fn() }));
vi.mock('../lib/qrMemory', () => ({ generateQrPngDataUrl: async () => 'data:image/png;base64,AA==' }));
vi.mock('../lib/authContext', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/albumSession', () => ({ startFreshAlbum: (id: string) => h.fresh(id) }));

import EventGuest from './EventGuest';
import EventManage from './EventManage';
import { takePendingEventImport } from '../lib/eventAlbum';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

const EV = {
  title: 'Ana & Ben', event_type: 'wedding', event_date: '2026-10-10', kids_on: true, open: true,
  opens_on: '2026-10-09', closes_on: '2026-10-17', photos_per_guest: 20, videos_per_guest: 2, tables: 10,
};
const feedItem = (id: string, over: Record<string, unknown> = {}) => ({
  id, booking_id: 'b1', kind: 'photo', ext: 'jpg', guest_name: 'Migo', table_no: 5, ready_at: '2026-10-10T10:00:00Z', mine: false, hidden: false, width: 1, height: 1, ...over,
});

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  localStorage.clear();
  h.calls = []; h.uploads = []; h.downloads = []; h.fresh.mockReset();
  h.rpc = {
    event_public: () => ({ data: EV, error: null }),
    event_copy_offer: () => ({ data: false, error: null }),
    event_join: () => ({ data: { guest_id: 'g1', token: 'tok-1' }, error: null }),
    event_me: () => ({ data: { guest_id: 'g1', name: 'Tita Lorna', table_no: 5, photos: 0, videos: 0 }, error: null }),
    event_feed: () => ({ data: [], error: null }),
    event_media_begin: () => ({ data: { media_id: 'm1', booking_id: 'b1', objects: [{ bucket: 'event-originals', name: 'b1/m1.jpg' }, { bucket: 'event-media', name: 'b1/m1-v.jpg' }, { bucket: 'event-media', name: 'b1/m1-t.jpg' }] }, error: null }),
    event_media_ready: () => ({ data: true, error: null }),
  };
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Where() { const l = useLocation(); return createElement('p', { 'data-testid': 'where' }, l.pathname); }
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const render = async (at: string) => {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [at] },
      createElement(Routes, null,
        createElement(Route, { path: '/e/:code', element: createElement(EventGuest) }),
        createElement(Route, { path: '/events/:id', element: createElement(EventManage) }),
        createElement(Route, { path: '*', element: createElement(Where) }),
      )));
  });
  await settle();
};
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const $$ = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
const click = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await settle(); };
const type = async (el: Element | null, value: string) => {
  await act(async () => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const pickFiles = async (input: Element | null, files: File[]) => {
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: Object.assign(files, { item: (i: number) => files[i] }) });
    input!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
};

describe('the guest page (/e/:code)', () => {
  it('a code that isn’t an event says so, in words', async () => {
    h.rpc.event_public = () => ({ data: null, error: null });
    await render('/e/nope1234');
    expect($('guest-unknown')?.textContent).toContain('We can’t find this event');
  });

  it('before it opens: when it opens, and no join card', async () => {
    h.rpc.event_public = () => ({ data: { ...EV, open: false, opens_on: '2099-01-01', closes_on: '2099-01-09' }, error: null });
    await render('/e/abc12345');
    expect($('guest-closed')?.textContent).toMatch(/^Photos open on .+, the day before the event\./);
    expect($('guest-join')).toBeNull();
  });

  it('joining: a name, and the kids OK when the hosts said kids are coming; the table comes from the QR', async () => {
    await render('/e/abc12345?t=5');
    expect($('guest-title')?.textContent).toBe('Ana & Ben');
    expect(($('guest-table') as HTMLSelectElement).value).toBe('5');
    await click($('guest-join-btn'));
    expect(host.textContent).toContain('Add your name, so the hosts know whose photos these are.');
    expect(h.calls.some(([n]) => n === 'event_join')).toBe(false);
    await type($('guest-name'), 'Tita Lorna');
    await click($('guest-join-btn'));
    expect(h.calls.some(([n]) => n === 'event_join')).toBe(false); // kids not ticked yet
    await click($('guest-kids')!.querySelector('input'));
    await click($('guest-join-btn'));
    expect(h.calls.find(([n]) => n === 'event_join')?.[1]).toEqual({ p_code: 'abc12345', p_name: 'Tita Lorna', p_table: 5, p_kids_ok: true });
    expect($('guest-camera')?.textContent).toContain('Hi, Tita Lorna · Table 5');
    expect($('guest-counter')?.textContent).toBe('0 of 20 photos · 0 of 2 videos shared');
    expect(JSON.parse(localStorage.getItem('megy-event-guest:abc12345')!)).toMatchObject({ token: 'tok-1', table: 5 });
  });

  it('a guest the host removed is back at the join card (their pass is gone)', async () => {
    localStorage.setItem('megy-event-guest:abc12345', JSON.stringify({ token: 'old', guestId: 'g9', name: 'Spammy', table: null }));
    h.rpc.event_me = () => ({ data: null, error: null });
    await render('/e/abc12345');
    expect($('guest-join')).not.toBeNull();
    expect(localStorage.getItem('megy-event-guest:abc12345')).toBeNull();
  });

  it('at 19 of 20, three photos from the gallery: one shares, two are left out with why', async () => {
    localStorage.setItem('megy-event-guest:abc12345', JSON.stringify({ token: 'tok-1', guestId: 'g1', name: 'Tita Lorna', table: 5 }));
    h.rpc.event_me = () => ({ data: { guest_id: 'g1', name: 'Tita Lorna', table_no: 5, photos: 19, videos: 0 }, error: null });
    await render('/e/abc12345');
    const jpg = (n: string) => new File(['x'], n, { type: 'image/jpeg' });
    await pickFiles($('guest-pick-input'), [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]);
    expect(host.textContent).toContain('2 left out: you can share 20 photos and 2 videos. Delete one of yours to add another.');
    expect(h.calls.filter(([n]) => n === 'event_media_begin')).toHaveLength(1);
    expect(h.uploads).toEqual(['event-originals/b1/m1.jpg', 'event-media/b1/m1-v.jpg', 'event-media/b1/m1-t.jpg']);
    expect($('guest-queue')?.textContent).toContain('Shared');
  });

  it('the feed: everyone’s, and mine; mine hidden by the hosts says so; a failed delete says so', async () => {
    localStorage.setItem('megy-event-guest:abc12345', JSON.stringify({ token: 'tok-1', guestId: 'g1', name: 'Tita Lorna', table: 5 }));
    h.rpc.event_feed = () => ({ data: [feedItem('m1'), feedItem('m2', { mine: true, hidden: true, guest_name: 'Tita Lorna' })], error: null });
    h.rpc.event_media_delete = () => ({ data: null, error: { message: 'Failed to fetch' } });
    await render('/e/abc12345');
    expect($$('guest-feed-item')).toHaveLength(2);
    await click($('guest-tab-mine'));
    expect($$('guest-feed-item')).toHaveLength(1);
    expect($('guest-feed')?.textContent).toContain('Hidden by the hosts');
    await click($$('guest-feed-item')[0]);
    await click($('guest-delete'));
    expect(host.textContent).toContain('We couldn’t delete it. Check your connection and try again.');
  });
});

describe('the host’s event page (/events/:id)', () => {
  const BOOKING = {
    id: 'b1', booking_number: 'EV-2026-A2474MV', user_id: 'host-1', status: 'paid', event_type: 'wedding', event_date: '2026-10-10',
    deal_total: 45000, deal_deposit: 20000, deal_album_size: '8x8', deal_cover: 'hard', deal_pages: 80, album_order_id: null,
  };
  const MY = {
    booking_id: 'b1', title: 'Ana & Ben', kids_on: true, tables: 10, copies_on: true, guest_code: 'abc12345', screen_key: 'k3y', screen_paused: false,
    open: true, opens_on: '2026-10-09', closes_on: '2026-10-17', kept_until: '2027-02-07', guests: 3, photos: 48, videos: 1, picked: 0,
  };
  const poolItem = (i: number, over: Record<string, unknown> = {}) => ({
    id: `m${i}`, booking_id: 'b1', kind: 'photo', ext: 'jpg', guest_id: 'g1', guest_name: 'Migo', table_no: 5, hidden: false, picked: false,
    ready_at: `2026-10-10T10:${String(i).padStart(2, '0')}:00Z`, width: 1, height: 1, duration_s: null, ...over,
  });
  beforeEach(() => {
    h.booking = BOOKING;
    h.rpc.my_event = () => ({ data: MY, error: null });
    h.rpc.my_event_guests = () => ({ data: [{ id: 'g9', name: 'Spammy', table_no: null, kids_ok: true, joined_at: '', removed_at: null, photos: 0, videos: 0 }], error: null });
    h.rpc.set_event_media = () => ({ data: true, error: null });
    h.rpc.remove_event_guest = () => ({ data: true, error: null });
  });

  it('not open yet (no deposit confirmed): says so, nothing else', async () => {
    h.rpc.my_event = () => ({ data: null, error: null });
    h.booking = { ...BOOKING, status: 'quoted' };
    await render('/events/b1');
    expect($('manage-not-ready')?.textContent).toContain('Your event opens once we confirm your deposit.');
  });

  it('the album needs 40 picked photos: short, it says how many more; nothing downloads', async () => {
    h.rpc.my_event_media = () => ({ data: Array.from({ length: 38 }, (_, i) => poolItem(i, { picked: true })), error: null });
    await render('/events/b1');
    expect($('manage-make-album')?.textContent).toBe('Make my album with 38 photos');
    await click($('manage-make-album'));
    expect($('manage-album-short')?.textContent).toBe('An album needs at least 40 photos. Pick 2 more below (tap ★ on a photo).');
    expect(h.downloads).toEqual([]);
  });

  it('★ picks; a guest is removed only on the second tap', async () => {
    h.rpc.my_event_media = () => ({ data: [poolItem(1)], error: null });
    await render('/events/b1');
    await click($('manage-pick'));
    expect(h.calls.find(([n]) => n === 'set_event_media')?.[1]).toEqual({ p_media_id: 'm1', p_hidden: null, p_picked: true });
    await click($('manage-remove'));
    expect(h.calls.some(([n]) => n === 'remove_event_guest')).toBe(false);
    await click($('manage-remove-yes'));
    expect(h.calls.find(([n]) => n === 'remove_event_guest')?.[1]).toEqual({ p_guest_id: 'g9' });
  });

  it('Make my album: the picked, unhidden photos’ print masters, in order, with the picked videos, to a fresh album', async () => {
    const pool = [
      ...Array.from({ length: 41 }, (_, i) => poolItem(i, { picked: true })),
      poolItem(50, { picked: true, hidden: true }),
      poolItem(51),
      poolItem(52, { picked: true, kind: 'video', ext: 'mp4', guest_name: 'Bea', duration_s: 4 }),
    ];
    h.rpc.my_event_media = () => ({ data: pool, error: null });
    await render('/events/b1');
    expect($('manage-picked')?.textContent).toBe('41 photos picked and 1 video (they become video memories).');
    await click($('manage-make-album'));
    expect(h.downloads).toEqual(Array.from({ length: 41 }, (_, i) => `event-originals/b1/m${i}.jpg`));
    const imp = takePendingEventImport()!;
    expect(imp).toMatchObject({ bookingId: 'b1', bookingNumber: 'EV-2026-A2474MV', title: 'Ana & Ben', size: '8x8', cover: 'hard', pages: 80 });
    expect(imp.files.map((f) => f.name)).toEqual(Array.from({ length: 41 }, (_, i) => `Migo-m${i}.jpg`));
    expect(imp.videos).toEqual([{ id: 'm52', url: 'https://x/event-media/b1/m52.mp4', ext: 'mp4', by: 'Bea', durationS: 4 }]);
    expect(h.fresh).toHaveBeenCalledWith('host-1');
    expect($('where')?.textContent).toBe('/builder');
  });

  it('once the album is ordered, the card says so instead', async () => {
    h.booking = { ...BOOKING, album_order_id: 'o1' };
    h.rpc.my_event_media = () => ({ data: [], error: null });
    await render('/events/b1');
    expect($('manage-album-ordered')?.textContent).toContain('Your album is ordered.');
    expect($('manage-make-album')).toBeNull();
  });
});
