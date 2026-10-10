-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — ACCOUNT DELETION PROOF (live, always rolled back)
--
--  Proves that deleting an account takes the customer's memory VIDEOS with it
--  (0035), on the live schema, without writing anything:
--
--    • everything happens inside one transaction, and the script ENDS BY
--      RAISING, so the whole thing rolls back. The report comes back as the
--      error message, by design;
--    • the accounts are made up inside that transaction (zz-probe-*.invalid)
--      and never committed, so no real customer row is touched, not even
--      inside a rolled-back step;
--    • each scenario runs in its own subtransaction and is rolled back before
--      the next one starts.
--
--  Calls run as the roles Supabase uses: the customer's calls as
--  `authenticated` with their JWT claims (what PostgREST does for the
--  endpoint's customer client), the file removal as `service_role` with
--  storage.allow_delete_query on (what Storage does for the endpoint's
--  service-key remove()).
--
--  Each row says what 0035 should give and marks PASS/FAIL. Against a database
--  WITHOUT 0035, the A*, B1/B2, C* and D* rows FAIL, and C shows the bug:
--  the account is deleted while its videos stay in the public bucket.
--
--  HOW TO RUN
--    npx supabase db query --linked --file supabase/security/account-deletion-proof.sql
--  To prove an unapplied migration, run `begin;` + the migration + this file
--  (minus its own `begin;`) as one file.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Run one statement as p_role / p_uid. Success KEEPS its effects (inside the
-- scenario's own subtransaction, which is rolled back later); failure rolls the
-- statement back and reports it. mode 'try' -> ALLOWED / REFUSED <sqlstate>
-- <message>; mode 'value' -> first column of the first row.
create or replace function pg_temp.do_as(p_uid uuid, p_role text, p_sql text, p_mode text default 'try')
returns text language plpgsql as $$
declare
  v_email text;
  v_out   text;
begin
  select email into v_email from auth.users where id = p_uid;
  begin
    perform set_config('role', p_role, true),
            set_config('request.jwt.claim.role', p_role, true),
            set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
            set_config('request.jwt.claims',
              case when p_uid is null then json_build_object('role', p_role)::text
                   else json_build_object('sub', p_uid, 'role', p_role, 'email', v_email, 'aud', 'authenticated')::text end, true),
            -- Storage sets this for its own deletes (storage.protect_delete).
            set_config('storage.allow_delete_query', case when p_role = 'service_role' then 'true' else 'false' end, true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claims', '', true),
            set_config('storage.allow_delete_query', 'false', true);
    return coalesce(v_out, '<null>');
  exception when others then
    return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

-- One report line. want 'ALLOWED' / 'REFUSED <sqlstate>' match as a prefix;
-- anything else must match exactly.
create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when (p_want like 'ALLOWED%' or p_want like 'REFUSED%') and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || p_got;
$$;

do $proof$
declare
  Z uuid := gen_random_uuid();   -- customer with 3 clips, a delivered order on a 20-year term
  V uuid := gen_random_uuid();   -- another customer with 1 clip
  B uuid := gen_random_uuid();   -- customer with an order on the press + 1 clip
  z_order uuid;
  names_json text;
  r text := '';
  got text;
  fails int;
  total int;
  names_sql  constant text := $q$select public.my_memory_clip_names()::text$q$;
  count_sql  constant text := $q$select jsonb_array_length(public.my_memory_clip_names())::text$q$;
  delete_sql constant text := $q$select public.delete_own_account()$q$;
begin
  if exists (select 1 from storage.objects where name like 'zz-del-%' or name like '%/zz-del-%')
     or exists (select 1 from public.qr_memories where code like 'zz-del-%') then
    raise exception 'fixture names already in use';
  end if;

  -- ── fixtures (never committed) ────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (Z, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-z@probe.invalid', '{}', '{}', now(), now()),
         (V, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-v@probe.invalid', '{}', '{}', now(), now()),
         (B, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-b@probe.invalid', '{}', '{}', now(), now());

  -- Clips, stamped the way Storage stamps an upload (owner + owner_id = uploader).
  -- Z's third object is a non-code name: only owner_id finds it.
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version) values
    ('memory-clips', 'zz-del-za1.mp4',          Z, Z::text, '{"size":1048576,"mimetype":"video/mp4"}', 'probe'),
    ('memory-clips', 'zz-del-za2.mov',          Z, Z::text, '{"size":1048576,"mimetype":"video/quicktime"}', 'probe'),
    ('memory-clips', Z::text || '/zz-del-orphan.mp4', Z, Z::text, '{"size":1048576,"mimetype":"video/mp4"}', 'probe'),
    ('memory-clips', 'zz-del-va1.mp4',          V, V::text, '{"size":1048576,"mimetype":"video/mp4"}', 'probe'),
    ('memory-clips', 'zz-del-ba1.mp4',          B, B::text, '{"size":1048576,"mimetype":"video/mp4"}', 'probe');

  insert into public.qr_memories (code, user_id, destination, kind, expires_at) values
    ('zz-del-za1', Z, 'https://probe.invalid/storage/v1/object/public/memory-clips/zz-del-za1.mp4', 'clip', now() + interval '20 years'),
    ('zz-del-za2', Z, 'https://probe.invalid/storage/v1/object/public/memory-clips/zz-del-za2.mov', 'clip', now() + interval '5 years'),
    ('zz-del-ba1', B, 'https://probe.invalid/storage/v1/object/public/memory-clips/zz-del-ba1.mp4', 'clip', now() + interval '5 years');

  insert into public.orders (user_id, album_snapshot, album_size, status, payment_status, amount, hosting_years,
                             ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
  values (Z, '{}', '8x8', 'delivered', 'paid', 1000, 20,
          'Zz Probe', '+639000000000', '1 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '1 Probe St')
  returning id into z_order;
  insert into public.orders (user_id, album_snapshot, album_size, status, payment_status, amount,
                             ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
  values (B, '{}', '8x8', 'in_production', 'paid', 1000,
          'Bb Probe', '+639000000001', '2 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '2 Probe St');

  -- ── A. The endpoint's list: the caller's own clips, nobody else's ─────────
  begin
    r := r || pg_temp.line('A1', 'Z lists own clips (2 code names + 1 non-code name)', '3', pg_temp.do_as(Z, 'authenticated', count_sql, 'value'));
    got := pg_temp.do_as(Z, 'authenticated', names_sql, 'value');
    r := r || pg_temp.line('A2', 'Z''s list excludes V''s clip', 'true', (got not like '%zz-del-va1%' and got like '%zz-del-za1.mp4%')::text);
    r := r || pg_temp.line('A3', 'Z''s list includes the non-code name', 'true', (got like '%/zz-del-orphan.mp4%')::text);
    r := r || pg_temp.line('A4', 'V lists own clips', '1', pg_temp.do_as(V, 'authenticated', count_sql, 'value'));
    r := r || pg_temp.line('A5', 'anon cannot call the list', 'REFUSED 42501', pg_temp.do_as(null, 'anon', count_sql, 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── B. Preflight: the dialog gets the count and the hosting end date ──────
  begin
    r := r || pg_temp.line('B1', 'Z preflight: videos', '3',
           pg_temp.do_as(Z, 'authenticated', $q$select public.account_deletion_preflight() ->> 'videos'$q$, 'value'));
    r := r || pg_temp.line('B2', 'Z preflight: hosted until = the 20-year term', extract(year from now() + interval '20 years')::text,
           pg_temp.do_as(Z, 'authenticated', $q$select extract(year from (public.account_deletion_preflight() ->> 'videos_hosted_until')::timestamptz)::text$q$, 'value'));
    r := r || pg_temp.line('B3', 'Z preflight: nothing blocking (order delivered)', '0',
           pg_temp.do_as(Z, 'authenticated', $q$select jsonb_array_length(public.account_deletion_preflight() -> 'blocking')::text$q$, 'value'));
    r := r || pg_temp.line('B4', 'B preflight: the order on the press blocks', '1',
           pg_temp.do_as(B, 'authenticated', $q$select jsonb_array_length(public.account_deletion_preflight() -> 'blocking')::text$q$, 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── C. The bug: delete the account while the videos are still public ──────
  begin
    r := r || pg_temp.line('C1', 'Z deletes the account with 3 clips still in the bucket', 'REFUSED P0001',
           pg_temp.do_as(Z, 'authenticated', delete_sql));
    r := r || pg_temp.line('C2', '...Z''s account still exists', '1', (select count(*)::text from auth.users where id = Z));
    r := r || pg_temp.line('C3', '...Z''s clips still exist (and so does the account to own them)', '3', (select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = Z::text));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── D. The fixed flow, in the endpoint's order ────────────────────────────
  begin
    -- D1: list as the customer; D2: remove exactly those names as Storage does
    -- for a service-key remove(); D3: delete_own_account() as the customer.
    names_json := pg_temp.do_as(Z, 'authenticated', names_sql, 'value');
    r := r || pg_temp.line('D1', 'Z lists own clips for removal', 'true', (names_json like '[%')::text);
    r := r || pg_temp.line('D2', 'service role removes exactly the listed names', '3',
           pg_temp.do_as(null, 'service_role', format(
             $q$with d as (delete from storage.objects
                            where bucket_id = 'memory-clips'
                              and name in (select jsonb_array_elements_text(%L::jsonb))
                           returning 1)
                select count(*)::text from d$q$, case when names_json like '[%' then names_json else '[]' end), 'value'));
    r := r || pg_temp.line('D3', 'Z deletes the account once the clips are gone', 'ALLOWED', pg_temp.do_as(Z, 'authenticated', delete_sql));
    r := r || pg_temp.line('D4', '...Z''s account is gone', '0', (select count(*)::text from auth.users where id = Z));
    r := r || pg_temp.line('D5', '...Z''s clips are gone', '0', (select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = Z::text));
    r := r || pg_temp.line('D6', '...Z''s memory rows are gone', '0', (select count(*)::text from public.qr_memories where user_id = Z));
    r := r || pg_temp.line('D7', '...V''s clip is untouched', '1', (select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = V::text));
    r := r || pg_temp.line('D8', '...B''s clip is untouched', '1', (select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = B::text));
    r := r || pg_temp.line('D9', '...Z''s paid order is kept as a scrubbed receipt', '1',
           (select count(*)::text from public.orders
             where id = z_order and user_id is null and customer_deleted_at is not null
               and ship_name is null and ship_phone is null and album_snapshot = '{}'::jsonb and hosting_years = 20));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── E. Money in flight: refused, and the video stays ──────────────────────
  begin
    r := r || pg_temp.line('E1', 'B (order on the press) deletes the account', 'REFUSED P0001',
           pg_temp.do_as(B, 'authenticated', delete_sql));
    got := pg_temp.do_as(B, 'authenticated', delete_sql);
    r := r || pg_temp.line('E2', '...refused for the order, not the video', 'true', (got like '%is paid and not yet delivered%')::text);
    r := r || pg_temp.line('E3', '...B''s clip is still there', '1', (select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = B::text));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── F. Doors and pins ─────────────────────────────────────────────────────
  r := r || pg_temp.line('F1', 'anon has no EXECUTE on the clip list', 'true',
         coalesce((select (not has_function_privilege('anon', p.oid, 'EXECUTE'))::text
                     from pg_proc p where p.oid = to_regprocedure('public.my_memory_clip_names()')), '<missing>'));
  r := r || pg_temp.line('F2', 'authenticated has EXECUTE on the clip list', 'true',
         coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                     from pg_proc p where p.oid = to_regprocedure('public.my_memory_clip_names()')), '<missing>'));
  r := r || pg_temp.line('F3', 'anon still cannot delete or preflight', 'true',
         (not has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.account_deletion_preflight()', 'EXECUTE'))::text);
  r := r || pg_temp.line('F4', 'memory-clips + print-pdfs versioning off (a delete really deletes)', 'true',
         (not exists (select 1 from storage.buckets bk
                       where bk.id in ('memory-clips', 'print-pdfs')
                         and coalesce(to_jsonb(bk) ->> 'versioning_status', 'DISABLED') <> 'DISABLED'))::text);

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('ACCOUNT DELETION PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
