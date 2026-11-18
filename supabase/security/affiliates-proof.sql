-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — AFFILIATES PROOF (0061; live, always rolled back)
--
--  As real people (RLS on, the way the app calls): someone applies, the owner
--  approves them with a code, a customer's code takes the discount off the
--  order, the commission follows the order (paid → pending, delivered →
--  payable, paid out → paid, cancelled → void), and every way around it is
--  refused — your own code, a code with the tester code, a paused code, the
--  program switched off, changing the code after, reading the tables,
--  a customer calling the owner's functions. The script ends by raising, so
--  NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/affiliates-proof.sql
--  Before applying 0061: one file = "begin;" + 0061 + this file without "begin;".
--
--  Fixture: three customers with no unpaid order and an owner account, picked
--  at run time (no ids in this public repo). The settings are set inside the
--  transaction.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated, anon;
grant usage on sequence proof_log_n_seq to authenticated, anon;

do $$
declare
  v_aff uuid;
  v_c   uuid;
  v_d   uuid;
  v_own uuid;
begin
  select w.user_id into v_own from public.owner_accounts w limit 1;
  select u.id into v_aff from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
     and not exists (select 1 from public.affiliates f where f.user_id = u.id)
   order by u.created_at limit 1;
  select u.id into v_c from auth.users u
   where u.id <> v_aff
     and not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  select u.id into v_d from auth.users u
   where u.id not in (v_aff, v_c)
     and not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  if v_aff is null or v_c is null or v_d is null or v_own is null then
    raise exception 'Need three fixture customers without unpaid orders and an owner account.';
  end if;
  delete from public.tester_code_tries where user_id in (v_aff, v_c, v_d);
  update public.store_settings
     set tester_code = 'ZZPROOF7', tester_code_on = true,
         affiliate_on = true, affiliate_rate_pct = 10, affiliate_discount = 100
   where id = 1;
  perform set_config('proof.aff', v_aff::text, true);
  perform set_config('proof.c', v_c::text, true);
  perform set_config('proof.d', v_d::text, true);
  perform set_config('proof.own', v_own::text, true);
end $$;

-- An order insert the way checkout sends it, as whoever is signed in.
create or replace function pg_temp.place(p_aff text, p_tester text default null, p_phone text default '+639170000000')
returns public.orders language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, tester_code, affiliate_code)
  values (auth.uid(), '{"album_size":"8x8","pages":[]}', '8x8', 'hardboundLinen', 40, 'matte', 'Zz Probe', p_phone, '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St', p_tester, p_aff)
  returning * into o;
  return o;
end $$;
grant execute on function pg_temp.place(text, text, text) to authenticated;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;
create or replace function pg_temp.log(p_ok boolean, p_pass text, p_fail text) returns void language sql as $$
  insert into proof_log(line) values (case when p_ok then 'PASS ' || p_pass else 'FAIL ' || p_fail end);
$$;
grant execute on function pg_temp.log(boolean, text, text) to authenticated, anon;

set local role authenticated;

-- ── The affiliate applies ──
do $$
declare
  aff uuid := current_setting('proof.aff')::uuid;
  r jsonb;
begin
  perform pg_temp.as_user(aff);
  begin
    r := public.apply_affiliate('Zz Affiliate Probe', '12345', null, 'My photo page', true);
    perform pg_temp.log(false, '', 'a bad GCash number was accepted');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'a bad GCash number is refused: ' || sqlerrm, '');
  end;
  begin
    r := public.apply_affiliate('Zz Affiliate Probe', '0917 555 0001', null, 'My photo page', false);
    perform pg_temp.log(false, '', 'applied without agreeing to the terms');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'applying without agreeing is refused', '');
  end;
  r := public.apply_affiliate('  Zz  Affiliate Probe ', '0917 555 0001', '123-456-789', 'Wedding photographer, Facebook page', true);
  perform pg_temp.log(r -> 'affiliate' ->> 'status' = 'pending' and r -> 'affiliate' -> 'code' = 'null'::jsonb
      and r -> 'affiliate' ->> 'full_name' = 'Zz Affiliate Probe' and r -> 'affiliate' ->> 'gcash_last4' = '0001',
    'applied: pending, no code yet, name tidied, GCash shown as its last 4', 'apply answered ' || r::text);
  begin
    r := public.apply_affiliate('Zz Affiliate Probe', '09175550001', null, 'Again', true);
    perform pg_temp.log(false, '', 'applied twice');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'applying twice is refused', '');
  end;
end $$;

