-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 24-PAGE MEGY MINI PROOF (0071; always rolled back)
--
--  The price list offers the Mini at 16 pages (₱350) and 24 pages (₱449); a
--  Mini order is priced by its page count; a 24-page Mini with videos pays
--  the same packs as a 16-page one; any other page count is refused (MP021);
--  a customer can't set the 24-page prices; every 16-page price is what it
--  was before 0070. The script ends by raising, so NOTHING is written; the
--  report is the error message.
--
--  HOW TO RUN (after 0071):
--    npx supabase db query --linked --file supabase/security/mini-24-proof.sql
--  Before applying 0071: one file = "begin;" + 0071 + this file without "begin;".
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
-- An order insert the way checkout sends it; removed again so the unpaid cap never bites.
create or replace function pg_temp.place(p_size text, p_cover text, p_pages integer, p_qr integer default 0)
returns jsonb language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
  values (current_setting('proof.c')::uuid,
          jsonb_build_object('album_size', p_size, 'pages', pg_temp.pages(p_pages, p_qr)),
          p_size, p_cover, p_pages, 'glossy', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St')
  returning * into o;
  delete from public.orders where id = o.id;
  return jsonb_build_object('quoted_amount', o.quoted_amount, 'quote', o.quote, 'pages', o.page_count);
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
    -- a local database with no owner: make one for this transaction only
    select u.id into v_own from auth.users u where u.id <> v_c order by u.created_at limit 1;
    insert into public.owner_accounts (user_id, note) values (v_own, 'mini-24 proof, rolled back');
  end if;
  perform set_config('proof.c', v_c::text, true);
  perform set_config('proof.own', v_own::text, true);
  -- Megy Mini on sale, at the owner's numbers
  update public.pricing_model
     set mini_shipping_fee = 120, mini_price = 350, mini_package_price = 299, mini_free_qr = 2,
         mini24_price = 449, mini24_package_price = 399
   where id = 1;
  update public.store_settings set mini_on = true where id = 1;
  perform pg_temp.as_user(v_c);
end $$;

-- ── The price list: both page counts; the 16-page fields unchanged ──
set local role anon;
do $$
declare m jsonb := public.public_price_schedule() -> 'mini';
begin
  perform pg_temp.log((m ->> 'pages')::int = 16 and (m ->> 'price')::int = 350 and (m ->> 'package_price')::int = 299
      and (m ->> 'shipping_fee')::int = 120 and (m ->> 'free_qr')::int = 2,
    'the 16-page fields older apps read are unchanged (16 pages, 350, package 299, shipping 120, 2 videos)',
    'mini is ' || coalesce(m::text, 'null'));
  perform pg_temp.log(m -> 'options' = '[{"pages":16,"price":350,"package_price":299},{"pages":24,"price":449,"package_price":399}]'::jsonb,
    'options: 16 pages 350 (package 299), 24 pages 449 (package 399)',
    'options are ' || coalesce((m -> 'options')::text, 'null'));
end $$;
reset role;

-- ── Orders ──
do $$
declare r jsonb; bad integer;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470 and (r -> 'quote' ->> 'album')::int = 350 and (r -> 'quote' ->> 'pages')::int = 16,
    'a 16-page Mini asks 470 (350 + 120), as before', '16 pages: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 569 and (r -> 'quote' ->> 'album')::int = 449 and (r -> 'quote' ->> 'pages')::int = 24,
    'a 24-page Mini asks 569 (449 + 120)', '24 pages: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 24, 5);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 669 and (r -> 'quote' ->> 'qr_packs')::int = 1,
    'a 24-page Mini with 5 videos asks 669 (one pack of 3 for 100)', '24 pages, 5 videos: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 16, 5);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 570,
    'a 16-page Mini with 5 videos asks 570, as before', '16 pages, 5 videos: ' || r::text);
  foreach bad in array array[20, 32, 15] loop
    begin
      perform pg_temp.place('5.8x8.3', 'staple', bad);
      perform pg_temp.log(false, '', 'a ' || bad || '-page Mini was placed');
    exception when sqlstate 'MP021' then
      perform pg_temp.log(true, 'a ' || bad || '-page Mini is refused (MP021: ' || sqlerrm || ')', '');
    end;
  end loop;
end $$;

-- ── A customer can't set the 24-page prices; the owner can ──
set local role authenticated;
do $$
begin
  begin
    perform public.set_megy_mini_24(1, 1);
    perform pg_temp.log(false, '', 'a customer set the 24-page prices');
  exception when sqlstate '42501' then
    perform pg_temp.log(true, 'a customer calling set_megy_mini_24 is refused', '');
  end;
end $$;
reset role;
do $$
declare r jsonb;
begin
  perform pg_temp.as_user(current_setting('proof.own')::uuid);
  r := public.set_megy_mini_24(459, 409);
  perform pg_temp.log((r ->> 'mini24_price')::int = 459 and (r ->> 'mini24_package_price')::int = 409 and (r ->> 'mini24_cost')::int = 83,
    'the owner sets 459 / 409; the owner view shows them and cost 83', 'owner view: ' || r::text);
  begin
    perform public.set_megy_mini_24(0, 409);
    perform pg_temp.log(false, '', 'a 0 price was saved');
  exception when sqlstate '22023' then
    perform pg_temp.log(true, 'a 0 price is refused', '');
  end;
  perform pg_temp.log((public.order_quote('5.8x8.3', 'staple', 24, 0, null, false, null, null) ->> 'album')::int = 459,
    'a 24-page Mini is then priced 459',
    '24 pages after the owner change: ' || coalesce(public.order_quote('5.8x8.3', 'staple', 24, 0, null, false, null, null)::text, 'null'));
  perform pg_temp.as_user(current_setting('proof.c')::uuid);
end $$;

-- ── Off: no 24-page Mini either ──
do $$
begin
  update public.store_settings set mini_on = false where id = 1;
  perform pg_temp.log(public.order_quote('5.8x8.3', 'staple', 24, 0, null, false, null, null) is null,
    'off: a 24-page Mini has no price', 'off: a 24-page Mini is priced');
  begin
    perform pg_temp.place('5.8x8.3', 'staple', 24);
    perform pg_temp.log(false, '', 'off: a 24-page Mini was placed');
  exception when sqlstate 'MP022' then
    perform pg_temp.log(true, 'off: a 24-page Mini order is refused (MP022)', '');
  end;
end $$;

do $$
declare report text; total integer; fails integer;
begin
  select string_agg(line, E'\n' order by n), count(*), count(*) filter (where line like 'FAIL%')
    into report, total, fails from proof_log;
  raise exception E'\n%\n== % checks, % failed ==', report, total, fails;
end $$;
