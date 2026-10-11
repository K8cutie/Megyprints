// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   A GUEST'S OWN ALBUM (0047). Any guest who joined with the QR picks from the
   pool and makes their own album at the NORMAL price. The album must never be
   linked to the booking (the booking pays only for the host's), yet its
   picked videos still reach "Add a video memory". And the database side:
   every new door is closed to anon, the helpers to everyone, the picks table
   to direct reads; print masters only for what the guest picked.
   ══════════════════════════════════════════════════════════════════════════ */

vi.mock('./supabase', () => ({ supabaseConfigured: true, supabase: { rpc: vi.fn() } }));

import { eventLinkForAlbum, eventVideosForAlbum, keepGuestAlbumVideos, linkAlbumToBooking } from './eventAlbum';
import { eventForCode, guestAlbumErrorMessage, type GuestAlbumEvent } from './eventGuestAlbum';

const SQL = readFileSync(resolve(__dirname, '../../supabase/migrations/0047_event_guest_albums.sql'), 'utf8');
const BUILDER = readFileSync(resolve(__dirname, '../pages/Builder.tsx'), 'utf8');

beforeEach(() => localStorage.clear());

describe('the album on this device', () => {
  const video = { id: 'm52', url: 'https://x/v.mp4', ext: 'mp4', by: 'Bea', durationS: 4 };

  it('a guest album keeps its videos for "Add a video memory" but has no booking link (checkout prices it normally)', () => {
    keepGuestAlbumVideos('album-g', [video]);
    expect(eventVideosForAlbum('album-g')).toEqual([video]);
    expect(eventLinkForAlbum('album-g')).toBeNull();
  });

  it('the host\'s linked album still offers its own videos first', () => {
    linkAlbumToBooking('album-h', { bookingId: 'b1', bookingNumber: 'EV-1', size: '8x8', cover: 'hard', pages: 40, videos: [video] });
    keepGuestAlbumVideos('album-h', []);
    expect(eventVideosForAlbum('album-h')).toEqual([video]);
  });

  it('the builder skips the booking link for a guest album (source guard)', () => {
    const guest = BUILDER.indexOf('if (imp.guestAlbum) { keepGuestAlbumVideos(albumId, imp.videos); return; }');
    const link = BUILDER.indexOf('linkAlbumToBooking(albumId, {');
    expect(guest).toBeGreaterThan(0);
    expect(link).toBeGreaterThan(guest);
  });
});

describe('small helpers', () => {
  it('finds the event for a code', () => {
    const e = { guest_code: 'abc12345' } as GuestAlbumEvent;
    expect(eventForCode([e], 'abc12345')).toBe(e);
    expect(eventForCode([e], 'zzz')).toBeNull();
  });

  it('shows the database\'s own words for its EV05x refusals, plain words otherwise', () => {
    expect(guestAlbumErrorMessage({ code: 'EV052', message: 'You joined this event with another account.' })).toBe('You joined this event with another account.');
    expect(guestAlbumErrorMessage({ code: '42501', message: 'permission denied for function x' })).toBe('Sign in to make your own album.');
    expect(guestAlbumErrorMessage({ code: 'XX000', message: 'internal' })).toBe('Something went wrong. Please try again.');
  });
});

describe('0047 grants (source guard)', () => {
  const PUBLIC_FNS = ['set_guest_albums(uuid, boolean)', 'link_event_guest(text, text)', 'my_guest_albums()', 'guest_album_media(uuid)',
    'set_guest_pick(uuid, uuid, boolean)', 'event_guest_album_reads_path(text)', 'my_event(uuid)'];
  const HELPERS = ['event_guest_albums_live(public.event_bookings)', 'event_album_guest(uuid)', 'event_album_media_ok(public.event_media)'];

  it('every function a signed-in guest or host calls is closed to anon and open to authenticated only', () => {
    for (const fn of PUBLIC_FNS) {
      expect(SQL, fn).toContain(`revoke all on function public.${fn} from public, anon;`);
      expect(SQL, fn).toContain(`grant execute on function public.${fn} to authenticated;`);
    }
  });

  it('the helpers are closed to everyone (only the functions above use them)', () => {
    for (const fn of HELPERS) expect(SQL, fn).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`);
  });

  it('the picks table has RLS on and no direct access', () => {
    expect(SQL).toContain('alter table public.event_guest_picks enable row level security;');
    expect(SQL).toContain('revoke all on table public.event_guest_picks from anon, authenticated;');
  });

  it('print masters: a SELECT-only policy on event-originals, by the guest\'s picks', () => {
    expect(SQL).toMatch(/create policy "event_originals_guest_album_reads"\s+on storage\.objects for select to authenticated\s+using \(bucket_id = 'event-originals' and public\.event_guest_album_reads_path\(name\)\);/);
    const fn = SQL.slice(SQL.indexOf('function public.event_guest_album_reads_path'), SQL.indexOf('create policy "event_originals_guest_album_reads"'));
    expect(fn).toContain('join public.event_guest_picks p on p.guest_id = g.id');
    expect(fn).toContain("m.kind = 'photo'");
  });

  it('on by default (owner, 2026-10-11)', () => {
    expect(SQL).toContain('add column if not exists guest_albums_on boolean not null default true');
  });

  it('my_event keeps every field the host page reads (0044) and adds the two new ones', () => {
    const old = readFileSync(resolve(__dirname, '../../supabase/migrations/0044_event_camera.sql'), 'utf8');
    const keys = (src: string, fn: string) => {
      const body = src.slice(src.indexOf(`create or replace function public.${fn}(`));
      return [...body.slice(0, body.indexOf('$$;')).matchAll(/'([a-z_]+)',\s/g)].map((m) => m[1]);
    };
    const before = keys(old, 'my_event');
    const after = keys(SQL, 'my_event');
    expect(after).toEqual(expect.arrayContaining(before));
    expect(after).toEqual(expect.arrayContaining(['guest_albums_on', 'guest_albums']));
    expect(keys(SQL, 'event_public')).toEqual(expect.arrayContaining([...keys(old, 'event_public'), 'albums_on']));
  });
});
