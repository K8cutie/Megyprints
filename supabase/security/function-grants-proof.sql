-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — FUNCTION GRANTS PROOF (0061; live, always rolled back)
--
--  As anon (what PostgREST runs a signed-out call as): every public function
--  0061 takes from anon is refused AT THE DOOR (42501 "permission denied for
--  function", not the body's own "not authorized"); the allow-listed guest
--  and public functions still run; signed-in customers keep their RPCs; and
--  the trigger functions no client can run still fire: an album save still
--  stamps updated_at, a signup still makes its profile. The script ends by
--  raising, so NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/function-grants-proof.sql
--  Before applying 0061: one file = "begin;" + 0061 + this file without
--  "begin;". Run as-is before 0061 to see the FAILs it fixes.
--
--  Fixture: one customer with an album, picked at run time (no ids in this
--  public repo).
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to public;
grant usage on sequence proof_log_n_seq to public;

do $$
declare v_user uuid; v_album uuid;
begin
  select a.user_id, a.id into v_user, v_album
    from public.albums a join auth.users u on u.id = a.user_id
   where not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by a.created_at limit 1;
  if v_user is null then raise exception 'Need a fixture customer with an album.'; end if;
  perform set_config('proof.user', v_user::text, true);
  perform set_config('proof.album', v_album::text, true);
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;

-- ── 1. The grants themselves (has_function_privilege) ──
do $$
declare f text; bad text;
  allowed text[] := array[
    'public.resolve_memory(text)', 'public.public_price_schedule()', 'public.included_hosting_years()',
    'public.event_public(text)', 'public.event_join(text, text, integer, boolean)', 'public.event_me(text, text)',
    'public.event_feed(text, text, timestamptz, integer, boolean)',
    'public.event_media_begin(text, text, text, text, bigint, integer, integer, numeric)',
    'public.event_media_ready(text, text, uuid)', 'public.event_media_delete(text, text, uuid)',
    'public.event_screen(text, text, integer)', 'public.event_copy_offer(text)', 'public.event_upload_allowed(text, text)'];
  nobody text[] := array[
    'public.handle_new_user()', 'public.handle_updated_at()', 'public.set_order_number()',
    'public.contact_messages_rate_limit()', 'public.orders_pin_album_size()', 'public.orders_seed_status_history()',
    'public.qr_memories_pin_immutable()', 'public.gen_order_number()'];
  signed_in text[] := array[
    'public.set_order_status(uuid, text)', 'public.operator_orders_count()', 'public.operator_role()', 'public.is_owner()',
    'public.cancelled_files_keep_days()', 'public.event_bytes_per_guest()', 'public.event_days_after()',
    'public.event_days_before()', 'public.event_is_open(text, text, date)', 'public.event_keep_days()',
    'public.event_media_objects(uuid, uuid, text, text)', 'public.event_min_guests()', 'public.event_photos_per_guest()',
    'public.event_screen_delay_seconds()', 'public.event_upload_window(date)', 'public.event_videos_per_guest()',
    'public.order_status_rank(public.order_status)', 'public.self_cancel_daily_limit()', 'public.unpaid_order_days()',
    'public.unpaid_order_limit()'];
begin
  foreach f in array nobody loop
    insert into proof_log(line) values (case
      when has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')
        then 'FAIL a client role can run ' || f
      else 'PASS no client role can run ' || f end);
  end loop;
  foreach f in array signed_in loop
    insert into proof_log(line) values (case
      when has_function_privilege('anon', f, 'EXECUTE') then 'FAIL anon can run ' || f
      when not has_function_privilege('authenticated', f, 'EXECUTE') then 'FAIL signed-in customers lost ' || f
      else 'PASS signed-in yes, anon no: ' || f end);
  end loop;
  foreach f in array allowed loop
    insert into proof_log(line) values (case
      when has_function_privilege('anon', f, 'EXECUTE') then 'PASS anon keeps ' || f
      else 'FAIL anon lost ' || f || ' (a guest or public page breaks)' end);
  end loop;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname) into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.oid <> all (select to_regprocedure(x)::oid from unnest(allowed) x);
  insert into proof_log(line) values (case when bad is null
    then 'PASS anon can run no public function outside the allow-list'
    else 'FAIL anon can run, outside the allow-list: ' || bad end);
