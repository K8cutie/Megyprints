-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0047_event_guest_albums.sql  (idempotent; safe to re-run)
--
--  WHY: every guest makes their own album from the event's pool (owner,
--  2026-10-11). A school field trip: the organizer shares the QR, the parents
--  pool their photos and videos, and each parent makes their own album from
--  that pool. Same for a wedding (the bride's mother) or any event. Not a
--  copy of the host's album (0045 copies) — their own picks.
--
--  The owner's rules:
--   • EVERYONE WHO JOINED with the QR can make one. The host controls who
--     joins (they share the QR) and can remove a guest (remove_event_guest).
--   • ON BY DEFAULT; the host can switch it off (set_guest_albums).
--   • NORMAL PRICE. It's an ordinary order; the booking doesn't pay for it
--     (cover_order_with_booking stays the host's alone).
--   • NO DOWNLOADS. A guest sees what the feed shows (not hidden, not from a
--     removed guest), picks their own, and can read the print master ONLY of
--     a photo they picked — what their album is built from, on their device.
--
--  An order needs an account, so "Make your own album" links the guest pass
--  on the phone (code + token, as joined) to the signed-in account, once.
--  After that the account finds the event from any device. A pass linked to
--  one account can't be linked to another.
--
--  Access ends when the host removes the guest, switches guest albums off,
--  deletes their account, the booking isn't live, or the pool is purged
--  (event_keep_days after the event).
--
--  Run AFTER 0045.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.event_bookings add column if not exists guest_albums_on boolean not null default true;
alter table public.event_guests add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.event_guests add column if not exists linked_at timestamptz;
create index if not exists event_guests_user_idx on public.event_guests (user_id) where user_id is not null;

create table if not exists public.event_guest_picks (
  guest_id   uuid        not null references public.event_guests(id) on delete cascade,
  media_id   uuid        not null references public.event_media(id) on delete cascade,
  picked_at  timestamptz not null default now(),
  primary key (guest_id, media_id)
);
create index if not exists event_guest_picks_media_idx on public.event_guest_picks (media_id);
alter table public.event_guest_picks enable row level security;
revoke all on table public.event_guest_picks from anon, authenticated;

-- A booking whose guests may make albums now.
create or replace function public.event_guest_albums_live(b public.event_bookings)
returns boolean language sql immutable set search_path = '' as $$
  select b.id is not null and b.customer_deleted_at is null and b.guest_albums_on
     and b.status in ('booked', 'paid', 'completed')
$$;
revoke all on function public.event_guest_albums_live(public.event_bookings) from public, anon, authenticated;

-- The signed-in account's guest row, if it may make an album now; else nulls.
create or replace function public.event_album_guest(p_guest_id uuid)
returns public.event_guests
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.event_guests g
    join public.event_bookings b on b.id = g.booking_id
   where g.id = p_guest_id and g.user_id = auth.uid() and auth.uid() is not null
     and g.removed_at is null and public.event_guest_albums_live(b)
$$;
revoke all on function public.event_album_guest(uuid) from public, anon, authenticated;

-- What a guest may put in an album: the feed's items (0044 event_feed): ready,
-- not hidden, not deleted or purged, not from a removed guest.
create or replace function public.event_album_media_ok(m public.event_media)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select m.id is not null and m.status = 'ready' and not m.hidden and m.deleted_at is null and m.purged_at is null
     and not exists (select 1 from public.event_guests gg where gg.id = m.guest_id and gg.removed_at is not null)
$$;
revoke all on function public.event_album_media_ok(public.event_media) from public, anon, authenticated;

-- ══════ 1. The host ══════

create or replace function public.set_guest_albums(p_booking_id uuid, p_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.event_bookings b
     set guest_albums_on = coalesce(p_on, true)
   where b.id = p_booking_id and b.user_id = auth.uid() and auth.uid() is not null
     and b.status in ('booked', 'paid', 'completed');
  if not found then
    raise exception 'This event isn''t yours, or it isn''t booked yet.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_guest_albums(uuid, boolean) from public, anon;
grant execute on function public.set_guest_albums(uuid, boolean) to authenticated;

-- The host's event page (0044) + whether guests can make albums.
create or replace function public.my_event(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id',      b.id,
           'title',           b.event_title,
           'kids_on',         b.kids_on,
           'tables',          b.tables,
           'copies_on',       b.copies_on,
           'guest_albums_on', b.guest_albums_on,
           'guest_code',      b.guest_code,
           'screen_key',      b.screen_key,
           'screen_paused',   b.screen_paused,
           'open',            public.event_is_open(b.status, b.guest_code, b.event_date),
           'opens_on',        lower(public.event_upload_window(b.event_date)),
           'closes_on',       upper(public.event_upload_window(b.event_date)) - 1,
           'kept_until',      b.event_date + public.event_keep_days(),
           'guests',          (select count(*) from public.event_guests g where g.booking_id = b.id and g.removed_at is null),
           'photos',          (select count(*) from public.event_media m where m.booking_id = b.id and m.kind = 'photo' and m.status = 'ready' and m.deleted_at is null and m.purged_at is null),
           'videos',          (select count(*) from public.event_media m where m.booking_id = b.id and m.kind = 'video' and m.status = 'ready' and m.deleted_at is null and m.purged_at is null),
           'picked',          (select count(*) from public.event_media m where m.booking_id = b.id and m.picked and m.status = 'ready' and m.deleted_at is null and m.purged_at is null),
           'guest_albums',    (select count(*) from public.event_guests g where g.booking_id = b.id and g.user_id is not null and g.removed_at is null))
    from public.event_booking_of_host(p_booking_id) b
   where b.id is not null
$$;
revoke all on function public.my_event(uuid) from public, anon;
grant execute on function public.my_event(uuid) to authenticated;

-- ══════ 2. The guest ══════

-- The guest page's public face (0044) + whether guests can make albums.
create or replace function public.event_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'title',            coalesce(b.event_title, ''),
           'event_type',       b.event_type,
           'event_date',       b.event_date,
           'kids_on',          b.kids_on,
           'open',             public.event_is_open(b.status, b.guest_code, b.event_date),
           'opens_on',         lower(public.event_upload_window(b.event_date)),
           'closes_on',        upper(public.event_upload_window(b.event_date)) - 1,
           'photos_per_guest', public.event_photos_per_guest(),
           'videos_per_guest', public.event_videos_per_guest(),
           'tables',           b.tables,
           'albums_on',        public.event_guest_albums_live(b),
           'kept_until',       b.event_date + public.event_keep_days())
    from public.event_bookings b
   where b.guest_code = p_code
     and b.status in ('booked', 'paid', 'completed')
     and b.customer_deleted_at is null
$$;
revoke all on function public.event_public(text) from public;
grant execute on function public.event_public(text) to anon, authenticated;

-- "Make your own album": link the guest pass on this phone to the signed-in
-- account. Once linked, it stays with that account.
create or replace function public.link_event_guest(p_code text, p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g public.event_guests;
  v_b public.event_bookings;
begin
  if auth.uid() is null then
    raise exception 'Sign in to make your own album.' using errcode = '42501';
  end if;
  select * into v_g from public.event_guest_of(p_code, p_token);
  if v_g.id is null then
    raise exception 'Open this on the phone you joined the event with.' using errcode = 'EV050';
  end if;
  select * into v_b from public.event_bookings b where b.id = v_g.booking_id;
  if not public.event_guest_albums_live(v_b) then
    raise exception 'Making your own album isn''t open for this event.' using errcode = 'EV051';
  end if;
  update public.event_guests g
     set user_id = auth.uid(), linked_at = now()
   where g.id = v_g.id and g.user_id is null;
  if not found and v_g.user_id is distinct from auth.uid() then
    raise exception 'You joined this event with another account. Sign in with that account to make your album.' using errcode = 'EV052';
  end if;
  return jsonb_build_object('guest_id', v_g.id);
end;
$$;
revoke all on function public.link_event_guest(text, text) from public, anon;
grant execute on function public.link_event_guest(text, text) to authenticated;

-- The events this account can make an album from (newest event first).
create or replace function public.my_guest_albums()
returns table (guest_id uuid, booking_id uuid, guest_code text, title text, event_type text, event_date date,
               kept_until date, album_size text, picked integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, b.id, b.guest_code, coalesce(b.event_title, ''), b.event_type, b.event_date,
         b.event_date + public.event_keep_days(), b.deal_album_size,
         (select count(*)::integer from public.event_guest_picks p where p.guest_id = g.id)
    from public.event_guests g
    join public.event_bookings b on b.id = g.booking_id
   where g.user_id = auth.uid() and auth.uid() is not null
     and g.removed_at is null and public.event_guest_albums_live(b)
   order by b.event_date desc, g.linked_at desc
$$;
revoke all on function public.my_guest_albums() from public, anon;
grant execute on function public.my_guest_albums() to authenticated;

-- The pool for the guest's album, with their own picks.
create or replace function public.guest_album_media(p_guest_id uuid)
returns table (id uuid, booking_id uuid, kind text, ext text, guest_name text, ready_at timestamptz,
               width integer, height integer, duration_s numeric, mine boolean, picked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.booking_id, m.kind, m.ext, gg.name, m.ready_at, m.width, m.height, m.duration_s,
         (m.guest_id = me.id),
         exists (select 1 from public.event_guest_picks p where p.guest_id = me.id and p.media_id = m.id)
    from public.event_album_guest(p_guest_id) me
    join public.event_media m on m.booking_id = me.booking_id
    left join public.event_guests gg on gg.id = m.guest_id
   where me.id is not null and public.event_album_media_ok(m)
   order by m.ready_at desc
$$;
revoke all on function public.guest_album_media(uuid) from public, anon;
grant execute on function public.guest_album_media(uuid) to authenticated;

-- Pick or unpick one item for the guest's own album.
create or replace function public.set_guest_pick(p_guest_id uuid, p_media_id uuid, p_picked boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g public.event_guests;
  v_m public.event_media;
begin
  select * into v_g from public.event_album_guest(p_guest_id);
  if v_g.id is null then return false; end if;
  select * into v_m from public.event_media m where m.id = p_media_id and m.booking_id = v_g.booking_id;
  if not public.event_album_media_ok(v_m) then return false; end if;
  if coalesce(p_picked, false) then
    insert into public.event_guest_picks (guest_id, media_id) values (v_g.id, p_media_id) on conflict do nothing;
  else
    delete from public.event_guest_picks p where p.guest_id = v_g.id and p.media_id = p_media_id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_guest_pick(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_guest_pick(uuid, uuid, boolean) to authenticated;

-- ══════ 3. Print masters: only the photos the guest picked ══════
create or replace function public.event_guest_album_reads_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.event_guests g
      join public.event_bookings b on b.id = g.booking_id
      join public.event_guest_picks p on p.guest_id = g.id
      join public.event_media m on m.id = p.media_id and m.booking_id = b.id
     where g.user_id = auth.uid() and g.removed_at is null and public.event_guest_albums_live(b)
       and p_name = b.id::text || '/' || m.id::text || '.jpg'
       and m.kind = 'photo' and public.event_album_media_ok(m))
$$;
revoke all on function public.event_guest_album_reads_path(text) from public, anon;
grant execute on function public.event_guest_album_reads_path(text) to authenticated;

drop policy if exists "event_originals_guest_album_reads" on storage.objects;
create policy "event_originals_guest_album_reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-originals' and public.event_guest_album_reads_path(name));

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- select to_regclass('public.event_guest_picks');
-- select policyname from pg_policies where schemaname = 'storage' and policyname = 'event_originals_guest_album_reads';
