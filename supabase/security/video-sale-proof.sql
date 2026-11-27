-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — VIDEO SALE PROOF (0077, was 0073; always rolled back)
--
--  Proves, on the real schema:
--    V1  the owner's decision is in: ₱50 a video, the Christmas sale (3 for
--        ₱100) to 2026-12-31, read by anyone;
--    V2  a saved order's quote charges the sale: an album with 5 videos (3
--        extra) ₱100, with 6 (4 extra) ₱150; a Megy Mini with 3 (1 extra) ₱50;
--    V3  once the sale has ended, ₱50 each: 3 extra = ₱150;
--    V4  a visitor and a signed-in customer can't start or end a sale, or
--        call the fee;
--    V5  the owner can't set a dishonest sale: no name, a name over 30
--        letters, an end date past 6 months or in the past;
--    V6  the owner can start a new theme and end it;
--    V7  the table refuses a pack that isn't cheaper than its videos one by
--        one, whoever writes it.
--
--  One transaction that ENDS BY RAISING (the report is the error message).
--  Makes a throwaway owner when the database has none (rolled back).
--
--  HOW TO RUN (local test database, after 0077):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/video-sale-proof.sql
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table vs_log (n serial, line text);
grant insert, select on vs_log to anon, authenticated;
grant usage on sequence vs_log_n_seq to anon, authenticated;
create or replace function pg_temp.log(p_ok boolean, p_line text) returns void language sql as $$
  insert into vs_log(line) values ((case when p_ok then 'PASS ' else 'FAIL ' end) || p_line);
$$;
grant execute on function pg_temp.log(boolean, text) to anon, authenticated;

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
  update public.store_settings set mini_on = true where id = 1;
  update public.pricing_model set mini_shipping_fee = coalesce(mini_shipping_fee, 120) where id = 1;
  perform set_config('proof.owner', v_owner::text, true);
  perform set_config('proof.cust', v_cust::text, true);
end $$;

-- V1
select pg_temp.log(public.public_video_offer() = '{"single": 50, "pack": {"name": "Christmas sale", "size": 3, "price": 100, "until": "2026-12-31"}}'::jsonb,
                   'V1 ₱50 a video, the Christmas sale 3 for ₱100 to 2026-12-31');

-- V2 the quote a saved order gets (orders_quote passes no schedule: the live offer)
select pg_temp.log((public.order_quote('8x8', 'softcover', 40, 5, null, false) ->> 'qr_fee')::int = 100, 'V2 album, 5 videos (3 extra): ₱100');
select pg_temp.log((public.order_quote('8x8', 'softcover', 40, 6, null, false) ->> 'qr_fee')::int = 150
                   and (public.order_quote('8x8', 'softcover', 40, 6, null, false) ->> 'qr_singles')::int = 1, 'V2 album, 6 videos (4 extra): ₱150 = a pack + 1 single');
select pg_temp.log((public.order_quote('5.8x8.3', 'staple', 16, 3, null, false) ->> 'qr_fee')::int = 50,
                   'V2 Megy Mini, 3 videos (1 extra): ₱50');
update public.store_settings set a4_on = true where id = 1;
select pg_temp.log((public.order_quote('8.3x11.7', 'staple', 24, 3, null, false) ->> 'qr_fee')::int = 50
                   and (public.order_quote('8.3x11.7', 'staple', 24, 3, null, false) ->> 'album')::int = (select a4_24_price from public.pricing_model where id = 1),
                   'V2 Megy Magazine (A4), 24 pages, 3 videos (1 extra): its own price + ₱50');

-- V3 after the sale
update public.pricing_model set video_sale_until = (now() at time zone 'Asia/Manila')::date - 1 where id = 1;
select pg_temp.log(public.public_video_offer() -> 'pack' = 'null'::jsonb
                   and (public.order_quote('8x8', 'softcover', 40, 5, null, false) ->> 'qr_fee')::int = 150,
                   'V3 the day after the sale: no pack, 3 extra = ₱150');
update public.pricing_model set video_sale_until = date '2026-12-31' where id = 1;

-- V4 a visitor, then a customer
set local role anon;
do $$
begin
  begin perform public.set_video_sale('Free for all', (now() at time zone 'Asia/Manila')::date + 10);
    perform pg_temp.log(false, 'V4 a visitor started a sale');
  exception when insufficient_privilege then perform pg_temp.log(true, 'V4 a visitor can''t start a sale'); end;
  begin perform public.video_memory_fee(3, '{"single": 1}'::jsonb);
    perform pg_temp.log(false, 'V4 a visitor called the fee');
  exception when insufficient_privilege then perform pg_temp.log(true, 'V4 a visitor can''t call the fee'); end;
end $$;
reset role;
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.cust'), 'role', 'authenticated')::text, true);
  perform public.set_video_sale(null, null);
  perform pg_temp.log(false, 'V4 a customer ended the sale');
exception when insufficient_privilege then
  perform pg_temp.log(true, 'V4 a customer can''t end the sale');
end $$;

-- V5 + V6 the owner
do $$
declare today date := (now() at time zone 'Asia/Manila')::date; tries text[] := '{}';
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);
  begin perform public.set_video_sale('', today + 30); tries := array_append(tries, 'no name');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_video_sale(repeat('x', 31), today + 30); tries := array_append(tries, '31 letters');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_video_sale('Long sale', today + 184); tries := array_append(tries, '184 days');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_video_sale('Old sale', today - 1); tries := array_append(tries, 'yesterday');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_video_sale('No end', null); tries := array_append(tries, 'no end date');
  exception when sqlstate '22023' then null; end;
  perform pg_temp.log(cardinality(tries) = 0,
    'V5 the owner can''t set a dishonest sale' || case when cardinality(tries) > 0 then ' (went through: ' || array_to_string(tries, ', ') || ')' else '' end);

  perform public.set_video_sale('Valentine sale', today + 30);
  perform pg_temp.log(public.public_video_offer() -> 'pack' ->> 'name' = 'Valentine sale', 'V6 the owner starts a new theme');
  perform public.set_video_sale(null, null);
  perform pg_temp.log(public.public_video_offer() -> 'pack' = 'null'::jsonb, 'V6 the owner ends it: ₱50 each');
end $$;
reset role;

-- V7
do $$
begin
  update public.pricing_model set video_pack_price = 150 where id = 1;
  perform pg_temp.log(false, 'V7 the table took 3 for ₱150 at ₱50 each');
exception when check_violation then
  perform pg_temp.log(true, 'V7 the table refuses a pack that isn''t cheaper (3 for ₱150 at ₱50)');
end $$;

do $$
declare rep text; fails int;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into rep, fails from vs_log;
  raise exception E'VIDEO SALE PROOF: % FAIL\n%', fails, rep;
end $$;
