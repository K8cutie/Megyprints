-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0044_event_camera.sql  (idempotent; safe to re-run)
--
--  WHY: the guest camera for a BOOKED event (0043): guests scan the QR on
--  their table, join with their name (no account, no app), and share up to
--  event_photos_per_guest() photos and event_videos_per_guest() short videos.
--  The host (the booking's account) sees everything, hides what shouldn't be
--  shown, removes a guest, picks favourites for the album, and runs a
--  slideshow on the venue screen. It only ever runs for a booking whose
--  deposit is confirmed (booked/paid), so its storage is always paid for.
--
--  Guests have no account. Joining returns a random token the guest's phone
--  keeps; the database stores only its SHA-256. Every guest function takes
--  (event code, token). Uploads go straight to Storage with no server in
--  between (a venue's guests share one IP, and the API's per-IP limit would
--  block them): event_media_begin() records the item and names its files,
--  and the storage insert policy allows exactly those names, for one hour,
--  through event_upload_allowed().
--
--  Files:
--    event-originals (private)  <booking>/<media>.jpg       print master
--    event-media     (public)   <booking>/<media>-v.jpg     view copy
--                               <booking>/<media>-t.jpg     thumbnail / video poster
--                               <booking>/<media>.<mp4|mov|webm>  video
--  The public bucket is never listable (no SELECT policy) and its names hold
--  a random id, the same rule as memory-clips (0030).
--
--  Cleanup (api/event-cleanup.mjs, service role): deleted items, uploads
--  never finished, a cancelled or declined booking's media, and every item
--  event_keep_days() after the event.
--
--  Run AFTER 0043.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 0. The numbers, in one place (src/lib/eventCamera.ts mirrors them) ══════
create or replace function public.event_photos_per_guest()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;
create or replace function public.event_videos_per_guest()
returns integer language sql immutable set search_path = '' as $$ select 2 $$;
create or replace function public.event_days_before()
returns integer language sql immutable set search_path = '' as $$ select 1 $$;
create or replace function public.event_days_after()
returns integer language sql immutable set search_path = '' as $$ select 7 $$;
create or replace function public.event_keep_days()
returns integer language sql immutable set search_path = '' as $$ select 120 $$;
create or replace function public.event_screen_delay_seconds()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;

do $$
declare f text;
begin
  foreach f in array array['event_photos_per_guest', 'event_videos_per_guest', 'event_days_before',
                           'event_days_after', 'event_keep_days', 'event_screen_delay_seconds'] loop
    execute format('revoke all on function public.%I() from public', f);
    execute format('grant execute on function public.%I() to anon, authenticated, service_role', f);
  end loop;
end $$;

-- ══════ 1. The event, on the booking ══════
alter table public.event_bookings add column if not exists event_title text;
alter table public.event_bookings add column if not exists kids_on boolean not null default false;
alter table public.event_bookings add column if not exists tables integer;
alter table public.event_bookings add column if not exists copies_on boolean not null default false;
alter table public.event_bookings add column if not exists guest_code text;
alter table public.event_bookings add column if not exists screen_key text;
alter table public.event_bookings add column if not exists screen_paused boolean not null default false;
alter table public.event_bookings add column if not exists album_order_id uuid;

do $$
begin
  alter table public.event_bookings add constraint event_bookings_title_chk check (event_title is null or char_length(event_title) between 1 and 80);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.event_bookings add constraint event_bookings_tables_chk check (tables is null or tables between 1 and 200);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.event_bookings add constraint event_bookings_code_chk check (guest_code is null or guest_code ~ '^[a-z2-9]{8}$');
exception when duplicate_object then null;
end $$;
create unique index if not exists event_bookings_guest_code_idx on public.event_bookings (guest_code) where guest_code is not null;

-- The host reads their event's settings with the rest of the row (still never deal_cost).
grant select (event_title, kids_on, tables, copies_on, guest_code, screen_key, screen_paused, album_order_id)
  on public.event_bookings to authenticated;

-- A request never brings event settings with it.
create or replace function public.event_bookings_event_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.event_title    := null;
  new.kids_on        := false;
  new.tables         := null;
  new.copies_on      := false;
  new.guest_code     := null;
  new.screen_key     := null;
  new.screen_paused  := false;
  new.album_order_id := null;
  return new;
end;
$$;
revoke all on function public.event_bookings_event_defaults() from public, anon, authenticated;
drop trigger if exists event_bookings_event_defaults_trg on public.event_bookings;
create trigger event_bookings_event_defaults_trg
  before insert on public.event_bookings
  for each row execute function public.event_bookings_event_defaults();

-- A random code from the order-number alphabet's lower case (the QR's link).
create or replace function public.gen_event_code(p_len integer)
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_catalog
as $$
declare
  alphabet constant text := 'abcdefghijkmnpqrstuvwxyz23456789';
  rnd bytea := extensions.gen_random_bytes(p_len);
  s text := '';
  i int;
