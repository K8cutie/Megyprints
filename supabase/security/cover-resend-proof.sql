-- ════════════════════════════════════════════════════════════════════════════
--  Proof for 0050 (cover resend + error reports). Run AFTER 0050 is applied:
--    npx supabase db query --linked --file supabase/security/cover-resend-proof.sql
--  It changes nothing: every check runs in one transaction that ends in an
--  error carrying the results (so it rolls back). Expected:
--    customer: orders missing cover = MP-2026-KGCFSQN   (until its cover is sent)
--    customer/anon: denied everywhere; owner: own orders missing cover = (none)
--    log: true, true, false (address cap), true, false (blank), false (day full)
--    stored: m4 = 2000/500/null; customer sees 0 reports; owner sees them
--  First run 2026-10-22, inside a transaction with the migration itself, before
--  it was applied: every line as expected.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table _r (n serial, k text, v text);
grant all on _r to public;
grant usage, select on sequence _r_n_seq to public;

-- 1. The KGCFSQN customer: their order is listed, nothing else.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select user_id from public.orders where order_number = 'MP-2026-KGCFSQN'),
  'role', 'authenticated', 'email', 'customer@example.test')::text, true);
set local role authenticated;
insert into _r (k, v) select 'customer: orders missing cover', coalesce(string_agg(o.order_number, ','), '(none)')
  from public.my_orders_missing_cover() m join public.orders o on o.id = m.order_id;
do $$ begin perform public.log_client_error('x'); insert into _r (k, v) values ('customer: can call log_client_error', 'YES');
exception when insufficient_privilege then insert into _r (k, v) values ('customer: can call log_client_error', 'no (denied)'); end $$;
do $$ begin insert into public.client_errors (message) values ('forged'); insert into _r (k, v) values ('customer: can insert client_errors', 'YES');
exception when insufficient_privilege then insert into _r (k, v) values ('customer: can insert client_errors', 'no (denied)'); end $$;
reset role;

-- 2. The owner account (July test orders with no cover_front must NOT be listed).
select set_config('request.jwt.claims', json_build_object(
  'sub', (select id from auth.users where lower(email) = 'archgarcia@gmail.com' limit 1),
  'role', 'authenticated', 'email', 'archgarcia@gmail.com')::text, true);
set local role authenticated;
insert into _r (k, v) select 'owner: own orders missing cover', coalesce(string_agg(o.order_number, ','), '(none)')
  from public.my_orders_missing_cover() m join public.orders o on o.id = m.order_id;
reset role;

-- 3. Anonymous visitors.
set local role anon;
do $$ begin perform * from public.my_orders_missing_cover(); insert into _r (k, v) values ('anon: can list missing covers', 'YES');
exception when insufficient_privilege then insert into _r (k, v) values ('anon: can list missing covers', 'no (denied)'); end $$;
do $$ begin perform count(*) from public.client_errors; insert into _r (k, v) values ('anon: can read client_errors', 'YES');
exception when insufficient_privilege then insert into _r (k, v) values ('anon: can read client_errors', 'no (denied)'); end $$;
do $$ begin perform public.log_client_error('x'); insert into _r (k, v) values ('anon: can call log_client_error', 'YES');
exception when insufficient_privilege then insert into _r (k, v) values ('anon: can call log_client_error', 'no (denied)'); end $$;
reset role;

-- 4. The endpoint (service role): caps per address and per day, field limits.
--    (Counts include any real reports from the last day; on a busy day read
--    the cap lines with that in mind.)
set local role service_role;
insert into _r (k, v) select 'log: 1st from ip1', public.log_client_error('m1', 's', '{"path":"checkout","step":"cover_pdf"}', 'u', 'ua', 'proof-ip1', 300, 2)::text;
insert into _r (k, v) select 'log: 2nd from ip1', public.log_client_error('m2', null, null, null, null, 'proof-ip1', 300, 2)::text;
insert into _r (k, v) select 'log: 3rd from ip1 (over its cap of 2)', public.log_client_error('m3', null, null, null, null, 'proof-ip1', 300, 2)::text;
insert into _r (k, v) select 'log: from ip2', public.log_client_error('m4', repeat('s', 9000), '["not","an","object"]', repeat('u', 900), null, 'proof-ip2', 300, 2)::text;
insert into _r (k, v) select 'log: blank message', public.log_client_error('   ')::text;
insert into _r (k, v) select 'log: day full (cap 3, 3 stored)', public.log_client_error('m5', null, null, null, null, 'proof-ip9', 3, 30)::text;
insert into _r (k, v) select 'stored: m4 stack/url length, context', (select length(stack) || '/' || length(url) || '/' || coalesce(context::text, 'null') from public.client_errors where message = 'm4' order by id desc limit 1);
reset role;

-- 5. Who can read the reports.
select set_config('request.jwt.claims', json_build_object(
  'sub', (select user_id from public.orders where order_number = 'MP-2026-KGCFSQN'),
  'role', 'authenticated', 'email', 'customer@example.test')::text, true);
set local role authenticated;
insert into _r (k, v) select 'customer: reports visible', count(*)::text from public.client_errors;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'email', 'archgarcia@gmail.com')::text, true);
set local role authenticated;
insert into _r (k, v) select 'owner: reports visible', count(*)::text from public.client_errors;
reset role;

do $$ begin raise exception 'PROOF RESULTS (rolled back):%', (select string_agg(E'\n  ' || k || ' = ' || v, '' order by n) from _r); end $$;
rollback;
