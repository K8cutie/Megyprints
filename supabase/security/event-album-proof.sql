-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — EVENT ALBUM PROOF (0045; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    R. the host's album order is paid by the booking only once the balance
--       is confirmed, only for the deal's size/cover/pages, only once, and
--       only by the booking's own account; nobody can set the event columns
--       by hand; the booking completes when the album is delivered and can pay
--       again if its album order is cancelled;
--    S. guest copies: only when the host turned them on and their album is
--       paid; a signed-in guest places a normal unpaid order for the same
--       album that prints from the host's files; anon can't; bad delivery
--       details are refused; the 3-unpaid limit applies; the console sees
--       which order a copy prints from.
--
--  Run after 0045:  npx supabase db query --linked --file supabase/security/event-album-proof.sql
--  Before applying: "begin;" + 0043 + 0044 + 0045 + this without "begin;".
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
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-ea' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

-- An unpaid album order as the customer would place it (RLS insert).
create or replace function pg_temp.order_sql(p_size text default '8x8', p_cover text default 'hardboundLeather', p_pages int default 40)
returns text language sql as $$
  select format($q$insert into public.orders (user_id, album_snapshot, album_size, cover, material, page_count, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
                   values (auth.uid(), '{"title":"zz probe"}', %L, %L, 'matte', %s, 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St')
                   returning id::text$q$, p_size, p_cover, p_pages)
$$;

create or replace function pg_temp.ship()
returns text language sql as $$
  select '{"name":"Lola Nena","phone":"+639181234567","address":"2 Copy St, Brgy. Probe, Probe City, Metro Manila 1000","region":"NCR","province":"Metro Manila","city":"Probe City","barangay":"Probe","street":"2 Copy St","zip":"1000"}'
$$;

do $proof$
declare
  H uuid; O uuid; OWN uuid; G uuid;
  ev uuid; cd text; o1 uuid; o2 uuid; oc uuid; got text;
  r text := '';
  fails int; total int;
begin
  if exists (select 1 from auth.users where email like 'zz-probe-ea%') then
    raise exception 'fixture names already in use';
  end if;
  H := pg_temp.mk_user('h'); O := pg_temp.mk_user('o'); OWN := pg_temp.mk_user('own'); G := pg_temp.mk_user('g');
  insert into public.operator_roles (email, role) values ('zz-probe-eaown@probe.invalid', 'owner');

  ev := pg_temp.do_as(H, 'authenticated',
          $q$insert into public.event_bookings (user_id, event_type, event_date, venue, guest_count, host_name, mobile)
             values (auth.uid(), 'wedding', (now() at time zone 'Asia/Manila')::date, 'Zz Hall', 80, 'Zz Host', '09170000000') returning id::text$q$, 'value')::uuid;
  perform pg_temp.do_as(OWN, 'authenticated', format('select public.set_booking_deal(%L, 30000, 12000, 9000, ''8x8'', ''hard'', 48)', ev));
  perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''deposit'')', ev), 'value');
  cd := (select guest_code from public.event_bookings where id = ev);
  o1 := pg_temp.do_as(H, 'authenticated', pg_temp.order_sql(), 'value')::uuid;

  -- ── R. The host's album, paid by the booking ───────────────────────────────
  begin
    got := pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o1, ev));
    r := r || pg_temp.line('R1', 'before the balance is in, the album isn''t covered', 'REFUSED EV031', got);
    r := r || pg_temp.line('R2', '...and it says which balance', 'true', (got like '%Pay the ₱18,000 balance first%')::text);
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''balance'')', ev), 'value');
    o2 := pg_temp.do_as(H, 'authenticated', pg_temp.order_sql('6x6', 'hardboundLeather', 40), 'value')::uuid;
    r := r || pg_temp.line('R3', 'a different size isn''t covered, in words', 'REFUSED EV034',
           pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o2, ev)));
    oc := pg_temp.do_as(H, 'authenticated', pg_temp.order_sql('8x8', 'softcover', 40), 'value')::uuid;
    r := r || pg_temp.line('R4', 'a softcover isn''t a hardbound deal', 'REFUSED EV034',
           pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', oc, ev)));
    r := r || pg_temp.line('R5', 'another account can''t use the booking', 'REFUSED EV030',
           pg_temp.do_as(O, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o1, ev)));
    r := r || pg_temp.line('R6', 'anon can''t call it', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.cover_order_with_booking(%L, %L)', o1, ev)));
    r := r || pg_temp.line('R7', 'the deal''s album is covered', 'ALLOWED',
           pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o1, ev)));
    r := r || pg_temp.line('R8', '...paid, ₱0, by the booking', 'paid|paid|0|true|booking',
           (select concat_ws('|', status, payment_status, amount, (event_booking_id = ev)::text, status_history -> -1 ->> 'by') from public.orders where id = o1));
    r := r || pg_temp.line('R9', '...and the booking knows its album order', 'true',
           (select (album_order_id = o1)::text from public.event_bookings where id = ev));
    r := r || pg_temp.line('R10', 'a second album isn''t covered', 'REFUSED EV032',
           pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o2, ev)));
    r := r || pg_temp.line('R11', 'a customer''s insert can''t set the event columns', '<null>|<null>',
           pg_temp.do_as(H, 'authenticated', format(
             $q$insert into public.orders (user_id, album_snapshot, album_size, cover, material, page_count, ship_name, ship_phone, ship_address, ship_zip,
                                           ship_region, ship_province, ship_city, ship_barangay, ship_street, event_booking_id, copy_of_order_id)
                values (auth.uid(), '{}', '8x8', 'hardboundLeather', 'matte', 40, 'Zz Probe', '+639170000000', '1 Probe St', '0000',
                        'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St', %L, %L)
                returning coalesce(event_booking_id::text, '<null>') || '|' || coalesce(copy_of_order_id::text, '<null>')$q$, ev, o1), 'value'));
    update public.orders set status = 'delivered' where id = o1;
    r := r || pg_temp.line('R12', 'the album delivered: the booking is completed', 'completed',
           (select status from public.event_bookings where id = ev));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── R13. A cancelled album order frees the booking ─────────────────────────
  begin
    perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''balance'')', ev), 'value');
    perform pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o1, ev));
    update public.orders set status = 'cancelled' where id = o1;
    r := r || pg_temp.line('R13', 'the album order cancelled: the booking can pay for a new one', '<null>',
           (select coalesce(album_order_id::text, '<null>') from public.event_bookings where id = ev));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- The host's album, covered, for S (kept by this block).
  perform pg_temp.do_as(OWN, 'authenticated', format('select public.mark_booking_paid(%L, ''balance'')', ev), 'value');
  perform pg_temp.do_as(H, 'authenticated', format('select public.cover_order_with_booking(%L, %L)', o1, ev));

  -- ── S. Guest copies ─────────────────────────────────────────────────────────
  begin
    r := r || pg_temp.line('S1', 'copies off: nothing offered', '<null>',
           pg_temp.do_as(null, 'anon', format('select public.event_copy_offer(%L)::text', cd), 'value'));
    r := r || pg_temp.line('S2', '...and a copy is refused', 'REFUSED EV040',
           pg_temp.do_as(G, 'authenticated', format('select public.place_event_copy_order(%L, %L::jsonb)::text', cd, pg_temp.ship()), 'value'));
    perform pg_temp.do_as(H, 'authenticated', format('select public.set_my_event(%L, ''Ana & Ben'', false, 20, true)', ev));
    r := r || pg_temp.line('S3', 'copies on: the same album is offered', '8x8|hardboundLeather|40',
           pg_temp.do_as(null, 'anon', format($q$select concat_ws('|', public.event_copy_offer(%L) ->> 'album_size', public.event_copy_offer(%L) ->> 'cover', public.event_copy_offer(%L) ->> 'page_count')$q$, cd, cd, cd), 'value'));
    r := r || pg_temp.line('S4', 'anon can''t place a copy (sign in first)', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.place_event_copy_order(%L, %L::jsonb)::text', cd, pg_temp.ship()), 'value'));
    r := r || pg_temp.line('S5', 'a bad mobile number is refused', 'REFUSED EV041',
           pg_temp.do_as(G, 'authenticated', format('select public.place_event_copy_order(%L, %L::jsonb)::text', cd, replace(pg_temp.ship(), '+639181234567', '0918')), 'value'));
    got := pg_temp.do_as(G, 'authenticated', format($q$select public.place_event_copy_order(%L, %L::jsonb) ->> 'order_id'$q$, cd, pg_temp.ship()), 'value');
    r := r || pg_temp.line('S6', 'a signed-in guest places a copy', 'true', (got ~ '^[0-9a-f-]{36}$')::text);
    r := r || pg_temp.line('S7', '...a normal unpaid order of theirs, for the same album, printing from the host''s', 'pending_payment|unpaid|<null>|true|8x8|40|true|Lola Nena',
           (select concat_ws('|', status, payment_status, coalesce(amount::text, '<null>'), (user_id = G)::text, album_size, page_count, (copy_of_order_id = o1)::text, ship_name)
              from public.orders where id = got::uuid));
    r := r || pg_temp.line('S8', 'the guest sees their copy, not the host''s order', '1|0',
           pg_temp.do_as(G, 'authenticated', format($q$select (select count(*) from public.orders where id = %L) || '|' || (select count(*) from public.orders where id = %L)$q$, got, o1), 'value'));
    perform pg_temp.do_as(G, 'authenticated', format('select public.place_event_copy_order(%L, %L::jsonb)', cd, pg_temp.ship()), 'value');
    perform pg_temp.do_as(G, 'authenticated', format('select public.place_event_copy_order(%L, %L::jsonb)', cd, pg_temp.ship()), 'value');
    r := r || pg_temp.line('S9', 'a 4th unpaid copy hits the 3-unpaid limit', 'REFUSED MP001',
           pg_temp.do_as(G, 'authenticated', format('select public.place_event_copy_order(%L, %L::jsonb)::text', cd, pg_temp.ship()), 'value'));
    r := r || pg_temp.line('S10', 'the console sees which order the copy prints from', 'true',
           pg_temp.do_as(OWN, 'authenticated', format('select (copy_of_order_number = %L)::text from public.operator_orders(500, 0) where id = %L',
             (select order_number from public.orders where id = o1), got), 'value'));
    r := r || pg_temp.line('S11', '...and which booking the host''s album belongs to', 'true',
           pg_temp.do_as(OWN, 'authenticated', format('select (event_booking_number = (select booking_number from public.event_bookings where id = %L))::text from public.operator_orders(500, 0) where id = %L', ev, o1), 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('EVENT ALBUM PROOF — %s/%s PASS (rolled back; nothing written)%s', total - fails, total, r);
end
$proof$;
