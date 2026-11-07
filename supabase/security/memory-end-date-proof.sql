-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — QR VIDEO END DATE PROOF (0060; live, always rolled back)
--
--  As a real customer (RLS on, the way the app writes memory rows): a QR
--  video whose hosting term ended can't be brought back by deleting the
--  memory and making it again — with no date, with a fresh 5 years, or as a
--  link first. An honest re-link keeps the years that were paid. Nobody but
--  the database writes the kept dates. The script ends by raising, so
--  NOTHING is written; the report is the error message.
--
--  HOW TO RUN:
--    npx supabase db query --linked --file supabase/security/memory-end-date-proof.sql
--  Before applying 0060: one file = "begin;" + 0060 + this file without
--  "begin;". Run as-is before 0060 to see the FAILs it fixes.
--
--  Fixture: two customers, picked at run time (no ids in this public repo).
-- ════════════════════════════════════════════════════════════════════════════
begin;

create temp table proof_log (n serial, line text) on commit drop;
grant insert, select on proof_log to authenticated, anon;
grant usage on sequence proof_log_n_seq to authenticated, anon;

do $$
declare v_a uuid; v_b uuid;
begin
  select u.id into v_a from auth.users u
   where not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  select u.id into v_b from auth.users u
   where u.id <> v_a
     and not exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))
     and not exists (select 1 from public.owner_accounts w where w.user_id = u.id)
   order by u.created_at limit 1;
  if v_a is null or v_b is null then raise exception 'Need two fixture customers.'; end if;
  delete from public.qr_memories where code like 'zzend%';
  perform set_config('proof.a', v_a::text, true);
  perform set_config('proof.b', v_b::text, true);
  perform set_config('proof.clip', 'https://example.supabase.co/storage/v1/object/public/memory-clips/zzendclip.mp4', true);
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.as_user(uuid) to authenticated;
-- "plays" = what /m does: no date, or a date still ahead.
create or replace function pg_temp.plays(p_code text) returns text language sql as $$
  select case when m.expires_at is null then 'plays forever (no end date)'
              when m.expires_at > now() then 'plays until ' || to_char(m.expires_at, 'YYYY-MM-DD')
              else 'ended ' || to_char(m.expires_at, 'YYYY-MM-DD') end
    from public.qr_memories m where m.code = p_code;
$$;
grant execute on function pg_temp.plays(text) to authenticated;

-- ── 1. A new video memory, saved with no date ──
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid; m public.qr_memories;
begin
  perform pg_temp.as_user(a);
  insert into public.qr_memories (code, user_id, destination, kind)
  values ('zzendclip', a, current_setting('proof.clip'), 'clip');
  select * into m from public.qr_memories where code = 'zzendclip';
  insert into proof_log(line) values (case when m.expires_at between now() + interval '4 years' and now() + make_interval(years => public.included_hosting_years()) + interval '1 day'
    then 'PASS a new video gets the included term (' || pg_temp.plays('zzendclip') || ')'
    else 'FAIL a new video saved with no date: ' || pg_temp.plays('zzendclip') end);
end $$;

-- ── The shop's term on it ends (as the database's own functions write it) ──
reset role;
update public.qr_memories set expires_at = now() - interval '1 day' where code = 'zzendclip';

