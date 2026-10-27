-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — TESTER CODE PROOF (0057; live, always rolled back)
--
--  As real customers (RLS on, the way checkout inserts): the code is checked,
--  a checked code makes the order free, the order pays itself,
--  and every way around it is refused — an unchecked code, a wrong or
--  switched-off code, a code added after, a normal order "claimed" free,
--  guessing past 10 tries, reading the code or the tries. The script ends by
--  raising, so NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/tester-code-proof.sql
--  Before applying 0057: one file = "begin;" + 0057 + this file without "begin;".
--
--  Fixture: two customers with no unpaid order, picked at run time (no ids in
--  this public repo). The owner's settings are set inside the transaction.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated;
grant usage on sequence proof_log_n_seq to authenticated;

-- Two customers (A uses the code, B never checked it) and the owner's settings.
do $$
declare
  v_a uuid;
  v_b uuid;
begin
  select u.id into v_a from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)  -- 0058: owners go by account
   order by u.created_at limit 1;
  select u.id into v_b from auth.users u
   where u.id <> v_a
     and not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)  -- 0058: owners go by account
   order by u.created_at limit 1;
  if v_a is null or v_b is null then raise exception 'Need two fixture customers without unpaid orders.'; end if;
  delete from public.tester_code_tries where user_id in (v_a, v_b);
  update public.store_settings set tester_code = 'ZZPROOF7', tester_code_on = true where id = 1;
  perform set_config('proof.a', v_a::text, true);
  perform set_config('proof.b', v_b::text, true);
end $$;

