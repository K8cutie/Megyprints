-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — ALBUM STATS PROOF (0048; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    A. only the owner can read the stats: not a visitor, not a signed-in
--       customer, not a fulfillment operator;
--    B. a row is numbers only — the shapes, left-out photos and pages come
--       out exactly as saved, and nothing that names a person or an album
--       (title, photo names, captions) is in it;
--    C. the occasion is a chip, or words at least 3 albums share; a one-off
--       ("Maria's debut") comes out as "Something else";
--    D. "paid only" keeps the albums with a paid order, and the cap holds;
--    E. the owner's and the Team's own albums are left out by default.
--
--  Same method as unpaid-expiry-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), made-up accounts
--  (zz-probe-*.invalid), every scenario in its own subtransaction. The
--  fixtures are made inside the transaction, so p_since => now() (the
--  transaction's own clock) picks out only them.
--
--  HOW TO RUN
--    npx supabase db query --linked --file supabase/security/album-stats-proof.sql
--  To prove 0048 before applying it: `begin;` + the migration + this file
--  (minus its own `begin;`) as one file.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Run p_sql as p_role with a JWT carrying p_email ('' = no email).
create or replace function pg_temp.as_email(p_role text, p_email text, p_sql text)
returns text language plpgsql as $$
declare v_out text;
begin
  begin
    perform set_config('role', p_role, true),
            set_config('request.jwt.claim.role', p_role, true),
            set_config('request.jwt.claims',
              case when p_email = '' then json_build_object('role', p_role)::text
                   else json_build_object('sub', coalesce((select u.id from auth.users u where lower(u.email) = lower(p_email) order by u.created_at limit 1), gen_random_uuid()), 'role', p_role, 'email', p_email, 'aud', 'authenticated')::text end, true);
    execute p_sql into v_out;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claims', '', true);
    return coalesce(v_out, '<null>');
  exception when others then
    return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when p_want like 'REFUSED%' and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || coalesce(p_got, '<null>');
$$;

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-stats-' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

create or replace function pg_temp.mk_album(p_user uuid, p_occasion text, p_photos jsonb, p_pages jsonb)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.albums (id, user_id, title, album_size, occasion, photos, pages)
  values (v, p_user, 'zz probe album Maria Santos', '8x8', p_occasion, p_photos, p_pages);
  return v;
end $$;

do $proof$
declare
  r     text := '';
  got   text;
  fails int;
  total int;
  U     uuid;
  T     uuid;
  A1    uuid;
  -- 3 portraits, 2 landscapes, 1 square, 1 16:9, 1 9:16, 1 left out (a
  -- portrait), and 3 without a usable size: none given, a width saved as
  -- words, and an entry that isn't a photo at all. None of them may fail the call.
  ph    jsonb := '[
    {"id":"a","name":"IMG_maria_01.jpg","width":3024,"height":4032},
    {"id":"b","name":"IMG_maria_02.jpg","width":3024,"height":4032},
    {"id":"c","name":"IMG_maria_03.jpg","width":3024,"height":4032,"leftOut":true},
    {"id":"d","name":"d.jpg","width":4032,"height":3024},
    {"id":"e","name":"e.jpg","width":1500,"height":1000},
    {"id":"f","name":"f.jpg","width":1440,"height":1440},
    {"id":"g","name":"g.jpg","width":1920,"height":1080},
    {"id":"h","name":"h.jpg","width":1080,"height":1920},
    {"id":"i","name":"i.jpg"},
    {"id":"j","name":"j.jpg","width":"abc","height":10},
    "not a photo"
  ]';
  pg    jsonb := '[
    {"templateId":"t88-fb-solo","slotFills":[0]},
    {"templateId":"t88-fb-solo-pt-box-left","slotFills":[1],"textElements":[{"id":"q","text":"Happy 18th, Maria","boxIndex":0}]},
    {"templateId":"t88-x","slotFills":[3,null,4]},
    "not a page"
  ]';
