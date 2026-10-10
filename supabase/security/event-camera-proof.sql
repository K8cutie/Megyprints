-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — EVENT CAMERA PROOF (0044; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    K. an event opens (QR code + screen key) only when its deposit is
--       confirmed; a request can't bring event settings; codes never change;
--    L. joining: anon can join an open event by code with a name; unknown
--       code, no name, kids not OK'd, outside the dates are refused with
--       sentences; only the host can change the event;
--    M. uploads: a file goes in only under a name event_media_begin() just
--       gave (right bucket, under an hour, open event); the item shows only
--       once every file is in; 20 photos and 2 videos per guest; a wrong
--       token or a removed guest can't upload;
--    N. the feed: guests see what's ready and not hidden; a guest sees their
--       own hidden item, marked; deleted and removed guests' items are gone;
--    O. the host: sees everything with names, hides, picks, removes guests,
--       reads the print masters; nobody else can;
--    P. the venue screen: needs the screen key, shows only items ready 10+
--       seconds and not hidden, and says when it's paused;
--    Q. cleanup: only the service role lists files to purge; an item is
--       marked purged only once its files are gone.
--
--  Same method as event-bookings-proof.sql. Run after 0044 is applied:
--    npx supabase db query --linked --file supabase/security/event-camera-proof.sql
--  Before applying: one file = "begin;" + 0043 + 0044 + this without "begin;".
-- ════════════════════════════════════════════════════════════════════════════
begin;

create or replace function pg_temp.do_as(p_uid uuid, p_role text, p_sql text, p_mode text default 'try')
returns text language plpgsql as $$
declare
  v_email text;
  v_out   text;
begin
  select email into v_email from auth.users where id = p_uid;
  begin
    perform set_config('role', p_role, true),
            set_config('request.jwt.claim.role', p_role, true),
            set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
            set_config('request.jwt.claims',
              case when p_uid is null then json_build_object('role', p_role)::text
                   else json_build_object('sub', p_uid, 'role', p_role, 'email', v_email, 'aud', 'authenticated')::text end, true),
            set_config('storage.allow_delete_query', case when p_role = 'service_role' then 'true' else 'false' end, true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claims', '', true),
            set_config('storage.allow_delete_query', 'false', true);
    return coalesce(v_out, '<null>');
  exception when others then
    return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when (p_want like 'ALLOWED%' or p_want like 'REFUSED%') and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || coalesce(p_got, '<null>');
$$;

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-ec' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

-- A booking for host p_host, its event p_days from today (Manila), deposit confirmed.
create or replace function pg_temp.mk_event(p_host uuid, p_owner uuid, p_days int default 0)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := pg_temp.do_as(p_host, 'authenticated', format(
         $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
            values (auth.uid(), 'wedding', (now() at time zone 'Asia/Manila')::date + %s, 'Zz Probe Hall', 20, 'Zz Probe Host', '09170000000') returning id::text$q$, p_days), 'value')::uuid;
  perform pg_temp.do_as(p_owner, 'authenticated', format('select public.set_booking_deal(%L, 30000, 12000, 9000, ''8x8'', ''hard'', 40)', v));
  perform pg_temp.do_as(p_owner, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', v), 'value');
  return v;
end $$;

create or replace function pg_temp.code(p_booking uuid)
returns text language sql as $$ select guest_code from public.event_bookings where id = p_booking $$;

-- Join as anon; the token.
create or replace function pg_temp.join(p_code text, p_name text, p_kids boolean default false)
returns text language sql as $$
  select pg_temp.do_as(null, 'anon', format('select (public.event_join(%L, %L, 3, %L::boolean) ->> ''token'')', p_code, p_name, p_kids), 'value')
$$;

-- Begin an item as anon; returns the media id.
create or replace function pg_temp.begin_item(p_code text, p_token text, p_kind text default 'photo', p_ext text default 'jpg')
returns text language sql as $$
  select pg_temp.do_as(null, 'anon', format('select (public.event_media_begin(%L, %L, %L, %L, 1000, 4000, 3000, null) ->> ''media_id'')', p_code, p_token, p_kind, p_ext), 'value')
$$;

-- Put a storage object as anon (what the phone's upload does).
create or replace function pg_temp.put(p_bucket text, p_name text)
returns text language sql as $$
  select pg_temp.do_as(null, 'anon', format($q$insert into storage.objects (bucket_id, name) values (%L, %L)$q$, p_bucket, p_name))
$$;

-- Upload every file of an item and mark it ready.
create or replace function pg_temp.finish(p_code text, p_token text, p_media uuid)
returns text language plpgsql as $$
declare o record;
begin
  for o in select x.bucket, x.name from public.event_media m, public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) x where m.id = p_media loop
    perform pg_temp.put(o.bucket, o.name);
  end loop;
  return pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)::text', p_code, p_token, p_media), 'value');
end $$;

do $proof$
declare
  H uuid; O uuid; OWN uuid; X uuid;
  ev uuid; ev_later uuid; cd text; tokA text; tokB text; got text;
  m1 uuid; m2 uuid; mB uuid; mv uuid; mx uuid;
  r text := '';
  fails int; total int;
begin
  if exists (select 1 from auth.users where email like 'zz-probe-ec%') then
    raise exception 'fixture names already in use';
  end if;
  H := pg_temp.mk_user('h'); O := pg_temp.mk_user('o'); OWN := pg_temp.mk_user('own'); X := pg_temp.mk_user('x');
  insert into public.operator_roles (email, role) values ('zz-probe-ecown@probe.invalid', 'owner');

  -- ── K. Opening ──────────────────────────────────────────────────────────────
  begin
    got := pg_temp.do_as(H, 'authenticated',
      $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile, guest_code, kids_on, copies_on, screen_key, event_title)
         values (auth.uid(), 'debut', (now() at time zone 'Asia/Manila')::date + 3, 'Zz Hall', 50, 'Zz Host', '09170000000', 'aaaaaaaa', true, true, 'k', 'X')
         returning concat_ws('|', coalesce(guest_code, '<null>'), kids_on, copies_on, coalesce(screen_key, '<null>'), coalesce(event_title, '<null>'))$q$, 'value');
    r := r || pg_temp.line('K1', 'a request can''t bring event settings', '<null>|f|f|<null>|<null>', got);
    ev := pg_temp.do_as(H, 'authenticated', format(
            $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
               values (auth.uid(), 'wedding', (now() at time zone 'Asia/Manila')::date, 'Zz Hall', 20, 'Zz Host', '09170000000') returning id::text$q$), 'value')::uuid;
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.set_booking_deal(%L, 30000, 12000, 9000, ''8x8'', ''hard'', 40)', ev));
    r := r || pg_temp.line('K2', 'a quoted booking has no event yet', '<null>', coalesce(pg_temp.code(ev), '<null>'));
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', ev), 'value');
    r := r || pg_temp.line('K3', 'the deposit confirmed: a QR code and a screen key', 'true|true',
           (select (guest_code ~ '^[a-z2-9]{8}$')::text || '|' || (screen_key ~ '^[a-z2-9]{16}$')::text from public.event_bookings where id = ev));
    cd := pg_temp.code(ev);
    perform pg_temp.do_as(null, 'service_role', format('update public.event_bookings set guest_code = ''zzzzzzzz'', screen_key = ''x'' where id = %L', ev));
    r := r || pg_temp.line('K4', 'the code never changes, even for the service role', cd, pg_temp.code(ev));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- The event for L–Q (kept by this block): today, booked.
  ev := pg_temp.mk_event(H, OWN, 0);
  cd := pg_temp.code(ev);

  -- ── L. Joining ──────────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('L1', 'anon reads the event''s public face: open, no kids note', 'true|false|20|2',
           pg_temp.do_as(null, 'anon', format($q$select concat_ws('|', public.event_public(%L) ->> 'open', public.event_public(%L) ->> 'kids_on', public.event_public(%L) ->> 'photos_per_guest', public.event_public(%L) ->> 'videos_per_guest')$q$, cd, cd, cd, cd), 'value'));
    tokA := pg_temp.join(cd, 'Tita Lorna');
    r := r || pg_temp.line('L2', 'anon joins with a name and gets a token', 'true', (length(tokA) >= 30)::text);
    r := r || pg_temp.line('L3', '...stored only as a hash', '0', (select count(*)::text from public.event_guests where token_hash = tokA));
    r := r || pg_temp.line('L4', 'an unknown code is refused', 'REFUSED EV020',
           pg_temp.do_as(null, 'anon', 'select public.event_join(''zzzzzzzz'', ''Bea'')', 'value'));
    r := r || pg_temp.line('L5', 'no name is refused, in words', 'REFUSED EV022',
           pg_temp.do_as(null, 'anon', format('select public.event_join(%L, ''   '')', cd), 'value'));
    r := r || pg_temp.line('L6', 'another account can''t change the event', 'REFUSED 42501',
           pg_temp.do_as(O, 'authenticated', format('select public.set_my_event(%L, ''Hack'', false, 10, true)', ev)));
    r := r || pg_temp.line('L7', 'the host turns on "kids will be there"', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format('select public.set_my_event(%L, ''Ana & Ben'', true, 20, false)', ev)));
    r := r || pg_temp.line('L8', 'then joining without the OK is refused, in words', 'REFUSED EV021',
           pg_temp.do_as(null, 'anon', format('select public.event_join(%L, ''Bea'', 2, false)', cd), 'value'));
    r := r || pg_temp.line('L9', '...and with it, joins', 'true', (length(pg_temp.join(cd, 'Bea', true)) >= 30)::text);
    r := r || pg_temp.line('L10', 'anon can''t read the host''s view', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.my_event(%L)::text', ev), 'value'));
    r := r || pg_temp.line('L11', 'another account gets nothing from it', '<null>',
           pg_temp.do_as(O, 'authenticated', format('select public.my_event(%L)::text', ev), 'value'));
    ev_later := pg_temp.mk_event(X, OWN, 30);
    got := pg_temp.do_as(null, 'anon', format('select public.event_join(%L, ''Early'')', pg_temp.code(ev_later)), 'value');
    r := r || pg_temp.line('L12', 'an event a month away isn''t taking photos yet, and says when', 'REFUSED EV020', got);
    r := r || pg_temp.line('L13', '...with the dates', 'true', (got like '%is taking photos from % to %')::text);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  tokA := pg_temp.join(cd, 'Tita Lorna');
  tokB := pg_temp.join(cd, 'Migo');

  -- ── M. Uploads ──────────────────────────────────────────────────────────────
  begin
    got := pg_temp.do_as(null, 'anon', format('select jsonb_array_length(public.event_media_begin(%L, %L, ''photo'', ''jpg'', 1000, 4000, 3000, null) -> ''objects'')::text', cd, tokA), 'value');
    r := r || pg_temp.line('M1', 'a photo is three files: print master, view copy, thumbnail', '3', got);
    m1 := pg_temp.begin_item(cd, tokA)::uuid;
    r := r || pg_temp.line('M2', 'anon puts the print master under its name', 'ALLOWED', pg_temp.put('event-originals', ev || '/' || m1 || '.jpg'));
    r := r || pg_temp.line('M3', 'a name nobody began is refused', 'REFUSED', pg_temp.put('event-originals', ev || '/' || gen_random_uuid() || '.jpg'));
    r := r || pg_temp.line('M4', 'the right name in the wrong bucket is refused', 'REFUSED', pg_temp.put('event-media', ev || '/' || m1 || '.jpg'));
    r := r || pg_temp.line('M5', 'a file outside the event buckets is untouched by this', 'REFUSED', pg_temp.put('payment-proofs', ev || '/' || m1 || '.jpg'));
    r := r || pg_temp.line('M6', 'not ready while files are missing', 'false',
           pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)::text', cd, tokA, m1), 'value'));
    r := r || pg_temp.line('M7', 'ready once every file is in', 'true', pg_temp.finish(cd, tokA, m1));
    mx := pg_temp.begin_item(cd, tokA)::uuid;
    update public.event_media set created_at = now() - interval '2 hours' where id = mx;
    r := r || pg_temp.line('M8', 'a name begun over an hour ago is refused', 'REFUSED', pg_temp.put('event-originals', ev || '/' || mx || '.jpg'));
    -- M1 and m1 count (2); mx is over an hour old, so it doesn't. 17 more = 19.
    for i in 1..17 loop perform pg_temp.begin_item(cd, tokA); end loop;
    r := r || pg_temp.line('M9', 'the 20th photo still goes', 'true', (pg_temp.begin_item(cd, tokA) ~ '^[0-9a-f-]{36}$')::text);
    got := pg_temp.begin_item(cd, tokA);
    r := r || pg_temp.line('M10', 'the 21st is refused, in words', 'REFUSED EV024', got);
    r := r || pg_temp.line('M11', '...saying what to do', 'true', (got like '%shared 20 photos, the most for one guest. Delete one%')::text);
    mv := pg_temp.begin_item(cd, tokA, 'video', 'mp4')::uuid;
    perform pg_temp.begin_item(cd, tokA, 'video', 'mov');
    r := r || pg_temp.line('M12', 'a 3rd video is refused', 'REFUSED EV024', pg_temp.begin_item(cd, tokA, 'video', 'webm'));
    r := r || pg_temp.line('M13', 'a video''s poster goes to event-media, the video to event-videos', 'event-media,event-videos',
           (select string_agg(o.bucket, ',') from public.event_media m, public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) o where m.id = mv));
    r := r || pg_temp.line('M14', 'a photo can''t claim to be a video file', 'REFUSED 23514', pg_temp.begin_item(cd, tokB, 'photo', 'mp4'));
    r := r || pg_temp.line('M15', 'a wrong token can''t upload', 'REFUSED EV025', pg_temp.begin_item(cd, 'not-a-token'));
    r := r || pg_temp.line('M16', 'a token from this event at another event can''t either', 'REFUSED EV025', pg_temp.begin_item('zzzzzzzz', tokA));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- Ready items for N–Q: A has m1, m2; B has mB.
  m1 := pg_temp.begin_item(cd, tokA)::uuid; perform pg_temp.finish(cd, tokA, m1);
  m2 := pg_temp.begin_item(cd, tokA)::uuid; perform pg_temp.finish(cd, tokA, m2);
  mB := pg_temp.begin_item(cd, tokB)::uuid; perform pg_temp.finish(cd, tokB, mB);

  -- ── N. The feed ─────────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('N1', 'A sees all three, with names', '3|Migo,Tita Lorna',
           pg_temp.do_as(null, 'anon', format($q$select count(*) || '|' || string_agg(distinct guest_name, ',' order by guest_name) from public.event_feed(%L, %L)$q$, cd, tokA), 'value'));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_event_media(%L, true, null)', mB), 'value');
    r := r || pg_temp.line('N2', 'the host hides B''s photo: A no longer sees it', '2',
           pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, %L)', cd, tokA), 'value'));
    r := r || pg_temp.line('N3', 'B still sees it, marked as hidden', 'true|true',
           pg_temp.do_as(null, 'anon', format($q$select mine || '|' || hidden from public.event_feed(%L, %L) where id = %L$q$, cd, tokB, mB), 'value'));
    r := r || pg_temp.line('N4', 'A deletes their own photo', 'true',
           pg_temp.do_as(null, 'anon', format('select public.event_media_delete(%L, %L, %L)::text', cd, tokA, m2), 'value'));
    r := r || pg_temp.line('N5', 'B can''t delete A''s', 'false',
           pg_temp.do_as(null, 'anon', format('select public.event_media_delete(%L, %L, %L)::text', cd, tokB, m1), 'value'));
    r := r || pg_temp.line('N6', 'the feed without a token is empty', '0',
           pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, ''nope'')', cd), 'value'));
    r := r || pg_temp.line('N7', 'anon can''t read the tables directly', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', 'select count(*)::text from public.event_media', 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── O. The host ─────────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('O1', 'the host''s counts', '2|3|0',
           pg_temp.do_as(H, 'authenticated', format($q$select concat_ws('|', public.my_event(%L) ->> 'guests', public.my_event(%L) ->> 'photos', public.my_event(%L) ->> 'picked')$q$, ev, ev, ev), 'value'));
    r := r || pg_temp.line('O2', 'the host picks one for the album', 'true',
           pg_temp.do_as(H, 'authenticated', format('select public.set_event_media(%L, null, true)::text', m1), 'value'));
    r := r || pg_temp.line('O3', 'another account can''t pick or hide', 'false',
           pg_temp.do_as(O, 'authenticated', format('select public.set_event_media(%L, true, true)::text', m1), 'value'));
    r := r || pg_temp.line('O4', 'the host reads a print master', '1',
           pg_temp.do_as(H, 'authenticated', format($q$select count(*)::text from storage.objects where bucket_id = 'event-originals' and name = %L$q$, ev || '/' || m1 || '.jpg'), 'value'));
    r := r || pg_temp.line('O5', 'another account can''t', '0',
           pg_temp.do_as(O, 'authenticated', format($q$select count(*)::text from storage.objects where bucket_id = 'event-originals' and name = %L$q$, ev || '/' || m1 || '.jpg'), 'value'));
    r := r || pg_temp.line('O6', 'nor can a guest (anon)', '0',
           pg_temp.do_as(null, 'anon', format($q$select count(*)::text from storage.objects where bucket_id = 'event-originals' and name = %L$q$, ev || '/' || m1 || '.jpg'), 'value'));
    r := r || pg_temp.line('O7', 'the host removes B', 'true',
           pg_temp.do_as(H, 'authenticated', format('select public.remove_event_guest(%L)::text', (select id from public.event_guests where token_hash = public.event_token_hash(tokB))), 'value'));
    r := r || pg_temp.line('O8', 'B can''t upload any more', 'REFUSED EV025', pg_temp.begin_item(cd, tokB));
    r := r || pg_temp.line('O9', 'B''s photo is hidden from A', '2',
           pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, %L)', cd, tokA), 'value'));
    r := r || pg_temp.line('O10', 'B''s items leave the host''s pool and are marked to go (the cleanup takes the files)', '0|true',
           pg_temp.do_as(H, 'authenticated', format('select count(*)::text from public.my_event_media(%L) where id = %L', ev, mB), 'value')
           || '|' || (select (deleted_at is not null)::text from public.event_media where id = mB));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── P. The venue screen ─────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('P1', 'without the screen key, nothing', '<null>',
           pg_temp.do_as(null, 'anon', format('select public.event_screen(%L, ''wrong'')::text', cd), 'value'));
    r := r || pg_temp.line('P2', 'items just ready aren''t on the screen yet', '0',
           pg_temp.do_as(null, 'anon', format($q$select jsonb_array_length(public.event_screen(%L, %L) -> 'items')::text$q$, cd, (select screen_key from public.event_bookings where id = ev)), 'value'));
    update public.event_media set ready_at = now() - interval '20 seconds' where booking_id = ev;
    r := r || pg_temp.line('P3', '20 seconds later they are, with the guest''s name and table', '3|3',
           pg_temp.do_as(null, 'anon', format($q$select jsonb_array_length(public.event_screen(%L, %L) -> 'items') || '|' || (public.event_screen(%L, %L) -> 'items' -> 0 ->> 'table_no')$q$,
             cd, (select screen_key from public.event_bookings where id = ev), cd, (select screen_key from public.event_bookings where id = ev)), 'value'));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_event_media(%L, true, null)', m1), 'value');
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_event_screen(%L, true)', ev));
    r := r || pg_temp.line('P4', 'a hidden item leaves the screen; paused shows', '2|true',
           pg_temp.do_as(null, 'anon', format($q$select jsonb_array_length(public.event_screen(%L, %L) -> 'items') || '|' || (public.event_screen(%L, %L) ->> 'paused')$q$,
             cd, (select screen_key from public.event_bookings where id = ev), cd, (select screen_key from public.event_bookings where id = ev)), 'value'));
    r := r || pg_temp.line('P5', 'another account can''t pause it', 'REFUSED 42501',
           pg_temp.do_as(O, 'authenticated', format('select public.set_event_screen(%L, false)', ev)));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── Q. Cleanup ──────────────────────────────────────────────────────────────
  begin
    perform pg_temp.do_as(null, 'anon', format('select public.event_media_delete(%L, %L, %L)', cd, tokA, m2), 'value');
    r := r || pg_temp.line('Q1', 'a customer can''t list files to purge', 'REFUSED 42501',
           pg_temp.do_as(H, 'authenticated', 'select count(*)::text from public.event_media_files_to_purge()', 'value'));
    r := r || pg_temp.line('Q2', 'the service role sees the deleted photo''s 3 files, and only those', '3',
           pg_temp.do_as(null, 'service_role', format('select count(*)::text from public.event_media_files_to_purge(1000) where media_id = %L', m2), 'value'));
    r := r || pg_temp.line('Q3', 'nothing of a live item is listed', '0',
           pg_temp.do_as(null, 'service_role', format('select count(*)::text from public.event_media_files_to_purge(1000) where media_id = %L', m1), 'value'));
    r := r || pg_temp.line('Q4', 'not marked purged while its files are there', '0',
           pg_temp.do_as(null, 'service_role', format('select public.finish_event_media_purge(array[%L]::uuid[])::text', m2), 'value'));
    perform pg_temp.do_as(null, 'service_role', format($q$delete from storage.objects where name like %L$q$, ev || '/' || m2 || '%'));
    r := r || pg_temp.line('Q5', 'marked once they''re gone', '1',
           pg_temp.do_as(null, 'service_role', format('select public.finish_event_media_purge(array[%L]::uuid[])::text', m2), 'value'));
    update public.event_bookings set status = 'cancelled', cancelled_by = 'owner' where id = ev;
    -- The guard pins cancelled_at once stamped; back-date it with the guard off
    -- (this subtransaction is rolled back).
    alter table public.event_bookings disable trigger event_bookings_guard_trg;
    update public.event_bookings set cancelled_at = now() - interval '4 days' where id = ev;
    alter table public.event_bookings enable trigger event_bookings_guard_trg;
    r := r || pg_temp.line('Q6', 'a booking cancelled 4 days ago: all its files are due', 'true',
           pg_temp.do_as(null, 'service_role', format('select (count(*) >= 6)::text from public.event_media_files_to_purge(1000) where name like %L', ev || '/%'), 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── S. Abuse limits and lifecycle (Kraken 2026-10-10) ─────────────────────
  declare
    tC text; tD text; tE text; tF text; tG text; mm uuid; i int; ev2 uuid; cd2 text; bd uuid; bk uuid;
  begin
    -- S1. Delete-and-share can't keep files coming: twice the limit a day.
    tC := pg_temp.join(cd, 'Churner');
    for i in 1..40 loop
      mm := pg_temp.begin_item(cd, tC)::uuid;
      perform pg_temp.do_as(null, 'anon', format('select public.event_media_delete(%L, %L, %L)', cd, tC, mm), 'value');
    end loop;
    got := pg_temp.begin_item(cd, tC);
    r := r || pg_temp.line('S1', 'after 40 begun-and-deleted photos in a day, the 41st is refused', 'REFUSED EV024', got);
    r := r || pg_temp.line('S2', '...in words', 'true', (got like '%shared and deleted a lot today%')::text);

    -- S3. An item begun long ago can't be finished later (the hour-later bypass).
    tD := pg_temp.join(cd, 'Late finisher');
    mm := pg_temp.begin_item(cd, tD)::uuid;
    update public.event_media set created_at = now() - interval '2 hours' where id = mm;
    r := r || pg_temp.line('S3', 'an item begun 2 hours ago doesn''t become ready', 'false', pg_temp.finish(cd, tD, mm));

    -- S4. ready() counts again: a 21st can't slip in.
    tE := pg_temp.join(cd, 'Squeezer');
    for i in 1..20 loop
      perform pg_temp.finish(cd, tE, pg_temp.begin_item(cd, tE)::uuid);
    end loop;
    insert into public.event_media (booking_id, guest_id, kind, ext)
    values (ev, (select id from public.event_guests where token_hash = public.event_token_hash(tE)), 'photo', 'jpg') returning id into mm;
    r := r || pg_temp.line('S4', 'with 20 ready, a 21st item made some other way isn''t finished', 'REFUSED EV024',
           pg_temp.finish(cd, tE, mm));

    -- S5–S6. What really landed: an oversized thumbnail is refused; sizes recorded.
    tF := pg_temp.join(cd, 'Big thumb');
    mm := pg_temp.begin_item(cd, tF)::uuid;
    perform pg_temp.put(o.bucket, o.name) from public.event_media_objects(ev, mm, 'photo', 'jpg') o;
    update storage.objects set metadata = jsonb_build_object('size', case when name like '%-t.jpg' then 2000000 else 1000 end)
     where name like ev || '/' || mm || '%';
    r := r || pg_temp.line('S5', 'a 2 MB "thumbnail" doesn''t become ready', 'REFUSED EV026',
           pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)', cd, tF, mm), 'value'));
    update storage.objects set metadata = jsonb_build_object('size', 3000) where name like ev || '/' || mm || '%';
    perform pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)', cd, tF, mm), 'value');
    r := r || pg_temp.line('S6', 'ready records the bytes that really landed', '9000', (select bytes::text from public.event_media where id = mm));

    -- S7. The event's space: full is full.
    insert into public.event_media (booking_id, guest_id, kind, ext, status, ready_at, bytes)
    select ev, null, 'photo', 'jpg', 'ready', now(), 104857600 from generate_series(1, 30);
    r := r || pg_temp.line('S7', 'past the event''s space, a new share is refused', 'REFUSED EV027', pg_temp.begin_item(cd, tF));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  declare
    tG text; tH text; mm uuid; ev2 uuid; cd2 text; key2 text; bd uuid; bk uuid; gid uuid;
  begin
    -- S8. "Mine" is the guest's own, all of them.
    tG := pg_temp.join(cd, 'Mine only');
    mm := pg_temp.begin_item(cd, tG)::uuid;
    perform pg_temp.finish(cd, tG, mm);
    r := r || pg_temp.line('S8', 'the Mine feed holds only the guest''s own', '1',
           pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, %L, null, 100, true)', cd, tG), 'value'));
    -- S9. A purged item leaves every list.
    update public.event_media set purged_at = now() where id = mm;
    r := r || pg_temp.line('S9', 'a purged item is in no feed and not in the host''s pool', '0|0',
           pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, %L, null, 100, true)', cd, tG), 'value')
           || '|' || pg_temp.do_as(H, 'authenticated', format('select count(*)::text from public.my_event_media(%L) where id = %L', ev, mm), 'value'));
    -- S10. Control characters don't reach the pool, the list or the screen.
    tH := pg_temp.join(cd, E'Bea\nTable 9');
    r := r || pg_temp.line('S10', 'a guest name loses its line breaks', 'Bea Table 9',
           (select name from public.event_guests where token_hash = public.event_token_hash(tH)));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_my_event(%L, %L, false, 10, true)', ev, E'Ana\n& Ben'));
    r := r || pg_temp.line('S11', '...and so does the event''s name', 'Ana & Ben', (select event_title from public.event_bookings where id = ev));

    -- S12. The host deletes their account: the event closes at once.
    update public.event_bookings set customer_deleted_at = now() where id = ev;
    r := r || pg_temp.line('S12', 'the guest page, the feed and the screen are gone; no copies; names cleared', '<null>|0|<null>|<null>|false|0',
           coalesce(pg_temp.do_as(null, 'anon', format('select public.event_public(%L)::text', cd), 'value'), '<null>')
           || '|' || pg_temp.do_as(null, 'anon', format('select count(*)::text from public.event_feed(%L, %L)', cd, tG), 'value')
           || '|' || pg_temp.do_as(null, 'anon', format('select public.event_screen(%L, %L)::text', cd, (select screen_key from public.event_bookings where id = ev)), 'value')
           || '|' || coalesce((select event_title from public.event_bookings where id = ev), '<null>')
           || '|' || (select copies_on::text from public.event_bookings where id = ev)
           || '|' || (select count(*)::text from public.event_guests where booking_id = ev and name <> 'Guest'));
    r := r || pg_temp.line('S13', 'nobody new can join it', 'REFUSED EV020',
           pg_temp.do_as(null, 'anon', format('select public.event_join(%L, ''Newcomer'')', cd), 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  declare
    ev2 uuid; t2 text; bd uuid; bk uuid;
  begin
    -- S14. Retention: guests' names once the event's files are gone.
    ev2 := pg_temp.mk_event(H, OWN, 0);
    t2 := pg_temp.join(pg_temp.code(ev2), 'Old guest');
    update public.event_bookings set event_date = event_date - 200 where id = ev2;
    -- S15. A request declined 200 days ago with no money: contact cleared; one a deposit was sent for: kept.
    bd := pg_temp.do_as(O, 'authenticated', format(
            $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
               values (auth.uid(), 'debut', (now() at time zone 'Asia/Manila')::date + 30, 'Zz Old Hall', 30, 'Zz Old Host', '09170000001') returning id::text$q$), 'value')::uuid;
    bk := pg_temp.do_as(O, 'authenticated', format(
            $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
               values (auth.uid(), 'debut', (now() at time zone 'Asia/Manila')::date + 31, 'Zz Kept Hall', 30, 'Zz Kept Host', '09170000002') returning id::text$q$), 'value')::uuid;
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.set_booking_deal(%L, 30000, 12000, 9000, ''8x8'', ''hard'', 40)', bk));
    perform pg_temp.do_as(O, 'authenticated', format('select public.submit_booking_payment(%L, ''deposit'', ''777'')', bk));
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.close_booking(%L, ''declined'', null)', bd));
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.close_booking(%L, ''declined'', null)', bk));
    alter table public.event_bookings disable trigger event_bookings_guard_trg;
    update public.event_bookings set updated_at = now() - interval '200 days' where id in (bd, bk);
    alter table public.event_bookings enable trigger event_bookings_guard_trg;
    r := r || pg_temp.line('S14', 'only the service role sweeps', 'REFUSED 42501|REFUSED 42501',
           left(pg_temp.do_as(null, 'anon', 'select public.event_retention_sweep()'), 13) || '|' || left(pg_temp.do_as(O, 'authenticated', 'select public.event_retention_sweep()'), 13));
    perform pg_temp.do_as(null, 'service_role', 'select public.event_retention_sweep()', 'value');
    r := r || pg_temp.line('S15', 'the sweep clears the old event''s guest names', 'Guest',
           (select name from public.event_guests where token_hash = public.event_token_hash(t2)));
    r := r || pg_temp.line('S16', '...the old no-money request''s contact, and keeps the one a deposit was sent for', '<null>|<null>|Zz Kept Host|09170000002',
           (select coalesce(host_name, '<null>') || '|' || coalesce(mobile, '<null>') from public.event_bookings where id = bd)
           || '|' || (select host_name || '|' || mobile from public.event_bookings where id = bk));
    r := r || pg_temp.line('S17', 'the buckets: originals private 20 MB, copies 4 MB jpeg, videos 50 MB', '3',
           (select count(*)::text from storage.buckets where
              (id = 'event-originals' and not public and file_size_limit = 20971520)
           or (id = 'event-media' and public and file_size_limit = 4194304 and allowed_mime_types = array['image/jpeg'])
           or (id = 'event-videos' and public and file_size_limit = 52428800)));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('EVENT CAMERA PROOF — %s/%s PASS (rolled back; nothing written)%s', total - fails, total, r);
end
$proof$;
