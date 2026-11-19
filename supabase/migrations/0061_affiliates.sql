-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0061_affiliates.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-15): "lets go with affiliates". People who send us
--  customers (photographers, coordinators, creators) get a code and a link.
--  Their customer gets money off; they earn a commission, paid by GCash once
--  the album is delivered. "Become an affiliate" lives in the app: the
--  person applies from their own account, the owner approves, and the
--  account gets an Affiliate page with their code, link and earnings.
--
--  WHAT:
--   1. store_settings: the program switch (OFF until the owner turns it on),
--      the commission rate (10%), the customer's discount (₱100), how long a
--      link counts (30 days) and the smallest payout (₱500). Owner-only, like
--      the rest of the row (0025). affiliate_program() shows them to anyone:
--      the page that invites people to join needs them.
--   2. affiliates: one application per account. pending → approved (with a
--      code) or rejected; approved ↔ paused. A turned-down person may apply
--      again 30 days after.
--   3. check_order_code(code): the checkout's one code box. The tester code
--      (0057) first, then an approved affiliate code while the program is on.
--      Wrong tries share 0057's limit (10 an hour per account). Your own code
--      answers "own": no money off your own order.
--   4. orders.affiliate_code / affiliate_id: an order placed with a code. The
--      trigger takes it only if the code is approved, the program is on, it
--      is not the customer's own and the order has no tester code; then the
--      order asks the discount less (quoted_amount) and its quote keeps the
--      code, the discount and the real total. A code that stopped working
--      refuses the order (MP009): checkout showed the lower price. Nobody can
--      add or change the code after.
--   5. affiliate_commissions: one row per order, made when the order is PAID
--      (rate × the album price less the discount; extra pages and add-ons
--      earn nothing). It follows the order: paid → shipped is "pending",
--      delivered is "payable", cancelled (or back to unpaid) is "void".
--      Paid rows never change. Flagged when the delivery phone is the
--      affiliate's GCash number or the name is theirs (self-referral).
--   6. affiliate_payouts: the owner pays everything payable in one GCash
--      transfer and records its reference; those rows become "paid".
--   7. my_affiliate(): the person's own page — status, code, totals, each
--      sale (date, size, cover, amount, status; never the customer) and the
--      payouts. apply_affiliate(): the application form.
--   8. Owner: owner_affiliates(), owner_affiliate_sales(), owner_decide_affiliate()
--      (approve with a code / reject / pause / resume), owner_set_affiliate_rate(),
--      owner_pay_affiliate(), owner_void_commission().
--
--  orders.affiliate_id has NO foreign key on purpose: an account deletion
--  that removes an affiliate would null it through an UPDATE, which the pin
--  in (4) refuses. The commission rows hold the real link.
--
--  Run AFTER 0060.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The owner's settings ══════
alter table public.store_settings add column if not exists affiliate_on boolean not null default false;
alter table public.store_settings add column if not exists affiliate_rate_pct numeric(5,2) not null default 10;
alter table public.store_settings add column if not exists affiliate_discount integer not null default 100;
alter table public.store_settings add column if not exists affiliate_window_days integer not null default 30;
alter table public.store_settings add column if not exists affiliate_min_payout integer not null default 500;

alter table public.store_settings drop constraint if exists store_settings_affiliate_chk;
alter table public.store_settings add constraint store_settings_affiliate_chk check (
  affiliate_rate_pct >= 0 and affiliate_rate_pct <= 50
  and affiliate_discount >= 0 and affiliate_discount <= 2000
  and affiliate_window_days between 1 and 365
  and affiliate_min_payout between 0 and 100000);

create or replace function public.affiliate_program()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'on',          coalesce(s.affiliate_on, false),
           'rate_pct',    s.affiliate_rate_pct,
           'discount',    s.affiliate_discount,
           'window_days', s.affiliate_window_days,
           'min_payout',  s.affiliate_min_payout)
    from public.store_settings s
   where s.id = 1;
$$;
revoke all on function public.affiliate_program() from public;
grant execute on function public.affiliate_program() to anon, authenticated;

