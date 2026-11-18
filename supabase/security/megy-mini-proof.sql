-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — MEGY MINI PROOF (0062; always rolled back)
--
--  Megy Mini stays off sale until the owner turns it on with a shipping fee;
--  the price list then carries it; a Mini order is priced ₱350 + shipping +
--  ₱20 per QR memory past the 2 free; a Mini must be A5, staples, 16 pages;
--  a customer can't switch it on; album prices are unchanged. The script ends
--  by raising, so NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/megy-mini-proof.sql
--  Before applying 0062: one file = "begin;" + 0062 + this file without "begin;".
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
-- A book's pages: n pages, the first q of them carrying one QR memory.
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
  return jsonb_build_object('quoted_amount', o.quoted_amount, 'quote', o.quote, 'size', o.album_size, 'pages', o.page_count);
end $$;

do $$
declare
  v_c   uuid;
  v_own uuid;
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
    insert into public.owner_accounts (user_id, note) values (v_own, 'megy-mini proof, rolled back');
  end if;
  perform set_config('proof.c', v_c::text, true);
  perform set_config('proof.own', coalesce(v_own::text, ''), true);
  perform pg_temp.as_user(v_c);
  -- start from "off, no fee", whatever the database had
  update public.store_settings set mini_on = false where id = 1;
  update public.pricing_model set mini_shipping_fee = null, mini_price = 350, mini_package_price = 299, mini_free_qr = 2 where id = 1;
end $$;

-- ── Off: not in the price list, a Mini order is refused ──
do $$
declare r jsonb;
begin
  perform pg_temp.log((public.public_price_schedule() -> 'mini') = 'null'::jsonb,
    'off: the price list has mini = null', 'off: the price list shows a mini: ' || coalesce(public.public_price_schedule() ->> 'mini', ''));
  perform pg_temp.log(public.public_price_schedule() -> 'sizes' -> '5.8x8.3' is null,
    'A5 is never an album size', 'a5 shows as an album size');
  begin
    r := pg_temp.place('5.8x8.3', 'staple', 16);
    perform pg_temp.log(false, '', 'off: a Mini order was placed: ' || r::text);
  exception when sqlstate 'MP022' then
    perform pg_temp.log(true, 'off: a Mini order is refused (MP022: ' || sqlerrm || ')', '');
  end;
end $$;

-- ── A customer can't switch it on ──
set local role authenticated;
do $$
begin
  begin
    perform public.set_megy_mini(true, 1, 1, 0, 50);
    perform pg_temp.log(false, '', 'a customer switched Megy Mini on');
  exception when sqlstate '42501' then
    perform pg_temp.log(true, 'a customer calling set_megy_mini is refused', '');
  end;
  begin
    perform public.owner_pricing_model();
    perform pg_temp.log(false, '', 'a customer read the owner pricing model');
  exception when sqlstate '42501' then
    perform pg_temp.log(true, 'a customer reading owner_pricing_model is refused', '');
  end;
end $$;
reset role;

-- ── The owner turns it on (needs a shipping fee) ──
do $$
declare r jsonb; own text := current_setting('proof.own');
begin
  if own = '' then
    update public.pricing_model set mini_shipping_fee = 120 where id = 1;
    update public.store_settings set mini_on = true where id = 1;
    perform pg_temp.log(true, 'no owner account here: switched on directly (fee 120)', '');
  else
    perform pg_temp.as_user(own::uuid);
    begin
      perform public.set_megy_mini(true, 350, 299, null, 2);
      perform pg_temp.log(false, '', 'turned on with no shipping fee');
    exception when sqlstate '22023' then
      perform pg_temp.log(true, 'turning on with no shipping fee is refused: ' || sqlerrm, '');
    end;
    r := public.set_megy_mini(true, 350, 299, 120, 2);
    perform pg_temp.log((r ->> 'mini_on')::boolean and (r ->> 'mini_shipping_fee')::int = 120 and (r ->> 'mini_cost')::int = 56,
      'the owner turns it on with a ₱120 fee; the owner view shows on, 120, cost 56', 'owner view after set_megy_mini: ' || r::text);
    perform pg_temp.as_user(current_setting('proof.c')::uuid);
  end if;
end $$;

-- ── On: the price list carries it, anon can read it ──
set local role anon;
do $$
declare m jsonb := public.public_price_schedule() -> 'mini';
begin
  perform pg_temp.log(m ->> 'size' = '5.8x8.3' and m ->> 'cover' = 'staple' and (m ->> 'pages')::int = 16
      and (m ->> 'price')::int = 350 and (m ->> 'package_price')::int = 299
      and (m ->> 'shipping_fee')::int = 120 and (m ->> 'free_qr')::int = 2,
    'on: anyone sees mini {5.8x8.3, staple, 16 pages, ₱350, package ₱299, shipping ₱120, 2 free videos}',
    'on: the price list mini is ' || coalesce(m::text, 'null'));