begin
  for i in 0 .. p_len - 1 loop
    s := s || substr(alphabet, (get_byte(rnd, i) % 32) + 1, 1);
  end loop;
  return s;
end;
$$;
revoke all on function public.gen_event_code(integer) from public, anon, authenticated;

-- The event opens when the deposit is confirmed: it gets its QR code and the
-- venue screen's key. Once set, they never change.
create or replace function public.event_bookings_open_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if new.guest_code is null and new.status in ('booked', 'paid') then
    loop
      v_code := public.gen_event_code(8);
      exit when not exists (select 1 from public.event_bookings b where b.guest_code = v_code);
    end loop;
    new.guest_code := v_code;
    new.screen_key := public.gen_event_code(16);
  elsif tg_op = 'UPDATE' then
    new.guest_code := coalesce(old.guest_code, new.guest_code);
    new.screen_key := coalesce(old.screen_key, new.screen_key);
  end if;
  return new;
end;
$$;
revoke all on function public.event_bookings_open_event() from public, anon, authenticated;
drop trigger if exists event_bookings_open_event_trg on public.event_bookings;
create trigger event_bookings_open_event_trg
  before update on public.event_bookings
  for each row execute function public.event_bookings_open_event();

-- Taking photos: from event_days_before() before the event day to
-- event_days_after() after it (Manila), while booked or paid.
create or replace function public.event_upload_window(p_date date)
returns daterange
language sql
immutable
set search_path = ''
as $$ select daterange(p_date - public.event_days_before(), p_date + public.event_days_after(), '[]') $$;
revoke all on function public.event_upload_window(date) from public;
grant execute on function public.event_upload_window(date) to anon, authenticated, service_role;