begin
  U := pg_temp.mk_user('u');
  A1 := pg_temp.mk_album(U, 'Maria''s debut', ph, pg);

  -- ── A. Owner only ─────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('A1', 'a visitor (anon) cannot call it', 'REFUSED 42501',
           pg_temp.as_email('anon', '', 'select count(*)::text from public.admin_album_stats()'));
    r := r || pg_temp.line('A2', 'a signed-in customer cannot', 'REFUSED 42501',
           pg_temp.as_email('authenticated', 'zz-probe-stats-u@probe.invalid', 'select count(*)::text from public.admin_album_stats()'));
    insert into public.operator_roles (email, role) values ('zz-probe-stats-ful@probe.invalid', 'fulfillment');
    -- 0058: a Team role needs a Google sign-in with that email.
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    select 'zz-probe-' || u.id, u.id, jsonb_build_object('sub', u.id, 'email', u.email, 'email_verified', true), 'google', now(), now()
      from auth.users u where u.email = 'zz-probe-stats-ful@probe.invalid';
    r := r || pg_temp.line('A3', 'a fulfillment operator cannot', 'REFUSED 42501',
           pg_temp.as_email('authenticated', 'zz-probe-stats-ful@probe.invalid', 'select count(*)::text from public.admin_album_stats()'));
    r := r || pg_temp.line('A4', 'the owner can', '1',
           pg_temp.as_email('authenticated', 'archgarcia@gmail.com', 'select count(*)::text from public.admin_album_stats(false, true, now())'));
    r := r || pg_temp.line('A5', 'anon holds no EXECUTE on it', 'false',
           has_function_privilege('anon', 'public.admin_album_stats(boolean, boolean, timestamptz, integer)', 'execute')::text);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── B. Numbers only, exactly as saved ─────────────────────────────────────
  begin
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select concat_ws('|', album_size, photos, left_out, portrait, landscape, square, extra_wide, extra_tall, unknown_shape, paid, made_on = now()::date)
           from public.admin_album_stats(false, true, now())$q$);
    r := r || pg_temp.line('B1', 'size, photos, left out, P/L/S/wide/tall/unknown, paid, made today', '8x8|11|1|3|2|1|1|1|3|f|t', got);
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select array_to_string(pages, ',') from public.admin_album_stats(false, true, now())$q$);
    r := r || pg_temp.line('B2', 'each page = layout|photos|boxes with something; a non-page skipped', 't88-fb-solo|1|0,t88-fb-solo-pt-box-left|1|1,t88-x|2|0', got);
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select (s::text ilike '%maria%' or s::text ilike '%zz probe%' or s::text ilike '%IMG_%')::text
           from public.admin_album_stats(false, true, now()) s$q$);
    r := r || pg_temp.line('B3', 'no title, photo name, caption or one-off occasion in the row', 'false', got);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── C. Occasions ──────────────────────────────────────────────────────────
  begin
    perform pg_temp.mk_album(U, 'WEDDING', '[]', '[]');
    perform pg_temp.mk_album(U, ' Debut ', '[]', '[]');
    perform pg_temp.mk_album(U, 'debut', '[]', '[]');
    perform pg_temp.mk_album(U, 'DEBUT', '[]', '[]');
    perform pg_temp.mk_album(U, null, '[]', '[]');
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select string_agg(coalesce(occasion, '<none>') || ' x' || n, ', ' order by occasion collate "C")
           from (select occasion, count(*) n from public.admin_album_stats(false, true, now()) group by occasion) t$q$);
    r := r || pg_temp.line('C1', 'chip in its own case; words 3 albums share; a one-off is Something else', 'Something else x1, Wedding x1, debut x3, <none> x1', got);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── D. Paid only, and the cap ─────────────────────────────────────────────
  begin
    perform pg_temp.mk_album(U, 'Family', '[]', '[]');
    perform pg_temp.mk_album(U, 'Family', '[]', '[]');
    insert into public.orders (user_id, album_id, album_snapshot, album_size, status, payment_status, amount,
                               ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province,
                               ship_city, ship_barangay, ship_street)
    values (U, A1, '{"pages":[]}', '8x8', 'paid'::public.order_status, 'paid', 1000,
            'Zz Probe', '+639000000000', '1 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila',
            'Probe City', 'Probe', '1 Probe St');
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select count(*) || '|' || bool_and(paid) from public.admin_album_stats(true, true, now())$q$);
    r := r || pg_temp.line('D1', 'paid only = just the album with a paid order', '1|true', got);
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select count(*) || '|' || max(total_matching) from public.admin_album_stats(false, true, now(), 2)$q$);
    r := r || pg_temp.line('D2', 'a cap of 2 returns 2 rows and still says how many match', '2|3', got);
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select count(*)::text from public.admin_album_stats(false, true, now(), 0)$q$);
    r := r || pg_temp.line('D3', 'a cap below 1 still returns at least 1 row', '1', got);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── E. Our own albums are left out unless asked for ───────────────────────
  begin
    T := pg_temp.mk_user('team');
    insert into public.operator_roles (email, role) values ('zz-probe-stats-team@probe.invalid', 'fulfillment');
    -- 0058: a Team role needs a Google sign-in with that email.
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    select 'zz-probe-' || u.id, u.id, jsonb_build_object('sub', u.id, 'email', u.email, 'email_verified', true), 'google', now(), now()
      from auth.users u where u.email = 'zz-probe-stats-team@probe.invalid';
    perform pg_temp.mk_album(T, 'Family', '[]', '[]');
    -- And one on the real owner account (rolled back with everything else).
    perform pg_temp.mk_album(id, 'Family', '[]', '[]') from auth.users where email = 'archgarcia@gmail.com';
    got := pg_temp.as_email('authenticated', 'archgarcia@gmail.com',
      $q$select (select count(*) from public.admin_album_stats(false, true, now())) || '|'
             || (select count(*) from public.admin_album_stats(false, false, now()))$q$);
    r := r || pg_temp.line('E1', 'owner and Team albums left out by default, counted when asked', '1|3', got);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('ALBUM STATS PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