end $$;

-- ── 2. As anon: the revoked functions refuse at the door ──
-- Typed nulls: a function anon can still run would reach its body (and
-- raise its own error, or answer); one it can't stops with 42501 first.
-- Trigger functions say "can only be called as triggers" (0A000) when the
-- door is open.
set local role anon;
do $$
declare c text;
begin
  foreach c in array array[
    'public.gen_order_number()', 'public.set_order_number()', 'public.handle_new_user()', 'public.handle_updated_at()',
    'public.contact_messages_rate_limit()', 'public.orders_pin_album_size()', 'public.orders_seed_status_history()',
    'public.qr_memories_pin_immutable()',
    'public.set_order_status(null::uuid, null::text)', 'public.operator_orders_count()', 'public.operator_role()', 'public.is_owner()',
    'public.cancelled_files_keep_days()', 'public.event_bytes_per_guest()', 'public.event_days_after()', 'public.event_days_before()',
    'public.event_is_open(null::text, null::text, null::date)', 'public.event_keep_days()',
    'public.event_media_objects(null::uuid, null::uuid, null::text, null::text)', 'public.event_min_guests()',
    'public.event_photos_per_guest()', 'public.event_screen_delay_seconds()', 'public.event_upload_window(null::date)',
    'public.event_videos_per_guest()', 'public.order_status_rank(null::public.order_status)', 'public.self_cancel_daily_limit()',
    'public.unpaid_order_days()', 'public.unpaid_order_limit()'] loop
    begin
      execute 'select ' || c;
      insert into proof_log(line) values ('FAIL anon ran ' || c);
    exception
      when insufficient_privilege then
        insert into proof_log(line) values (case when sqlerrm like 'permission denied for function%'
          then 'PASS anon refused at the door (42501): ' || c
          else 'FAIL anon reached the body of ' || c || ': ' || sqlerrm end);
      when others then
        insert into proof_log(line) values ('FAIL anon reached the body of ' || c || ' (' || sqlstate || ' ' || sqlerrm || ')');
    end;
  end loop;
end $$;

-- ── 3. As anon: the guest and public functions still answer ──
-- Unknown codes, so nothing is found or made; any answer or error from the
-- body is a PASS (the door let anon in).
do $$
declare c text;
begin
  foreach c in array array[
    'public.public_price_schedule()', 'public.included_hosting_years()', 'public.resolve_memory(''zzproof-none'')',
    'public.event_public(''zzproof-none'')', 'public.event_copy_offer(''zzproof-none'')',
    'public.event_me(''zzproof-none'', ''x'')', 'public.event_feed(''zzproof-none'', ''x'', null, 1, false)',
    'public.event_screen(''zzproof-none'', ''x'', 1)', 'public.event_upload_allowed(''event-media'', ''zzproof/none.jpg'')',
    'public.event_join(''zzproof-none'', ''x'', null, false)',
    'public.event_media_begin(''zzproof-none'', ''x'', ''photo'', ''jpg'', 1, 1, 1, null)',
    'public.event_media_ready(''zzproof-none'', ''x'', gen_random_uuid())',
    'public.event_media_delete(''zzproof-none'', ''x'', gen_random_uuid())'] loop
    begin
      execute 'select ' || c;
      insert into proof_log(line) values ('PASS anon still runs ' || c);
    exception when others then
      insert into proof_log(line) values (case when sqlerrm like 'permission denied for function%'
        then 'FAIL anon is refused ' || c || ' (a guest or public page breaks)'
        else 'PASS anon still runs ' || c || ' (its own answer: ' || sqlstate || ')' end);
    end;
  end loop;
end $$;