create or replace function public.event_is_open(p_status text, p_code text, p_date date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('booked', 'paid') and p_code is not null
     and public.event_upload_window(p_date) @> (now() at time zone 'Asia/Manila')::date
$$;
revoke all on function public.event_is_open(text, text, date) from public;
grant execute on function public.event_is_open(text, text, date) to anon, authenticated, service_role;

-- ══════ 2. Guests ══════
create table if not exists public.event_guests (
  id          uuid        primary key default gen_random_uuid(),
  booking_id  uuid        not null references public.event_bookings(id) on delete cascade,
  name        text        not null,
  table_no    integer,
  kids_ok     boolean     not null default false,
  token_hash  text        not null unique,
  joined_at   timestamptz not null default now(),
  removed_at  timestamptz,
  constraint event_guests_name_chk check (char_length(name) between 1 and 60),
  constraint event_guests_table_chk check (table_no is null or table_no between 1 and 200)
);
create index if not exists event_guests_booking_idx on public.event_guests (booking_id, joined_at);
alter table public.event_guests enable row level security;
revoke all on public.event_guests from anon, authenticated;
grant all on public.event_guests to service_role;

-- ══════ 3. Photos and videos ══════
create table if not exists public.event_media (
  id          uuid        primary key default gen_random_uuid(),
  booking_id  uuid        not null references public.event_bookings(id) on delete cascade,
  guest_id    uuid        references public.event_guests(id) on delete set null,
  kind        text        not null,
  ext         text        not null,
  status      text        not null default 'uploading',
  width       integer,
  height      integer,
  duration_s  numeric(7,2),
  bytes       bigint,
  hidden      boolean     not null default false,
  picked      boolean     not null default false,
  deleted_at  timestamptz,
  purged_at   timestamptz,
  created_at  timestamptz not null default now(),
  ready_at    timestamptz,
  constraint event_media_kind_chk check (kind in ('photo', 'video')),
  constraint event_media_ext_chk check ((kind = 'photo' and ext = 'jpg') or (kind = 'video' and ext in ('mp4', 'mov', 'webm'))),
  constraint event_media_status_chk check (status in ('uploading', 'ready')),
  constraint event_media_size_chk check ((width is null or width between 1 and 20000) and (height is null or height between 1 and 20000)
                                         and (bytes is null or bytes between 1 and 104857600)
                                         and (duration_s is null or duration_s between 0 and 600))
);
create index if not exists event_media_booking_idx on public.event_media (booking_id, status, ready_at desc);
create index if not exists event_media_guest_idx on public.event_media (guest_id);
alter table public.event_media enable row level security;
revoke all on public.event_media from anon, authenticated;
grant all on public.event_media to service_role;

-- Every file of one item: (bucket, object name).
create or replace function public.event_media_objects(p_booking uuid, p_id uuid, p_kind text, p_ext text)
returns table (bucket text, name text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    (case when p_kind = 'photo' then 'event-originals' end, p_booking::text || '/' || p_id::text || '.jpg'),
    (case when p_kind = 'photo' then 'event-media' end,     p_booking::text || '/' || p_id::text || '-v.jpg'),
    ('event-media',                                         p_booking::text || '/' || p_id::text || '-t.jpg'),
    (case when p_kind = 'video' then 'event-media' end,     p_booking::text || '/' || p_id::text || '.' || p_ext)
  ) v(bucket, name)
  where bucket is not null;
$$;
revoke all on function public.event_media_objects(uuid, uuid, text, text) from public;
grant execute on function public.event_media_objects(uuid, uuid, text, text) to anon, authenticated, service_role;

-- ══════ 4. The buckets ══════
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('event-originals', 'event-originals', false, 20971520, array['image/jpeg'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('event-media', 'event-media', true, 52428800, array['image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm'])
  on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                                 allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise notice 'event buckets not created (%): create them in the dashboard', sqlerrm;
end $$;

-- An upload is allowed only for a file event_media_begin() just named: the
-- item is still uploading, under an hour old, and its event is open.
create or replace function public.event_upload_allowed(p_bucket text, p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  begin
    v_id := substring(p_name from '^[0-9a-f-]{36}/([0-9a-f-]{36})')::uuid;
  exception when others then
    return false;
  end;
  if v_id is null then return false; end if;
  return exists (
    select 1
      from public.event_media m
      join public.event_bookings b on b.id = m.booking_id
     where m.id = v_id
       and m.status = 'uploading'
       and m.deleted_at is null
       and m.created_at > now() - interval '1 hour'
       and public.event_is_open(b.status, b.guest_code, b.event_date)
       and exists (select 1 from public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) o
                    where o.bucket = p_bucket and o.name = p_name)
  );
end;
$$;
revoke all on function public.event_upload_allowed(text, text) from public;
grant execute on function public.event_upload_allowed(text, text) to anon, authenticated;

-- The host reads their own event's print masters (for the album).
create or replace function public.event_host_owns_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.event_bookings b
     where b.id::text = split_part(p_name, '/', 1) and b.user_id = auth.uid())
$$;
revoke all on function public.event_host_owns_path(text) from public, anon;
grant execute on function public.event_host_owns_path(text) to authenticated;

drop policy if exists "event_uploads_named_by_begin" on storage.objects;
create policy "event_uploads_named_by_begin"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id in ('event-originals', 'event-media')
    and public.event_upload_allowed(bucket_id, name)
  );

drop policy if exists "event_originals_host_reads" on storage.objects;
create policy "event_originals_host_reads"
  on storage.objects for select to authenticated
  using (bucket_id = 'event-originals' and public.event_host_owns_path(name));

-- ══════ 5. A guest, from (code, token) ══════
create or replace function public.event_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;
revoke all on function public.event_token_hash(text) from public, anon, authenticated;

-- The guest, if the token is theirs, at this event, and they're not removed.
create or replace function public.event_guest_of(p_code text, p_token text)
returns public.event_guests
language sql
stable
security definer
set search_path = ''
as $$
  select g.*
    from public.event_guests g
    join public.event_bookings b on b.id = g.booking_id
   where b.guest_code = p_code
     and g.token_hash = public.event_token_hash(p_token)
     and g.removed_at is null
$$;
revoke all on function public.event_guest_of(text, text) from public, anon, authenticated;

-- ══════ 6. What a guest can do ══════
-- The event's public face: what the guest page needs before joining. Null for
-- an unknown code or a closed booking.
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
           'tables',           b.tables)
    from public.event_bookings b
   where b.guest_code = p_code
     and b.status in ('booked', 'paid', 'completed')
