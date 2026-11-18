-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — DELIVERED PRINT FILES PROOF (0064; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    D1–D6  which delivered orders are due: delivered 90+ days ago only;
--           never an order delivered 89 days ago, one still on its way, one
--           with no delivery date in its history (updated_at keeps it), an
--           order copies print from, or a copy order;
--    D7–D10 claim, then no going back to printing (MP010), an unclaimed
--           order still can go back; finish records it once, it leaves the
--           list, and a refund can still cancel it;
--    D11–D13 only the service role can list, claim or finish; anyone can
--           read the number of days.
--
--  Same method as unpaid-expiry-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), a made-up account
--  (zz-probe-*.invalid), fixture orders inserted as the table owner.
--
--  HOW TO RUN (local test database):
--    docker exec -i supabase_db_megyprints_testers psql -U postgres < supabase/security/delivered-files-proof.sql
--  To prove 0064 before applying it: `begin;` + the migration + this file
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

create or replace function pg_temp.mk_user(p_tag text)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-probe-x' || p_tag || '@probe.invalid', '{}', '{}', now(), now());
  return v;
end $$;

-- A fixture order, inserted as the table owner, then put where the case needs
-- it. p_delivered_days_ago null = no "delivered" entry in its history.
create or replace function pg_temp.mk_delivered(p_user uuid, p_status text, p_delivered_days_ago integer)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.orders (user_id, album_snapshot, album_size, ship_name, ship_phone, ship_address, ship_zip, ship_region, ship_province, ship_city, ship_barangay, ship_street)
  values (p_user, '{}', '8x8', 'Dd Probe', '+639000000004', '4 Probe Street, Probe City', '0000', 'NCR', 'Metro Manila', 'Probe City', 'Probe', '4 Probe St')
  returning id into v;
  update public.orders
     set status = p_status::public.order_status,
         payment_status = 'paid',
         status_history = coalesce(status_history, '[]'::jsonb)
           || case when p_delivered_days_ago is null then '[]'::jsonb
                   else jsonb_build_array(jsonb_build_object('status', 'delivered', 'at', now() - make_interval(days => p_delivered_days_ago), 'by', 'owner')) end
   where id = v;
  return v;
end $$;

create or replace function pg_temp.due_list()
returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', 'service_role', true);
  select coalesce(string_agg(order_id::text, ','), '') into v from public.orders_due_for_delivered_file_purge(500);
  perform set_config('role', 'none', true);
  return v;
end $$;

do $proof$
declare
  U uuid;
  o_old uuid; o_recent uuid; o_shipped uuid; o_nodate uuid; o_source uuid; o_copy uuid; o_back uuid;
  r text := '';
  got text;
  fails int;
  total int;
begin
  U := pg_temp.mk_user('dlv');

  begin
    o_old     := pg_temp.mk_delivered(U, 'delivered', 91);
    o_recent  := pg_temp.mk_delivered(U, 'delivered', 89);
    o_shipped := pg_temp.mk_delivered(U, 'shipped', null);
    update public.orders set status_history = status_history || jsonb_build_array(jsonb_build_object('status', 'delivered', 'at', now() - interval '200 days')) where id = o_shipped;
    o_nodate  := pg_temp.mk_delivered(U, 'delivered', null);
    o_source  := pg_temp.mk_delivered(U, 'delivered', 120);
    o_copy    := pg_temp.mk_delivered(U, 'delivered', 120);
    update public.orders set copy_of_order_id = o_source where id = o_copy;
    o_back    := pg_temp.mk_delivered(U, 'delivered', 30);

    got := pg_temp.due_list();
    r := r || pg_temp.line('D1', 'delivered 91 days ago is due', 'true', (position(o_old::text in got) > 0)::text);
    r := r || pg_temp.line('D2', 'delivered 89 days ago is not', 'false', (position(o_recent::text in got) > 0)::text);
    r := r || pg_temp.line('D3', 'an order still on its way (shipped) is not, whatever its history says', 'false', (position(o_shipped::text in got) > 0)::text);
    r := r || pg_temp.line('D4', 'delivered with no delivery date in its history is not (updated_at keeps it)', 'false', (position(o_nodate::text in got) > 0)::text);
    r := r || pg_temp.line('D5', 'an order copies print from is not', 'false', (position(o_source::text in got) > 0)::text);
    r := r || pg_temp.line('D6', 'a copy order is not', 'false', (position(o_copy::text in got) > 0)::text);

    got := pg_temp.do_as(null, 'service_role', format('select public.claim_delivered_order_file_purge(%L)::text', o_old), 'value');
    r := r || pg_temp.line('D7', 'the job claims the due order', 'true', got);
    got := pg_temp.do_as(null, 'service_role', format('select public.claim_delivered_order_file_purge(%L)::text', o_recent), 'value');
    r := r || pg_temp.line('D7b', '...but not one that is not due', 'false', got);
    got := pg_temp.do_as(null, 'postgres', format('update public.orders set status = %L where id = %L', 'printed', o_old));
    r := r || pg_temp.line('D8', 'a claimed order cannot go back to printing', 'REFUSED MP010', got);
    r := r || pg_temp.line('D8b', '...with the sentence', 'true', (got like '%print files were removed 90 days after it was delivered%order the album again from their phone%')::text);
    got := pg_temp.do_as(null, 'postgres', format('update public.orders set status = %L where id = %L', 'printed', o_back));
    r := r || pg_temp.line('D9', 'an unclaimed delivered order can still go back to printing', 'ALLOWED', got);
    got := pg_temp.do_as(null, 'service_role', format('select public.finish_delivered_order_file_purge(%L)::text', o_old), 'value');
    r := r || pg_temp.line('D10', 'the job records the removal', 'true', got);
    got := pg_temp.do_as(null, 'service_role', format('select public.finish_delivered_order_file_purge(%L)::text', o_old), 'value');
    r := r || pg_temp.line('D10b', '...once', 'false', got);
    r := r || pg_temp.line('D10c', '...and it leaves the list', 'false', (position(o_old::text in pg_temp.due_list()) > 0)::text);
    r := r || pg_temp.line('D10d', '...files_purged_at is set', 'true', (select (files_purged_at is not null)::text from public.orders where id = o_old));
    got := pg_temp.do_as(null, 'postgres', format('update public.orders set status = %L where id = %L', 'cancelled', o_old));
    r := r || pg_temp.line('D10e', 'a removed order can still be cancelled (a refund)', 'ALLOWED', got);

    r := r || pg_temp.line('D11', 'a customer cannot list due orders', 'REFUSED 42501',
           pg_temp.do_as(U, 'authenticated', 'select * from public.orders_due_for_delivered_file_purge(5)'));
    r := r || pg_temp.line('D11b', 'a customer cannot claim', 'REFUSED 42501',
           pg_temp.do_as(U, 'authenticated', format('select public.claim_delivered_order_file_purge(%L)', o_recent)));
    r := r || pg_temp.line('D11c', 'a customer cannot finish', 'REFUSED 42501',
           pg_temp.do_as(U, 'authenticated', format('select public.finish_delivered_order_file_purge(%L)', o_recent)));
    r := r || pg_temp.line('D12', 'anon cannot claim', 'REFUSED 42501',
           pg_temp.do_as(null, 'anon', format('select public.claim_delivered_order_file_purge(%L)', o_recent)));
    r := r || pg_temp.line('D13', 'anyone can read the number of days', '90',
           pg_temp.do_as(null, 'anon', 'select public.delivered_files_keep_days()::text', 'value'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('DELIVERED PRINT FILES PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
