-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — LAUNCH PRICE PROOF (0072; always rolled back)
--
--  Proves, on the real schema:
--    P1  the owner's decision is in: 40% off until 2027-03-31, read by anyone;
--    P2  the old 4× "was" price is off (one crossed-out price at a time);
--    P3  a visitor can read the launch price but can't set it;
--    P4  a signed-in customer can't set it;
--    P5  the owner can't set a dishonest one: over 90%, under 1%, an end date
--        in the past or more than 6 months out, or only half of it;
--    P6  the owner can set an honest one and clear it;
--    P7  it stops by itself the day after its end date (Manila);
--    P8  the table itself refuses a % over 90, whoever writes it.
--
--  One transaction that ENDS BY RAISING (the report is the error message).
--  Makes a throwaway owner when the database has none (rolled back with the
--  rest).
--
--  HOW TO RUN (local test database, after 0072):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/launch-price-proof.sql
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table lp_log (n serial, line text);
grant insert, select on lp_log to anon, authenticated;
grant usage on sequence lp_log_n_seq to anon, authenticated;
create or replace function pg_temp.log(p_ok boolean, p_line text) returns void language sql as $$
  insert into lp_log(line) values ((case when p_ok then 'PASS ' else 'FAIL ' end) || p_line);
$$;
grant execute on function pg_temp.log(boolean, text) to anon, authenticated;

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

-- P1 + P2 (as the database sees it after 0072)
select pg_temp.log(public.public_launch_price() = '{"pct": 40, "until": "2027-03-31"}'::jsonb,
                   'P1 the launch price is 40% off until 2027-03-31');
select pg_temp.log((select compare_multiple is null and compare_until is null from public.pricing_model where id = 1),
                   'P2 the old "was" price is off');

-- P3 a visitor
set local role anon;
select pg_temp.log(public.public_launch_price() ->> 'pct' = '40', 'P3 a visitor reads the launch price');
do $$
begin
  perform public.set_launch_price(10, (now() at time zone 'Asia/Manila')::date + 10);
  perform pg_temp.log(false, 'P3 a visitor set the launch price');
exception when insufficient_privilege then
  perform pg_temp.log(true, 'P3 a visitor can''t set it');
end $$;
reset role;

-- P4 a signed-in customer
set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.cust'), 'role', 'authenticated')::text, true);
  perform public.set_launch_price(10, (now() at time zone 'Asia/Manila')::date + 10);
  perform pg_temp.log(false, 'P4 a customer set the launch price');
exception when insufficient_privilege then
  perform pg_temp.log(true, 'P4 a customer can''t set it (not authorized)');
end $$;

-- P5 + P6 the owner
do $$
declare today date := (now() at time zone 'Asia/Manila')::date; tries text[] := '{}'; r jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('proof.owner'), 'role', 'authenticated')::text, true);

  begin perform public.set_launch_price(91, today + 30); tries := array_append(tries, '91%');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_launch_price(0, today + 30); tries := array_append(tries, '0%');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_launch_price(40, today - 1); tries := array_append(tries, 'yesterday');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_launch_price(40, today + 184); tries := array_append(tries, '184 days');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_launch_price(40, null); tries := array_append(tries, 'no end date');
  exception when sqlstate '22023' then null; end;
  begin perform public.set_launch_price(null, today + 30); tries := array_append(tries, 'no %');
  exception when sqlstate '22023' then null; end;
  perform pg_temp.log(cardinality(tries) = 0,
    'P5 the owner can''t set a dishonest one' || case when cardinality(tries) > 0 then ' (went through: ' || array_to_string(tries, ', ') || ')' else '' end);

  r := public.set_launch_price(25, today + 183);
  perform pg_temp.log(public.public_launch_price() = jsonb_build_object('pct', 25, 'until', to_char(today + 183, 'YYYY-MM-DD')),
    'P6 the owner sets 25% to the last day allowed (' || to_char(today + 183, 'YYYY-MM-DD') || ')');
  r := public.set_launch_price(null, null);
  perform pg_temp.log(public.public_launch_price() is null, 'P6 the owner clears it: no launch price');
end $$;
reset role;

-- P7 it stops by itself after its end date
update public.pricing_model set launch_pct = 40, launch_until = (now() at time zone 'Asia/Manila')::date where id = 1;
select pg_temp.log(public.public_launch_price() is not null, 'P7 still runs on its last day (Manila)');
update public.pricing_model set launch_until = (now() at time zone 'Asia/Manila')::date - 1 where id = 1;
select pg_temp.log(public.public_launch_price() is null, 'P7 gone the day after');

-- P8 the table refuses a dishonest % whoever writes it
do $$
begin
  update public.pricing_model set launch_pct = 95, launch_until = date '2099-01-01' where id = 1;
  perform pg_temp.log(false, 'P8 the table took 95%');
exception when check_violation then
  perform pg_temp.log(true, 'P8 the table refuses 95%');
end $$;

-- The report, then roll everything back.
do $$
declare rep text; fails int;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into rep, fails from lp_log;
  raise exception E'LAUNCH PRICE PROOF: % FAIL\n%', fails, rep;
end $$;
