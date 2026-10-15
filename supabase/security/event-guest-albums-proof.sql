-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — EVENT GUEST ALBUMS PROOF (0047; live, always rolled back)
--
--  A throwaway event (host H, owner OWN), three guests who joined with the QR
--  (A, B, C) and accounts P1, P2, X. As those real roles, with RLS on:
--   • a guest links their pass to an account once; nobody else can take it;
--   • they see what the feed shows (not hidden, not a removed guest's) and
--     pick their own; they read ONLY the print masters they picked, straight
--     through storage RLS;
--   • the host's switch, removing the guest, anon and strangers all close it.
--  Each probe runs in a subtransaction and the script ends by raising, so
--  NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/event-guest-albums-proof.sql
--  Before applying 0047: one file = "begin;" + 0047 + this file without "begin;".
--  Fixtures use 'zz-probe-ga' names that no real account has.
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
                   else json_build_object('sub', p_uid, 'role', p_role, 'email', v_email, 'aud', 'authenticated')::text end, true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claims', '', true);
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
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-ga' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

create or replace function pg_temp.mk_event(p_host uuid, p_owner uuid)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := pg_temp.do_as(p_host, 'authenticated',
         $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
            values (auth.uid(), 'other', (now() at time zone 'Asia/Manila')::date, 'Zz Probe Field Trip', 30, 'Zz Probe Organizer', '09170000000') returning id::text$q$, 'value')::uuid;
  perform pg_temp.do_as(p_owner, 'authenticated', format('select public.set_booking_deal(%L, 30000, 12000, 9000, ''8x8'', ''soft'', 40)', v));
  perform pg_temp.do_as(p_owner, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', v), 'value');
  return v;
end $$;

create or replace function pg_temp.join(p_code text, p_name text)
returns text language sql as $$
  select pg_temp.do_as(null, 'anon', format('select (public.event_join(%L, %L, null, true) ->> ''token'')', p_code, p_name), 'value')
$$;

create or replace function pg_temp.share(p_code text, p_token text, p_kind text default 'photo')
returns uuid language plpgsql as $$
declare
  v_media uuid;
  o record;
begin
  v_media := pg_temp.do_as(null, 'anon', format('select (public.event_media_begin(%L, %L, %L, %L, 1000, 4000, 3000, %s) ->> ''media_id'')',
               p_code, p_token, p_kind, case when p_kind = 'video' then 'mp4' else 'jpg' end, case when p_kind = 'video' then '10' else 'null' end), 'value')::uuid;
  for o in select x.bucket, x.name from public.event_media m, public.event_media_objects(m.booking_id, m.id, m.kind, m.ext) x where m.id = v_media loop
    perform pg_temp.do_as(null, 'anon', format($q$insert into storage.objects (bucket_id, name) values (%L, %L)$q$, o.bucket, o.name));
  end loop;
  perform pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)::text', p_code, p_token, v_media), 'value');
  return v_media;
end $$;

-- How many print masters of these media the account can read through storage RLS.
create or replace function pg_temp.reads(p_uid uuid, p_booking uuid, p_media uuid[])
returns text language sql as $$
  select pg_temp.do_as(p_uid, 'authenticated', format(
    $q$select count(*)::text from storage.objects where bucket_id = 'event-originals' and name = any(%L::text[])$q$,
    (select array_agg(p_booking::text || '/' || m::text || '.jpg') from unnest(p_media) m)), 'value')
$$;

do $proof$
declare
  H uuid; OWN uuid; P1 uuid; P2 uuid; X uuid;
  ev uuid; ev2 uuid; cd text; cd2 text; tokA text; tokB text; tokC text; tokD text; tokE text; tokF text;
  gA uuid; gB uuid; gC uuid; mx uuid; mB3 uuid; mE1 uuid;
  mA1 uuid; mB1 uuid; mB2 uuid; mC1 uuid; mV uuid; mOther uuid;
  r text := '';
  fails int; total int;
begin
  if exists (select 1 from auth.users where email like 'zz-probe-ga%') then
    raise exception 'fixture names already in use';
  end if;
  H := pg_temp.mk_user('h'); OWN := pg_temp.mk_user('own'); P1 := pg_temp.mk_user('p1'); P2 := pg_temp.mk_user('p2'); X := pg_temp.mk_user('x');
  insert into public.operator_roles (email, role) values ('zz-probe-gaown@probe.invalid', 'owner');

  begin
    ev := pg_temp.mk_event(H, OWN);
    cd := (select guest_code from public.event_bookings where id = ev);
    tokA := pg_temp.join(cd, 'Parent A'); tokB := pg_temp.join(cd, 'Parent B'); tokC := pg_temp.join(cd, 'Parent C');
    gA := (select id from public.event_guests where token_hash = public.event_token_hash(tokA));
    gC := (select id from public.event_guests where token_hash = public.event_token_hash(tokC));
    mA1 := pg_temp.share(cd, tokA); mV := pg_temp.share(cd, tokA, 'video');
    mB1 := pg_temp.share(cd, tokB); mB2 := pg_temp.share(cd, tokB);
    mC1 := pg_temp.share(cd, tokC);
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_event_media(%L, true, null)', mB2));
    perform pg_temp.do_as(H, 'authenticated', format('select public.remove_event_guest(%L)', gC));
    -- Another event's photo, to try across events.
    ev2 := pg_temp.mk_event(X, OWN);
    cd2 := (select guest_code from public.event_bookings where id = ev2);
    tokD := pg_temp.join(cd2, 'Other');
    mOther := pg_temp.share(cd2, tokD);

    r := r || pg_temp.line('G1', 'on by default: the guest page offers it', 'true',
           pg_temp.do_as(null, 'anon', format($q$select public.event_public(%L) ->> 'albums_on'$q$, cd), 'value'));
    r := r || pg_temp.line('G2', 'anon can''t link a pass', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.link_event_guest(%L, %L)', cd, tokA)));
    r := r || pg_temp.line('G3', 'a wrong token links nothing', 'REFUSED EV050',
           pg_temp.do_as(X, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, 'not-a-token')));
    r := r || pg_temp.line('G4', 'guest A links their pass to P1', gA::text,
           pg_temp.do_as(P1, 'authenticated', format($q$select public.link_event_guest(%L, %L) ->> 'guest_id'$q$, cd, tokA), 'value'));
    r := r || pg_temp.line('G5', '...again from P1 is fine', gA::text,
           pg_temp.do_as(P1, 'authenticated', format($q$select public.link_event_guest(%L, %L) ->> 'guest_id'$q$, cd, tokA), 'value'));
    r := r || pg_temp.line('G6', 'P2 can''t take A''s pass', 'REFUSED EV052',
           pg_temp.do_as(P2, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokA)));
    r := r || pg_temp.line('G7', 'P1 finds the event from the account', cd,
           pg_temp.do_as(P1, 'authenticated', 'select string_agg(guest_code, '','') from public.my_guest_albums()', 'value'));
    r := r || pg_temp.line('G8', 'P1 sees A''s photo + video and B''s shown photo, not the hidden one or the removed guest''s', '3|false|false',
           pg_temp.do_as(P1, 'authenticated', format(
             $q$select count(*)::text || '|' || bool_or(id = %L)::text || '|' || bool_or(id = %L)::text from public.guest_album_media(%L)$q$, mB2, mC1, gA), 'value'));
    r := r || pg_temp.line('G9', 'P2 (not A) sees nothing of A''s', '0',
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_media(%L)', gA), 'value'));
    r := r || pg_temp.line('G10', 'anon can''t read the pool', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select count(*) from public.guest_album_media(%L)', gA)));
    r := r || pg_temp.line('G11', 'before any pick P1 reads no print master', '0', pg_temp.reads(P1, ev, array[mA1, mB1]));
    r := r || pg_temp.line('G12', 'P1 picks A1 and the video; hidden, removed and another event''s are refused', 'true|true|false|false|false',
           pg_temp.do_as(P1, 'authenticated', format(
             $q$select public.set_guest_pick(%L, %L, true)::text || '|' || public.set_guest_pick(%L, %L, true)::text || '|' || public.set_guest_pick(%L, %L, true)::text || '|' || public.set_guest_pick(%L, %L, true)::text || '|' || public.set_guest_pick(%L, %L, true)::text$q$,
             gA, mA1, gA, mV, gA, mB2, gA, mC1, gA, mOther), 'value'));
    r := r || pg_temp.line('G13', 'P1 reads the picked print master only (A1 yes, B1 no)', '1', pg_temp.reads(P1, ev, array[mA1, mB1]));
    r := r || pg_temp.line('G14', 'P2 and X read none of them', '0|0', pg_temp.reads(P2, ev, array[mA1, mB1]) || '|' || pg_temp.reads(X, ev, array[mA1, mB1]));
    r := r || pg_temp.line('G15', 'the host still reads all theirs', '2', pg_temp.reads(H, ev, array[mA1, mB1]));
    r := r || pg_temp.line('G16', 'P2 can''t pick for A', 'false',
           pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)::text', gA, mB1), 'value'));
    r := r || pg_temp.line('G17', 'nobody reads the picks table directly', 'REFUSED 42501|REFUSED 42501',
           left(pg_temp.do_as(H, 'authenticated', 'select count(*) from public.event_guest_picks'), 13) || '|' ||
           left(pg_temp.do_as(P1, 'authenticated', 'select count(*) from public.event_guest_picks'), 13));
    r := r || pg_temp.line('G18', 'a stranger can''t switch it off', 'REFUSED 42501',
           pg_temp.do_as(X, 'authenticated', format('select public.set_guest_albums(%L, false)', ev)));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_guest_albums(%L, false)', ev));
    r := r || pg_temp.line('G19', 'host switches it off: page, pool, print masters and new links all close', 'false|0|0|REFUSED EV051',
           pg_temp.do_as(null, 'anon', format($q$select public.event_public(%L) ->> 'albums_on'$q$, cd), 'value') || '|' ||
           pg_temp.do_as(P1, 'authenticated', format('select count(*)::text from public.guest_album_media(%L)', gA), 'value') || '|' ||
           pg_temp.reads(P1, ev, array[mA1]) || '|' ||
           left(pg_temp.do_as(P2, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokB)), 13));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_guest_albums(%L, true)', ev));
    r := r || pg_temp.line('G20', 'the host''s page counts guests making albums', 'true|1',
           pg_temp.do_as(H, 'authenticated', format($q$select (public.my_event(%L) ->> 'guest_albums_on') || '|' || (public.my_event(%L) ->> 'guest_albums')$q$, ev, ev), 'value'));
    perform pg_temp.do_as(H, 'authenticated', format('select public.remove_event_guest(%L)', gA));
    r := r || pg_temp.line('G21', 'host removes guest A: P1 loses the pool, the print masters and the event', '0|0|<null>',
           pg_temp.do_as(P1, 'authenticated', format('select count(*)::text from public.guest_album_media(%L)', gA), 'value') || '|' ||
           pg_temp.reads(P1, ev, array[mA1]) || '|' ||
           pg_temp.do_as(P1, 'authenticated', 'select string_agg(guest_code, '','') from public.my_guest_albums()', 'value'));
    r := r || pg_temp.line('G22', 'anon can''t switch it or list albums', 'REFUSED 42501|REFUSED 42501',
           left(pg_temp.do_as(null, 'anon', format('select public.set_guest_albums(%L, false)', ev)), 13) || '|' ||
           left(pg_temp.do_as(null, 'anon', 'select count(*) from public.my_guest_albums()'), 13));

    -- ── After the review (second commit) ──
    gB := (select id from public.event_guests where token_hash = public.event_token_hash(tokB));
    perform pg_temp.do_as(P2, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokB));
    tokE := pg_temp.join(cd, 'Parent B tablet');
    -- Guest A was removed above, and their photos went with them: new ones.
    mB3 := pg_temp.share(cd, tokB); mE1 := pg_temp.share(cd, tokE);
    r := r || pg_temp.line('G23', 'one place per account per event: a second phone''s pass gives back the first', gB::text || '|1',
           pg_temp.do_as(P2, 'authenticated', format($q$select public.link_event_guest(%L, %L) ->> 'guest_id'$q$, cd, tokE), 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', 'select count(*)::text from public.my_guest_albums()', 'value'));
    r := r || pg_temp.line('G24', 'a removed pass is told so', 'REFUSED EV053',
           pg_temp.do_as(X, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokA)));
    tokF := pg_temp.join(cd, 'Parent A again');
    r := r || pg_temp.line('G25', 'the removed account can''t come back through a new pass', 'REFUSED EV053',
           pg_temp.do_as(P1, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokF)));
    r := r || pg_temp.line('G26', 'the pool comes a page at a time', '1|1|3',
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_media(%L, 0, 1)', gB), 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_media(%L, 1, 1)', gB), 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_media(%L)', gB), 'value'));
    -- Small limits for the proof (the transaction is rolled back).
    create or replace function public.event_guest_album_max_picks() returns integer language sql immutable set search_path = '' as $f$ select 1 $f$;
    r := r || pg_temp.line('G27', 'at most N picked at once', 'true|REFUSED EV054',
           pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)::text', gB, mB1), 'value') || '|' ||
           left(pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)', gB, mB3)), 13));
    create or replace function public.event_guest_album_max_picks() returns integer language sql immutable set search_path = '' as $f$ select 200 $f$;
    create or replace function public.event_guest_album_daily_picks() returns integer language sql immutable set search_path = '' as $f$ select 2 $f$;
    r := r || pg_temp.line('G28', 'unpicking doesn''t reset the day: a third new item is refused, an old one is fine', 'true|true|REFUSED EV055|true',
           pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, false)::text', gB, mB1), 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)::text', gB, mB3), 'value') || '|' ||
           left(pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)', gB, mE1)), 13) || '|' ||
           pg_temp.do_as(P2, 'authenticated', format('select public.set_guest_pick(%L, %L, true)::text', gB, mB1), 'value'));
    r := r || pg_temp.line('G29', 'the picks list is exact', '2',
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_picks(%L)', gB), 'value'));
    -- A copied print master published as a view copy: refused.
    tokD := pg_temp.join(cd2, 'Copier');
    mx := pg_temp.do_as(null, 'anon', format($q$select (public.event_media_begin(%L, %L, 'photo', 'jpg', 1000, 4000, 3000, null) ->> 'media_id')$q$, cd2, tokD), 'value')::uuid;
    perform pg_temp.do_as(null, 'anon', format($q$insert into storage.objects (bucket_id, name, metadata) values ('event-originals', %L, '{"size": 3000000}'), ('event-media', %L, '{"size": 9000000}'), ('event-media', %L, '{"size": 50000}')$q$,
             ev2::text || '/' || mx::text || '.jpg', ev2::text || '/' || mx::text || '-v.jpg', ev2::text || '/' || mx::text || '-t.jpg'));
    r := r || pg_temp.line('G30', 'a public view copy over 4 MB isn''t taken', 'REFUSED EV026',
           pg_temp.do_as(null, 'anon', format('select public.event_media_ready(%L, %L, %L)', cd2, tokD, mx)));
    -- The keep date passes.
    alter table public.event_bookings disable trigger event_bookings_guard_trg;
    update public.event_bookings set event_date = event_date - (public.event_keep_days() + 10) where id = ev;
    alter table public.event_bookings enable trigger event_bookings_guard_trg;
    r := r || pg_temp.line('G31', 'past the keep date: the page, the list, the pool and new links all close', 'false|0|0|REFUSED EV051',
           pg_temp.do_as(null, 'anon', format($q$select public.event_public(%L) ->> 'albums_on'$q$, cd), 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', 'select count(*)::text from public.my_guest_albums()', 'value') || '|' ||
           pg_temp.do_as(P2, 'authenticated', format('select count(*)::text from public.guest_album_media(%L)', gB), 'value') || '|' ||
           left(pg_temp.do_as(X, 'authenticated', format('select public.link_event_guest(%L, %L)', cd, tokF)), 13));
    perform pg_temp.do_as(null, 'service_role', 'select public.event_retention_sweep()', 'value');
    r := r || pg_temp.line('G32', 'the sweep forgets who attended: links, picks and the pick log', '0|0|0',
           (select count(*)::text from public.event_guests where booking_id = ev and (user_id is not null or linked_at is not null)) || '|' ||
           (select count(*)::text from public.event_guest_picks p join public.event_guests g on g.id = p.guest_id where g.booking_id = ev) || '|' ||
           (select count(*)::text from public.event_guest_pick_log l join public.event_guests g on g.id = l.guest_id where g.booking_id = ev));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('EVENT GUEST ALBUMS PROOF — %s/%s PASS (rolled back; nothing written)%s', total - fails, total, r);
end
$proof$;
