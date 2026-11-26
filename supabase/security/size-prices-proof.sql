-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — ALBUM PRICES BY SIZE PROOF (0074; always rolled back)
--
--  Proves, on the real schema:
--    P1  the owner's prices are in: every size on sale costs exactly its set
--        price at 40 pages, soft and hard;
--    P2  the price list keeps its shape (pps, soft_rate, hard_rate per size),
--        so apps already on phones read it unchanged;
--    P3  extra pages still cost the one sheet rate on top of a set price;
--    P4  the checkout charge (order_quote) is the set price;
--    P5  a visitor and a signed-in customer can read prices but not set them;
--    P6  the owner can't set a price under the floor (Bridgemedia cost +
--        shipping + hosting), not whole pesos, over ₱50,000, for a size that
--        doesn't exist, or in the wrong shape;
--    P7  the owner can set one price and leave the rest alone;
--    P8  clearing a price puts that size back on the store multiple;
--    P9  a size with no price keeps the old formula.
--
--  One transaction that ENDS BY RAISING (the report is the error message).
--  Makes a throwaway owner when the database has none (rolled back with the
--  rest).
--
--  HOW TO RUN (local test database, after 0074):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/size-prices-proof.sql
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table sp_log (n serial, line text);
grant insert, select on sp_log to anon, authenticated;
grant usage on sequence sp_log_n_seq to anon, authenticated;
create or replace function pg_temp.log(p_ok boolean, p_line text) returns void language sql as $$
  insert into sp_log(line) values ((case when p_ok then 'PASS ' else 'FAIL ' end) || p_line);
$$;
grant execute on function pg_temp.log(boolean, text) to anon, authenticated;

-- What a client computes from the price list (lib/pricing.ts priceOf).
create or replace function pg_temp.price_of(p_size text, p_cover text, p_pages int) returns numeric
language sql stable as $$
  with s as (select public.public_price_schedule() j)
  select round(ceil(greatest((s.j ->> 'min_pages')::int, p_pages)::numeric / (s.j -> 'sizes' -> p_size ->> 'pps')::int)
               * (s.j ->> 'sheet_rate')::numeric
               + (s.j -> 'sizes' -> p_size ->> (p_cover || '_rate'))::numeric)
         + greatest((s.j ->> 'hosting_reserve')::numeric, 0)
    from s
$$;
grant execute on function pg_temp.price_of(text, text, int) to anon, authenticated;

-- An owner and a customer to act as.
do $$
declare v_owner uuid; v_cust uuid;
begin
  select o.user_id into v_owner from public.owner_accounts o limit 1;
  if v_owner is null then
    select u.id into v_owner from auth.users u order by u.created_at limit 1;
    if v_owner is null then raise exception 'Need at least one account.'; end if;
    insert into public.owner_accounts (user_id) values (v_owner);
  end if;
  select u.id into v_cust from auth.users u
   where not exists (select 1 from public.owner_accounts o where o.user_id = u.id)
   order by u.created_at limit 1;
  if v_cust is null then raise exception 'Need an account that is not an owner.'; end if;
  perform set_config('proof.owner', v_owner::text, true);
  perform set_config('proof.cust', v_cust::text, true);
end $$;

-- P1 the owner's prices
select pg_temp.log(
  pg_temp.price_of('6x4', 'soft', 40) = 1078 and pg_temp.price_of('6x4', 'hard', 40) = 1308
  and pg_temp.price_of('6x6', 'soft', 40) = 1139 and pg_temp.price_of('6x6', 'hard', 40) = 1438
  and pg_temp.price_of('8x6', 'soft', 40) = 1200 and pg_temp.price_of('8x6', 'hard', 40) = 1660
  and pg_temp.price_of('6x8', 'soft', 40) = 1200 and pg_temp.price_of('6x8', 'hard', 40) = 1660
  and pg_temp.price_of('8x8', 'soft', 40) = 1505 and pg_temp.price_of('8x8', 'hard', 40) = 1965,
  'P1 every size on sale costs its set price at 40 pages (8x8 hard 1965, 6x4 soft 1078, ...)');

-- P2 the shape
select pg_temp.log(
  (select bool_and((select array_agg(x order by x) from jsonb_object_keys(v) x) = array['hard_rate', 'pps', 'soft_rate'])
     from jsonb_each(public.public_price_schedule() -> 'sizes') e(k, v)),
  'P2 each size in the price list still has only pps, soft_rate and hard_rate');

-- P3 extra pages
select pg_temp.log(
  pg_temp.price_of('8x8', 'hard', 60)
    = round(1965 - 50 + 5 * (public.public_price_schedule() ->> 'sheet_rate')::numeric) + 50,
  'P3 an 8x8 hardcover at 60 pages is its set price + 5 sheets at the sheet rate ('
    || pg_temp.price_of('8x8', 'hard', 60) || ')');