$$;
revoke all on function public.event_public(text) from public;
grant execute on function public.event_public(text) to anon, authenticated;

-- Join: name, table, and (if the host said kids will be there) the guest's OK.
create or replace function public.event_join(p_code text, p_name text, p_table integer default null, p_kids_ok boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  b      public.event_bookings;
  v_name text := btrim(coalesce(p_name, ''));
  v_tok  text;
  v_id   uuid;
  v_n    integer;
begin
  select * into b from public.event_bookings where guest_code = p_code;
  if not found or b.status not in ('booked', 'paid', 'completed') then
    raise exception 'We can''t find this event. Check the QR on your table, or ask the hosts.' using errcode = 'EV020';
  end if;
  if not public.event_is_open(b.status, b.guest_code, b.event_date) then
    raise exception 'This event is taking photos from % to %.',
      to_char(lower(public.event_upload_window(b.event_date)), 'Mon FMDD'),
      to_char(upper(public.event_upload_window(b.event_date)) - 1, 'Mon FMDD')
      using errcode = 'EV020';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'Add your name (up to 60 letters), so the hosts know whose photos these are.' using errcode = 'EV022';
  end if;
  if b.kids_on and not coalesce(p_kids_ok, false) then
    raise exception 'Kids are at this event. Tick the box to say you''re okay with that, including photos of your own kids.' using errcode = 'EV021';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('event_join:' || b.id::text, 0));
  select count(*) into v_n from public.event_guests g where g.booking_id = b.id and g.removed_at is null;
  if v_n >= b.guest_count * 2 + 20 then
    raise exception 'This event is full. Ask the hosts to make room.' using errcode = 'EV023';
  end if;
  v_tok := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  insert into public.event_guests (booking_id, name, table_no, kids_ok, token_hash)
  values (b.id, v_name, case when p_table between 1 and 200 then p_table end, coalesce(p_kids_ok, false), public.event_token_hash(v_tok))
  returning id into v_id;
  return jsonb_build_object('guest_id', v_id, 'token', v_tok);
end;
$$;
revoke all on function public.event_join(text, text, integer, boolean) from public;
grant execute on function public.event_join(text, text, integer, boolean) to anon, authenticated;

-- Who I am here, and how much I've shared. Null = not (or no longer) a guest.
create or replace function public.event_me(p_code text, p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'guest_id', g.id,
           'name',     g.name,
           'table_no', g.table_no,
           'photos',   (select count(*) from public.event_media m where m.guest_id = g.id and m.kind = 'photo' and m.deleted_at is null
                          and (m.status = 'ready' or m.created_at > now() - interval '1 hour')),
           'videos',   (select count(*) from public.event_media m where m.guest_id = g.id and m.kind = 'video' and m.deleted_at is null
                          and (m.status = 'ready' or m.created_at > now() - interval '1 hour')))
    from public.event_guest_of(p_code, p_token) g
   where g.id is not null
