-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — UNPAID ORDER EXPIRY PROOF (0042; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    A. at most 3 unpaid orders per account; the 4th is refused with a
--       sentence (MP001); a customer can cancel their own unsent one;
--    B. only orders unpaid for 7+ days where the customer never tapped
--       "I've sent" are cancelled; no customer can run the expiry;
--    C. a cancelled order is due for cleanup 3 days after the cancel;
--    D. a claimed order can't be reopened or marked paid (MP002), an
--       unclaimed one still can;
--    E. a memory video is offered for removal only when nothing could still
--       need it (each guard gets its own case, with its own customer, because
--       the paid-order guard is per customer);
--    F. videos uploaded for a checkout that never finished are found, and
--       only those;
--    G. a memory row goes only once its file is really gone;
--    H. a phone learns which of its codes are on its own PAID orders only;
--    I. a closed order takes no new print files, receipts or "I've sent";
--    J. memory_codes is the database's, never the client's.
--
--  Same method as account-deletion-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), made-up accounts
--  (zz-probe-*.invalid) and made-up Storage rows that are never committed,
--  every scenario in its own subtransaction.
--
--  Two honest differences:
--    • B4 runs the REAL expire_unpaid_orders(). Inside its rolled-back
--      subtransaction it also cancels any real order due that day. Nothing
--      is committed.
--    • clip_purge_since() is replaced (inside the transaction, rolled back)
--      with "30 days ago", so fixtures can be dated around it.
--
--  HOW TO RUN
--    npx supabase db query --linked --file supabase/security/unpaid-expiry-proof.sql
--  To prove 0042 before applying it: `begin;` + the migration + this file
--  (minus its own `begin;`) as one file.
-- ════════════════════════════════════════════════════════════════════════════
begin;

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

create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when (p_want like 'ALLOWED%' or p_want like 'REFUSED%') and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || coalesce(p_got, '<null>');
$$;

create or replace function pg_temp.snap(p_codes text[])
returns jsonb language sql as $$
  select jsonb_build_object('title', 'zz probe', 'pages', jsonb_build_array(jsonb_build_object(
    'qrFills', coalesce((select jsonb_agg(jsonb_build_object('code', c, 'kind', 'clip')) from unnest(p_codes) c), '[]'::jsonb))));
$$;

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-x' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

create or replace function pg_temp.mk_album(p_user uuid)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.albums (id, user_id, title) values (v, p_user, 'zz probe album');
  return v;
end $$;

-- A fixture order, inserted as the table owner (the cap and codes triggers run).
create or replace function pg_temp.mk_order(p_user uuid, p_album uuid, p_codes text[], p_status text,
                                            p_pay text, p_created timestamptz, p_updated timestamptz,
                                            p_submitted timestamptz default null)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.orders (user_id, album_id, album_snapshot, album_size, status, payment_status, amount,
                             ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province,
                             ship_city, ship_barangay, ship_street, created_at, updated_at, payment_submitted_at)
  values (p_user, p_album, pg_temp.snap(p_codes), '8x8', p_status::public.order_status, p_pay,
          case when p_pay = 'paid' then 1000 else null end,
          'Zz Probe', '+639000000000', '1 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila',
          'Probe City', 'Probe', '1 Probe St', p_created, p_updated, p_submitted)
  returning id into v_id;
  return v_id;
end $$;

-- A cancelled order the endpoint has claimed.
create or replace function pg_temp.mk_claimed(p_user uuid, p_album uuid, p_codes text[])
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  v_id := pg_temp.mk_order(p_user, p_album, p_codes, 'cancelled', 'unpaid', now() - interval '12 days', now() - interval '4 days');
  update public.orders set purge_started_at = now() where id = v_id;
  return v_id;
end $$;

-- A memory-clips object stamped the way an upload stamps it.
create or replace function pg_temp.mk_clip(p_name text, p_owner uuid, p_created timestamptz default now())
returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version, created_at)
  values ('memory-clips', p_name, p_owner, p_owner::text, '{"size":1,"mimetype":"video/mp4"}', 'probe', p_created);
$$;

create or replace function pg_temp.clips_of(p_order uuid)
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', 'service_role', true);
  select coalesce(string_agg(object_name, ',' order by object_name), '') into v from public.order_clip_files_to_purge(p_order);
  perform set_config('role', 'none', true);
  return v;