-- ── A customer tries the code before it's approved; then the owner decides ──
do $$
declare
  c uuid := current_setting('proof.c')::uuid;
  own uuid := current_setting('proof.own')::uuid;
  aff uuid := current_setting('proof.aff')::uuid;
  r jsonb;
  v_id uuid;
begin
  perform pg_temp.as_user(c);
  r := public.check_order_code('ZZAFF1');
  perform pg_temp.log(r ->> 'reason' = 'wrong', 'before approval the code answers "wrong"', 'unapproved code answered ' || r::text);
  begin
    r := public.owner_affiliates();
    perform pg_temp.log(false, '', 'a customer read the affiliates list');
  exception when insufficient_privilege then
    perform pg_temp.log(true, 'a customer can''t call the owner''s list', '');
  end;

  perform pg_temp.as_user(own);
  r := public.owner_affiliates();
  select (x ->> 'id')::uuid into v_id from jsonb_array_elements(r) x where x ->> 'full_name' = 'Zz Affiliate Probe';
  perform pg_temp.log(v_id is not null and exists (select 1 from jsonb_array_elements(r) x
      where (x ->> 'id')::uuid = v_id and x ->> 'gcash_number' = '+639175550001' and x ->> 'tin' = '123456789'),
    'the owner sees the application with the full GCash number and TIN', 'owner list: ' || left(r::text, 300));
  perform set_config('proof.aff_id', v_id::text, true);
  begin
    r := public.owner_decide_affiliate(v_id, 'approve', 'zzproof7');
    perform pg_temp.log(false, '', 'the tester code was given to an affiliate');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'the tester code can''t be an affiliate code', '');
  end;
  r := public.owner_decide_affiliate(v_id, 'approve', ' zz aff1 ');
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = v_id and x ->> 'status' = 'approved' and x ->> 'code' = 'ZZAFF1'),
    'approved with the code ZZAFF1 (typed small with spaces)', 'approve answered ' || left(r::text, 300));

  perform pg_temp.as_user(aff);
  r := public.my_affiliate();
  perform pg_temp.log(r -> 'affiliate' ->> 'status' = 'approved' and r -> 'affiliate' ->> 'code' = 'ZZAFF1'
      and (r -> 'affiliate' ->> 'rate_pct')::numeric = 10,
    'the affiliate''s page shows approved, the code, 10%', 'my_affiliate: ' || r::text);
  r := public.check_order_code('ZZAFF1');
  perform pg_temp.log(r ->> 'reason' = 'own', 'your own code answers "own"', 'own code answered ' || r::text);
  begin
    perform pg_temp.place('ZZAFF1');
    perform pg_temp.log(false, '', 'an order with your own code went through');
  exception when sqlstate 'MP009' then
    perform pg_temp.log(true, 'an order with your own code is refused (MP009)', '');
  end;
end $$;

-- ── The customer orders with the code ──
do $$
declare
  c uuid := current_setting('proof.c')::uuid;
  r jsonb;
  o public.orders;
  n integer;
begin
  perform pg_temp.as_user(c);
  r := public.check_order_code(' zzaff1 ');
  perform pg_temp.log((r ->> 'ok')::boolean and r ->> 'kind' = 'affiliate' and r ->> 'code' = 'ZZAFF1' and (r ->> 'discount')::int = 100
      and (r ->> 'window_days')::int = 30,
    'the code works for a customer: affiliate, ₱100 off, a link counts 30 days', 'customer check answered ' || r::text);
  o := pg_temp.place('zzaff1');
  perform pg_temp.log(o.affiliate_code = 'ZZAFF1' and o.affiliate_id = current_setting('proof.aff_id')::uuid
      and o.quoted_amount = (o.quote ->> 'total')::int - 100 and (o.quote -> 'affiliate' ->> 'discount')::int = 100
      and o.quote -> 'affiliate' -> 'real_total' = o.quote -> 'total',
    'the order asks ₱100 less (₱' || o.quoted_amount || ' of ₱' || (o.quote ->> 'total') || ') and names the affiliate',
    'affiliate order: ' || coalesce(o.quoted_amount::text, 'null') || ' ' || coalesce(o.quote::text, 'null'));
  perform set_config('proof.c_order', o.id::text, true);

  update public.orders set affiliate_code = null, affiliate_id = null, quoted_amount = 1 where id = o.id;
  select * into o from public.orders where id = o.id;
  perform pg_temp.log(o.affiliate_code = 'ZZAFF1' and o.affiliate_id is not null and o.quoted_amount = (o.quote ->> 'total')::int - 100,
    'the code and the amount stay as placed', 'changed after: ' || coalesce(o.affiliate_code, 'null'));

  -- The tester code and an affiliate code together: refused.
  r := public.check_order_code('ZZPROOF7');
  perform pg_temp.log(r ->> 'kind' = 'tester', 'the same box still takes the tester code', 'tester answered ' || r::text);
  begin
    perform pg_temp.place('ZZAFF1', 'ZZPROOF7');
    perform pg_temp.log(false, '', 'an order with both codes went through');
  exception when sqlstate 'MP009' then
    perform pg_temp.log(true, 'an order with the tester code and an affiliate code is refused (MP009)', '');
  end;

  begin
    select count(*) into n from public.affiliates;
    perform pg_temp.log(false, '', 'a customer reads the affiliates table (' || n || ')');
  exception when insufficient_privilege then
    perform pg_temp.log(true, 'a customer can''t read the affiliates table', '');
  end;
  begin
    select count(*) into n from public.affiliate_commissions;
    perform pg_temp.log(false, '', 'a customer reads the commissions table (' || n || ')');
  exception when insufficient_privilege then
    perform pg_temp.log(true, 'a customer can''t read the commissions table', '');
  end;