end $$;
reset role;

-- ── Mini orders ──
do $$
declare r jsonb;
begin
  r := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470 and r -> 'quote' ->> 'product' = 'mini'
      and (r -> 'quote' ->> 'album')::int = 350 and (r -> 'quote' ->> 'shipping')::int = 120,
    'a Mini with no videos asks ₱470 (350 + 120 shipping)', 'Mini, no videos: ' || r::text);

  r := pg_temp.place('5.8x8.3', 'staple', 16, 2);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 470 and (r -> 'quote' ->> 'qr_fee')::int = 0,
    'a Mini with 2 videos asks ₱470 (both free)', 'Mini, 2 videos: ' || r::text);

  r := pg_temp.place('5.8x8.3', 'staple', 16, 4);
  perform pg_temp.log((r ->> 'quoted_amount')::int = 510 and (r -> 'quote' ->> 'extra_qr')::int = 2,
    'a Mini with 4 videos asks ₱510 (2 past the free ones × ₱20)', 'Mini, 4 videos: ' || r::text);

  begin
    r := pg_temp.place('5.8x8.3', 'staple', 15);
    perform pg_temp.log(false, '', 'a 15-page Mini was placed: ' || r::text);
  exception when sqlstate 'MP021' then
    perform pg_temp.log(true, 'a 15-page Mini is refused (MP021)', '');
  end;
  begin
    r := pg_temp.place('5.8x8.3', 'staple', 40);
    perform pg_temp.log(false, '', 'a 40-page Mini was placed: ' || r::text);
  exception when sqlstate 'MP021' then
    perform pg_temp.log(true, 'a 40-page Mini is refused (MP021)', '');
  end;
  begin
    r := pg_temp.place('5.8x8.3', 'softcover', 16);
    perform pg_temp.log(false, '', 'an A5 softcover was placed: ' || r::text);
  exception when sqlstate 'MP020' then
    perform pg_temp.log(true, 'A5 without staples is refused (MP020)', '');
  end;
  begin
    r := pg_temp.place('8x8', 'staple', 16);
    perform pg_temp.log(false, '', 'an 8x8 with staples was placed: ' || r::text);
  exception when sqlstate 'MP020' then
    perform pg_temp.log(true, 'staples on an 8x8 are refused (MP020)', '');
  end;
end $$;

-- ── Albums are unchanged ──
do $$
declare
  s jsonb := public.public_price_schedule();
  r jsonb;
  want integer;
  k text;
  pages integer;
  bad text := '';
  checked integer := 0;
  pps integer;
  reserve integer := floor((s ->> 'hosting_reserve')::float8 + 0.5)::integer;
begin
  for k in select jsonb_object_keys(s -> 'sizes') loop
    pps := (s -> 'sizes' -> k ->> 'pps')::int;
    foreach pages in array array[40, 41, 60, 100] loop
      want := floor(ceil(greatest(40, pages)::numeric / pps)::integer * (s ->> 'sheet_rate')::float8
                    + (s -> 'sizes' -> k ->> 'hard_rate')::float8 + 0.5)::integer + reserve;
      r := public.order_quote(k, 'hardboundLeather', pages, 0, null, false);
      checked := checked + 1;
      if (r ->> 'total')::int is distinct from want or r ? 'product' then bad := bad || k || '/' || pages || ' '; end if;
      want := floor(ceil(greatest(40, pages)::numeric / pps)::integer * (s ->> 'sheet_rate')::float8
                    + (s -> 'sizes' -> k ->> 'soft_rate')::float8 + 0.5)::integer + reserve + 20 * 3;
      r := public.order_quote(k, 'softcover', pages, 10, null, false);
      checked := checked + 1;
      if (r ->> 'total')::int is distinct from want then bad := bad || k || '/' || pages || '/soft '; end if;
    end loop;
  end loop;
  perform pg_temp.log(bad = '' and checked > 0, 'album prices unchanged (' || checked || ' size/page/cover cases, 7 free QR still)', 'album prices changed: ' || bad);

  r := pg_temp.place('8x8', 'hardboundLeather', 40);
  perform pg_temp.log((r ->> 'quoted_amount')::int = (public.order_quote('8x8', 'hardboundLeather', 40, 0, null, false) ->> 'total')::int,
    'an 8x8 album order still gets its quote (' || (r ->> 'quoted_amount') || ')', 'album order: ' || r::text);
end $$;

do $$
declare rep text; fails integer;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into rep, fails from proof_log;
  raise exception E'\n%\n── % FAIL ──', rep, fails;
end $$;
