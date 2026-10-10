-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — STORAGE RLS PROOF (live, always rolled back)
--
--  Runs the exact SQL Supabase Storage runs for an upload / upsert / delete
--  (supabase/storage src/storage/database/pg.ts, with the role + JWT claims set
--  the way src/internal/database/postgres/scope.ts sets them) AS REAL ACCOUNTS
--  on the live database. Each probe runs in its own subtransaction and is
--  rolled back, and the whole script ends by raising, so NOTHING is written.
--
--  Every row says what it got, what the fixed schema (0034) should give, and
--  PASS/FAIL. Against a database without 0034 the 1a/1b, 2a/2b/2c/2f/2g and 3*
--  rows FAIL: that failure is the bug.
--
--  HOW TO RUN (the report comes back as the error message, by design):
--    npx supabase db query --linked --file supabase/security/storage-rls-proof.sql
--
--  Fixtures are picked at run time (no ids in this public repo):
--    U   = the newest non-operator customer with an UNPAID order (and that order)
--    V   = another non-operator customer
--    OWN = the owner account (operator)
--  Fixture objects use a 'zz' prefix that no real code can produce.
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Run one statement as a Storage request would, inside a subtransaction that is
-- ALWAYS rolled back. mode 'try' -> ALLOWED / REFUSED <sqlstate> <message>;
-- mode 'value' -> first column of the first row.
create or replace function pg_temp.run_as(p_uid uuid, p_sql text, p_mode text default 'try', p_role text default 'authenticated')
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
            set_config('storage.allow_delete_query', 'true', true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    raise exception using errcode = 'MPOK0', message = coalesce(v_out, '<null>');
  exception
    when sqlstate 'MPOK0' then return sqlerrm;
    when others then return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

-- Storage createObject (upload with upsert: false). No RETURNING.
create or replace function pg_temp.sql_create(p_bucket text, p_name text, p_uid uuid)
returns text language sql as $$
  select format($f$INSERT INTO storage.objects ("name", "owner", "owner_id", "bucket_id", "metadata", "version")
                  VALUES (%L, %L::uuid, %L, %L, '{"size":1048576,"mimetype":"application/octet-stream"}'::jsonb, '1')$f$,
                p_name, p_uid, p_uid::text, p_bucket);
$$;

-- Storage upsertObject (upload with upsert: true), live conflict target.
create or replace function pg_temp.sql_upsert(p_bucket text, p_name text, p_uid uuid)
returns text language sql as $$
  select format($f$INSERT INTO storage.objects ("name", "owner", "owner_id", "bucket_id", "metadata", "version")
                  VALUES (%L, %L::uuid, %L, %L, '{"size":1048576,"mimetype":"application/octet-stream"}'::jsonb, '1')
                  ON CONFLICT (bucket_id, name COLLATE "C") WHERE archived_at IS NULL
                  DO UPDATE SET "metadata" = EXCLUDED."metadata", "version" = EXCLUDED."version",
                                "owner" = EXCLUDED."owner", "owner_id" = EXCLUDED."owner_id"
                  RETURNING *$f$,
                p_name, p_uid, p_uid::text, p_bucket);
$$;

-- Storage deleteObject (RETURNING *): how many rows the caller could delete.
create or replace function pg_temp.sql_delete(p_bucket text, p_name text)
returns text language sql as $$
  select format($f$WITH d AS (DELETE FROM storage.objects WHERE name COLLATE "C" = %L AND bucket_id = %L AND archived_at IS NULL RETURNING *)
                  SELECT count(*)::text FROM d$f$, p_name, p_bucket);
$$;

-- Seed a row as the migration role (bypasses RLS), owned by p_uid.
create or replace function pg_temp.seed(p_bucket text, p_name text, p_uid uuid)
returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
  values (p_bucket, p_name, p_uid, p_uid::text, '{"size":1048576,"mimetype":"video/mp4"}'::jsonb, 'seed');
end $$;

-- One report line: id, PASS/FAIL, label, what 0034 should give, what it got.
-- want 'ALLOWED' / 'REFUSED <sqlstate>' match as a prefix; anything else exactly.
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
  owners constant text[] := array['archgarcia@gmail.com', 'megyprints@gmail.com'];
  U uuid; V uuid; OWN uuid; ORD text; OTHER_ORD text;
  r text := ''; b text; n int; i int; pdfs int; fails int; total int;
  cnt_sql constant text := $q$select count(*)::text from storage.objects where bucket_id = 'memory-clips' and owner_id = auth.uid()::text$q$;
  all_sql constant text := $q$select count(*)::text from storage.objects where bucket_id = 'memory-clips'$q$;
  op_sql  constant text := $q$select coalesce(public.operator_role(), 'none')$q$;
begin
  -- ── fixtures ──────────────────────────────────────────────────────────────
  select usr.id, o.id::text into U, ORD
    from public.orders o join auth.users usr on usr.id = o.user_id
   where o.payment_status = 'unpaid'
     and coalesce(usr.email, '') <> all (owners)
     and not exists (select 1 from public.operator_roles x where x.email = usr.email)
   order by o.created_at desc limit 1;
  select usr.id into V from auth.users usr
   where usr.id <> U and coalesce(usr.email, '') <> all (owners)
     and not exists (select 1 from public.operator_roles x where x.email = usr.email)
   order by usr.created_at limit 1;
  select usr.id into OWN from auth.users usr where usr.email = any (owners) order by usr.created_at limit 1;
  select o.id::text into OTHER_ORD from public.orders o where o.user_id <> U order by o.created_at limit 1;
  if U is null or V is null or OWN is null or OTHER_ORD is null then
    raise exception 'fixtures missing: need a non-operator customer with an unpaid order, a second customer, the owner, and an order that is not theirs';
  end if;
  if exists (select 1 from storage.objects where name like 'zz%' or name like U::text || '/%') then
    raise exception 'fixture names already in use';
  end if;
  select count(*) into pdfs from storage.objects where bucket_id = 'print-pdfs';

  r := r || E'\n   policies: ' || (select string_agg(policyname, '; ' order by policyname) from pg_policies where schemaname = 'storage' and tablename = 'objects');
  r := r || pg_temp.line('0a', 'U is not an operator', 'none', pg_temp.run_as(U, op_sql, 'value'));
  r := r || pg_temp.line('0b', 'V is not an operator', 'none', pg_temp.run_as(V, op_sql, 'value'));
  r := r || pg_temp.line('0c', 'OWN is the owner', 'owner', pg_temp.run_as(OWN, op_sql, 'value'));

  perform pg_temp.seed('memory-clips', 'zzprfuaa.mp4', U);
  perform pg_temp.seed('memory-clips', 'zzprfvaa.mp4', V);
  perform pg_temp.seed('print-pdfs', U::text || '/seeded.bin', U);

  -- ── 1. Clip replace ("Change video" on My Memories = upsert) ─────────────
  r := r || pg_temp.line('1a', 'U Change video, same format: upsert onto own clip', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_upsert('memory-clips', 'zzprfuaa.mp4', U)));
  r := r || pg_temp.line('1b', 'U Change video, new format: upsert a new name (RETURNING)', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_upsert('memory-clips', 'zzprfuaa.mov', U)));
  r := r || pg_temp.line('1c', 'U checkout upload: create a new clip', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_create('memory-clips', 'zzprfunw.mp4', U)));
  r := r || pg_temp.line('1d', 'U retry: create onto own existing clip (Storage 409)', 'REFUSED 23505',
         pg_temp.run_as(U, pg_temp.sql_create('memory-clips', 'zzprfuaa.mp4', U)));
  r := r || pg_temp.line('1e', 'U upsert onto V''s clip', 'REFUSED 42501',
         pg_temp.run_as(U, pg_temp.sql_upsert('memory-clips', 'zzprfvaa.mp4', U)));
  r := r || pg_temp.line('1f', 'U Storage-delete V''s clip (rows)', '0',
         pg_temp.run_as(U, pg_temp.sql_delete('memory-clips', 'zzprfvaa.mp4'), 'value'));

  -- ── 2. Own-clip visibility and the 200-per-account cap ──────────────────
  r := r || pg_temp.line('2a', 'U counts own clips (the cap''s subquery)', '1', pg_temp.run_as(U, cnt_sql, 'value'));
  r := r || pg_temp.line('2b', 'U sees memory-clips rows, unfiltered (own only)', '1', pg_temp.run_as(U, all_sql, 'value'));
  r := r || pg_temp.line('2c', 'V sees memory-clips rows, unfiltered (own only)', '1', pg_temp.run_as(V, all_sql, 'value'));
  r := r || pg_temp.line('2d', 'anon sees memory-clips rows', '0', pg_temp.run_as(null, all_sql, 'value', 'anon'));

  select count(*) into n from storage.objects where bucket_id = 'memory-clips' and owner_id = U::text;
  for i in 1 .. (199 - n) loop
    perform pg_temp.seed('memory-clips', 'zzcap' || translate(lpad(i::text, 3, '0'), '01', 'ab') || '.mp4', U);
  end loop;
  r := r || pg_temp.line('2e', 'U holding 199 clips uploads the 200th', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_create('memory-clips', 'zzcapnew.mp4', U)));
  perform pg_temp.seed('memory-clips', 'zzcapzzz.mp4', U);
  r := r || pg_temp.line('2f', 'U counts own clips while holding 200', '200', pg_temp.run_as(U, cnt_sql, 'value'));
  r := r || pg_temp.line('2g', 'U holding 200 clips uploads the 201st', 'REFUSED 42501',
         pg_temp.run_as(U, pg_temp.sql_create('memory-clips', 'zzcapmax.mp4', U)));
  r := r || pg_temp.line('2h', 'V (1 clip) uploads: the cap is per account', 'ALLOWED',
         pg_temp.run_as(V, pg_temp.sql_create('memory-clips', 'zzprfvnw.mp4', V)));

  -- ── 3. "<uid>/..." writes into every bucket (bucket-less legacy policies) ─
  foreach b in array array['print-pdfs', 'memory-clips', 'payment-proofs', 'album-photos'] loop
    r := r || pg_temp.line('3a', 'U create ' || b || '/<uid>/stray.bin', 'REFUSED 42501',
           pg_temp.run_as(U, pg_temp.sql_create(b, U::text || '/stray.bin', U)));
    r := r || pg_temp.line('3b', 'U upsert ' || b || '/<uid>/stray.bin', 'REFUSED 42501',
           pg_temp.run_as(U, pg_temp.sql_upsert(b, U::text || '/stray.bin', U)));
  end loop;
  r := r || pg_temp.line('3c', 'U reads print-pdfs (incl. a seeded <uid>/ row)', '0',
         pg_temp.run_as(U, $q$select count(*)::text from storage.objects where bucket_id = 'print-pdfs'$q$, 'value'));
  r := r || pg_temp.line('3d', 'U Storage-deletes print-pdfs/<uid>/seeded.bin (rows)', '0',
         pg_temp.run_as(U, pg_temp.sql_delete('print-pdfs', U::text || '/seeded.bin'), 'value'));

  -- ── 4. Real flows must be unchanged ──────────────────────────────────────
  r := r || pg_temp.line('4a', 'U print PDF: create <own order>.pdf', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_create('print-pdfs', ORD || '.pdf', U)));
  r := r || pg_temp.line('4b', 'U cover: create <own order>-cover.pdf', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_create('print-pdfs', ORD || '-cover.pdf', U)));
  r := r || pg_temp.line('4c', 'U receipt: create <own unpaid order>.jpg', 'ALLOWED',
         pg_temp.run_as(U, pg_temp.sql_create('payment-proofs', ORD || '.jpg', U)));
  r := r || pg_temp.line('4d', 'U print PDF for someone else''s order', 'REFUSED 42501',
         pg_temp.run_as(U, pg_temp.sql_create('print-pdfs', OTHER_ORD || '.pdf', U)));
  r := r || pg_temp.line('4e', 'U print PDF as upsert (customers must not read print-pdfs)', 'REFUSED 42501',
         pg_temp.run_as(U, pg_temp.sql_upsert('print-pdfs', ORD || '.pdf', U)));
  r := r || pg_temp.line('4f', 'U reads payment-proofs rows', '0',
         pg_temp.run_as(U, $q$select count(*)::text from storage.objects where bucket_id = 'payment-proofs'$q$, 'value'));
  r := r || pg_temp.line('4g', 'owner (operator) lists print-pdfs', pdfs::text,
         pg_temp.run_as(OWN, $q$select count(*)::text from storage.objects where bucket_id = 'print-pdfs' and name not like '%/%'$q$, 'value'));

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := fails + (length(r) - length(replace(r, ' PASS |', ''))) / length(' PASS |');
  raise exception E'STORAGE RLS PROOF: % of % PASS (everything rolled back)%', total - fails, total, r;
end
$proof$;