end $$;

-- ── The owner moves the order along; the commission follows ──
do $$
declare
  own uuid := current_setting('proof.own')::uuid;
  aff uuid := current_setting('proof.aff')::uuid;
  oid uuid := current_setting('proof.c_order')::uuid;
  o public.orders;
  cm record;
  r jsonb;
  v_expect integer;
begin
  perform pg_temp.as_user(own);
  perform public.set_order_status(oid, 'paid');
  select * into o from public.orders where id = oid;
  v_expect := floor(((o.quote ->> 'album')::int - 100) * 10 / 100.0 + 0.5)::int;
  perform set_config('proof.expect', v_expect::text, true);
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  perform pg_temp.log(jsonb_array_length(r) = 1 and r -> 0 ->> 'status' = 'pending' and (r -> 0 ->> 'amount')::int = v_expect
      and (r -> 0 ->> 'base_amount')::int = (o.quote ->> 'album')::int - 100 and r -> 0 -> 'flag' = 'null'::jsonb,
    'paid: one commission, pending, ₱' || v_expect || ' (10% of the album ₱' || ((o.quote ->> 'album')::int - 100) || ' after the discount)',
    'after paid: ' || r::text);
  perform public.set_order_status(oid, 'shipped');
  perform public.set_order_status(oid, 'delivered');
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  perform pg_temp.log(r -> 0 ->> 'status' = 'payable', 'delivered: payable', 'after delivered: ' || r::text);

  perform pg_temp.as_user(aff);
  r := public.my_affiliate();
  perform pg_temp.log((r -> 'totals' ->> 'payable')::int = v_expect and (r -> 'totals' ->> 'sales')::int = 1
      and (r -> 'totals' ->> 'this_month')::int = v_expect,
    'the affiliate sees ₱' || v_expect || ' payable, 1 sale, this month', 'totals: ' || (r -> 'totals')::text);
  perform pg_temp.log(not ((r -> 'sales' -> 0) ?| array['order_id', 'order_number', 'ship_name', 'ship_phone', 'user_id', 'flag']),
    'a sale on the affiliate''s page names no order and no customer', 'sale shows ' || (r -> 'sales' -> 0)::text);

  perform pg_temp.as_user(own);
  begin
    r := public.owner_pay_affiliate(current_setting('proof.aff_id')::uuid, '  ');
    perform pg_temp.log(false, '', 'a payout without a reference was recorded');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'a payout needs the GCash reference', '');
  end;
  r := public.owner_pay_affiliate(current_setting('proof.aff_id')::uuid, 'GC-ZZ-0001');
  perform pg_temp.log((r ->> 'amount')::int = v_expect and (r ->> 'count')::int = 1,
    'paid out ₱' || v_expect || ' for 1 sale', 'payout answered ' || r::text);
  begin
    r := public.owner_pay_affiliate(current_setting('proof.aff_id')::uuid, 'GC-ZZ-0002');
    perform pg_temp.log(false, '', 'paid twice');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'nothing left to pay: a second payout is refused', '');
  end;
  -- A paid commission stays paid, whatever happens to the order after.
  perform public.set_order_status(oid, 'cancelled');
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  perform pg_temp.log(r -> 0 ->> 'status' = 'paid', 'a paid commission stays paid when the order is cancelled after', 'after cancel: ' || r::text);

  perform pg_temp.as_user(aff);
  r := public.my_affiliate();
  perform pg_temp.log((r -> 'totals' ->> 'paid')::int = v_expect and jsonb_array_length(r -> 'payouts') = 1
      and r -> 'payouts' -> 0 ->> 'reference' = 'GC-ZZ-0001',
    'the affiliate sees the payout and its reference', 'after payout: ' || r::text);
