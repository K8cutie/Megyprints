-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — MEGY MAGAZINE PROOF (0076; always rolled back)
--
--  0076 alone changes nothing anyone sees: the A5 Mini is on sale at its
--  prices as before, and an A4 booklet can't be ordered. Then a4_on (the end
--  of 0076) puts Megy Magazine on sale BESIDE the Mini: the price list has
--  "a4" at ₱599 / ₱699 + ₱120 while "mini" is unchanged; A4 and A5 orders are
--  each priced from their own list; each booklet is refused in its own name
--  when it is off (MP022); anything but A5/A4 with staples is refused (MP020);
--  an order placed before keeps its quote. A customer can't see the costs;
--  album prices and longer videos are untouched. The script ends by raising,
--  so NOTHING is written; the report is the error.
--
--  HOW TO RUN (after 0076):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/megy-magazine-proof.sql
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
-- Places an order that must be refused with p_state (and, when given, words like p_words).
create or replace function pg_temp.refused(p_size text, p_cover text, p_pages integer, p_state text, p_what text, p_words text default null)
returns void language plpgsql as $$
begin
  begin
    perform pg_temp.place(p_size, p_cover, p_pages);
    perform pg_temp.log(false, '', p_what || ' was placed');
  exception when others then
    perform pg_temp.log(sqlstate = p_state and (p_words is null or sqlerrm like p_words),
                        p_what || ' is refused (' || sqlstate || ': ' || sqlerrm || ')',
                        p_what || ' failed with ' || sqlstate || ' (wanted ' || p_state || coalesce(', "' || p_words || '"', '') || '): ' || sqlerrm);
  end;
end $$;

do $$
declare v_c uuid;
begin
  select u.id into v_c from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  if v_c is null then raise exception 'Need a customer without an unpaid order.'; end if;
  perform set_config('proof.c', v_c::text, true);
  -- Megy Mini on sale the way it is live on 2026-11-27 (A5, 350 / 449)
  update public.pricing_model
     set mini_shipping_fee = 120, mini_price = 350, mini_package_price = 299, mini_free_qr = 2,
         mini24_price = 449, mini24_package_price = 399
   where id = 1;
  update public.store_settings set mini_on = true where id = 1;
  perform pg_temp.as_user(v_c);
end $$;

-- ══ 0076 ALONE: nothing anyone sees changes ══
set local role anon;
do $$
declare s jsonb := public.public_price_schedule();
begin
  perform pg_temp.log((s -> 'mini' ->> 'size') = '5.8x8.3' and (s -> 'mini' ->> 'price')::int = 350
      and s -> 'mini' -> 'options' = '[{"pages":16,"price":350,"package_price":299},{"pages":24,"price":449,"package_price":399}]'::jsonb,
    'the price list still sells the A5 Mini at 350 / 449 (what every app up to 2.1.8 reads)',
    'mini is ' || coalesce((s -> 'mini')::text, 'null'));
  perform pg_temp.log(jsonb_typeof(s -> 'a4') = 'null',
    'Megy Magazine is not in the price list while it is off', 'a4 is ' || coalesce((s -> 'a4')::text, 'missing'));
end $$;
reset role;
do $$
declare r jsonb;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470, 'an A5 16-page Mini asks 470', 'A5 16 pages: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 569, 'an A5 24-page Mini asks 569', 'A5 24 pages: ' || r::text);
  perform pg_temp.log(public.order_quote('8.3x11.7', 'staple', 16, 0, null, false, null, null) is null,
    'Megy Magazine has no price while it is off', 'Megy Magazine is priced while off');
  perform pg_temp.refused('8.3x11.7', 'staple', 16, 'MP022', 'while it is off, a Megy Magazine order', 'Megy Magazine isn''t on sale%');
end $$;

-- A Mini order placed before Megy Magazine goes on, kept to the end (its quote must stay).
do $$
declare r jsonb;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16, 0, true);
  perform set_config('proof.a5order', r ->> 'id', true);
end $$;

-- ══ ON SALE (the end of 0076, word for word) ══
update public.store_settings set a4_on = true where id = 1;