-- ── 2. The customer tries to bring it back ──
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid;
begin
  perform pg_temp.as_user(a);

  begin
    update public.qr_memories set expires_at = '2099-01-01' where code = 'zzendclip';
    insert into proof_log(line) values ('FAIL the customer moved the end date to 2099');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS the customer can''t edit the end date (42501)');
  end;

  -- delete + make it again with no date (what the app's re-link insert sends)
  delete from public.qr_memories where code = 'zzendclip';
  insert into public.qr_memories (code, user_id, destination) values ('zzendclip', a, current_setting('proof.clip'));
  insert into proof_log(line) values (case when pg_temp.plays('zzendclip') like 'ended%'
    then 'PASS delete + remake with no date: still ' || pg_temp.plays('zzendclip')
    else 'FAIL delete + remake with no date: ' || pg_temp.plays('zzendclip') end);

  -- delete + make it again with a fresh included term
  delete from public.qr_memories where code = 'zzendclip';
  begin
    insert into public.qr_memories (code, user_id, destination, kind, expires_at)
    values ('zzendclip', a, current_setting('proof.clip'), 'clip', now() + make_interval(years => public.included_hosting_years()));
  exception when others then null;
  end;
  insert into proof_log(line) values (case when pg_temp.plays('zzendclip') like 'ended%'
    then 'PASS delete + remake with a fresh 5 years: still ' || pg_temp.plays('zzendclip')
    else 'FAIL delete + remake with a fresh 5 years: ' || coalesce(pg_temp.plays('zzendclip'), 'refused') end);

  -- delete + make it again called a "link"
  delete from public.qr_memories where code = 'zzendclip';
  insert into public.qr_memories (code, user_id, destination, kind) values ('zzendclip', a, current_setting('proof.clip'), 'link');
  insert into proof_log(line) select case when m.kind = 'clip' and pg_temp.plays('zzendclip') like 'ended%'
    then 'PASS remade as a "link": a video (kind clip), still ' || pg_temp.plays('zzendclip')
    else 'FAIL remade as a "link": kind ' || m.kind || ', ' || pg_temp.plays('zzendclip') end
    from public.qr_memories m where m.code = 'zzendclip';

  -- a link first, then pointed at the video
  insert into public.qr_memories (code, user_id, destination) values ('zzendlink', a, 'https://www.youtube.com/watch?v=zzproof1');
  insert into proof_log(line) values (case when pg_temp.plays('zzendlink') like 'plays forever%'
    then 'PASS a YouTube link has no end date (links cost nothing to host)'
    else 'FAIL a YouTube link got ' || pg_temp.plays('zzendlink') end);
  update public.qr_memories set destination = replace(current_setting('proof.clip'), 'zzendclip', 'zzendlink') where code = 'zzendlink';
  insert into proof_log(line) select case when m.kind = 'clip' and m.expires_at is not null and m.expires_at <= now() + make_interval(years => public.included_hosting_years()) + interval '1 day'
    then 'PASS a link turned into our video gets the included term (' || pg_temp.plays('zzendlink') || ')'
    else 'FAIL a link turned into our video: kind ' || m.kind || ', ' || pg_temp.plays('zzendlink') end
    from public.qr_memories m where m.code = 'zzendlink';
end $$;

-- ── 3. An honest customer with paid years removes and re-links the memory ──
reset role;
update public.qr_memories set expires_at = now() + interval '9 years' where code = 'zzendclip';
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid; ok boolean := true;
begin
  perform pg_temp.as_user(a);
  update public.qr_memories set destination = current_setting('proof.clip') || '?v=2', title = 'Our day' where code = 'zzendclip';
  insert into proof_log(line) values (case when pg_temp.plays('zzendclip') like 'plays until%'
      and (select expires_at from public.qr_memories where code = 'zzendclip') > now() + interval '8 years'
    then 'PASS replacing the video keeps the paid 9 years' else 'FAIL replacing the video: ' || pg_temp.plays('zzendclip') end);
  delete from public.qr_memories where code = 'zzendclip';
  begin
    insert into public.qr_memories (code, user_id, destination) values ('zzendclip', a, current_setting('proof.clip'));
  exception when others then
    ok := false;
    insert into proof_log(line) values ('FAIL re-linking a paid memory was refused: ' || sqlerrm);
  end;
  if ok then
    insert into proof_log(line) values (case when (select expires_at from public.qr_memories where code = 'zzendclip') > now() + interval '8 years'
      then 'PASS remove + re-link keeps the paid 9 years (' || pg_temp.plays('zzendclip') || ')'
      else 'FAIL remove + re-link lost the paid years: ' || pg_temp.plays('zzendclip') end);
  end if;
  -- checkout's belt (insert, ignore duplicates) on a row that exists: no change
  insert into public.qr_memories (code, user_id, destination, kind, expires_at)
  values ('zzendclip', a, current_setting('proof.clip'), 'clip', now() + interval '5 years')
  on conflict (code) do nothing;
  insert into proof_log(line) values (case when (select expires_at from public.qr_memories where code = 'zzendclip') > now() + interval '8 years'
    then 'PASS checkout''s insert-if-missing leaves the paid date alone' else 'FAIL checkout''s insert-if-missing: ' || pg_temp.plays('zzendclip') end);
end $$;

-- ── 4. Nobody but the database writes the kept dates ──
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid; n integer;
begin
  perform pg_temp.as_user(a);
  if to_regclass('public.memory_terms') is null then
    insert into proof_log(line) values ('FAIL no kept end dates (memory_terms is missing)');
    return;
  end if;
  execute 'select count(*) from public.memory_terms where code like ''zzend%''' into n;
  insert into proof_log(line) values (case when n = 2 then 'PASS the customer reads their own 2 kept dates' else 'FAIL the customer reads ' || n || ' kept dates' end);
  begin
    execute 'insert into public.memory_terms (code, user_id, expires_at) values (''zzendnew'', auth.uid(), ''2099-01-01'')';
    insert into proof_log(line) values ('FAIL the customer wrote a kept date');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS the customer can''t write a kept date (42501)');
  end;
  begin
    execute 'update public.memory_terms set expires_at = ''2099-01-01'' where code = ''zzendclip''';
    insert into proof_log(line) values ('FAIL the customer changed a kept date');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS the customer can''t change a kept date (42501)');
  end;
  begin
    execute 'delete from public.memory_terms where code = ''zzendclip''';
    insert into proof_log(line) values ('FAIL the customer deleted a kept date');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS the customer can''t delete a kept date (42501)');
  end;
  perform pg_temp.as_user(gen_random_uuid());
  execute 'select count(*) from public.memory_terms where code like ''zzend%''' into n;
  insert into proof_log(line) values (case when n = 0 then 'PASS another account reads none of them' else 'FAIL another account reads ' || n end);
end $$;
-- ── 5. Another account takes the printed code (red team, 2026-11-07) ──
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid; b uuid := current_setting('proof.b')::uuid;
begin
  perform pg_temp.as_user(a);
  delete from public.qr_memories where code = 'zzendclip';
  perform pg_temp.as_user(b);
  begin
    insert into public.qr_memories (code, user_id, destination) values ('zzendclip', b, current_setting('proof.clip'));
    insert into proof_log(line) values ('FAIL another account took the code after it was deleted: ' || pg_temp.plays('zzendclip'));
  exception when unique_violation then
    insert into proof_log(line) values ('PASS another account can''t take the code (23505, the app makes a new one)');
  end;
  delete from public.qr_memories where code = 'zzendclip';  -- B's, if it got in
  begin
    insert into public.qr_memories (code, user_id, destination) values ('zzendclip', b, 'https://www.youtube.com/watch?v=zzproof2');
    insert into proof_log(line) values ('FAIL another account took the code as a link');
  exception when unique_violation then
    insert into proof_log(line) values ('PASS ...not as a link either (23505)');
  end;
end $$;

-- ── 6. The account is deleted: its kept dates stay, with no account on them ──
reset role;
do $$
begin
  -- what account deletion leaves: the memory row gone (delete_own_account),
  -- the kept date with no account on it (on delete set null)
  delete from public.qr_memories where code = 'zzendlink';
  if to_regclass('public.memory_terms') is null then
    insert into proof_log(line) values ('FAIL no kept end dates (memory_terms is missing)');
    return;
  end if;
  insert into proof_log(line)
  select case when c.confdeltype = 'n' then 'PASS deleting an account clears its id on its kept dates (on delete set null)'
              else 'FAIL deleting an account: confdeltype ' || c.confdeltype::text end
    from pg_constraint c
   where c.conrelid = 'public.memory_terms'::regclass and c.contype = 'f';
  execute 'update public.memory_terms set user_id = null where code = ''zzendlink''';
end $$;
set local role authenticated;
do $$
declare a uuid := current_setting('proof.a')::uuid; b uuid := current_setting('proof.b')::uuid;
begin
  foreach a in array array[a, b] loop
    perform pg_temp.as_user(a);
    begin
      insert into public.qr_memories (code, user_id, destination) values ('zzendlink', a, current_setting('proof.clip'));
      insert into proof_log(line) values ('FAIL a deleted account''s code was made again: ' || pg_temp.plays('zzendlink'));
      delete from public.qr_memories where code = 'zzendlink';
    exception when unique_violation then
      insert into proof_log(line) values ('PASS a deleted account''s code can''t be made again (23505)');
    end;
  end loop;
end $$;

reset role;
set local role anon;
do $$
declare n integer;
begin
  if to_regclass('public.memory_terms') is null then return; end if;
  begin
    execute 'select count(*) from public.memory_terms' into n;
    insert into proof_log(line) values ('FAIL a stranger reads ' || n || ' kept dates');
  exception when insufficient_privilege then
    insert into proof_log(line) values ('PASS a stranger can''t read kept dates (42501)');
  end;
end $$;

-- ── Report ──
reset role;
do $$
declare r text; f integer;
begin
  select string_agg(line, E'\n' order by n), count(*) filter (where line like 'FAIL%') into r, f from proof_log;
  raise exception E'\n%\n── % FAIL of % ── (rolled back: nothing written)', r, f, (select count(*) from proof_log);
end $$;