-- P4 the checkout charge
select pg_temp.log(
  (public.order_quote('8x8', 'hardboundLeather', 40, 0, null, false) ->> 'total')::int = 1965
  and (public.order_quote('6x4', 'softcover', 40, 0, null, false) ->> 'total')::int = 1078
  and (public.order_quote('8x8', 'hardboundLeather', 60, 0, null, false) ->> 'total')::numeric = pg_temp.price_of('8x8', 'hard', 60),
  'P4 order_quote charges the set price (8x8 hard 1965, 6x4 soft 1078, and the 60-page price)');

-- P5 a visitor, then a customer
set local role anon;
select pg_temp.log(pg_temp.price_of('8x8', 'hard', 40) = 1965, 'P5 a visitor reads the prices');
do $$
begin
  perform public.set_size_prices('{"8x8": {"hard": 999}}'::jsonb);
  perform pg_temp.log(false, 'P5 a visitor set a price');
exception when insufficient_privilege then
  perform pg_temp.log(true, 'P5 a visitor can''t set a price');
end $$;
reset role;

set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.cust'), 'role', 'authenticated')::text, true);
  perform public.set_size_prices('{"8x8": {"hard": 2500}}'::jsonb);
  perform pg_temp.log(false, 'P5 a customer set a price');
exception when insufficient_privilege then
  perform pg_temp.log(true, 'P5 a customer can''t set a price (not authorized)');
end $$;

-- P6 the owner's bad prices
do $$
declare
  bad jsonb;
  tries jsonb[] := array[
    '{"8x8": {"hard": 800}}',      -- under the floor (615 + 200 + 50 = 865)
    '{"6x4": {"soft": 470}}',      -- under the floor (229.5 + 250 = 480)
    '{"8x8": {"hard": 1965.5}}',   -- not whole pesos
    '{"8x8": {"hard": 60000}}',    -- over 50,000
    '{"9x9": {"hard": 2000}}',     -- no such size
    '{"8x8": {"hard": "1965"}}',   -- a string
    '{"8x8": 1965}',               -- wrong shape
    '[1965]'                       -- not an object
  ]::jsonb[];
  refused int := 0;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);
  foreach bad in array tries loop
    begin
      perform public.set_size_prices(bad);
    exception when invalid_parameter_value then
      refused := refused + 1;
    end;
  end loop;
  perform pg_temp.log(refused = array_length(tries, 1),
    'P6 the owner''s bad prices are all refused (' || refused || ' of ' || array_length(tries, 1) || ')');
end $$;

-- P6b the floor itself is allowed
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);
  perform public.set_size_prices('{"8x8": {"hard": 865}}'::jsonb);
  perform pg_temp.log(pg_temp.price_of('8x8', 'hard', 40) = 865, 'P6 a price exactly at the floor (8x8 hard 865) is allowed');
  perform public.set_size_prices('{"8x8": {"hard": 1965}}'::jsonb);
end $$;

-- P7 one price, the rest alone
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);
  perform public.set_size_prices('{"6x6": {"hard": 1500}}'::jsonb);
  perform pg_temp.log(
    pg_temp.price_of('6x6', 'hard', 40) = 1500 and pg_temp.price_of('6x6', 'soft', 40) = 1139
    and pg_temp.price_of('8x8', 'hard', 40) = 1965 and pg_temp.price_of('6x4', 'soft', 40) = 1078,
    'P7 setting 6x6 hard to 1500 changes only that price');
end $$;
reset role;
select pg_temp.log((public.order_quote('6x6', 'hardboundLeather', 40, 0, null, false) ->> 'total')::int = 1500,
  'P7 ... and checkout charges the new 1500');

-- P8 clearing a price
do $$
declare expect numeric;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);
  perform public.set_size_prices('{"6x6": {"hard": null}}'::jsonb);
  select round(4 * m.sheet_cost * coalesce(s.price_multiple, 3)
               + (m.sizes -> '6x6' ->> 'hb')::numeric * coalesce(s.price_multiple, 3)
               + (m.sizes -> '6x6' ->> 'surcharge')::numeric + m.shipping_allowance)
         + m.hosting_reserve
    into expect
    from public.pricing_model m, public.store_settings s where m.id = 1 and s.id = 1;
  perform pg_temp.log(
    pg_temp.price_of('6x6', 'hard', 40) = expect
    and not ((select sizes -> '6x6' from public.pricing_model where id = 1) ? 'price_hard'),
    'P8 clearing 6x6 hard puts it back on the multiple (' || expect || ')');
end $$;

-- P9 a size with no price
select pg_temp.log(
  (public.public_price_schedule() -> 'sizes' -> '11.5x8' ->> 'hard_rate')::numeric
    = (select (m.sizes -> '11.5x8' ->> 'hb')::numeric * coalesce(s.price_multiple, 3)
              + (m.sizes -> '11.5x8' ->> 'surcharge')::numeric + m.shipping_allowance
         from public.pricing_model m, public.store_settings s where m.id = 1 and s.id = 1),
  'P9 a size with no set price (11.5x8) keeps the multiple formula');

-- Report (the transaction rolls back by raising)
do $$
declare r text; fails int;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into r, fails from sp_log;
  raise exception E'\n%\n\n% check(s) failed', r, fails;
end $$;