end $$;

do $proof$
declare
  A uuid; B uuid; C uuid; D uuid; E uuid; P uuid; Q uuid; RR uuid; S uuid;
  alb_a uuid; alb_p uuid;
  o1 uuid; o2 uuid; o3 uuid; ob_paidpending uuid; ob_reopen uuid; o4 uuid; o5 uuid; o_paid uuid; o_paidcan uuid; o_cust uuid;
  oa uuid; og uuid; oh uuid; ou uuid; op uuid; oq uuid; orr uuid;
  r text := '';
  got text;
  fails int;
  total int;
  ins_c constant text := $q$insert into public.orders (user_id, album_snapshot, album_size, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street) values (auth.uid(), '{}', '8x8', 'Cc Probe', '+639000000002', '3 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '3 Probe St')$q$;
begin
  if exists (select 1 from storage.objects where bucket_id = 'memory-clips' and name like 'zzqx%')
     or exists (select 1 from public.qr_memories where code like 'zzqx%') then
    raise exception 'fixture names already in use';
  end if;

  -- Videos uploaded before 0042 are never removed. Here, "before" = 30 days ago.
  create or replace function public.clip_purge_since() returns timestamptz
    language sql stable set search_path = '' as $f$ select now() - interval '30 days' $f$;

  A := pg_temp.mk_user('a'); B := pg_temp.mk_user('b'); C := pg_temp.mk_user('c'); D := pg_temp.mk_user('d'); E := pg_temp.mk_user('e');
  P := pg_temp.mk_user('p'); Q := pg_temp.mk_user('q'); RR := pg_temp.mk_user('r'); S := pg_temp.mk_user('s');

  -- ── A. At most 3 unpaid orders per account ────────────────────────────────
  begin
    r := r || pg_temp.line('A1', 'C places unpaid order 1', 'ALLOWED', pg_temp.do_as(C, 'authenticated', ins_c));
    r := r || pg_temp.line('A2', 'C places unpaid order 2', 'ALLOWED', pg_temp.do_as(C, 'authenticated', ins_c));
    r := r || pg_temp.line('A3', 'C places unpaid order 3', 'ALLOWED', pg_temp.do_as(C, 'authenticated', ins_c));
    got := pg_temp.do_as(C, 'authenticated', ins_c);
    r := r || pg_temp.line('A4', 'C''s 4th unpaid order is refused', 'REFUSED MP001', got);
    r := r || pg_temp.line('A5', '...with the sentence, not an RLS error', 'true',
           (got like '%You already have 3 orders waiting for payment%cancel one in Your orders%after 7 days%')::text);
    got := pg_temp.do_as(C, 'authenticated', format('select public.cancel_my_unpaid_order(%L)::text',
             (select id from public.orders where user_id = C order by created_at limit 1)), 'value');
    r := r || pg_temp.line('A6', 'C cancels one of their own unsent orders', 'true', got);
    r := r || pg_temp.line('A7', '...which frees a place', 'ALLOWED', pg_temp.do_as(C, 'authenticated', ins_c));
    r := r || pg_temp.line('A8', '...and it is Cancelled by the customer, with its time', 'cancelled|customer|true',
           (select status::text || '|' || (status_history -> -1 ->> 'by') || '|' || (cancelled_at is not null)::text
              from public.orders where user_id = C and status = 'cancelled'));
    got := pg_temp.do_as(B, 'authenticated', format('select public.cancel_my_unpaid_order(%L)::text',
             (select id from public.orders where user_id = C and status = 'pending_payment' limit 1)), 'value');
    r := r || pg_temp.line('A9', 'B cannot cancel C''s order', 'false', got);
    update public.orders set payment_submitted_at = now()
     where id = (select id from public.orders where user_id = C and status = 'pending_payment' order by created_at limit 1);
    got := pg_temp.do_as(C, 'authenticated', format('select public.cancel_my_unpaid_order(%L)::text',
             (select id from public.orders where user_id = C and payment_submitted_at is not null limit 1)), 'value');
    r := r || pg_temp.line('A10', 'after "I''ve sent", C can no longer cancel it', 'false', got);
    r := r || pg_temp.line('A11', 'anon cannot cancel anything', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.cancel_my_unpaid_order(%L)', gen_random_uuid())));
    r := r || pg_temp.line('A12', 'B (another account) is unaffected by C''s limit', 'ALLOWED', pg_temp.do_as(B, 'authenticated', ins_c));
    r := r || pg_temp.line('A13', 'cleanup bookkeeping and "I''ve sent" sent on insert are ignored', '<null>|<null>|<null>|<null>|<null>|<null>|<null>|<null>',
           pg_temp.do_as(B, 'authenticated',
             $q$insert into public.orders (user_id, album_snapshot, album_size, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, files_purged_at, purge_started_at, cancelled_at, cancelled_by, reopened_at, payment_submitted_at, payment_proof_path, payment_reference) values (auth.uid(), '{}', '8x8', 'Bb Probe', '+639000000001', '2 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '2 Probe St', now(), now(), now(), 'customer', now(), now(), 'someone-elses.png', 'FAKE') returning concat_ws('|', coalesce(files_purged_at::text, '<null>'), coalesce(purge_started_at::text, '<null>'), coalesce(cancelled_at::text, '<null>'), coalesce(cancelled_by, '<null>'), coalesce(reopened_at::text, '<null>'), coalesce(payment_submitted_at::text, '<null>'), coalesce(payment_proof_path, '<null>'), coalesce(payment_reference, '<null>'))$q$, 'value'));
    -- At most 3 of their own cancels a day (place → upload → cancel can't loop).
    for i in 1..3 loop
      perform pg_temp.do_as(E, 'authenticated', ins_c);
    end loop;
    got := '';
    for i in 1..3 loop
      got := got || pg_temp.do_as(E, 'authenticated', format('select public.cancel_my_unpaid_order(%L)::text',
               (select id from public.orders where user_id = E and status = 'pending_payment' order by created_at limit 1)), 'value');
    end loop;
    r := r || pg_temp.line('A14', 'E cancels 3 of their own orders in a day', 'truetruetrue', got);
    perform pg_temp.do_as(E, 'authenticated', ins_c);
    got := pg_temp.do_as(E, 'authenticated', format('select public.cancel_my_unpaid_order(%L)::text',
             (select id from public.orders where user_id = E and status = 'pending_payment' limit 1)), 'value');
    r := r || pg_temp.line('A15', '...the 4th cancel that day is refused', 'REFUSED MP004', got);
    r := r || pg_temp.line('A16', '...with a sentence', 'true', (got like '%You''ve cancelled 3 orders today%closes by itself after 7 days%')::text);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── B. Which orders expire ────────────────────────────────────────────────
  begin
    o1 := pg_temp.mk_order(A, null, '{}', 'pending_payment', 'unpaid', now() - interval '8 days', now() - interval '8 days');
    o2 := pg_temp.mk_order(A, null, '{}', 'pending_payment', 'unpaid', now() - interval '8 days', now() - interval '8 days');
    update public.orders set payment_submitted_at = now() - interval '7 days' where id = o2;   -- "I've sent"
    o3 := pg_temp.mk_order(A, null, '{}', 'pending_payment', 'unpaid', now() - interval '2 days', now() - interval '2 days');
    ob_paidpending := pg_temp.mk_order(B, null, '{}', 'pending_payment', 'paid', now() - interval '9 days', now() - interval '9 days');
    -- 10 days old, closed, then reopened by the owner today (customer: "paying tomorrow").
    ob_reopen := pg_temp.mk_order(B, null, '{}', 'cancelled', 'unpaid', now() - interval '10 days', now() - interval '3 days');
    update public.orders set status = 'pending_payment' where id = ob_reopen;
    r := r || pg_temp.line('B1', 'anon cannot run the expiry', 'REFUSED 42501', pg_temp.do_as(null, 'anon', 'select public.expire_unpaid_orders()'));
    r := r || pg_temp.line('B2', 'a signed-in customer cannot run the expiry', 'REFUSED 42501', pg_temp.do_as(A, 'authenticated', 'select public.expire_unpaid_orders()'));
    r := r || pg_temp.line('B3', 'the service role can', 'true', has_function_privilege('service_role', 'public.expire_unpaid_orders()', 'EXECUTE')::text);
    r := r || pg_temp.line('B4', 'the expiry cancels exactly the 8-day-old unsent order (of these)', o1::text,
           pg_temp.do_as(null, 'service_role',
             format($q$select string_agg(order_id::text, ',') from public.expire_unpaid_orders() where order_id = any(array[%L, %L, %L, %L, %L]::uuid[])$q$, o1, o2, o3, ob_paidpending, ob_reopen), 'value'));
    r := r || pg_temp.line('B5', '...it is Cancelled, marked auto-expire, with its cancel time', 'cancelled|auto-expire|true',
           (select status::text || '|' || (status_history -> -1 ->> 'by') || '|' || (cancelled_at is not null)::text from public.orders where id = o1));
    r := r || pg_temp.line('B6', 'an order whose customer says they paid is kept', 'pending_payment', (select status::text from public.orders where id = o2));
    r := r || pg_temp.line('B7', 'a 2-day-old unpaid order is kept', 'pending_payment', (select status::text from public.orders where id = o3));
    r := r || pg_temp.line('B8', 'an order marked paid (status not moved yet) is kept', 'pending_payment', (select status::text from public.orders where id = ob_paidpending));
    r := r || pg_temp.line('B9', 'an order the owner reopened today gets its 7 days again', 'pending_payment|true',
           (select status::text || '|' || (reopened_at is not null)::text from public.orders where id = ob_reopen));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── C + D. Due 3 days after the cancel; claimed = final ───────────────────
  -- Fixtures inserted as cancelled have no cancelled_at (only a real cancel
  -- stamps it), so their updated_at stands in, exactly as for old orders.
  begin
    o4 := pg_temp.mk_order(A, null, '{}', 'cancelled', 'unpaid', now() - interval '12 days', now() - interval '4 days');
    o5 := pg_temp.mk_order(A, null, '{}', 'cancelled', 'unpaid', now() - interval '12 days', now() - interval '1 day');
    o_paid := pg_temp.mk_order(A, null, '{}', 'paid', 'paid', now() - interval '12 days', now() - interval '4 days');
    -- Paid, then cancelled by the owner (a refund, a misclick) 4 days ago.
    o_paidcan := pg_temp.mk_order(A, null, '{}', 'cancelled', 'paid', now() - interval '12 days', now() - interval '4 days');
    -- The customer cancelled their own just now: due on the next run.
    perform pg_temp.do_as(A, 'authenticated', ins_c);
    o_cust := (select id from public.orders where user_id = A and status = 'pending_payment' order by created_at desc limit 1);
    perform pg_temp.do_as(A, 'authenticated', format('select public.cancel_my_unpaid_order(%L)', o_cust), 'value');
    got := pg_temp.do_as(null, 'service_role', 'select coalesce(string_agg(order_id::text, '',''), '''') from public.orders_due_for_file_purge(500)', 'value');
    r := r || pg_temp.line('C1', 'cancelled 4 days ago: due', 'true', (got like '%' || o4::text || '%')::text);
    r := r || pg_temp.line('C2', 'cancelled 1 day ago: not yet (a late payment can still be matched)', 'false', (got like '%' || o5::text || '%')::text);
    r := r || pg_temp.line('C3', 'a paid order: never', 'false', (got like '%' || o_paid::text || '%')::text);
    r := r || pg_temp.line('C5', 'a PAID order the owner cancelled: never (its photos live only on a phone)', 'false', (got like '%' || o_paidcan::text || '%')::text);
    r := r || pg_temp.line('C6', 'one the customer cancelled themselves: due on the next run', 'true', (got like '%' || o_cust::text || '%')::text);
    r := r || pg_temp.line('C4', 'a signed-in customer cannot list them', 'REFUSED 42501',
           pg_temp.do_as(A, 'authenticated', 'select public.orders_due_for_file_purge(10)'));

    r := r || pg_temp.line('D1', 'claiming the due one', 'true', pg_temp.do_as(null, 'service_role', format('select public.claim_order_file_purge(%L)::text', o4), 'value'));
    r := r || pg_temp.line('D2', 'claiming one inside the 3 days', 'false', pg_temp.do_as(null, 'service_role', format('select public.claim_order_file_purge(%L)::text', o5), 'value'));
    r := r || pg_temp.line('D3', 'claiming a paid order', 'false', pg_temp.do_as(null, 'service_role', format('select public.claim_order_file_purge(%L)::text', o_paid), 'value'));
    r := r || pg_temp.line('D4', 'a customer cannot claim', 'REFUSED 42501', pg_temp.do_as(A, 'authenticated', format('select public.claim_order_file_purge(%L)', o4)));
    got := pg_temp.do_as(null, 'service_role', 'select coalesce(string_agg(order_id::text, '',''), '''') from public.orders_due_for_file_purge(500)', 'value');
    r := r || pg_temp.line('D5', 'a claimed, unfinished order stays due (the next run finishes it)', 'true', (got like '%' || o4::text || '%')::text);
    -- The owner's admin writes reach the table through RLS; the guard is a
    -- trigger, so it holds for every writer. Run here as the table owner.
    r := r || pg_temp.line('D6', 'the owner reopens the claimed order', 'REFUSED MP002',
           pg_temp.do_as(null, 'postgres', format('update public.orders set status = ''pending_payment'' where id = %L', o4)));
    r := r || pg_temp.line('D7', 'the owner marks the claimed order paid', 'REFUSED MP002',
           pg_temp.do_as(null, 'postgres', format('update public.orders set payment_status = ''paid'', status = ''paid'' where id = %L', o4)));
    r := r || pg_temp.line('D8', 'the owner reopens the unclaimed one (a late payment): allowed', 'ALLOWED',
           pg_temp.do_as(null, 'postgres', format('update public.orders set status = ''pending_payment'' where id = %L', o5)));
    r := r || pg_temp.line('D9', '...and its cancel time is cleared, its reopen time set', 'pending_payment|<null>|true',
           (select status::text || '|' || coalesce(cancelled_at::text, '<null>') || '|' || (reopened_at is not null)::text from public.orders where id = o5));
    perform pg_temp.do_as(null, 'postgres', format('update public.orders set purge_started_at = null, files_purged_at = null where id = %L', o4));
    r := r || pg_temp.line('D10', 'the owner''s account can''t clear a started cleanup', 'true',
           (select (purge_started_at is not null)::text from public.orders where id = o4));
    perform pg_temp.do_as(null, 'postgres', format('update public.orders set memory_codes = ''{zzqxfake}'', cancelled_at = now() - interval ''30 days'' where id = %L', o5));
    r := r || pg_temp.line('D11', '...nor set memory_codes or cancel times by hand', '{}|<null>',
           (select memory_codes::text || '|' || coalesce(cancelled_at::text, '<null>') from public.orders where id = o5));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── E. Which of a claimed order's videos may go ───────────────────────────
  begin
    alb_a := pg_temp.mk_album(A);
    -- may go: only on this order, A has no paid orders
    perform pg_temp.mk_clip('zzqxaaaa.mp4', A); perform pg_temp.mk_clip('zzqxaaaa.mov', A);
    insert into public.qr_memories (code, user_id, destination, kind) values ('zzqxaaaa', A, 'https://probe.invalid/m/zzqxaaaa.mp4', 'clip');
    oa := pg_temp.mk_claimed(A, alb_a, '{zzqxaaaa}');
    r := r || pg_temp.line('E1', 'only on this claimed order: both of its files may go', 'zzqxaaaa.mov,zzqxaaaa.mp4', pg_temp.clips_of(oa));

    -- a pending order (anyone's) still carries it
    perform pg_temp.mk_clip('zzqxbbbb.mp4', A);
    perform pg_temp.mk_order(D, null, '{zzqxbbbb}', 'pending_payment', 'unpaid', now(), now());
    r := r || pg_temp.line('E2', 'a live order still carries the code: kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxbbbb}')));

    -- a cancelled order inside its 3 days (could still be reopened) carries it
    perform pg_temp.mk_clip('zzqxbbcc.mp4', A);
    perform pg_temp.mk_order(D, null, '{zzqxbbcc}', 'cancelled', 'unpaid', now() - interval '2 days', now() - interval '1 day');
    r := r || pg_temp.line('E3', 'a cancelled order that could still be reopened carries it: kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxbbcc}')));

    -- the same album has a paid order whose copy lacks the code (lag)
    alb_p := pg_temp.mk_album(P);
    perform pg_temp.mk_clip('zzqxcccc.mp4', P);
    perform pg_temp.mk_order(P, alb_p, '{zzqxpppp}', 'paid', 'paid', now() - interval '20 days', now() - interval '20 days');
    op := pg_temp.mk_claimed(P, alb_p, '{zzqxcccc}');
    r := r || pg_temp.line('E4', 'the same album has a PAID order (its copy may lag): kept', '', pg_temp.clips_of(op));

    -- album deleted (album_id null), but the customer paid an order after the upload
    perform pg_temp.mk_clip('zzqxqqqq.mp4', Q, now() - interval '2 hours');
    perform pg_temp.mk_order(Q, null, '{}', 'shipped', 'paid', now() - interval '1 hour', now() - interval '1 hour');
    oq := pg_temp.mk_claimed(Q, null, '{zzqxqqqq}');
    r := r || pg_temp.line('E5', 'a paid order placed after the upload (album since deleted): kept', '', pg_temp.clips_of(oq));

    -- the customer's only paid order is from long before the upload
    perform pg_temp.mk_clip('zzqxrrrr.mp4', RR, now() - interval '2 hours');
    perform pg_temp.mk_order(RR, null, '{}', 'delivered', 'paid', now() - interval '20 days', now() - interval '20 days');
    orr := pg_temp.mk_claimed(RR, null, '{zzqxrrrr}');
    r := r || pg_temp.line('E6', '...but a paid order from long before the upload doesn''t protect it', 'zzqxrrrr.mp4', pg_temp.clips_of(orr));

    -- scanned
    perform pg_temp.mk_clip('zzqxdddd.mp4', A);
    insert into public.qr_memories (code, user_id, destination, kind) values ('zzqxdddd', A, 'https://probe.invalid/m/zzqxdddd.mp4', 'clip');
    update public.qr_memories set scan_count = 3 where code = 'zzqxdddd';
    r := r || pg_temp.line('E7', 'someone has scanned it: kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxdddd}')));

    -- another account uploaded the file
    perform pg_temp.mk_clip('zzqxeeee.mp4', B);
    r := r || pg_temp.line('E8', 'another account uploaded the file: kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxeeee}')));

    -- the memory row is another account's
    perform pg_temp.mk_clip('zzqxffff.mp4', A);
    insert into public.qr_memories (code, user_id, destination, kind) values ('zzqxffff', B, 'https://probe.invalid/m/zzqxffff.mp4', 'clip');
    r := r || pg_temp.line('E9', 'the memory row belongs to another account: kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxffff}')));

    -- uploaded but never given a memory row
    perform pg_temp.mk_clip('zzqxgggg.mp4', A);
    og := pg_temp.mk_claimed(A, null, '{zzqxgggg}');
    r := r || pg_temp.line('E10', 'a file uploaded but never given a memory row: may go', 'zzqxgggg.mp4', pg_temp.clips_of(og));

    -- uploaded before 0042 (the old checkout freed the phone copy)
    perform pg_temp.mk_clip('zzqxoldd.mp4', A, now() - interval '40 days');
    r := r || pg_temp.line('E11', 'uploaded before 0042 (maybe the only copy): kept', '', pg_temp.clips_of(pg_temp.mk_claimed(A, null, '{zzqxoldd}')));

    -- not claimed / not cancelled
    perform pg_temp.mk_clip('zzqxhhhh.mp4', A);
    insert into public.qr_memories (code, user_id, destination, kind) values ('zzqxhhhh', A, 'https://probe.invalid/m/zzqxhhhh.mp4', 'clip');
    oh := pg_temp.mk_order(D, null, '{zzqxhhhh}', 'pending_payment', 'unpaid', now(), now());
    r := r || pg_temp.line('E12', 'an order that is not cancelled: nothing', '', pg_temp.clips_of(oh));
    ou := pg_temp.mk_order(A, null, '{zzqxgggg}', 'cancelled', 'unpaid', now() - interval '12 days', now() - interval '4 days');
    r := r || pg_temp.line('E13', 'a cancelled order not yet claimed: nothing', '', pg_temp.clips_of(ou));
    r := r || pg_temp.line('E14', 'a signed-in customer cannot ask', 'REFUSED 42501',
           pg_temp.do_as(A, 'authenticated', format('select public.order_clip_files_to_purge(%L)', oa)));

    -- ── G. Recording the cleanup ─────────────────────────────────────────────
    got := pg_temp.do_as(null, 'service_role', format('select public.finish_order_file_purge(%L, ''{zzqxaaaa}'')::text', oa), 'value');
    r := r || pg_temp.line('G1', 'recording while the files are still there: recorded', 'true', got);
    r := r || pg_temp.line('G2', '...but the memory row stays (its file is not gone)', '1', (select count(*)::text from public.qr_memories where code = 'zzqxaaaa'));
    r := r || pg_temp.line('G3', 'the service role removes the files', 'ALLOWED',
           pg_temp.do_as(null, 'service_role', $q$delete from storage.objects where bucket_id = 'memory-clips' and name in ('zzqxaaaa.mp4', 'zzqxaaaa.mov', 'zzqxdddd.mp4')$q$));
    perform pg_temp.do_as(null, 'service_role', format('select public.finish_order_file_purge(%L, ''{zzqxaaaa}'')', oa), 'value');
    r := r || pg_temp.line('G4', 'once the files are gone the memory row goes too', '0', (select count(*)::text from public.qr_memories where code = 'zzqxaaaa'));
    perform pg_temp.do_as(null, 'service_role', format('select public.finish_order_file_purge(%L, ''{zzqxdddd}'')', oa), 'value');
    r := r || pg_temp.line('G5', 'a scanned memory row is never removed, even with its file gone', '1',
           (select count(*)::text from public.qr_memories where code = 'zzqxdddd'));
    got := pg_temp.do_as(null, 'service_role', format('select public.finish_order_file_purge(%L, ''{zzqxhhhh}'')::text', oh), 'value');
    r := r || pg_temp.line('G6', 'an order that is not cancelled is left alone', 'false', got);
    r := r || pg_temp.line('G7', '...its memory row stays', '1', (select count(*)::text from public.qr_memories where code = 'zzqxhhhh'));
    got := pg_temp.do_as(null, 'service_role', format('select public.finish_order_file_purge(%L, ''{}'')::text', ou), 'value');
    r := r || pg_temp.line('G8', 'an unclaimed order is not recorded', 'false', got);
    r := r || pg_temp.line('G9', 'a signed-in customer cannot record a cleanup', 'REFUSED 42501',
           pg_temp.do_as(A, 'authenticated', format('select public.finish_order_file_purge(%L, ''{}'')', og)));

    -- ── H. A phone asks which of its codes are paid ──────────────────────────
    got := pg_temp.do_as(P, 'authenticated', $q$select array_to_string(public.my_paid_memory_codes('{zzqxpppp,zzqxcccc}'), ',')$q$, 'value');
    r := r || pg_temp.line('H1', 'P: only the code on P''s PAID order', 'zzqxpppp', got);
    got := pg_temp.do_as(B, 'authenticated', $q$select array_to_string(public.my_paid_memory_codes('{zzqxpppp}'), ',')$q$, 'value');
    r := r || pg_temp.line('H2', 'B asking about P''s code gets nothing', '', got);
    r := r || pg_temp.line('H3', 'anon cannot ask', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', $q$select public.my_paid_memory_codes('{zzqxpppp}')$q$));
    r := r || pg_temp.line('H4', 'an empty question gets an empty answer', '',
           pg_temp.do_as(P, 'authenticated', $q$select array_to_string(public.my_paid_memory_codes('{}'), ',')$q$, 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── F. Videos from checkouts that never finished ──────────────────────────
  begin
    perform pg_temp.mk_clip('zzqxorph.mp4', S, now() - interval '8 days');   -- orphan
    perform pg_temp.mk_clip('zzqxrowd.mp4', S, now() - interval '8 days');   -- has a memory row
    insert into public.qr_memories (code, user_id, destination, kind) values ('zzqxrowd', S, 'https://probe.invalid/m/zzqxrowd.mp4', 'clip');
    perform pg_temp.mk_clip('zzqxlive.mp4', S, now() - interval '8 days');   -- a pending order carries it
    perform pg_temp.mk_order(S, null, '{zzqxlive}', 'pending_payment', 'unpaid', now(), now());
    perform pg_temp.mk_clip('zzqxgrac.mp4', S, now() - interval '8 days');   -- a reopenable cancelled order carries it
    perform pg_temp.mk_order(S, null, '{zzqxgrac}', 'cancelled', 'unpaid', now() - interval '2 days', now() - interval '1 day');
    perform pg_temp.mk_clip('zzqxyoun.mp4', S, now() - interval '2 days');   -- too young
    perform pg_temp.mk_clip('zzqxpold.mp4', S, now() - interval '40 days');  -- before 0042
    perform pg_temp.mk_clip('zzqxpaid.mp4', Q, now() - interval '8 days');   -- Q paid an order since
    perform pg_temp.mk_order(Q, null, '{}', 'paid', 'paid', now() - interval '3 days', now() - interval '3 days');
    got := pg_temp.do_as(null, 'service_role', $q$select coalesce(string_agg(object_name, ',' order by object_name), '') from public.orphan_clip_files(1000) where object_name like 'zzqx%'$q$, 'value');
    r := r || pg_temp.line('F1', 'only the 8-day-old video no order, memory or paid order needs', 'zzqxorph.mp4', got);
    r := r || pg_temp.line('F2', 'a signed-in customer cannot list them', 'REFUSED 42501',
           pg_temp.do_as(S, 'authenticated', 'select public.orphan_clip_files(10)'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── I. A closed order takes nothing new ───────────────────────────────────
  begin
    o1 := pg_temp.mk_order(A, null, '{}', 'pending_payment', 'unpaid', now(), now());
    o2 := pg_temp.mk_order(A, null, '{}', 'cancelled', 'unpaid', now(), now());
    r := r || pg_temp.line('I1', 'print file for an OPEN order: allowed', 'ALLOWED',
           pg_temp.do_as(A, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('print-pdfs', %L, auth.uid(), auth.uid()::text)$q$, o1 || '.pdf')));
    r := r || pg_temp.line('I2', 'print file for a CANCELLED order: refused', 'REFUSED 42501',
           pg_temp.do_as(A, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('print-pdfs', %L, auth.uid(), auth.uid()::text)$q$, o2 || '.pdf')));
    r := r || pg_temp.line('I3', 'receipt for a CANCELLED order: refused', 'REFUSED 42501',
           pg_temp.do_as(A, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('payment-proofs', %L, auth.uid(), auth.uid()::text)$q$, o2 || '.png')));
    got := pg_temp.do_as(A, 'authenticated', format('select public.submit_payment_proof(%L, ''REF123'', null)', o2));
    r := r || pg_temp.line('I4', '"I''ve sent" on a cancelled order: refused', 'REFUSED MP003', got);
    r := r || pg_temp.line('I5', '...with what to do', 'true', (got like '%closed because it wasn''t paid within 7 days%message us with your receipt%order it again%')::text);
    r := r || pg_temp.line('I6', '"I''ve sent" on an open order: still works', 'ALLOWED',
           pg_temp.do_as(A, 'authenticated', format('select public.submit_payment_proof(%L, ''REF123'', null)', o1)));
    o3 := pg_temp.mk_order(A, null, '{}', 'paid', 'paid', now(), now());
    r := r || pg_temp.line('I7', 'print file for a PAID order (an upload retried after Mark paid): allowed', 'ALLOWED',
           pg_temp.do_as(A, 'authenticated', format($q$insert into storage.objects (bucket_id, name, owner, owner_id) values ('print-pdfs', %L, auth.uid(), auth.uid()::text)$q$, o3 || '.pdf')));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── J. memory_codes is the database's ─────────────────────────────────────
  begin
    got := pg_temp.do_as(B, 'authenticated',
             $q$insert into public.orders (user_id, album_snapshot, album_size, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street, memory_codes) values (auth.uid(), '{"pages":[{"qrFills":[{"code":"zzqxreal"}]}],"cover_front":{"qrFills":[{"code":"zzqxcovr"}]}}', '8x8', 'Bb Probe', '+639000000001', '2 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '2 Probe St', '{zzqxfake}') returning array_to_string(memory_codes, ',')$q$, 'value');
    r := r || pg_temp.line('J1', 'codes come from the album copy (cover too), not the client', 'zzqxcovr,zzqxreal', got);
    o3 := pg_temp.mk_order(A, null, '{}', 'cancelled', 'unpaid', now(), now());
    perform pg_temp.do_as(A, 'authenticated', format('update public.orders set files_purged_at = now(), purge_started_at = now() where id = %L', o3));
    r := r || pg_temp.line('J2', 'a customer cannot update an order''s bookkeeping', '<null>|<null>',
           (select coalesce(files_purged_at::text, '<null>') || '|' || coalesce(purge_started_at::text, '<null>') from public.orders where id = o3));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('UNPAID EXPIRY PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