end $$;

-- ── A second customer: their own phone is the affiliate's GCash; then cancelled ──
do $$
declare
  d uuid := current_setting('proof.d')::uuid;
  own uuid := current_setting('proof.own')::uuid;
  o public.orders;
  r jsonb;
  v_cid uuid;
begin
  perform pg_temp.as_user(d);
  r := public.check_order_code('ZZAFF1');
  o := pg_temp.place('ZZAFF1', null, '+639175550001');
  perform pg_temp.as_user(own);
  perform public.set_order_status(o.id, 'paid');
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  select (x ->> 'id')::uuid into v_cid from jsonb_array_elements(r) x where (x ->> 'order_id')::uuid = o.id;
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'order_id')::uuid = o.id and x ->> 'flag' = 'same_phone'),
    'an order shipped to the affiliate''s own GCash number is flagged same_phone', 'flags: ' || r::text);
  r := public.owner_void_commission(v_cid, true);
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = v_cid and x ->> 'status' = 'void' and (x ->> 'owner_voided')::boolean),
    'the owner voids it', 'after void: ' || r::text);
  perform public.set_order_status(o.id, 'delivered');
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = v_cid and x ->> 'status' = 'void'),
    'a voided sale stays void when the album is delivered', 'after delivered: ' || r::text);
  r := public.owner_void_commission(v_cid, false);
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = v_cid and x ->> 'status' = 'payable'),
    'un-voided, it follows the order again (delivered: payable)', 'after unvoid: ' || r::text);
  perform public.set_order_status(o.id, 'cancelled');
  r := public.owner_affiliate_sales(current_setting('proof.aff_id')::uuid);
  perform pg_temp.log(exists (select 1 from jsonb_array_elements(r) x where (x ->> 'id')::uuid = v_cid and x ->> 'status' = 'void'),
    'cancelled: void', 'after cancel: ' || r::text);

  -- Paused: the code stops working.
  r := public.owner_decide_affiliate(current_setting('proof.aff_id')::uuid, 'pause');
  perform pg_temp.as_user(d);
  r := public.check_order_code('ZZAFF1');
  perform pg_temp.log(r ->> 'reason' = 'wrong', 'paused: the code answers "wrong"', 'paused answered ' || r::text);
  begin
    perform pg_temp.place('ZZAFF1');
    perform pg_temp.log(false, '', 'a paused code made an order');
  exception when sqlstate 'MP009' then
    perform pg_temp.log(true, 'paused: an order with the code is refused (MP009)', '');
  end;
end $$;

-- ── The owner switches the program off ──
reset role;
update public.affiliates set status = 'approved' where id = current_setting('proof.aff_id')::uuid;
update public.store_settings set affiliate_on = false where id = 1;
set local role authenticated;
do $$
declare
  d uuid := current_setting('proof.d')::uuid;
  r jsonb;
begin
  perform pg_temp.as_user(d);
  r := public.check_order_code('ZZAFF1');
  perform pg_temp.log(r ->> 'reason' = 'wrong', 'program off: the code answers "wrong"', 'off answered ' || r::text);
  begin
    perform pg_temp.place('ZZAFF1');
    perform pg_temp.log(false, '', 'program off, an order with the code went through');
  exception when sqlstate 'MP009' then
    perform pg_temp.log(true, 'program off: an order with the code is refused (MP009)', '');
  end;
  begin
    r := public.apply_affiliate('Zz Other', '09175550002', null, 'Somewhere', true);
    perform pg_temp.log(false, '', 'applied while the program is off');
  exception when sqlstate 'MP010' then
    perform pg_temp.log(true, 'program off: nobody can apply', '');
  end;
end $$;

reset role;
set local role anon;
do $$
declare r jsonb;
begin
  r := public.affiliate_program();
  perform pg_temp.log(r ? 'rate_pct' and r ? 'discount' and r ->> 'on' = 'false',
    'a visitor (not signed in) can read the program''s rate and discount', 'anon program: ' || coalesce(r::text, 'null'));
  begin
    r := public.my_affiliate();
    perform pg_temp.log(false, '', 'a visitor called my_affiliate');
  exception when insufficient_privilege then
    perform pg_temp.log(true, 'a visitor can''t call my_affiliate', '');
  end;
end $$;

reset role;

do $$
declare
  r text;
begin
  select string_agg(line, E'\n' order by n) into r from proof_log;
  raise exception E'AFFILIATES PROOF (rolled back)\n%\n% PASS, % FAIL', r,
    (select count(*) from proof_log where line like 'PASS%'),
    (select count(*) from proof_log where line like 'FAIL%');
end $$;