-- ── 4. As a signed-in customer: their RPCs pass the door, the generator doesn't ──
reset role;
set local role authenticated;
select pg_temp.as_user(current_setting('proof.user')::uuid);
do $$
declare c text;
begin
  foreach c in array array['public.operator_role()', 'public.is_owner()', 'public.operator_orders_count()',
                           'public.set_order_status(null::uuid, null::text)'] loop
    begin
      execute 'select ' || c;
      insert into proof_log(line) values ('PASS a customer still reaches ' || c);
    exception when others then
      insert into proof_log(line) values (case when sqlerrm like 'permission denied for function%'
        then 'FAIL a customer is refused ' || c
        else 'PASS a customer still reaches ' || c || ' (its own answer: ' || sqlstate || ')' end);
    end;
  end loop;
  begin
    perform public.gen_order_number();
    insert into proof_log(line) values ('FAIL a customer can mint order numbers');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS a customer can''t mint order numbers (42501)');
  end;
end $$;

-- ── 5. Trigger functions nobody can run still fire ──
-- a. A customer's album save: on_album_updated -> handle_updated_at().
do $$
declare v_before timestamptz; v_after timestamptz;
begin
  select updated_at into v_before from public.albums where id = current_setting('proof.album')::uuid;
  begin
    update public.albums set title = title where id = current_setting('proof.album')::uuid
      returning updated_at into v_after;
    insert into proof_log(line) values (case
      when v_after is null then 'FAIL the customer''s album save changed no row (RLS? fixture?)'
      when v_after is distinct from v_before then 'PASS a customer''s album save still stamps updated_at (handle_updated_at fires'
           || case when has_function_privilege('authenticated', 'public.handle_updated_at()', 'EXECUTE') then ')' else ', though customers can''t run it)' end
      else 'FAIL updated_at did not move: handle_updated_at did not fire' end);
  exception when others then
    insert into proof_log(line) values ('FAIL a customer''s album save failed: ' || sqlstate || ' ' || sqlerrm);
  end;
end $$;
reset role;

-- b. A signup, as the auth server inserts it: on_auth_user_created -> handle_new_user().
do $$
declare v_id uuid := gen_random_uuid(); v_ok boolean;
begin
  begin
    execute 'set local role supabase_auth_admin';
  exception when others then
    insert into proof_log(line) values ('SKIP signup: this connection can''t act as supabase_auth_admin (' || sqlerrm || '). After applying 0061, sign up a test account and check its user_profiles row');
    return;
  end;
  begin
    insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
    values (v_id, 'zzproof-' || v_id || '@example.invalid', '{"full_name": "zz proof signup"}'::jsonb,
            'authenticated', 'authenticated', now(), now());
    execute 'reset role';
    select exists (select 1 from public.user_profiles where id = v_id and full_name = 'zz proof signup') into v_ok;
    insert into proof_log(line) values (case when v_ok
      then 'PASS a signup still makes its profile (handle_new_user fires'
           || case when has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'EXECUTE') then ')' else ', though the auth server can''t run it directly)' end
      else 'FAIL a signup made no profile' end);
  exception when others then
    execute 'reset role';
    insert into proof_log(line) values (case when sqlerrm like 'permission denied for function%'
      then 'FAIL a signup is refused: ' || sqlerrm
      else 'SKIP signup: the test insert was refused for its own reason (' || sqlstate || ' ' || sqlerrm || ')' end);
  end;
end $$;
reset role;

-- c. New orders: set_order_number joins triggers that already fire on every
--    customer order although no customer can run their functions.
insert into proof_log(line)
select 'INFO triggers on orders that no customer can run: ' || coalesce(string_agg(t.tgname || ' -> ' || p.proname, ', ' order by t.tgname), 'none')
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.orders'::regclass and not t.tgisinternal and t.tgenabled <> 'D'
   and not has_function_privilege('authenticated', p.oid, 'EXECUTE');

-- ── Report ──
do $$
declare r text; f integer;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into r, f from proof_log;
  raise exception E'\n%\n── % FAIL of % ── (rolled back: nothing written)', r, f, (select count(*) from proof_log);
end $$;
