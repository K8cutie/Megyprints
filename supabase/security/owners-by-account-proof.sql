-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — OWNERS BY ACCOUNT PROOF (0058; live-safe, always rolled back)
--
--  Proves, on the real schema, without writing anything:
--    A. the owner list holds the built-in owners who sign in with Google, and
--       no customer or visitor can read it or add themselves;
--    B. the real owner account still has everything;
--    C. a DIFFERENT account whose login says megyprints@gmail.com gets
--       nothing an owner gets (the hole 0058 closes): no orders, no prices,
--       no settings, no print files, no status changes, no Team;
--    D. a Team role needs an account MADE by a Google sign-in with that
--       exact, verified email, and no password sign-in on it;
--    E. an owner account can't be deleted; a customer's still can;
--    F. nothing in the database decides on the login email any more.
--
--  Same method as unpaid-expiry-proof.sql: one transaction that ENDS BY
--  RAISING (the report is the error message), made-up accounts
--  (zz-probe-own-*.invalid) that are never committed, every scenario in its
--  own subtransaction. E1 tries to delete the real owner account; the
--  database refuses, and the transaction is rolled back regardless.
--
--  HOW TO RUN
--    npx supabase db query --linked --file supabase/security/owners-by-account-proof.sql
-- ════════════════════════════════════════════════════════════════════════════
begin;

-- Run p_sql as p_role, logged in as account p_sub with p_email in the login.
create or replace function pg_temp.as_login(p_sub uuid, p_email text, p_role text, p_sql text, p_mode text default 'value')
returns text language plpgsql as $$
declare v_out text;
begin
  begin
    perform set_config('role', p_role, true),
            set_config('request.jwt.claim.role', p_role, true),
            set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true),
            set_config('request.jwt.claims',
              case when p_sub is null then json_build_object('role', p_role)::text
                   else json_build_object('sub', p_sub, 'role', p_role, 'email', p_email, 'aud', 'authenticated')::text end, true);
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

-- A made-up account with the given sign-ins ('google', 'email').
create or replace function pg_temp.mk_user(p_email text, p_providers text[], p_google_email text default null, p_verified boolean default true)
returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid(); p text;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email, '{}', '{}', now(), now());
  foreach p in array p_providers loop
    insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (case when p = 'email' then v::text else 'zz-probe-' || gen_random_uuid()::text end, v,
            jsonb_build_object('sub', v::text, 'email', case when p = 'google' then coalesce(p_google_email, p_email) else p_email end, 'email_verified', p_verified),
            p, now(), now());
  end loop;
  return v;
end $$;

do $proof$
declare
  r      text := '';
  got    text;
  want   text;
  fails  int;
  total  int;
  owner  uuid;
  owner_email text;
  orders_all text;
  pdfs_all   text;
  fake   uuid := gen_random_uuid();
  g uuid; pw uuid; linked uuid; other uuid; cust uuid; unver uuid; late uuid;
