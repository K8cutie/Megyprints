-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — AFFILIATE CODE ON A MEGY MINI PROOF (0065; always rolled back)
--
--  Proves, on the real schema, as a signed-in customer (RLS on, the way the
--  app places an order):
--    M1  a Megy Mini placed with an affiliate code asks the FULL price, and
--        its quote records the code with a ₱0 discount;
--    M2  the code still names the affiliate on the order;
--    M3  an 8×8 album with the same code still gets the program's discount;
--    M4  once paid, the Mini earns the affiliate their rate of the full price.
--
--  One transaction that ENDS BY RAISING (the report is the error message):
--  the program, the Mini (switched on, its shipping fee), the affiliate and the orders are all
--  made inside it and rolled back. Needs two accounts without unpaid orders.
--
--  HOW TO RUN (local test database):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/affiliate-mini-proof.sql
--  To prove 0065 before applying it: `begin;` + the migration + this file
--  (minus its own `begin;`) as one file.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table mini_proof_log (n serial, line text);
grant insert, select on mini_proof_log to authenticated;
grant usage on sequence mini_proof_log_n_seq to authenticated;

do $$
declare v_aff uuid; v_c uuid;
begin
  select u.id into v_aff from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment')
     and not exists (select 1 from public.affiliates f where f.user_id = u.id)
   order by u.created_at limit 1;
  select u.id into v_c from auth.users u
   where u.id <> v_aff
     and not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment')
   order by u.created_at limit 1;
  if v_aff is null or v_c is null then raise exception 'Need two accounts without unpaid orders.'; end if;
  update public.store_settings set affiliate_on = true, affiliate_rate_pct = 10, affiliate_discount = 100, mini_on = true where id = 1;
  update public.pricing_model set mini_shipping_fee = coalesce(mini_shipping_fee, 120);
  insert into public.affiliates (user_id, status, code, full_name, gcash_number, promote_where, agreed_at, applied_at, decided_at)
  values (v_aff, 'approved', 'ZZMINI1', 'Zz Mini Probe', '+639170000009', 'Proof', now(), now(), now());
  perform set_config('proof.c', v_c::text, true);
end $$;

create or replace function pg_temp.place(p_size text, p_cover text, p_pages integer)
returns public.orders language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, affiliate_code)
  values (auth.uid(), jsonb_build_object('album_size', p_size, 'pages', '[]'::jsonb), p_size, p_cover, p_pages, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St', 'ZZMINI1')
  returning * into o;
  return o;
end $$;
grant execute on function pg_temp.place(text, text, integer) to authenticated;
create or replace function pg_temp.log(p_ok boolean, p_line text) returns void language sql as $$
  insert into mini_proof_log(line) values ((case when p_ok then 'PASS ' else 'FAIL ' end) || p_line);
$$;
grant execute on function pg_temp.log(boolean, text) to authenticated;

set local role authenticated;
do $$
declare m public.orders; a public.orders;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.c'), 'role', 'authenticated')::text, true);
  m := pg_temp.place('5.8x8.3', 'staple', 16);
  perform pg_temp.log(m.quoted_amount = (m.quote ->> 'total')::integer and (m.quote -> 'affiliate' ->> 'discount')::integer = 0,
    format('M1 a Megy Mini with a code asks the full price (₱%s of ₱%s), discount ₱%s', m.quoted_amount, m.quote ->> 'total', m.quote -> 'affiliate' ->> 'discount'));
  perform pg_temp.log(m.affiliate_code = 'ZZMINI1', 'M2 the code still names the affiliate on the Mini order');
  a := pg_temp.place('8x8', 'softcover', 40);
  perform pg_temp.log((a.quote -> 'affiliate' ->> 'discount')::integer = 100 and a.quoted_amount = (a.quote ->> 'total')::integer - 100,
    format('M3 an 8×8 album with the same code still gets ₱100 off (₱%s of ₱%s)', a.quoted_amount, a.quote ->> 'total'));
  perform set_config('proof.m', m.id::text, true);
end $$;
reset role;

do $$
declare m public.orders; c public.affiliate_commissions;
begin
  update public.orders set status = 'paid', payment_status = 'paid' where id = current_setting('proof.m')::uuid returning * into m;
  select * into c from public.affiliate_commissions where order_id = m.id;
  perform pg_temp.log(c.amount = round((m.quote ->> 'album')::numeric * 0.10) and c.base_amount = (m.quote ->> 'album')::integer,
    format('M4 paid: the affiliate earns ₱%s, 10%% of the full Mini price ₱%s', c.amount, m.quote ->> 'album'));
end $$;

do $$
declare r text; f int; t int;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%'), count(*) into r, f, t from mini_proof_log;
  raise exception using message = format(E'AFFILIATE MINI PROOF — %s/%s PASS (rolled back; nothing written)\n%s', t - f, t, r);
end $$;
