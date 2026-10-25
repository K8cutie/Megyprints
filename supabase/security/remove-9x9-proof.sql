-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 9x9 REMOVED PROOF (0053; live, always rolled back)
--
--  As a real customer (RLS on, the way checkout inserts): an order for a 9x9
--  album is refused (MP006) — softcover, hardbound, another spelling, and a
--  9x9 album whose order claims 8x8 — while an album that was 9x9 (now 8x8)
--  and a plain 8x8 order go through. Plus: no 9x9 price, 9x9 hidden from
--  older app copies, no album left at 9x9, no 9x9 event deal. The script ends
--  by raising, so NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/remove-9x9-proof.sql
--  Before applying 0053: one file = "begin;" + 0053 + this file without "begin;".
--
--  Fixture: a customer with no unpaid order, picked at run time (no ids in
--  this public repo). Their album is a scratch row inside the transaction.
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated;
grant usage on sequence proof_log_n_seq to authenticated;

do $$
declare
  v_user uuid;
  v_album uuid := gen_random_uuid();
begin
  insert into proof_log(line) select case
    when sizes -> '9x9' is null then 'PASS no 9x9 price' else 'FAIL 9x9 still priced: ' || (sizes -> '9x9')::text end
    from public.pricing_model where id = 1;
  insert into proof_log(line) select case
    when '9x9' = any (disabled_sizes) then 'PASS 9x9 hidden from older app copies (disabled_sizes ' || disabled_sizes::text || ')'
    else 'FAIL 9x9 not in disabled_sizes: ' || disabled_sizes::text end
    from public.store_settings where id = 1;
  insert into proof_log(line) select case
    when count(*) = 0 then 'PASS no album left at 9x9' else 'FAIL albums still at 9x9: ' || count(*) end
    from public.albums where public.retired_album_size(album_size);
  insert into proof_log(line) select case
    when pg_get_constraintdef(c.oid) not like '%9x9%' and pg_get_constraintdef(c.oid) like '%8x8%' then 'PASS event deals: no 9x9 in the size check'
    else 'FAIL event deal size check: ' || pg_get_constraintdef(c.oid) end
    from pg_constraint c where c.conname = 'event_bookings_size_chk' and c.conrelid = 'public.event_bookings'::regclass;

  select u.id into v_user from auth.users u
   where not exists (select 1 from public.orders o where o.user_id = u.id and o.status = 'pending_payment' and o.payment_status = 'unpaid')
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
   limit 1;
  if v_user is null then raise exception 'No fixture customer without unpaid orders.'; end if;
  -- A scratch album of theirs, saved at 9x9 the way an old app copy would.
  insert into public.albums (id, user_id, title, album_size, pages)
  values (v_album, v_user, 'Zz Probe 9x9', '9x9', '[{"templateId":"t99-fb-solo","size":"9x9"}]');
  perform set_config('proof.user', v_user::text, true);
  perform set_config('proof.album', v_album::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
end $$;

set local role authenticated;

do $$
declare
  v_user uuid := current_setting('proof.user')::uuid;
  v_album uuid := current_setting('proof.album')::uuid;
  v_size text;
begin
  begin
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"9x9"}', '9x9', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL a 9x9 softcover order was accepted');
  exception when sqlstate 'MP006' then
    insert into proof_log(line) values ('PASS 9x9 softcover refused: ' || sqlerrm);
  end;
  begin
    -- Hardbound is refused by the press check first (0046) — refused either way.
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":"9x9"}', '9x9', 'hardboundLeather', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL a 9x9 hardbound order was accepted');
  exception when sqlstate 'MP006' or sqlstate 'MP005' then
    insert into proof_log(line) values ('PASS 9x9 hardbound refused (' || sqlstate || ')');
  end;
  begin
    -- album_size is free text: another spelling of 9x9 is still 9x9.
    insert into public.orders (user_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, '{"album_size":" 9X9\""}', ' 9X9"', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL another spelling of 9x9 (" 9X9\"") was accepted');
  exception when sqlstate 'MP006' then
    insert into proof_log(line) values ('PASS another spelling of 9x9 is refused too');
  end;
  begin
    -- The album says 9x9 (an old app copy saved it so): the order claiming 8x8
    -- takes the album's size and is refused.
    update public.albums set album_size = '9x9' where id = v_album;
    insert into public.orders (user_id, album_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, v_album, '{"album_size":"8x8"}', '8x8', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St');
    insert into proof_log(line) values ('FAIL a 9x9 album ordered as 8x8 was accepted');
  exception when sqlstate 'MP006' then
    insert into proof_log(line) values ('PASS a 9x9 album claiming 8x8 is refused too');
  end;
  begin
    -- The same album once it says 8x8 (what 0053 did to every saved 9x9 album).
    update public.albums set album_size = '8x8' where id = v_album;
    insert into public.orders (user_id, album_id, album_snapshot, album_size, cover, page_count, material, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
    values (v_user, v_album, '{"album_size":"8x8"}', '8x8', 'softcover', 40, 'matte', 'Zz Probe', '+639170000000', '1 Probe St, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St')
    returning album_size into v_size;
    insert into proof_log(line) values (case when v_size = '8x8' then 'PASS the album that was 9x9 orders as 8x8' else 'FAIL it ordered as ' || v_size end);
  exception when others then
    insert into proof_log(line) values ('FAIL the album that was 9x9 is refused: ' || sqlstate || ' ' || sqlerrm);
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
  select 'info: 9x9 orders placed before 0053 (untouched): ' || count(*) from public.orders
   where public.retired_album_size(album_size) and created_at < now() - interval '1 minute';
  insert into proof_log(line)
  select case when count(*) = 1 then 'PASS the 9x9 order trigger is in place' else 'FAIL trigger missing or disabled' end
    from pg_trigger where tgname = 'orders_size_retired_trg' and tgrelid = 'public.orders'::regclass and tgenabled <> 'D';
  select string_agg(line, E'\n' order by n) into r from proof_log;
  raise exception using message = format(E'9x9 REMOVED PROOF — %s FAIL (rolled back; nothing written)\n%s',
    (select count(*) from proof_log where line like 'FAIL%'), r);
end $$;