set local role anon;
do $$
declare s jsonb := public.public_price_schedule();
declare a jsonb := s -> 'a4';
begin
  perform pg_temp.log(a ->> 'size' = '8.3x11.7' and a ->> 'cover' = 'staple' and (a ->> 'pages')::int = 16
      and (a ->> 'price')::int = 599 and (a ->> 'shipping_fee')::int = 120 and (a ->> 'free_qr')::int = 2,
    'the price list sells Megy Magazine: A4, 16 pages 599, shipping 120, 2 videos',
    'a4 is ' || coalesce(a::text, 'null'));
  perform pg_temp.log(a -> 'options' = '[{"pages":16,"price":599,"package_price":549},{"pages":24,"price":699,"package_price":649}]'::jsonb,
    'options: 16 pages 599 (package 549), 24 pages 699 (package 649)',
    'options are ' || coalesce((a -> 'options')::text, 'null'));
  perform pg_temp.log((s -> 'mini' ->> 'size') = '5.8x8.3' and (s -> 'mini' ->> 'price')::int = 350
      and (s -> 'mini' -> 'options' -> 1 ->> 'price')::int = 449,
    'and the Mini beside it is still A5 at 350 / 449', 'mini changed: ' || coalesce((s -> 'mini')::text, 'null'));
  perform pg_temp.log(a ? 'cost' = false and (a::text not like '%cost%'),
    'no cost figure in the public list', 'the public list shows a cost: ' || a::text);
end $$;
reset role;

do $$
declare r jsonb;
begin
  r := pg_temp.place('8.3x11.7', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 719 and (r -> 'quote' ->> 'album')::int = 599 and (r -> 'quote' ->> 'shipping')::int = 120,
    'a 16-page Megy Magazine asks 719 (599 + 120)', 'A4 16 pages: ' || r::text);
  r := pg_temp.place('8.3x11.7', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 819 and (r -> 'quote' ->> 'album')::int = 699,
    'a 24-page Megy Magazine asks 819 (699 + 120)', 'A4 24 pages: ' || r::text);
  r := pg_temp.place('8.3x11.7', 'staple', 24, 5);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 919 and (r -> 'quote' ->> 'qr_packs')::int = 1,
    'a 24-page Megy Magazine with 5 videos asks 919 (one pack of 3 for 100)', 'A4 24 pages, 5 videos: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470, 'the A5 Mini still asks 470 beside it', 'A5 16 pages: ' || r::text);
  r := pg_temp.place('5.8x8.3', 'staple', 24);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 569, 'and 569 at 24 pages', 'A5 24 pages: ' || r::text);
  perform pg_temp.refused('8.3x11.7', 'softcover', 16, 'MP020', 'an A4 order without staples');
  perform pg_temp.refused('8x8', 'staple', 16, 'MP020', 'an 8x8 with staples');
  perform pg_temp.refused('8.3x11.7', 'staple', 20, 'MP021', 'a 20-page Megy Magazine', 'Megy Magazine has 16 or 24 pages%');
  perform pg_temp.refused('5.8x8.3', 'staple', 20, 'MP021', 'a 20-page Mini', 'A Megy Mini has 16 or 24 pages%');
end $$;

-- ══ Each booklet off on its own ══
update public.store_settings set mini_on = false where id = 1;
do $$
declare r jsonb;
begin
  perform pg_temp.refused('5.8x8.3', 'staple', 16, 'MP022', 'with the Mini off, a Mini order', 'Megy Mini isn''t on sale%');
  r := pg_temp.place('8.3x11.7', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 719, 'Megy Magazine still sells with the Mini off', 'A4 with the Mini off: ' || r::text);
end $$;
update public.store_settings set mini_on = true where id = 1;

do $$
begin
  perform pg_temp.log((select quoted_amount from public.orders where id = current_setting('proof.a5order')::uuid) = 470,
    'the Mini order placed before keeps its 470', 'the Mini order placed before changed');
  update public.orders set ship_name = 'Zz Probe 2' where id = current_setting('proof.a5order')::uuid;
  perform pg_temp.log((select quoted_amount from public.orders where id = current_setting('proof.a5order')::uuid) = 470,
    'and still 470 after an update (never re-quoted)', 'an update re-quoted the Mini order');
  delete from public.orders where id = current_setting('proof.a5order')::uuid;
end $$;

-- ══ The owner's numbers: owner only ══
set local role authenticated;
do $$
begin
  begin
    perform public.owner_pricing_model();
    perform pg_temp.log(false, '', 'a customer read the owner''s pricing model');
  exception when sqlstate '42501' then
    perform pg_temp.log(true, 'a customer can''t read the costs (owner_pricing_model)', '');
  end;
end $$;
reset role;

-- ══ An affiliate client gets no discount on Megy Magazine (0065 reads the staples) ══
select pg_temp.log(
  pg_get_functiondef('public.orders_with_affiliate_code'::regproc) like '%new.cover = ''staple''%v_discount := 0%',
  'an affiliate code takes nothing off a stapled order, A4 too (0065)', 'the affiliate rule no longer reads the staples');

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