-- An order insert the way checkout sends it, as whoever is signed in.
create or replace function pg_temp.place(p_code text, p_snapshot jsonb default '{"album_size":"8x8","pages":[]}', p_years integer default null)
returns public.orders language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, hosting_years, tester_code)
  values (auth.uid(), p_snapshot, '8x8', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St', p_years, p_code)
  returning * into o;
  return o;
end $$;
grant execute on function pg_temp.place(text, jsonb, integer) to authenticated;
create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;

set local role authenticated;

-- ── Customer A: check, order free, claim ──
do $$
declare
  a uuid := current_setting('proof.a')::uuid;
  r jsonb;
  o public.orders;
  n integer;
begin
  perform pg_temp.as_user(a);
  r := public.check_tester_code('nope');
  insert into proof_log(line) values (case when r ->> 'reason' = 'wrong' then 'PASS a wrong code: "wrong"' else 'FAIL wrong code answered ' || r::text end);
  r := public.check_tester_code(' zz proof7 ');
  insert into proof_log(line) values (case when (r ->> 'ok')::boolean and r ->> 'code' = 'ZZPROOF7'
    then 'PASS the code works typed small with spaces' else 'FAIL right code answered ' || r::text end);

  -- A video memory on the album, saved at the included term, and the order
  -- placed with 10 years: claiming it must start the 10, as Mark paid does.
  insert into public.qr_memories (code, user_id, destination, kind, expires_at)
  values ('zzprfclip', a, 'https://example.test/zzprfclip.mp4', 'clip', now() + make_interval(years => public.included_hosting_years()));
  o := pg_temp.place('zzproof7', '{"album_size":"8x8","pages":[{"qrFills":[{"code":"zzprfclip","kind":"clip"}]}]}', 10);
  insert into proof_log(line) values (case when o.tester_code = 'ZZPROOF7' and o.quoted_amount = 0
      and (o.quote -> 'tester' -> 'real_total') = (o.quote -> 'total') and (o.quote ->> 'total')::int > 0
    then 'PASS the order asks ₱0 and keeps the real price (₱' || (o.quote ->> 'total') || ')' else 'FAIL tester order: ' || coalesce(o.quoted_amount::text, 'null') || ' ' || coalesce(o.quote::text, 'null') end);

  perform set_config('proof.a_order', o.id::text, true);
  perform public.claim_tester_order(o.id);
  select * into o from public.orders where id = o.id;
  insert into proof_log(line) values (case when o.status = 'paid' and o.payment_status = 'paid' and o.amount = 0
      and o.status_history -> -1 ->> 'by' = 'tester_code'
    then 'PASS the free order paid itself (status paid, by tester_code)' else 'FAIL after claim: ' || o.status || '/' || o.payment_status end);
  insert into proof_log(line)
  select case when m.expires_at = m.created_at + interval '10 years'
    then 'PASS its video memory now lasts the 10 years it was ordered with' else 'FAIL memory expires ' || coalesce(m.expires_at::text, 'never') end
    from public.qr_memories m where m.code = 'zzprfclip';
  begin
    perform public.claim_tester_order(o.id);
    insert into proof_log(line) values ('PASS claiming again is a no-op');
  exception when others then
    insert into proof_log(line) values ('FAIL claiming again: ' || sqlerrm);
  end;

  -- The customer can't take the code off, or the quote down, after.
  update public.orders set tester_code = null, quoted_amount = 99 where id = o.id;
  select * into o from public.orders where id = o.id;
  insert into proof_log(line) values (case when o.tester_code = 'ZZPROOF7' and o.quoted_amount = 0
    then 'PASS the code and the amount stay as placed' else 'FAIL changed after: ' || coalesce(o.tester_code, 'null') || ' ' || o.quoted_amount end);

  -- A normal order: the full price, and it can't be claimed free.
  o := pg_temp.place(null);
  insert into proof_log(line) values (case when o.tester_code is null and o.quoted_amount = (o.quote ->> 'total')::int and o.quoted_amount > 0
    then 'PASS an order without the code asks the full ₱' || o.quoted_amount else 'FAIL normal order: ' || coalesce(o.quoted_amount::text, 'null') end);
  begin
    perform public.claim_tester_order(o.id);
    insert into proof_log(line) values ('FAIL a normal order was claimed free');
  exception when sqlstate 'MP008' then
    insert into proof_log(line) values ('PASS a normal order can''t be claimed free (MP008)');
  end;
  -- Adding the code to it after does nothing.
  update public.orders set tester_code = 'ZZPROOF7' where id = o.id;
  select * into o from public.orders where id = o.id;
  insert into proof_log(line) values (case when o.tester_code is null then 'PASS a code added after is dropped' else 'FAIL a code was added after' end);

  -- A wrong code on an order is refused, not quietly charged in full.
  begin
    o := pg_temp.place('WRONG123');
    insert into proof_log(line) values ('FAIL an order with a wrong code went through');
  exception when sqlstate 'MP007' then
    insert into proof_log(line) values ('PASS an order with a wrong code is refused (MP007): ' || sqlerrm);
  end;

  -- Customers read neither the code nor the tries.
  select count(*) into n from public.store_settings where tester_code is not null;
  insert into proof_log(line) values (case when n = 0 then 'PASS a customer can''t read the code' else 'FAIL a customer reads store_settings' end);
  begin
    select count(*) into n from public.tester_code_tries;
    insert into proof_log(line) values ('FAIL a customer reads the tries (' || n || ')');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS a customer can''t read the tries');
  end;
end $$;

-- ── Customer B: never checked the code ──
do $$
declare
  b uuid := current_setting('proof.b')::uuid;
  o public.orders;
  r jsonb;
  i integer;
begin
  perform pg_temp.as_user(b);
  begin
    o := pg_temp.place('ZZPROOF7');
    insert into proof_log(line) values ('FAIL the right code without a check made an order');
  exception when sqlstate 'MP007' then
    insert into proof_log(line) values ('PASS the right code without checking it first is refused (no guessing through orders)');
  end;
  begin
    perform public.claim_tester_order(current_setting('proof.a_order')::uuid);
    insert into proof_log(line) values ('FAIL B claimed A''s order');
  exception when sqlstate 'MP008' then
    insert into proof_log(line) values ('PASS another customer''s order can''t be claimed');
  end;
  for i in 1..10 loop r := public.check_tester_code('GUESS' || i); end loop;
  r := public.check_tester_code('ZZPROOF7');
  insert into proof_log(line) values (case when r ->> 'reason' = 'too_many' then 'PASS after 10 wrong tries even the right code gets "too_many"' else 'FAIL 11th try answered ' || r::text end);
end $$;

-- ── The owner switches it off ──
reset role;
update public.store_settings set tester_code_on = false where id = 1;
set local role authenticated;
do $$
declare
  a uuid := current_setting('proof.a')::uuid;
  o public.orders;
  r jsonb;
begin
  perform pg_temp.as_user(a);
  r := public.check_tester_code('ZZPROOF7');
  insert into proof_log(line) values (case when r ->> 'reason' = 'wrong' then 'PASS switched off: the code answers "wrong"' else 'FAIL switched off answered ' || r::text end);
  begin
    o := pg_temp.place('ZZPROOF7');
    insert into proof_log(line) values ('FAIL switched off, an order with the code went through');
  exception when sqlstate 'MP007' then
    insert into proof_log(line) values ('PASS switched off, an order with the code is refused (MP007)');
  end;
end $$;

reset role;

do $$
declare
  r text;
begin
  insert into proof_log(line)
  select case when count(*) = 1 then 'PASS the trigger is in place' else 'FAIL trigger missing or disabled' end
    from pg_trigger where tgname = 'orders_tester_code_trg' and tgrelid = 'public.orders'::regclass and tgenabled <> 'D';
  insert into proof_log(line)
  select case when not has_function_privilege('anon', 'public.check_tester_code(text)', 'EXECUTE')
               and not has_function_privilege('anon', 'public.claim_tester_order(uuid)', 'EXECUTE')
    then 'PASS signed-out visitors can''t check or claim' else 'FAIL anon can check or claim' end;
  select string_agg(line, E'\n' order by n) into r from proof_log;
  raise exception using message = format(E'TESTER CODE PROOF — %s FAIL (rolled back; nothing written)\n%s',
    (select count(*) from proof_log where line like 'FAIL%'), r);
end $$;