begin
  select o.user_id, u.email into owner, owner_email
    from public.owner_accounts o join auth.users u on u.id = o.user_id order by o.created_at, o.user_id limit 1;
  select count(*)::text into orders_all from public.orders;
  select count(*)::text into pdfs_all from storage.objects where bucket_id = 'print-pdfs';

  -- ── A. The owner list ─────────────────────────────────────────────────────
  begin
    select count(*)::text into want from auth.users u
     where lower(u.email) in ('archgarcia@gmail.com', 'megyprints@gmail.com')
       and public.google_born_email(u.id) = lower(u.email);
    select count(*)::text into got from public.owner_accounts o join auth.users u on u.id = o.user_id
     where lower(u.email) in ('archgarcia@gmail.com', 'megyprints@gmail.com');
    r := r || pg_temp.line('A1', 'the built-in owners whose accounts Google made are the owners', want, got);
    cust := pg_temp.mk_user('zz-probe-own-cust@probe.invalid', '{email}');
    r := r || pg_temp.line('A2', 'a customer cannot read the owner list', 'REFUSED 42501',
           pg_temp.as_login(cust, 'zz-probe-own-cust@probe.invalid', 'authenticated', 'select count(*)::text from public.owner_accounts'));
    r := r || pg_temp.line('A3', 'a visitor cannot read it', 'REFUSED 42501',
           pg_temp.as_login(null, null, 'anon', 'select count(*)::text from public.owner_accounts'));
    r := r || pg_temp.line('A4', 'a customer cannot add themselves', 'REFUSED 42501',
           pg_temp.as_login(cust, 'zz-probe-own-cust@probe.invalid', 'authenticated',
             'insert into public.owner_accounts (user_id) values (auth.uid())', 'try'));
    r := r || pg_temp.line('A5', 'a customer cannot ask whose email Google proved', 'REFUSED 42501',
           pg_temp.as_login(cust, 'zz-probe-own-cust@probe.invalid', 'authenticated', 'select public.google_born_email(auth.uid())'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── B. The real owner keeps everything ────────────────────────────────────
  begin
    if owner is null then
      r := r || pg_temp.line('B0', 'there is an owner account to test', 'yes', 'no');
    else
      r := r || pg_temp.line('B1', 'the owner account is the owner', 'owner',
             pg_temp.as_login(owner, owner_email, 'authenticated', 'select public.operator_role()'));
      r := r || pg_temp.line('B2', 'it sees every order', orders_all,
             pg_temp.as_login(owner, owner_email, 'authenticated', 'select count(*)::text from public.orders'));
      r := r || pg_temp.line('B3', 'it reads the price model', 'ALLOWED',
             pg_temp.as_login(owner, owner_email, 'authenticated', 'select public.owner_pricing_model()', 'try'));
      r := r || pg_temp.line('B4', 'it sees every print file', pdfs_all,
             pg_temp.as_login(owner, owner_email, 'authenticated', $q$select count(*)::text from storage.objects where bucket_id = 'print-pdfs'$q$));
      r := r || pg_temp.line('B5', 'it reads the Team list', 'ALLOWED',
             pg_temp.as_login(owner, owner_email, 'authenticated', 'select count(*) from public.operator_roles', 'try'));
    end if;
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── C. Another account with the owner's email in its login ────────────────
  begin
    r := r || pg_temp.line('C1', 'not an owner', '<null>',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('C2', 'is_owner() says no', 'false',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', 'select public.is_owner()::text'));
    r := r || pg_temp.line('C3', 'sees no orders', '0',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', 'select count(*)::text from public.orders'));
    r := r || pg_temp.line('C4', 'cannot read the price model', 'REFUSED 42501',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', 'select public.owner_pricing_model()'));
    -- Live grants customers SELECT on the table (RLS hides the row); a database
    -- built from the migrations alone grants nothing. Either way: no row.
    got := pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', 'select count(*)::text from public.pricing_model');
    r := r || pg_temp.line('C5', 'sees no pricing_model row', '0', case when got like 'REFUSED 42501%' then '0' else got end);
    r := r || pg_temp.line('C6', 'changes no store setting', '0',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated',
             'with u as (update public.store_settings set price_multiple = price_multiple returning 1) select count(*)::text from u'));
    r := r || pg_temp.line('C7', 'sees no print file', '0',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', $q$select count(*)::text from storage.objects where bucket_id = 'print-pdfs'$q$));
    r := r || pg_temp.line('C8', 'cannot change an order''s status', 'REFUSED P0001 not authorized',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated', format('select public.set_order_status(%L, %L)::text', gen_random_uuid(), 'paid')));
    r := r || pg_temp.line('C9', 'cannot add to the Team', 'REFUSED 42501',
           pg_temp.as_login(fake, 'megyprints@gmail.com', 'authenticated',
             $q$insert into public.operator_roles (email, role) values ('zz-probe-own-x@probe.invalid', 'owner')$q$, 'try'));
    r := r || pg_temp.line('C10', 'cannot set a price', 'REFUSED 42501',
           pg_temp.as_login(fake, 'archgarcia@gmail.com', 'authenticated', 'select public.set_shipping_allowance(0)::text'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── D. Team roles need a Google sign-in with that email ───────────────────
  begin
    insert into public.operator_roles (email, role) values
      ('zz-probe-own-g@probe.invalid', 'fulfillment'),
      ('zz-probe-own-pw@probe.invalid', 'fulfillment'),
      ('zz-probe-own-ln@probe.invalid', 'fulfillment'),
      ('zz-probe-own-o@probe.invalid', 'owner'),
      ('zz-probe-own-uv@probe.invalid', 'fulfillment'),
      ('zz-probe-own-late@probe.invalid', 'fulfillment');
    g      := pg_temp.mk_user('zz-probe-own-g@probe.invalid', '{google}');
    pw     := pg_temp.mk_user('zz-probe-own-pw@probe.invalid', '{email}');
    linked := pg_temp.mk_user('zz-probe-own-ln@probe.invalid', '{email,google}');
    other  := pg_temp.mk_user('zz-probe-own-oth@probe.invalid', '{google}', 'zz-probe-own-oth@probe.invalid');
    unver  := pg_temp.mk_user('zz-probe-own-uv@probe.invalid', '{google}', null, false);
    late   := pg_temp.mk_user('zz-probe-own-late@probe.invalid', '{google}');
    -- An account made an hour before its Google sign-in (another sign-in made it; Google was joined on later).
    update auth.users set created_at = now() - interval '1 hour' where id = late;
    r := r || pg_temp.line('D1', 'Google sign-in with the Team email: the role', 'fulfillment',
           pg_temp.as_login(g, 'zz-probe-own-g@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D2', '...and the Team''s order list', orders_all,
           pg_temp.as_login(g, 'zz-probe-own-g@probe.invalid', 'authenticated', 'select public.operator_orders_count()::text'));
    r := r || pg_temp.line('D3', 'password sign-in with the Team email: nothing', '<null>',
           pg_temp.as_login(pw, 'zz-probe-own-pw@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D4', 'password account with Google joined on: nothing', '<null>',
           pg_temp.as_login(linked, 'zz-probe-own-ln@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D5', 'made-up account with the Team email in its login: nothing', '<null>',
           pg_temp.as_login(gen_random_uuid(), 'zz-probe-own-g@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D6', 'Google sign-in with another email: nothing', '<null>',
           pg_temp.as_login(other, 'zz-probe-own-g@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D9', 'Google says the email is not verified: nothing', '<null>',
           pg_temp.as_login(unver, 'zz-probe-own-uv@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D10', 'Google joined onto an older account: nothing', '<null>',
           pg_temp.as_login(late, 'zz-probe-own-late@probe.invalid', 'authenticated', 'select public.operator_role()'));
    r := r || pg_temp.line('D7', 'a Team member is not on the owner list', 'false',
           pg_temp.as_login(g, 'zz-probe-own-g@probe.invalid', 'authenticated', 'select public.is_owner()::text'));
    r := r || pg_temp.line('D8', 'a Team member sees no order rows directly', '0',
           pg_temp.as_login(g, 'zz-probe-own-g@probe.invalid', 'authenticated', 'select count(*)::text from public.orders'));
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── E. Deleting accounts ──────────────────────────────────────────────────
  begin
    if owner is not null then
      begin
        delete from auth.users where id = owner;
        got := 'ALLOWED';
      exception when others then
        got := 'REFUSED ' || sqlstate || ' ' || sqlerrm;
      end;
      r := r || pg_temp.line('E1', 'an owner account cannot be deleted', 'REFUSED 23503', got);
    end if;
    cust := pg_temp.mk_user('zz-probe-own-del@probe.invalid', '{email}');
    begin
      delete from auth.users where id = cust;
      got := 'ALLOWED';
    exception when others then
      got := 'REFUSED ' || sqlstate || ' ' || sqlerrm;
    end;
    r := r || pg_temp.line('E2', 'a customer account still can', 'ALLOWED', got);
    raise exception using errcode = 'MPOK0';
  exception when sqlstate 'MPOK0' then null;
  end;

  -- ── F. Nothing decides on the login email ─────────────────────────────────
  select coalesce(string_agg(x, ', '), '') into got from (
    select 'function ' || p.proname as x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'storage') and p.prokind = 'f'
       and ((p.prosrc ilike '%jwt()%' and p.prosrc ilike '%email%')
            or p.prosrc ilike '%auth.email()%' or p.prosrc ilike '%request.jwt.claim%')
    union all
    select 'policy ' || tablename || ' "' || policyname || '"'
      from pg_policies
     where schemaname in ('public', 'storage')
       and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(jwt\(\)|auth\.email\(\)|request\.jwt\.claim)') s;
  r := r || pg_temp.line('F1', 'no function or policy reads the login email', '', got);

  fails := (length(r) - length(replace(r, ' FAIL |', ''))) / length(' FAIL |');
  total := (length(r) - length(replace(r, E'\n', '')));
  raise exception using message = format('OWNERS BY ACCOUNT PROOF — %s/%s PASS (rolled back; nothing written)%s',
                                         total - fails, total, r);
end
$proof$;