-- ══════ 2. Tables (closed: only the functions below read or write them) ══════
create table if not exists public.affiliates (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  status        text not null default 'pending',
  code          text unique,
  full_name     text not null,
  gcash_number  text not null,
  tin           text,
  promote_where text not null,
  rate_pct      numeric(5,2),
  agreed_at     timestamptz not null default now(),
  applied_at    timestamptz not null default now(),
  decided_at    timestamptz,
  constraint affiliates_status_chk check (status in ('pending', 'approved', 'rejected', 'paused')),
  constraint affiliates_code_chk   check (code is null or code ~ '^[A-Z0-9]{3,20}$'),
  constraint affiliates_name_chk   check (char_length(full_name) between 2 and 80),
  constraint affiliates_gcash_chk  check (gcash_number ~ '^\+639[0-9]{9}$'),
  constraint affiliates_tin_chk    check (tin is null or tin ~ '^[0-9]{9,14}$'),
  constraint affiliates_where_chk  check (char_length(promote_where) between 3 and 300),
  constraint affiliates_rate_chk   check (rate_pct is null or (rate_pct >= 0 and rate_pct <= 50)),
  constraint affiliates_code_when  check (status not in ('approved', 'paused') or code is not null)
);

create table if not exists public.affiliate_payouts (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  amount       integer not null check (amount > 0),
  reference    text not null check (char_length(reference) between 1 and 64),
  paid_at      timestamptz not null default now(),
  paid_by      uuid references auth.users(id) on delete set null
);
create index if not exists affiliate_payouts_affiliate on public.affiliate_payouts (affiliate_id, paid_at desc);

create table if not exists public.affiliate_commissions (
  id           uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  order_id     uuid unique references public.orders(id) on delete set null,
  order_number text,
  album_size   text,
  cover        text,
  base_amount  integer not null,
  rate_pct     numeric(5,2) not null,
  amount       integer not null check (amount >= 0),
  status       text not null default 'pending' check (status in ('pending', 'payable', 'paid', 'void')),
  flag         text,
  owner_voided boolean not null default false,
  earned_at    timestamptz not null default now(),
  payable_at   timestamptz,
  void_at      timestamptz,
  paid_at      timestamptz,
  payout_id    uuid references public.affiliate_payouts(id) on delete set null
);
create index if not exists affiliate_commissions_affiliate on public.affiliate_commissions (affiliate_id, earned_at desc);

alter table public.affiliates enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_commissions enable row level security;
-- No policies: customers and the owner both go through the functions below.
revoke all on public.affiliates, public.affiliate_payouts, public.affiliate_commissions from public, anon, authenticated;

-- ══════ Small helpers ══════
-- As the code box compares: no spaces, capitals.
create or replace function public.affiliate_clean_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p, ''), '\s', '', 'g'));
$$;
revoke all on function public.affiliate_clean_code(text) from public, anon, authenticated;

