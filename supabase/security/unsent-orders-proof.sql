-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — UNSENT ORDERS PROOF (0068; live-safe, always rolled back)
--
--  The story of MP-2026-9M5572U, on the real schema, without writing anything:
--  an order whose phone stopped after the cover and the first video.
--    A. what is missing is read from Storage and the QR rows: the pages, the
--       second video, and all three QRs' memory rows;
--    B. its customer (and only its customer) sees it as unsent; a visitor
--       can't ask;
--    C. "I've sent the payment" is refused (MP030), and so is In production
--       or Printed, by the owner too (MP031); Mark paid still works;
--    D. the console's list says the same, for operators only;
--    E. once the rest arrives (Finish sending), nothing is missing, it leaves
--       the customer's list, the payment goes through and it can be printed;
--    F. a cancelled order isn't listed; an order whose files were removed
--       has nothing missing.
--
--  Same method as unpaid-expiry-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), made-up accounts
--  (zz-probe-*.invalid) and made-up Storage rows, never committed.
--
--  HOW TO RUN
--    npx supabase db query --linked --file supabase/security/unsent-orders-proof.sql
--  Before 0068 is applied: `begin;` + the migration + this file (minus its
--  own `begin;`) as one file. Every line should say PASS.
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
                   else json_build_object('sub', p_uid, 'role', p_role, 'email', v_email, 'aud', 'authenticated')::text end, true);
    if p_mode = 'value' then
      execute p_sql into v_out;
    else
      execute p_sql;
      v_out := 'ALLOWED';
    end if;
    perform set_config('role', 'none', true),
            set_config('request.jwt.claim.role', '', true),
            set_config('request.jwt.claim.sub', '', true),
            set_config('request.jwt.claims', '', true);
    return coalesce(v_out, '<null>');
  exception when others then
    perform set_config('role', 'none', true);
    return 'REFUSED ' || sqlstate || ' ' || sqlerrm;
  end;
end $$;

create or replace function pg_temp.line(p_id text, p_label text, p_want text, p_got text)
returns text language sql as $$
  select E'\n' || p_id || ' '
      || case when (p_want like 'ALLOWED%' or p_want like 'REFUSED%') and p_got like p_want || '%' then 'PASS'
              when p_got = p_want then 'PASS'
              else 'FAIL' end
      || ' | ' || p_label || ' | want ' || p_want || ' | ' || left(coalesce(p_got, '<null>'), 160);
$$;

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-u' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

-- Two video QRs and one link QR, the way the app saves them: a QR slot on
-- page 1 (with an empty slot beside it), a caption-box QR, and a QR slot in
-- the snake_case spelling on page 2.
create or replace function pg_temp.snap()
returns jsonb language sql as $$
  select jsonb_build_object('title', 'zz probe', 'pages', jsonb_build_array(
    jsonb_build_object('qrFills', jsonb_build_array(jsonb_build_object('code', 'zzpra2', 'kind', 'clip'), null),
                       'textSlotQr', jsonb_build_array(jsonb_build_object('code', 'zzprc2', 'kind', 'link'))),
    jsonb_build_object('qr_fills', jsonb_build_array(jsonb_build_object('code', 'zzprb2', 'kind', 'clip')))));
$$;

create or replace function pg_temp.mk_order(p_user uuid, p_status text default 'pending_payment')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.orders (user_id, album_snapshot, album_size, status, payment_status,
                             ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province,
                             ship_city, ship_barangay, ship_street)
  values (p_user, pg_temp.snap(), '8x8', p_status::public.order_status, 'unpaid',
          'Zz Probe', '+639000000000', '1 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila',
          'Probe City', 'Probe', '1 Probe St')
  returning id into v_id;
  return v_id;
end $$;

create or replace function pg_temp.put(p_bucket text, p_name text)
returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, '{"size": 1}'::jsonb);
$$;

create or replace function pg_temp.missing(p_order uuid)
returns text language sql as $$ select public.order_files_missing(p_order)::text $$;

do $$
declare
  r       text := '';
  cust    uuid := pg_temp.mk_user('cust');
  other   uuid := pg_temp.mk_user('other');
  owner   uuid := pg_temp.mk_user('owner');
  o       uuid;
  paid_o  uuid;
  gone_o  uuid;
  shut_o  uuid;
