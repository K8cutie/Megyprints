-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0058_owners_by_account.sql  (idempotent; safe to re-run)
--
--  WHY (audit 2026-10-27, owner: "fix all three ... so it goes live"):
--  owner rights went by the email written in the login, checked against two
--  Gmails typed into 7 policies and 9 functions. Since 2026-10-01 a new email
--  sign-up is confirmed at once, with no email sent, so anyone can make an
--  account for an address they don't own. Both owner Gmails had accounts, so
--  nobody could take them that day. But two things would have opened it:
--    • an owner deleting their own account (Settings → Delete my account)
--      frees the address, and the next sign-up with it was a full owner;
--    • the Team tab adds people by email. Anyone who signed up with that
--      email before the real person did got the role.
--  Proof on live: a made-up account id with megyprints@gmail.com in its login
--  saw 20/20 orders, 17/17 print files, the payment receipt.
--
--  WHAT:
--   1. owner_accounts: the owners by ACCOUNT ID. Filled here with the two
--      built-in owners' accounts, and only if the account signs in with
--      Google with that Gmail (Google proves the inbox; both do). Customers
--      can't read or change it. An owner account can't be deleted while it
--      is listed (on delete restrict), so "Delete my account" stops instead
--      of freeing the address — and an owner can't lock themselves out.
--   2. is_owner() = the signed-in account is in owner_accounts. Every place
--      that compared the login email to the two Gmails now asks is_owner():
--      the 7 policies (orders, pricing_model, store_settings,
--      template_settings, operator_roles) and the 8 owner functions (bodies
--      copied from their latest migration; only the check line changed).
--   3. operator_role(): 'owner' for owner_accounts; a Team role only for an
--      account that signs in with Google with that exact email AND has no
--      email-and-password sign-in. (A password account made first for
--      someone else's address gets their Google sign-in joined onto it when
--      they arrive, so a password on the account means the inbox was never
--      proven.) Every function and storage policy that calls operator_role()
--      follows.
--
--  Not changed: who sees what. The two Gmails keep everything they had; a
--  Team member keeps what their role gave. The admin page's email check in
--  the app (src/lib/templateSettings.ts) only chose what to show; the app now
--  asks operator_role() instead.
--
--  ADD AN OWNER LATER: insert their account id into public.owner_accounts
--  (SQL editor or `supabase db query --linked`). A fresh local database has
--  no owners until you do.
--
--  Run AFTER 0057. (0056 belongs to another open change and touches none of
--  this; push with --include-all if 0056 is still unapplied.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The owners, by account ══════
create table if not exists public.owner_accounts (
  user_id    uuid primary key references auth.users (id) on delete restrict,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.owner_accounts enable row level security;
-- No policies: customers can't read or write it. The database functions read
-- it as its owner; the server (service role) reads it for account deletion.
revoke all on public.owner_accounts from public, anon, authenticated;
grant select on public.owner_accounts to service_role;

insert into public.owner_accounts (user_id, note)
select u.id, lower(u.email)
  from auth.users u
 where lower(u.email) in ('archgarcia@gmail.com', 'megyprints@gmail.com')
   and exists (select 1 from auth.identities i
                where i.user_id = u.id and i.provider = 'google'
                  and lower(i.identity_data ->> 'email') = lower(u.email))
on conflict (user_id) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.owner_accounts;
  raise notice 'owner_accounts: % owner account(s)', n;
end $$;

-- ══════ 2. is_owner() ══════
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.owner_accounts o where o.user_id = auth.uid());
$$;
revoke all on function public.is_owner() from public;
-- anon too: a policy that names it is checked for every caller.
grant execute on function public.is_owner() to anon, authenticated, service_role;

-- ══════ 3. operator_role() ══════
create or replace function public.operator_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_owner() then 'owner'
    else (select r.role
            from public.operator_roles r
           where exists (select 1 from auth.identities g
                          where g.user_id = auth.uid() and g.provider = 'google'
                            and lower(g.identity_data ->> 'email') = lower(r.email))
             and not exists (select 1 from auth.identities p
                              where p.user_id = auth.uid() and p.provider = 'email')
           order by case r.role when 'owner' then 0 else 1 end
           limit 1)
  end;
$$;
revoke all on function public.operator_role() from public;
grant execute on function public.operator_role() to anon, authenticated, service_role;

-- ══════ 4. The policies ══════
drop policy if exists "owners manage roles" on public.operator_roles;
create policy "owners manage roles" on public.operator_roles for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
-- The app reads a person's own role through operator_role() now, so the row
-- itself is owner-only.
drop policy if exists "read own role or owner reads all" on public.operator_roles;
drop policy if exists "owners read the team" on public.operator_roles;
create policy "owners read the team" on public.operator_roles for select to authenticated
  using ((select public.is_owner()));

drop policy if exists "Admin can view all orders" on public.orders;
create policy "Admin can view all orders" on public.orders for select to authenticated
  using ((select public.is_owner()));
drop policy if exists "Admin can update orders" on public.orders;
create policy "Admin can update orders" on public.orders for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "Owners manage pricing model" on public.pricing_model;
create policy "Owners manage pricing model" on public.pricing_model for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "Owners write store settings" on public.store_settings;
create policy "Owners write store settings" on public.store_settings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "Admin can write template settings" on public.template_settings;
create policy "Admin can write template settings" on public.template_settings for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ══════ 5. The owner functions ══════
-- Each body is its latest migration's, with
--   if coalesce(auth.jwt() ->> 'email', '') not in (<the two Gmails>) then
-- changed to
--   if not public.is_owner() then

-- owner_pricing_model (from 0041_free_shipping_and_was_price.sql)
create or replace function public.owner_pricing_model()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m    public.pricing_model%rowtype;
  srow jsonb;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into m from public.pricing_model where id = 1;
  if not found then return null; end if;
  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;

  return jsonb_build_object(
    'sheet_cost',         m.sheet_cost,
    'soft_cover_cost',    m.soft_cover_cost,
    'soft_bind_cost',     m.soft_bind_cost,
    'min_pages',          m.min_pages,
    'hosting_reserve',    m.hosting_reserve,
    'hosting_tiers',      m.hosting_tiers,
    'hd_memories_price',  m.hd_memories_price,
    'shipping_allowance', m.shipping_allowance,
    'compare_multiple',   m.compare_multiple,
    'compare_until',      to_char(m.compare_until, 'YYYY-MM-DD'),
    'sizes',              m.sizes,
    'price_multiple',     coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;
revoke all on function public.owner_pricing_model() from public;
revoke execute on function public.owner_pricing_model() from anon;
grant execute on function public.owner_pricing_model() to authenticated;

-- set_shipping_allowance (from 0041_free_shipping_and_was_price.sql)
create or replace function public.set_shipping_allowance(p_amount integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000 then
    raise exception 'Shipping must be between 0 and 10000' using errcode = '22023';
  end if;
  update public.pricing_model
     set shipping_allowance = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;
revoke all on function public.set_shipping_allowance(integer) from public;
revoke execute on function public.set_shipping_allowance(integer) from anon;
grant execute on function public.set_shipping_allowance(integer) to authenticated;

-- set_price_compare (from 0041_free_shipping_and_was_price.sql)
create or replace function public.set_price_compare(p_multiple numeric, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  mult  numeric;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_multiple is null and p_until is null then
    update public.pricing_model
       set compare_multiple = null, compare_until = null, updated_at = now()
     where id = 1;
    return jsonb_build_object('compare_multiple', null, 'compare_until', null);
  end if;

  select coalesce(price_multiple, 3) into mult from public.store_settings where id = 1;
  if p_multiple is null or p_until is null then
    raise exception 'Set both the old multiple and the end date, or clear both' using errcode = '22023';
  end if;
  if p_multiple <= coalesce(mult, 3) or p_multiple > 10 or p_multiple * 4 <> round(p_multiple * 4) then
    raise exception 'The old multiple must be a quarter step above today''s (%), up to 10', mult using errcode = '22023';
  end if;
  if p_until < today or p_until > today + 183 then
    raise exception 'The end date must be between today and % (6 months)', today + 183 using errcode = '22023';
  end if;

  update public.pricing_model
     set compare_multiple = p_multiple, compare_until = p_until, updated_at = now()
   where id = 1;
  return jsonb_build_object('compare_multiple', p_multiple, 'compare_until', to_char(p_until, 'YYYY-MM-DD'));
end
$$;
revoke all on function public.set_price_compare(numeric, date) from public;
revoke execute on function public.set_price_compare(numeric, date) from anon;
grant execute on function public.set_price_compare(numeric, date) to authenticated;

-- set_hd_memories_price (from 0032_hd_memories.sql)
create or replace function public.set_hd_memories_price(p_amount integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then
    raise exception 'HD price must be between 0 and 100000' using errcode = '22023';
  end if;
  update public.pricing_model
     set hd_memories_price = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;
revoke all on function public.set_hd_memories_price(integer) from public;
revoke execute on function public.set_hd_memories_price(integer) from anon;
grant execute on function public.set_hd_memories_price(integer) to authenticated;

-- set_hosting_tiers (from 0030_hosted_memories.sql)
create or replace function public.set_hosting_tiers(p_tiers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t jsonb;
  n integer := 0;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) < 1
     or jsonb_array_length(p_tiers) > 8 then
    raise exception 'hosting tiers must be an array of 1–8 entries' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_tiers) loop
    n := n + 1;
    if jsonb_typeof(t -> 'years') <> 'number' or jsonb_typeof(t -> 'price') <> 'number'
       or (t ->> 'years')::numeric < 1 or (t ->> 'years')::numeric > 50
       or (t ->> 'price')::numeric < 0 or (t ->> 'price')::numeric > 100000 then
      raise exception 'tier % must be {years: 1–50, price: 0–100000}', n using errcode = '22023';
    end if;
  end loop;
  update public.pricing_model
     set hosting_tiers = p_tiers, updated_at = now()
   where id = 1;
  return p_tiers;
end
$$;
revoke all on function public.set_hosting_tiers(jsonb) from public;
revoke execute on function public.set_hosting_tiers(jsonb) from anon;
grant execute on function public.set_hosting_tiers(jsonb) to authenticated;

-- apply_order_hosting_term (from 0030_hosted_memories.sql)
create or replace function public.apply_order_hosting_term(p_order_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o     public.orders%rowtype;
  codes text[];
  n     integer := 0;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.hosting_years is null then return 0; end if;

  select array_agg(distinct f ->> 'code') into codes
    from jsonb_array_elements(coalesce(o.album_snapshot -> 'pages', '[]'::jsonb)) p,
         jsonb_array_elements(
           coalesce(p -> 'qrFills', p -> 'qr_fills', '[]'::jsonb)
           || coalesce(p -> 'textSlotQr', p -> 'text_slot_qr', '[]'::jsonb)) f
   where jsonb_typeof(f) = 'object' and (f ->> 'code') ~ '^[a-z2-9]{4,32}$';
  if codes is null then return 0; end if;

  update public.qr_memories m
     set expires_at = m.created_at + make_interval(years => o.hosting_years)
   where m.code = any(codes)
     and m.user_id = o.user_id
     and m.kind = 'clip';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.apply_order_hosting_term(uuid) from public;
revoke execute on function public.apply_order_hosting_term(uuid) from anon;
grant execute on function public.apply_order_hosting_term(uuid) to authenticated;

-- renew_memory (from 0030_hosted_memories.sql)
create or replace function public.renew_memory(p_code text, p_years integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare new_exp timestamptz;
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_years is null or p_years < 1 or p_years > 50 then
    raise exception 'years must be 1–50' using errcode = '22023';
  end if;
  update public.qr_memories
     set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(years => p_years)
   where code = p_code
  returning expires_at into new_exp;
  return new_exp;
end
$$;
revoke all on function public.renew_memory(text, integer) from public;
revoke execute on function public.renew_memory(text, integer) from anon;
grant execute on function public.renew_memory(text, integer) to authenticated;

-- set_hosting_reserve (from 0029_hosting_reserve.sql)
create or replace function public.set_hosting_reserve(p_amount integer)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000 then
    raise exception 'hosting reserve must be between 0 and 10000' using errcode = '22023';
  end if;
  update public.pricing_model
     set hosting_reserve = p_amount, updated_at = now()
   where id = 1;
  return p_amount;
end
$$;
revoke all on function public.set_hosting_reserve(integer) from public;
revoke execute on function public.set_hosting_reserve(integer) from anon;
grant execute on function public.set_hosting_reserve(integer) to authenticated;

-- ══════ 6. Self-check: nothing decides on the login email any more ══════
-- Fails the migration (and so rolls it back) if any public function or policy
-- still reads the email out of the login.
do $$
declare bad text;
begin
  select string_agg(x, ', ') into bad from (
    select 'function ' || p.proname as x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'storage') and p.prokind = 'f'
       and p.prosrc ilike '%jwt()%' and p.prosrc ilike '%email%'
    union all
    select 'policy ' || schemaname || '.' || tablename || ' "' || policyname || '"'
      from pg_policies
     where schemaname in ('public', 'storage')
       and coalesce(qual, '') || coalesce(with_check, '') ilike '%jwt()%'
  ) s;
  if bad is not null then
    raise exception '0058: still decided by the login email: %', bad;
  end if;
end $$;