-- A PH mobile number as +639XXXXXXXXX, or null: 0917…, 63917…, +63 917…, 917….
create or replace function public.affiliate_clean_phone(p text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d ~ '^09[0-9]{9}$' then return '+63' || substr(d, 2); end if;
  if d ~ '^639[0-9]{9}$' then return '+' || d; end if;
  if d ~ '^9[0-9]{9}$' then return '+63' || d; end if;
  return null;
end;
$$;
revoke all on function public.affiliate_clean_phone(text) from public, anon, authenticated;

-- What a commission is while its order is in this status (paid rows aside).
create or replace function public.affiliate_commission_target(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_status = 'delivered' then 'payable'
           when p_status in ('paid', 'in_production', 'printed', 'shipped') then 'pending'
           else 'void'
         end;
$$;
revoke all on function public.affiliate_commission_target(text) from public, anon, authenticated;

-- ══════ 7. The person's own page ══════
create or replace function public.my_affiliate()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  a       public.affiliates;
  v_rate  numeric;
  -- The first moment of this month in the Philippines.
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila';
begin
  if v_uid is null then return null; end if;
  select * into a from public.affiliates where user_id = v_uid;
  if not found then
    return jsonb_build_object('program', public.affiliate_program(), 'affiliate', null);
  end if;
  select coalesce(a.rate_pct, s.affiliate_rate_pct) into v_rate from public.store_settings s where s.id = 1;
  return jsonb_build_object(
    'program', public.affiliate_program(),
    'affiliate', jsonb_build_object(
      'status',       a.status,
      'code',         case when a.status in ('approved', 'paused') then a.code end,
      'full_name',    a.full_name,
      'gcash_last4',  right(a.gcash_number, 4),
      'rate_pct',     coalesce(v_rate, a.rate_pct),
      'applied_at',   a.applied_at,
      'decided_at',   a.decided_at,
      'reapply_from', case when a.status = 'rejected' then a.decided_at + interval '30 days' end),
    'totals', (
      select jsonb_build_object(
               'sales',      count(*) filter (where c.status <> 'void'),
               'pending',    coalesce(sum(c.amount) filter (where c.status = 'pending'), 0),
               'payable',    coalesce(sum(c.amount) filter (where c.status = 'payable'), 0),
               'paid',       coalesce(sum(c.amount) filter (where c.status = 'paid'), 0),
               'this_month', coalesce(sum(c.amount) filter (where c.status <> 'void' and c.earned_at >= v_month), 0),
               'all_time',   coalesce(sum(c.amount) filter (where c.status <> 'void'), 0))
        from public.affiliate_commissions c
       where c.affiliate_id = a.id),
    -- Each sale: when, what kind of album, what it earned. Never who bought it.
    'sales', coalesce((
      select jsonb_agg(jsonb_build_object(
               'earned_at',  x.earned_at,
               'album_size', x.album_size,
               'cover',      x.cover,
               'amount',     x.amount,
               'status',     x.status,
               'paid_at',    x.paid_at) order by x.earned_at desc)
        from (select * from public.affiliate_commissions c
               where c.affiliate_id = a.id
               order by c.earned_at desc
               limit 200) x), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object('amount', p.amount, 'reference', p.reference, 'paid_at', p.paid_at)
                       order by p.paid_at desc)
        from public.affiliate_payouts p
       where p.affiliate_id = a.id), '[]'::jsonb));
end;
$$;
revoke all on function public.my_affiliate() from public, anon;
grant execute on function public.my_affiliate() to authenticated;

