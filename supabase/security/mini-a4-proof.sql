-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — A4 MEGY MINI PROOF (0076; always rolled back)
--
--  0076 alone changes nothing anyone sees: the A5 Mini is still on sale at its
--  prices, and an A4 one can't be ordered. Then the go-live update (the end of
--  0076) moves the size and the prices together: the price list sells A4 at
--  ₱450 / ₱550 + ₱120, an A4 order is priced so, an A5 one from an older app is
--  refused as not on sale (MP022), anything but A4/A5 with staples is refused
--  (MP020), and an A5 order placed before keeps its quote. A customer can't
--  move the size; the owner can. Album prices and longer videos are untouched.
--  The script ends by raising, so NOTHING is written; the report is the error.
--
--  HOW TO RUN (after 0076):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/mini-a4-proof.sql
--    (live, read-only by rollback: npx supabase db query --linked --file …)
--  Before applying 0076: one file = "begin;" + 0076 + this file without "begin;".
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated, anon;
grant usage on sequence proof_log_n_seq to authenticated, anon;

create or replace function pg_temp.log(p_ok boolean, p_pass text, p_fail text) returns void language sql as $$
  insert into proof_log(line) values (case when p_ok then 'PASS ' || p_pass else 'FAIL ' || p_fail end);
$$;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.log(boolean, text, text) to authenticated, anon;
grant execute on function pg_temp.as_user(uuid) to authenticated, anon;
create or replace function pg_temp.pages(n integer, q integer default 0) returns jsonb language sql as $$
  select coalesce(jsonb_agg(case when i <= q then '{"qrFills":[true]}'::jsonb else '{"qrFills":[]}'::jsonb end order by i), '[]'::jsonb)
    from generate_series(1, n) i;
$$;
-- An order insert the way checkout sends it; removed again unless p_keep, so
-- the unpaid cap never bites.
create or replace function pg_temp.place(p_size text, p_cover text, p_pages integer, p_qr integer default 0, p_keep boolean default false)
returns jsonb language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
  values (current_setting('proof.c')::uuid,
          jsonb_build_object('album_size', p_size, 'pages', pg_temp.pages(p_pages, p_qr)),
          p_size, p_cover, p_pages, 'glossy', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St')
  returning * into o;
  if not p_keep then delete from public.orders where id = o.id; end if;
  return jsonb_build_object('id', o.id, 'quoted_amount', o.quoted_amount, 'quote', o.quote, 'pages', o.page_count);
end $$;
-- Places an order that must be refused with p_state.
create or replace function pg_temp.refused(p_size text, p_cover text, p_pages integer, p_state text, p_what text)
returns void language plpgsql as $$
begin
  begin
    perform pg_temp.place(p_size, p_cover, p_pages);
    perform pg_temp.log(false, '', p_what || ' was placed');
  exception when others then
    perform pg_temp.log(sqlstate = p_state, p_what || ' is refused (' || sqlstate || ': ' || sqlerrm || ')',
                        p_what || ' failed with ' || sqlstate || ' (wanted ' || p_state || '): ' || sqlerrm);
  end;
end $$;

do $$
declare v_c uuid; v_own uuid;
begin
  select w.user_id into v_own from public.owner_accounts w limit 1;
  select u.id into v_c from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  if v_c is null then raise exception 'Need a customer without an unpaid order.'; end if;
  if v_own is null then
    select u.id into v_own from auth.users u where u.id <> v_c order by u.created_at limit 1;
    insert into public.owner_accounts (user_id, note) values (v_own, 'mini-a4 proof, rolled back');
  end if;
  perform set_config('proof.c', v_c::text, true);
  perform set_config('proof.own', v_own::text, true);
  -- Megy Mini on sale the way it is live on 2026-11-27 (A5, 350 / 449)
  update public.pricing_model
     set mini_shipping_fee = 120, mini_price = 350, mini_package_price = 299, mini_free_qr = 2,
         mini24_price = 449, mini24_package_price = 399, mini_size = '5.8x8.3'
   where id = 1;
  update public.store_settings set mini_on = true where id = 1;
  perform pg_temp.as_user(v_c);
end $$;

-- ══ 0076 ALONE: nothing anyone sees changes ══
set local role anon;
do $$
declare m jsonb := public.public_price_schedule() -> 'mini';
begin
  perform pg_temp.log(m ->> 'size' = '5.8x8.3' and (m ->> 'price')::int = 350
      and m -> 'options' = '[{"pages":16,"price":350,"package_price":299},{"pages":24,"price":449,"package_price":399}]'::jsonb,
    'the price list still sells the A5 Mini at 350 / 449 (what apps up to 2.1.7 read)',
    'before the switch, mini is ' || coalesce(m::text, 'null'));
end $$;
reset role;
do $$
declare r jsonb;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470, 'an A5 16-page Mini still asks 470', 'A5 16 pages: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 569, 'an A5 24-page Mini still asks 569', 'A5 24 pages: ' || r::text);
  perform pg_temp.log(public.order_quote('8.3x11.7', 'staple', 16, 0, null, false, null, null) is null,
    'an A4 Mini has no price before the switch', 'an A4 Mini is priced before the switch');
  perform pg_temp.refused('8.3x11.7', 'staple', 16, 'MP022', 'before the switch, an A4 Mini order');
end $$;

-- An A5 order placed before the switch, kept to the end (its quote must stay).
do $$
declare r jsonb;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16, 0, true);
  perform set_config('proof.a5order', r ->> 'id', true);
