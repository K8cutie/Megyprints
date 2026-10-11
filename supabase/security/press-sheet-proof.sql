-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — PRESS SHEET PROOF (0046; live, always rolled back)
--
--  As a real customer (RLS on, the way checkout inserts): a 9x9 hardbound
--  order is refused (MP005), also when the request claims 8x8 for a 9x9 album;
--  9x9 softcover and 8x8 hardbound go through. Plus the new pages-per-sheet
--  and the triggers in place. The script ends by raising, so NOTHING is
--  written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/press-sheet-proof.sql
--  Before applying 0046: one file = "begin;" + 0046 + this file without "begin;".
--
--  Fixture: a customer with no unpaid order, picked at run time (no ids in
--  this public repo).
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated;
grant usage on sequence proof_log_n_seq to authenticated;

do $$
declare
  v_user uuid;
  s jsonb;
begin
  select sizes into s from public.pricing_model where id = 1;
  insert into proof_log(line) values ('pps ' || (select string_agg(key || '=' || (value->>'pps'), ' ' order by key) from jsonb_each(s)));
  insert into proof_log(line) values (case
    when (s->'6x4'->>'pps')::int = 12 and (s->'6x6'->>'pps')::int = 6 and (s->'8x6'->>'pps')::int = 6
     and (s->'6x8'->>'pps')::int = 6 and (s->'8x8'->>'pps')::int = 4 and (s->'9x9'->>'pps')::int = 4
     and (s->'11.5x8'->>'pps')::int = 4 and (s->'8.5x11'->>'pps')::int = 4
    then 'PASS pages per sheet = printSheet.ts' else 'FAIL pages per sheet' end);
  insert into proof_log(line) values (case
    when (s->'9x9'->>'hb')::numeric = 380 and (s->'9x9'->>'surcharge')::numeric = 150
    then 'PASS other size settings untouched' else 'FAIL other size settings changed: ' || (s->'9x9')::text end);

  select u.id into v_user from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
   limit 1;
  if v_user is null then raise exception 'No fixture customer without unpaid orders.'; end if;
  perform set_config('proof.user', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;

do $$
declare
  v_user uuid := current_setting('proof.user')::uuid;
begin
  begin
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"9x9"}', '9x9', 'hardboundLeather', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL a 9x9 hardbound order was accepted');
  exception when sqlstate 'MP005' then
    insert into proof_log(line) values ('PASS 9x9 hardbound refused: ' || sqlerrm);
  end;
  begin
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"9x9"}', '8x8', 'hardboundLeather', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL a 9x9 album sent as 8x8 hardbound was accepted');
  exception when sqlstate 'MP005' then
    insert into proof_log(line) values ('PASS a 9x9 album claiming 8x8 is refused too');
  end;
  begin
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"9x9"}', '9x9', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('PASS 9x9 softcover accepted');
  exception when others then
    insert into proof_log(line) values ('FAIL 9x9 softcover refused: ' || sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"8x8"}', '8x8', 'hardboundLeather', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('PASS 8x8 hardbound accepted');
  exception when others then
    insert into proof_log(line) values ('FAIL 8x8 hardbound refused: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;

reset role;

do $$
declare
  r text;
begin
  insert into proof_log(line)
  select 'info: 9x9 hardbound orders placed before 0046 (untouched): ' || count(*) from public.orders
   where album_size = '9x9' and cover <> 'softcover' and created_at < now() - interval '1 minute';
  insert into proof_log(line)
  select 'info: event deals already 9x9 hard: ' || count(*) from public.event_bookings where deal_album_size = '9x9' and deal_cover = 'hard';
  insert into proof_log(line)
  select case when count(*) = 2 then 'PASS both triggers in place' else 'FAIL triggers: ' || coalesce(string_agg(tgname, ', '), 'none') end
    from pg_trigger where tgname in ('orders_press_fit_trg', 'event_bookings_press_fit_trg');
  select string_agg(line, E'\n' order by n) into r from proof_log;
  raise exception using message = format(E'PRESS SHEET PROOF — %s FAIL (rolled back; nothing written)\n%s',
    (select count(*) from proof_log where line like 'FAIL%'), r);
end $$;