-- ══════ 2b. Applying ══════
create or replace function public.apply_affiliate(
  p_full_name text, p_gcash text, p_tin text, p_promote_where text, p_agree boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_phone text := public.affiliate_clean_phone(p_gcash);
  v_tin   text := nullif(regexp_replace(coalesce(p_tin, ''), '\D', '', 'g'), '');
  v_where text := btrim(coalesce(p_promote_where, ''));
  v_on    boolean;
  a       public.affiliates;
begin
  if v_uid is null then
    raise exception 'Sign in to apply.' using errcode = '42501';
  end if;
  select affiliate_on into v_on from public.store_settings where id = 1;
  if not coalesce(v_on, false) then
    raise exception 'The affiliate program isn''t open right now.' using errcode = 'MP010';
  end if;
  if not coalesce(p_agree, false) then
    raise exception 'Please agree to the affiliate terms.' using errcode = 'MP010';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Please type your full name.' using errcode = 'MP010';
  end if;
  if v_phone is null then
    raise exception 'Please type your GCash number, like 0917 123 4567.' using errcode = 'MP010';
  end if;
  if v_tin is not null and v_tin !~ '^[0-9]{9,14}$' then
    raise exception 'A TIN has 9 to 14 digits. Leave it empty if you don''t have one yet.' using errcode = 'MP010';
  end if;
  if char_length(v_where) < 3 or char_length(v_where) > 300 then
    raise exception 'Tell us where you''ll share your code.' using errcode = 'MP010';
  end if;

  select * into a from public.affiliates where user_id = v_uid for update;
  if found then
    if a.status <> 'rejected' then
      raise exception 'You already applied.' using errcode = 'MP010';
    end if;
    if a.decided_at > now() - interval '30 days' then
      raise exception 'You can apply again from %.',
        to_char((a.decided_at + interval '30 days') at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY')
        using errcode = 'MP010';
    end if;
    update public.affiliates
       set status = 'pending', full_name = v_name, gcash_number = v_phone, tin = v_tin,
           promote_where = v_where, agreed_at = now(), applied_at = now(), decided_at = null
     where id = a.id;
  else
    insert into public.affiliates (user_id, full_name, gcash_number, tin, promote_where)
    values (v_uid, v_name, v_phone, v_tin, v_where);
  end if;
  return public.my_affiliate();
end;
$$;
revoke all on function public.apply_affiliate(text, text, text, text, boolean) from public, anon;
grant execute on function public.apply_affiliate(text, text, text, text, boolean) to authenticated;

-- ══════ 3. The checkout's code box ══════
-- tester_code_tries (0057) now counts every code typed here.
create or replace function public.check_order_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := public.affiliate_clean_code(p_code);
  v_wrong integer;
  s       record;
  v_have  boolean;
  a       public.affiliates;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in');
  end if;
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  delete from public.tester_code_tries where user_id = v_uid and at < now() - interval '2 days';
  select count(*) into v_wrong from public.tester_code_tries
   where user_id = v_uid and not ok and at > now() - interval '1 hour';
  if v_wrong >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;

  select tester_code, tester_code_on, affiliate_on, affiliate_discount, affiliate_window_days into s
    from public.store_settings where id = 1;
  v_have := found;
  if v_have and s.tester_code_on and s.tester_code is not null and v_code = s.tester_code then
    insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
    return jsonb_build_object('ok', true, 'kind', 'tester', 'code', s.tester_code);
  end if;
  if v_have and s.affiliate_on then
    select * into a from public.affiliates where code = v_code and status = 'approved';
    if found then
      insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
      if a.user_id = v_uid then
        return jsonb_build_object('ok', false, 'reason', 'own');
      end if;
      -- window_days: how long a ?ref= link the app kept still counts.
      return jsonb_build_object('ok', true, 'kind', 'affiliate', 'code', a.code,
                                'discount', greatest(0, coalesce(s.affiliate_discount, 0)),
                                'window_days', s.affiliate_window_days);
    end if;
  end if;
  -- Wrong, paused, or the program is off: the same answer, so nothing can be probed.
  insert into public.tester_code_tries (user_id, ok) values (v_uid, false);
  return jsonb_build_object('ok', false, 'reason', 'wrong');
end;
$$;
revoke all on function public.check_order_code(text) from public, anon;
grant execute on function public.check_order_code(text) to authenticated;

-- ══════ 4. The code on an order ══════
alter table public.orders add column if not exists affiliate_code text;
alter table public.orders add column if not exists affiliate_id uuid;  -- no FK: see the header
create index if not exists orders_affiliate_id on public.orders (affiliate_id) where affiliate_id is not null;

create or replace function public.orders_with_affiliate_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code     text;
  s          record;
  a          public.affiliates;
  v_discount integer;
begin
  if tg_op = 'UPDATE' then
    new.affiliate_code := old.affiliate_code;
    new.affiliate_id   := old.affiliate_id;
    return new;
  end if;
  new.affiliate_id := null;  -- only this trigger names the affiliate
  v_code := public.affiliate_clean_code(new.affiliate_code);
  if v_code = '' then
    new.affiliate_code := null;
    return new;
  end if;
  if new.tester_code is not null then
    raise exception 'One code per order: the tester code already makes this album free.' using errcode = 'MP009';
  end if;
  if new.event_booking_id is not null then
    raise exception 'Codes don''t apply to an event album: the booking pays for it.' using errcode = 'MP009';
  end if;
  select affiliate_on, affiliate_discount into s from public.store_settings where id = 1;
  select * into a from public.affiliates where code = v_code and status = 'approved';
  if not found or not coalesce(s.affiliate_on, false) then
    raise exception 'The code % doesn''t work any more. Remove it to order at the normal price.', left(v_code, 24)
      using errcode = 'MP009';
  end if;
  if a.user_id = new.user_id then
    raise exception 'Your own code can''t take money off your own order. Remove it to order at the normal price.'
      using errcode = 'MP009';
  end if;

  v_discount := greatest(0, coalesce(s.affiliate_discount, 0));
  if new.quoted_amount is not null then
    v_discount := least(v_discount, new.quoted_amount);
  end if;
  new.affiliate_id   := a.id;
  new.affiliate_code := a.code;
  -- 0055's quote stays null when the price couldn't be worked out: a record,
  -- not a gate. With one, it keeps the code, the discount and the real total.
  if new.quote is not null then
    new.quote := new.quote || jsonb_build_object('affiliate', jsonb_build_object(
                   'code', a.code, 'discount', v_discount, 'real_total', new.quote -> 'total'));
  end if;
  if new.quoted_amount is not null then
    new.quoted_amount := new.quoted_amount - v_discount;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_with_affiliate_code() from public, anon, authenticated;

-- BEFORE triggers fire in name order: this runs after orders_quote_trg (the
-- price) and orders_tester_code_trg (a tester code), so it sees both.
drop trigger if exists orders_with_affiliate_code_trg on public.orders;
create trigger orders_with_affiliate_code_trg
  before insert or update on public.orders
  for each row execute function public.orders_with_affiliate_code();

-- ══════ 5. Commissions follow the order ══════
create or replace function public.orders_affiliate_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target text := public.affiliate_commission_target(new.status::text);
  a        public.affiliates;
  v_rate   numeric;
  v_base   integer;
  v_flag   text;
begin
  if new.affiliate_id is null then return null; end if;

  -- Earned the first time the order is paid (or later, if it skipped ahead).
  if v_target <> 'void' and not exists (select 1 from public.affiliate_commissions c where c.order_id = new.id) then
    select * into a from public.affiliates where id = new.affiliate_id;
    if not found then return null; end if;
    select coalesce(a.rate_pct, s.affiliate_rate_pct) into v_rate from public.store_settings s where s.id = 1;
    v_rate := coalesce(v_rate, a.rate_pct, 0);
    -- The album with its included pages, less the customer's discount.
    v_base := case
                when new.quote is null or (new.quote ->> 'album') is null then 0
                else greatest(0, (new.quote ->> 'album')::integer
                                 - coalesce((new.quote -> 'affiliate' ->> 'discount')::integer, 0))
              end;
    v_flag := case
                when new.quote is null then 'no_price'
                when public.affiliate_clean_phone(new.ship_phone) = a.gcash_number then 'same_phone'
                when lower(btrim(coalesce(new.ship_name, ''))) = lower(a.full_name) then 'same_name'
              end;
    insert into public.affiliate_commissions
      (affiliate_id, order_id, order_number, album_size, cover, base_amount, rate_pct, amount, status, flag, payable_at)
    values
      (a.id, new.id, new.order_number, new.album_size, new.cover, v_base, v_rate,
       floor(v_base * v_rate / 100 + 0.5)::integer, v_target, v_flag,
       case when v_target = 'payable' then now() end)
    on conflict (order_id) do nothing;
    return null;
  end if;

  update public.affiliate_commissions c
     set status     = v_target,
         payable_at = case when v_target = 'payable' then coalesce(c.payable_at, now()) end,
         void_at    = case when v_target = 'void' then now() end
   where c.order_id = new.id
     and c.status <> 'paid'
     and not c.owner_voided
     and c.status <> v_target;
  return null;
end;
$$;
revoke all on function public.orders_affiliate_commission() from public, anon, authenticated;

drop trigger if exists orders_affiliate_commission_trg on public.orders;
create trigger orders_affiliate_commission_trg
  after insert or update of status on public.orders
  for each row when (new.affiliate_id is not null)
  execute function public.orders_affiliate_commission();

-- ══════ 8. The owner ══════
create or replace function public.owner_affiliates()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see affiliates.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'sort_key' order by x.sort_key, x.applied_at desc)
      from (
        select a.id, a.status, a.code, a.full_name, u.email::text as email, a.gcash_number, a.tin,
               a.promote_where, a.rate_pct, a.applied_at, a.decided_at,
               case a.status when 'pending' then 0 when 'approved' then 1 when 'paused' then 2 else 3 end as sort_key,
               coalesce(c.sales, 0)   as sales,
               coalesce(c.pending, 0) as pending,
               coalesce(c.payable, 0) as payable,
               coalesce(c.paid, 0)    as paid,
               coalesce(c.flagged, 0) as flagged
          from public.affiliates a
          left join auth.users u on u.id = a.user_id
          left join lateral (
            select count(*) filter (where cc.status <> 'void')                        as sales,
                   sum(cc.amount) filter (where cc.status = 'pending')                as pending,
                   sum(cc.amount) filter (where cc.status = 'payable')                as payable,
                   sum(cc.amount) filter (where cc.status = 'paid')                   as paid,
                   count(*) filter (where cc.flag is not null and cc.status <> 'void') as flagged
              from public.affiliate_commissions cc
             where cc.affiliate_id = a.id) c on true
      ) x), '[]'::jsonb);