begin
  insert into public.owner_accounts (user_id, note) values (owner, 'zz probe');

  -- The phone sent the cover and the first video, then stopped.
  o := pg_temp.mk_order(cust);
  perform pg_temp.put('print-pdfs', o::text || '-cover.pdf');
  perform pg_temp.put('memory-clips', 'zzpra2.mp4');

  r := r || pg_temp.line('A1', 'what is missing', '{pages,video:zzprb2,memory:zzpra2,memory:zzprb2,memory:zzprc2}', pg_temp.missing(o));
  r := r || pg_temp.line('A2', 'in words', 'the pages, 1 memory video and 3 QR codes', public.order_missing_words(public.order_files_missing(o)));

  r := r || pg_temp.line('B1', 'its customer sees it unsent', o::text,
    pg_temp.do_as(cust, 'authenticated', 'select string_agg(order_id::text, '','') from public.my_unsent_orders()', 'value'));
  r := r || pg_temp.line('B2', '... with what is missing', '{pages,video:zzprb2,memory:zzpra2,memory:zzprb2,memory:zzprc2}',
    pg_temp.do_as(cust, 'authenticated', 'select missing::text from public.my_unsent_orders() limit 1', 'value'));
  r := r || pg_temp.line('B3', 'another customer sees nothing', '<null>',
    pg_temp.do_as(other, 'authenticated', 'select string_agg(order_id::text, '','') from public.my_unsent_orders()', 'value'));
  r := r || pg_temp.line('B4', 'a visitor can''t ask', 'REFUSED 42501',
    pg_temp.do_as(null, 'anon', 'select * from public.my_unsent_orders()'));

  r := r || pg_temp.line('C1', 'I''ve sent the payment: refused', 'REFUSED MP030',
    pg_temp.do_as(cust, 'authenticated', format('select public.submit_payment_proof(%L::uuid, %L, null)', o, 'REF1')));
  r := r || pg_temp.line('C2', '... and nothing was written', '<null>',
    coalesce((select payment_submitted_at::text from public.orders where id = o), '<null>'));
  r := r || pg_temp.line('C3', 'owner: In production refused', 'REFUSED MP031',
    pg_temp.do_as(owner, 'authenticated', format('select public.set_order_status(%L::uuid, %L)', o, 'in_production')));
  r := r || pg_temp.line('C4', '... the owner''s words name what never arrived', 'true',
    (pg_temp.do_as(owner, 'authenticated', format('select public.set_order_status(%L::uuid, %L)', o, 'in_production')) like '%the pages, 1 memory video and 3 QR codes never arrived%')::text);
  r := r || pg_temp.line('C5', 'a straight update to Printed refused too', 'REFUSED MP031',
    pg_temp.do_as(null, 'postgres', format('update public.orders set status = %L where id = %L', 'printed', o)));

  paid_o := pg_temp.mk_order(cust);
  r := r || pg_temp.line('C6', 'owner: Mark paid still works on an unsent order', 'ALLOWED',
    pg_temp.do_as(owner, 'authenticated', format('select public.set_order_status(%L::uuid, %L)', paid_o, 'paid')));
  r := r || pg_temp.line('C7', '... and it stays on the customer''s unsent list', 'true',
    (pg_temp.do_as(cust, 'authenticated', 'select string_agg(order_id::text, '','') from public.my_unsent_orders()', 'value') like '%' || paid_o::text || '%')::text);

  r := r || pg_temp.line('D1', 'console: an operator sees what is missing', '{pages,video:zzprb2,memory:zzpra2,memory:zzprb2,memory:zzprc2}',
    pg_temp.do_as(owner, 'authenticated', format('select missing::text from public.operator_orders_unsent(array[%L::uuid])', o), 'value'));
  r := r || pg_temp.line('D2', 'console: a customer can''t ask', 'REFUSED',
    pg_temp.do_as(cust, 'authenticated', format('select * from public.operator_orders_unsent(array[%L::uuid])', o)));

  -- Finish sending: the rest arrives.
  perform pg_temp.put('print-pdfs', o::text || '.pdf');
  perform pg_temp.put('memory-clips', 'zzprb2.mp4');
  insert into public.qr_memories (code, user_id, destination, kind) values
    ('zzpra2', cust, 'https://probe.invalid/zzpra2.mp4', 'clip'),
    ('zzprb2', cust, 'https://probe.invalid/zzprb2.mp4', 'clip'),
    ('zzprc2', cust, 'https://www.youtube.com/watch?v=zzprobe', 'link');

  r := r || pg_temp.line('E1', 'nothing missing', '{}', pg_temp.missing(o));
  r := r || pg_temp.line('E2', 'it leaves the customer''s list', 'false',
    (pg_temp.do_as(cust, 'authenticated', 'select coalesce(string_agg(order_id::text, '',''), '''') from public.my_unsent_orders()', 'value') like '%' || o::text || '%')::text);
  r := r || pg_temp.line('E3', 'I''ve sent the payment goes through', 'ALLOWED',
    pg_temp.do_as(cust, 'authenticated', format('select public.submit_payment_proof(%L::uuid, %L, null)', o, 'REF1')));
  r := r || pg_temp.line('E4', 'owner: Mark paid, then In production', 'ALLOWED',
    pg_temp.do_as(owner, 'authenticated', format('select public.set_order_status(%L::uuid, %L); select public.set_order_status(%L::uuid, %L)', o, 'paid', o, 'in_production')));
  r := r || pg_temp.line('E5', '... it is in production', 'in_production', (select status::text from public.orders where id = o));

  shut_o := pg_temp.mk_order(other, 'cancelled');
  r := r || pg_temp.line('F1', 'a cancelled order isn''t listed', '<null>',
    pg_temp.do_as(other, 'authenticated', 'select string_agg(order_id::text, '','') from public.my_unsent_orders()', 'value'));
  gone_o := pg_temp.mk_order(other);
  update public.orders set files_purged_at = now() where id = gone_o;
  r := r || pg_temp.line('F2', 'files removed: nothing "missing"', '{}', pg_temp.missing(gone_o));

  raise exception 'UNSENT ORDERS PROOF (rolled back):%', r;
end $$;