end $$;

-- ══ Only the owner moves the size ══
set local role authenticated;
do $$
begin
  begin
    perform public.set_megy_mini_size('8.3x11.7');
    perform pg_temp.log(false, '', 'a customer moved the Mini size');
  exception when sqlstate '42501' then
    perform pg_temp.log(true, 'a customer calling set_megy_mini_size is refused', '');
  end;
end $$;
reset role;
do $$
declare r jsonb;
begin
  perform pg_temp.as_user(current_setting('proof.own')::uuid);
  begin
    perform public.set_megy_mini_size('6x8');
    perform pg_temp.log(false, '', 'the Mini was set to 6x8');
  exception when sqlstate '22023' then
    perform pg_temp.log(true, 'a size other than A4 or A5 is refused', '');
  end;
  r := public.set_megy_mini_size('8.3x11.7');
  perform pg_temp.log(r ->> 'mini_size' = '8.3x11.7', 'the owner moves it to A4; the owner view shows it', 'owner view: ' || r::text);
  r := public.set_megy_mini_size('5.8x8.3');
  perform pg_temp.log(r ->> 'mini_size' = '5.8x8.3', 'and back to A5', 'owner view: ' || r::text);
  perform pg_temp.as_user(current_setting('proof.c')::uuid);
end $$;

-- ══ THE GO-LIVE UPDATE (the end of 0076, word for word) ══
update public.pricing_model
   set mini_size = '8.3x11.7',
       mini_price = 450,   mini_package_price = 399,   mini_cost = 80,
       mini24_price = 550, mini24_package_price = 499, mini24_cost = 120,
       updated_at = now()
 where id = 1;

set local role anon;
do $$
declare m jsonb := public.public_price_schedule() -> 'mini';
begin
  perform pg_temp.log(m ->> 'size' = '8.3x11.7' and m ->> 'cover' = 'staple' and (m ->> 'pages')::int = 16
      and (m ->> 'price')::int = 450 and (m ->> 'shipping_fee')::int = 120 and (m ->> 'free_qr')::int = 2,
    'the price list sells the A4 Mini: 16 pages 450, shipping 120, 2 videos (an A5 app now hides it)',
    'after the switch, mini is ' || coalesce(m::text, 'null'));
  perform pg_temp.log(m -> 'options' = '[{"pages":16,"price":450,"package_price":399},{"pages":24,"price":550,"package_price":499}]'::jsonb,
    'options: 16 pages 450 (package 399), 24 pages 550 (package 499)',
    'options are ' || coalesce((m -> 'options')::text, 'null'));
end $$;
reset role;

do $$
declare r jsonb;
begin
  r := pg_temp.place('8.3x11.7', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 570 and (r -> 'quote' ->> 'album')::int = 450 and (r -> 'quote' ->> 'shipping')::int = 120,
    'an A4 16-page Mini asks 570 (450 + 120)', 'A4 16 pages: ' || r::text);
  r := pg_temp.place('8.3x11.7', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 670 and (r -> 'quote' ->> 'album')::int = 550,
    'an A4 24-page Mini asks 670 (550 + 120)', 'A4 24 pages: ' || r::text);
  r := pg_temp.place('8.3x11.7', 'staple', 24, 5);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 770 and (r -> 'quote' ->> 'qr_packs')::int = 1,
    'an A4 24-page Mini with 5 videos asks 770 (one pack of 3 for 100)', 'A4 24 pages, 5 videos: ' || r::text);
  perform pg_temp.refused('5.8x8.3', 'staple', 16, 'MP022', 'after the switch, an A5 Mini order (an older app)');
  perform pg_temp.refused('8.3x11.7', 'softcover', 16, 'MP020', 'an A4 order without staples');
  perform pg_temp.refused('8x8', 'staple', 16, 'MP020', 'an 8x8 with staples');
  perform pg_temp.refused('8.3x11.7', 'staple', 20, 'MP021', 'a 20-page A4 Mini');
  perform pg_temp.log((select quoted_amount from public.orders where id = current_setting('proof.a5order')::uuid) = 470,
    'the A5 order placed before keeps its 470', 'the A5 order placed before changed');
  update public.orders set ship_name = 'Zz Probe 2' where id = current_setting('proof.a5order')::uuid;
  perform pg_temp.log((select quoted_amount from public.orders where id = current_setting('proof.a5order')::uuid) = 470,
    'and still 470 after an update (never re-quoted)', 'an update re-quoted the A5 order');
  delete from public.orders where id = current_setting('proof.a5order')::uuid;
end $$;

-- ══ Albums and longer videos untouched ══
select pg_temp.log(
  (public.order_quote('8x8', 'hardboundLeather', 40, 0, null, false, null, null) ->> 'total')::int
    = (select (sizes -> '8x8' ->> 'price_hard')::int from public.pricing_model where id = 1),
  'an 8x8 hardcover still costs its set price (0074)', 'the 8x8 hardcover price moved');
select pg_temp.log(jsonb_typeof(public.public_price_schedule() -> 'long_video_prices') = 'object',
  'longer videos are still in the price list', 'longer videos disappeared from the price list');

do $$
declare report text; total integer; fails integer;
begin
  select string_agg(line, E'\n' order by n), count(*), count(*) filter (where line like 'FAIL%')
    into report, total, fails from proof_log;
  raise exception E'\n%\n== % checks, % failed ==', report, total, fails;
end $$;