end;
$$;
revoke all on function public.owner_affiliates() from public, anon;
grant execute on function public.owner_affiliates() to authenticated;

create or replace function public.owner_affiliate_sales(p_affiliate_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can see affiliate sales.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',           c.id,
             'order_id',     c.order_id,
             'order_number', c.order_number,
             'order_status', o.status::text,
             'album_size',   c.album_size,
             'cover',        c.cover,
             'earned_at',    c.earned_at,
             'base_amount',  c.base_amount,
             'rate_pct',     c.rate_pct,
             'amount',       c.amount,
             'status',       c.status,
             'flag',         c.flag,
             'owner_voided', c.owner_voided,
             'paid_at',      c.paid_at) order by c.earned_at desc)
      from public.affiliate_commissions c
      left join public.orders o on o.id = c.order_id
     where c.affiliate_id = p_affiliate_id), '[]'::jsonb);
end;
$$;
revoke all on function public.owner_affiliate_sales(uuid) from public, anon;
grant execute on function public.owner_affiliate_sales(uuid) to authenticated;

create or replace function public.owner_decide_affiliate(p_id uuid, p_action text, p_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a        public.affiliates;
  v_code   text := public.affiliate_clean_code(p_code);
  v_tester text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can decide on affiliates.' using errcode = '42501';
  end if;
  select * into a from public.affiliates where id = p_id for update;
  if not found then
    raise exception 'Affiliate not found.' using errcode = 'MP010';
  end if;

  if p_action = 'approve' then
    if a.status not in ('pending', 'rejected') then
      raise exception 'Only a waiting or turned-down application can be approved.' using errcode = 'MP010';
    end if;
    if v_code !~ '^[A-Z0-9]{3,20}$' then
      raise exception 'A code is 3 to 20 letters or numbers, no spaces.' using errcode = 'MP010';
    end if;
    select tester_code into v_tester from public.store_settings where id = 1;
    if v_code = v_tester then
      raise exception '% is the tester code. Pick another.', v_code using errcode = 'MP010';
    end if;
    begin
      update public.affiliates set status = 'approved', code = v_code, decided_at = now() where id = a.id;
    exception when unique_violation then
      raise exception 'The code % is taken. Pick another.', v_code using errcode = 'MP010';
    end;
  elsif p_action = 'reject' then
    if a.status <> 'pending' then
      raise exception 'Only a waiting application can be turned down.' using errcode = 'MP010';
    end if;
    update public.affiliates set status = 'rejected', decided_at = now() where id = a.id;
  elsif p_action = 'pause' then
    if a.status <> 'approved' then
      raise exception 'Only an active affiliate can be paused.' using errcode = 'MP010';
    end if;
    update public.affiliates set status = 'paused' where id = a.id;
  elsif p_action = 'resume' then
    if a.status <> 'paused' then
      raise exception 'Only a paused affiliate can be resumed.' using errcode = 'MP010';
    end if;
    update public.affiliates set status = 'approved' where id = a.id;
  else
    raise exception 'Unknown action %.', p_action using errcode = 'MP010';
  end if;
  return public.owner_affiliates();
end;
$$;
revoke all on function public.owner_decide_affiliate(uuid, text, text) from public, anon;
grant execute on function public.owner_decide_affiliate(uuid, text, text) to authenticated;

-- Null = the program's rate.
create or replace function public.owner_set_affiliate_rate(p_id uuid, p_rate numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the owner can change a rate.' using errcode = '42501';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 50) then
    raise exception 'A rate is 0 to 50%%.' using errcode = 'MP010';
  end if;
  update public.affiliates set rate_pct = p_rate where id = p_id;
  if not found then
    raise exception 'Affiliate not found.' using errcode = 'MP010';
  end if;
  return public.owner_affiliates();
end;
$$;
revoke all on function public.owner_set_affiliate_rate(uuid, numeric) from public, anon;
grant execute on function public.owner_set_affiliate_rate(uuid, numeric) to authenticated;

-- Pays everything payable (and worth something) in one transfer.
create or replace function public.owner_pay_affiliate(p_id uuid, p_reference text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref   text := btrim(coalesce(p_reference, ''));
  v_total integer;
  v_n     integer;
  v_pay   uuid;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can record a payout.' using errcode = '42501';
  end if;
  if char_length(v_ref) < 1 or char_length(v_ref) > 64 then
    raise exception 'Type the GCash reference number of the transfer.' using errcode = 'MP010';
  end if;
  perform 1 from public.affiliates where id = p_id for update;  -- one payout at a time
  if not found then
    raise exception 'Affiliate not found.' using errcode = 'MP010';
  end if;
  select coalesce(sum(amount), 0), count(*) into v_total, v_n
    from public.affiliate_commissions
   where affiliate_id = p_id and status = 'payable' and amount > 0;
  if v_n = 0 then
    raise exception 'Nothing to pay yet: a sale becomes payable when its album is delivered.' using errcode = 'MP010';
  end if;
  insert into public.affiliate_payouts (affiliate_id, amount, reference, paid_by)
  values (p_id, v_total, v_ref, auth.uid())
  returning id into v_pay;
  update public.affiliate_commissions
     set status = 'paid', paid_at = now(), payout_id = v_pay
   where affiliate_id = p_id and status = 'payable' and amount > 0;
  return jsonb_build_object('amount', v_total, 'count', v_n);
end;
$$;
revoke all on function public.owner_pay_affiliate(uuid, text) from public, anon;
grant execute on function public.owner_pay_affiliate(uuid, text) to authenticated;

-- Void one sale (self-referral, a refund the status doesn't show), or undo that.
create or replace function public.owner_void_commission(p_id uuid, p_void boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c   public.affiliate_commissions;
  v_s text;
  v_t text;
begin
  if not public.is_owner() then
    raise exception 'Only the owner can void a commission.' using errcode = '42501';
  end if;
  select * into c from public.affiliate_commissions where id = p_id for update;
  if not found then
    raise exception 'Commission not found.' using errcode = 'MP010';
  end if;
  if c.status = 'paid' then
    raise exception 'This commission is already paid.' using errcode = 'MP010';
  end if;
  if coalesce(p_void, false) then
    update public.affiliate_commissions
       set owner_voided = true, status = 'void', void_at = now(), payable_at = null
     where id = c.id;
  else
    select o.status::text into v_s from public.orders o where o.id = c.order_id;
    v_t := case when v_s is null then 'void' else public.affiliate_commission_target(v_s) end;
    update public.affiliate_commissions
       set owner_voided = false,
           status       = v_t,
           void_at      = case when v_t = 'void' then now() end,
           payable_at   = case when v_t = 'payable' then coalesce(c.payable_at, now()) end
     where id = c.id;
  end if;
  return public.owner_affiliate_sales(c.affiliate_id);
end;
$$;
revoke all on function public.owner_void_commission(uuid, boolean) from public, anon;
grant execute on function public.owner_void_commission(uuid, boolean) to authenticated;

-- ══════ Verify ══════
select 'store_settings has the affiliate settings (program off until the owner turns it on)' as check,
  (select (affiliate_rate_pct is not null and affiliate_discount is not null)::text from public.store_settings where id = 1) as result
union all
select 'both order triggers in place',
  (exists (select 1 from pg_trigger where tgname = 'orders_with_affiliate_code_trg' and not tgisinternal)
   and exists (select 1 from pg_trigger where tgname = 'orders_affiliate_commission_trg' and not tgisinternal))::text
union all
select 'affiliate tables closed to customers and visitors',
  (not has_table_privilege('authenticated', 'public.affiliates', 'SELECT')
   and not has_table_privilege('anon', 'public.affiliates', 'SELECT')
   and not has_table_privilege('authenticated', 'public.affiliate_commissions', 'SELECT')
   and not has_table_privilege('authenticated', 'public.affiliate_payouts', 'SELECT'))::text
union all
select 'customer functions: authenticated yes, anon no; the program info: anyone',
  (has_function_privilege('authenticated', 'public.check_order_code(text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.check_order_code(text)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.my_affiliate()', 'EXECUTE')
   and not has_function_privilege('anon', 'public.apply_affiliate(text, text, text, text, boolean)', 'EXECUTE')
   and has_function_privilege('anon', 'public.affiliate_program()', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.orders_with_affiliate_code()', 'EXECUTE'))::text;