$$;
revoke all on function public.event_me(text, text) from public;
grant execute on function public.event_me(text, text) to anon, authenticated;

-- Start one upload: checks the guest's limit, records the item, names its
-- files. The phone then uploads exactly those (the storage policy).
create or replace function public.event_media_begin(
  p_code text, p_token text, p_kind text, p_ext text,
  p_bytes bigint default null, p_width integer default null, p_height integer default null, p_duration numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g     public.event_guests;
  b     public.event_bookings;
  v_n   integer;
  v_max integer;
  v_id  uuid;
begin
  select * into g from public.event_guest_of(p_code, p_token);
  if g.id is null then
    raise exception 'You''re not in this event any more. Scan the QR again to join.' using errcode = 'EV025';
  end if;
  select * into b from public.event_bookings where id = g.booking_id;
  if not public.event_is_open(b.status, b.guest_code, b.event_date) then
    raise exception 'This event isn''t taking photos right now.' using errcode = 'EV020';
  end if;
  if p_kind not in ('photo', 'video') then
    raise exception 'Only photos and videos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('event_media:' || g.id::text, 0));
  v_max := case when p_kind = 'photo' then public.event_photos_per_guest() else public.event_videos_per_guest() end;
  select count(*) into v_n from public.event_media m
   where m.guest_id = g.id and m.kind = p_kind and m.deleted_at is null
     and (m.status = 'ready' or m.created_at > now() - interval '1 hour');
  if v_n >= v_max then
    raise exception 'You''ve shared % %, the most for one guest. Delete one to add another.',
      v_max, case when p_kind = 'photo' then 'photos' else 'videos' end
      using errcode = 'EV024';
  end if;
  insert into public.event_media (booking_id, guest_id, kind, ext, bytes, width, height, duration_s)
  values (b.id, g.id, p_kind, p_ext, p_bytes, p_width, p_height, p_duration)
  returning id into v_id;
  return jsonb_build_object(
    'media_id',   v_id,
    'booking_id', b.id,
    'objects',    (select jsonb_agg(jsonb_build_object('bucket', o.bucket, 'name', o.name))
                     from public.event_media_objects(b.id, v_id, p_kind, p_ext) o));
end;
$$;
revoke all on function public.event_media_begin(text, text, text, text, bigint, integer, integer, numeric) from public;
grant execute on function public.event_media_begin(text, text, text, text, bigint, integer, integer, numeric) to anon, authenticated;

-- Every file is in: the item shows in the feed.
create or replace function public.event_media_ready(p_code text, p_token text, p_media_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
  m public.event_media;
begin
  select * into g from public.event_guest_of(p_code, p_token);
  if g.id is null then return false; end if;
  select * into m from public.event_media where id = p_media_id and guest_id = g.id and deleted_at is null;
  if not found then return false; end if;
  if m.status = 'ready' then return true; end if;
  if exists (select 1 from public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) o
              where not exists (select 1 from storage.objects s where s.bucket_id = o.bucket and s.name = o.name)) then
    return false;
  end if;
  update public.event_media set status = 'ready', ready_at = now() where id = m.id;
  return true;
end;
$$;
revoke all on function public.event_media_ready(text, text, uuid) from public;
grant execute on function public.event_media_ready(text, text, uuid) to anon, authenticated;

-- A guest deletes their own item (its files go with the nightly cleanup).
create or replace function public.event_media_delete(p_code text, p_token text, p_media_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g public.event_guests;
begin
  select * into g from public.event_guest_of(p_code, p_token);
  if g.id is null then return false; end if;
  update public.event_media set deleted_at = now()
   where id = p_media_id and guest_id = g.id and deleted_at is null;
  return found;
end;
$$;
revoke all on function public.event_media_delete(text, text, uuid) from public;
grant execute on function public.event_media_delete(text, text, uuid) to anon, authenticated;

-- The shared feed: everyone's ready items the host hasn't hidden, newest
-- first, a page at a time. A guest also sees their own hidden ones, marked.
create or replace function public.event_feed(p_code text, p_token text, p_before timestamptz default null, p_limit integer default 40)
returns table (id uuid, booking_id uuid, kind text, ext text, guest_name text, table_no integer,
               ready_at timestamptz, mine boolean, hidden boolean, width integer, height integer)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.booking_id, m.kind, m.ext, gg.name, gg.table_no, m.ready_at, (m.guest_id = me.id), m.hidden, m.width, m.height
    from public.event_guest_of(p_code, p_token) me
    join public.event_media m on m.booking_id = me.booking_id
    left join public.event_guests gg on gg.id = m.guest_id
   where me.id is not null
     and m.status = 'ready'
     and m.deleted_at is null
     and (m.guest_id = me.id or (not m.hidden and gg.removed_at is null))
     and (p_before is null or m.ready_at < p_before)
   order by m.ready_at desc
   limit greatest(1, least(coalesce(p_limit, 40), 100))
$$;
revoke all on function public.event_feed(text, text, timestamptz, integer) from public;
grant execute on function public.event_feed(text, text, timestamptz, integer) to anon, authenticated;

-- ══════ 7. What the host can do (the booking's own account) ══════
create or replace function public.event_booking_of_host(p_booking_id uuid)
returns public.event_bookings
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.event_bookings b
   where b.id = p_booking_id and b.user_id = auth.uid() and auth.uid() is not null
     and b.status in ('booked', 'paid', 'completed')
$$;
revoke all on function public.event_booking_of_host(uuid) from public, anon, authenticated;

create or replace function public.my_event(p_booking_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'booking_id',    b.id,
           'title',         b.event_title,
           'kids_on',       b.kids_on,
           'tables',        b.tables,
           'copies_on',     b.copies_on,
           'guest_code',    b.guest_code,
           'screen_key',    b.screen_key,
           'screen_paused', b.screen_paused,
           'open',          public.event_is_open(b.status, b.guest_code, b.event_date),
           'opens_on',      lower(public.event_upload_window(b.event_date)),
           'closes_on',     upper(public.event_upload_window(b.event_date)) - 1,
           'kept_until',    b.event_date + public.event_keep_days(),
           'guests',        (select count(*) from public.event_guests g where g.booking_id = b.id and g.removed_at is null),
           'photos',        (select count(*) from public.event_media m where m.booking_id = b.id and m.kind = 'photo' and m.status = 'ready' and m.deleted_at is null),
           'videos',        (select count(*) from public.event_media m where m.booking_id = b.id and m.kind = 'video' and m.status = 'ready' and m.deleted_at is null),
           'picked',        (select count(*) from public.event_media m where m.booking_id = b.id and m.picked and m.status = 'ready' and m.deleted_at is null))
    from public.event_booking_of_host(p_booking_id) b
   where b.id is not null
$$;
revoke all on function public.my_event(uuid) from public, anon;
grant execute on function public.my_event(uuid) to authenticated;

create or replace function public.set_my_event(p_booking_id uuid, p_title text, p_kids_on boolean, p_tables integer, p_copies_on boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.event_bookings b
     set event_title = nullif(left(btrim(coalesce(p_title, '')), 80), ''),
         kids_on     = coalesce(p_kids_on, false),
         tables      = case when p_tables between 1 and 200 then p_tables end,
         copies_on   = coalesce(p_copies_on, false)
   where b.id = p_booking_id and b.user_id = auth.uid() and auth.uid() is not null
     and b.status in ('booked', 'paid', 'completed');
  if not found then
    raise exception 'This event isn''t yours, or it isn''t booked yet.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_my_event(uuid, text, boolean, integer, boolean) from public, anon;
grant execute on function public.set_my_event(uuid, text, boolean, integer, boolean) to authenticated;

create or replace function public.my_event_media(p_booking_id uuid)
returns table (id uuid, booking_id uuid, kind text, ext text, guest_id uuid, guest_name text, table_no integer,
               hidden boolean, picked boolean, ready_at timestamptz, width integer, height integer, duration_s numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.booking_id, m.kind, m.ext, m.guest_id, g.name, g.table_no, m.hidden, m.picked, m.ready_at, m.width, m.height, m.duration_s
    from public.event_booking_of_host(p_booking_id) b
    join public.event_media m on m.booking_id = b.id
    left join public.event_guests g on g.id = m.guest_id
   where b.id is not null and m.status = 'ready' and m.deleted_at is null
   order by m.ready_at desc
$$;
revoke all on function public.my_event_media(uuid) from public, anon;
grant execute on function public.my_event_media(uuid) to authenticated;

create or replace function public.set_event_media(p_media_id uuid, p_hidden boolean default null, p_picked boolean default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.event_media m
     set hidden = coalesce(p_hidden, m.hidden),
         picked = coalesce(p_picked, m.picked)
    from public.event_bookings b
   where m.id = p_media_id and b.id = m.booking_id
     and b.user_id = auth.uid() and auth.uid() is not null
     and m.deleted_at is null;
  return found;
end;
$$;
revoke all on function public.set_event_media(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_event_media(uuid, boolean, boolean) to authenticated;

create or replace function public.my_event_guests(p_booking_id uuid)
returns table (id uuid, name text, table_no integer, kids_ok boolean, joined_at timestamptz, removed_at timestamptz, photos bigint, videos bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.table_no, g.kids_ok, g.joined_at, g.removed_at,
         (select count(*) from public.event_media m where m.guest_id = g.id and m.kind = 'photo' and m.status = 'ready' and m.deleted_at is null),
         (select count(*) from public.event_media m where m.guest_id = g.id and m.kind = 'video' and m.status = 'ready' and m.deleted_at is null)
    from public.event_booking_of_host(p_booking_id) b
    join public.event_guests g on g.booking_id = b.id
   where b.id is not null
   order by g.joined_at
$$;
revoke all on function public.my_event_guests(uuid) from public, anon;
grant execute on function public.my_event_guests(uuid) to authenticated;

-- Remove a guest: they can't add or see anything more, and what they shared
-- is hidden from everyone.
create or replace function public.remove_event_guest(p_guest_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
begin
  update public.event_guests g
     set removed_at = now()
    from public.event_bookings b
   where g.id = p_guest_id and b.id = g.booking_id
     and b.user_id = auth.uid() and auth.uid() is not null
     and g.removed_at is null
  returning g.booking_id into v_booking;
  if v_booking is null then return false; end if;
  update public.event_media set hidden = true where guest_id = p_guest_id;
  return true;
end;
$$;
revoke all on function public.remove_event_guest(uuid) from public, anon;
grant execute on function public.remove_event_guest(uuid) to authenticated;

create or replace function public.set_event_screen(p_booking_id uuid, p_paused boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.event_bookings b set screen_paused = coalesce(p_paused, false)
   where b.id = p_booking_id and b.user_id = auth.uid() and auth.uid() is not null;
  if not found then
    raise exception 'This event isn''t yours.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_event_screen(uuid, boolean) from public, anon;
grant execute on function public.set_event_screen(uuid, boolean) to authenticated;

-- ══════ 8. The venue screen ══════
-- With the screen key (not the guests' code alone). Only items ready for
-- event_screen_delay_seconds(), so the host has time to hide one first.
create or replace function public.event_screen(p_code text, p_key text, p_limit integer default 60)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'title',  coalesce(b.event_title, ''),
           'paused', b.screen_paused,
           'items',  coalesce((
             select jsonb_agg(x order by x.ready_at desc)
               from (select m.id, m.booking_id, m.kind, m.ext, g.name as guest_name, g.table_no, m.ready_at
                       from public.event_media m
                       left join public.event_guests g on g.id = m.guest_id
                      where m.booking_id = b.id and m.status = 'ready' and m.deleted_at is null and not m.hidden
                        and (g.id is null or g.removed_at is null)
                        and m.ready_at <= now() - make_interval(secs => public.event_screen_delay_seconds())
                      order by m.ready_at desc
                      limit greatest(1, least(coalesce(p_limit, 60), 200))) x), '[]'::jsonb))
    from public.event_bookings b
   where b.guest_code = p_code and b.screen_key = p_key and p_key is not null
     and b.status in ('booked', 'paid', 'completed')
$$;
revoke all on function public.event_screen(text, text, integer) from public;
grant execute on function public.event_screen(text, text, integer) to anon, authenticated;

-- ══════ 9. Cleanup (service role, api/event-cleanup.mjs) ══════
-- Files due to go: deleted items, uploads never finished (a day), every item
-- of a booking cancelled or declined 3+ days ago or whose host deleted their
-- account 3+ days ago, and every item event_keep_days() after the event.
create or replace function public.event_media_files_to_purge(p_limit integer default 200)
returns table (media_id uuid, bucket text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, o.bucket, o.name
    from (select m.*
            from public.event_media m
            join public.event_bookings b on b.id = m.booking_id
           where m.purged_at is null
             and (m.deleted_at is not null
                  or (m.status = 'uploading' and m.created_at < now() - interval '1 day')
                  or (b.status in ('cancelled', 'declined') and coalesce(b.cancelled_at, b.updated_at) < now() - interval '3 days')
                  or b.customer_deleted_at < now() - interval '3 days'
                  or b.event_date + public.event_keep_days() < (now() at time zone 'Asia/Manila')::date)
           order by m.created_at
           limit greatest(1, least(coalesce(p_limit, 200), 1000))) m,
         public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) o
$$;
revoke all on function public.event_media_files_to_purge(integer) from public, anon, authenticated;
grant execute on function public.event_media_files_to_purge(integer) to service_role;

-- Mark items purged once their files are really gone.
create or replace function public.finish_event_media_purge(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.event_media m set purged_at = now()
   where m.id = any(p_ids) and m.purged_at is null
     and not exists (select 1 from public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) o
                      join storage.objects s on s.bucket_id = o.bucket and s.name = o.name);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.finish_event_media_purge(uuid[]) from public, anon, authenticated;
grant execute on function public.finish_event_media_purge(uuid[]) to service_role;

-- ══════ Verify ══════
select 'event tables have RLS on and no customer grants' as check,
  ((select bool_and(relrowsecurity) from pg_class where oid in ('public.event_guests'::regclass, 'public.event_media'::regclass))
   and not has_table_privilege('anon', 'public.event_media', 'SELECT')
   and not has_table_privilege('authenticated', 'public.event_media', 'SELECT')
   and not has_table_privilege('anon', 'public.event_guests', 'SELECT')
   and not has_table_privilege('authenticated', 'public.event_guests', 'SELECT'))::text as result
union all
select 'guests can use the guest functions; only the service role can purge',
  (has_function_privilege('anon', 'public.event_join(text, text, integer, boolean)', 'EXECUTE')
   and has_function_privilege('anon', 'public.event_media_begin(text, text, text, text, bigint, integer, integer, numeric)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.my_event(uuid)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.event_media_files_to_purge(integer)', 'EXECUTE')
   and has_function_privilege('service_role', 'public.event_media_files_to_purge(integer)', 'EXECUTE'))::text
union all
select 'the event storage policies name their buckets',
  ((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('event_uploads_named_by_begin', 'event_originals_host_reads')
     and coalesce(with_check, qual) like '%event-%') = 2)::text
union all
select 'the deal cost is still hidden from hosts',
  (not has_column_privilege('authenticated', 'public.event_bookings', 'deal_cost', 'SELECT'))::text;
