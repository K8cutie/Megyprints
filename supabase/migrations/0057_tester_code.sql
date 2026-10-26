-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0057_tester_code.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-10-26, testing phase): "build MEGYTEST. Testers see the
--  real price, type the code, and the album is free: no pay step, straight to
--  thank-you, order arrives Paid and marked as a tester order." Then: "ignore
--  the 0 and 1 price. the code to make the album free is the way to go."
--
--  WHAT:
--   1. store_settings.tester_code / tester_code_on. Owner-only like the rest
--      of the row (0025). Starts as MEGYTEST, on.
--   2. check_tester_code(code): a signed-in customer asks whether a code works.
--      10 wrong tries an hour per account, then it stops answering.
--   3. orders.tester_code: sent with a new order. orders_tester_code_trg takes
--      it only if it is the code that is on AND this account checked it first
--      (so an order can't be used to guess codes), then the order asks ₱0
--      (quoted_amount) and its quote keeps the real price beside it. A wrong
--      or switched-off code refuses the order (MP007): it was shown as free.
--      Nobody can add or change the code on an order after.
--   4. claim_tester_order(order): a tester order, its files in, marks itself
--      Paid and its memory years start, as "Mark paid" would.
--   5. operator_orders() also returns tester_code, to every operator: the
--      shop must see which orders are tests.
--
--  Kept apart from 0055's order_quote()/orders_quote(): its own trigger runs
--  after orders_quote_trg (BEFORE triggers fire in name order) and only adds
--  to what that one worked out.
--
--  Run AFTER 0055. (0056 belongs to another open change and touches none of
--  this; push with --include-all if 0056 is still unapplied.)
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The code, on the owner's settings row ══════
alter table public.store_settings add column if not exists tester_code text;
alter table public.store_settings add column if not exists tester_code_on boolean not null default false;

alter table public.store_settings drop constraint if exists store_settings_tester_code_chk;
alter table public.store_settings add constraint store_settings_tester_code_chk
  check (tester_code is null or tester_code ~ '^[A-Z0-9]{4,24}$');

-- The owner's ask: MEGYTEST, on. Only when no code was ever set.
update public.store_settings
   set tester_code = 'MEGYTEST', tester_code_on = true, updated_at = now()
 where id = 1 and tester_code is null;

-- ══════ 2. "Does this code work?" ══════
create table if not exists public.tester_code_tries (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ok      boolean not null,
  at      timestamptz not null default now()
);
create index if not exists tester_code_tries_user_at on public.tester_code_tries (user_id, at desc);
alter table public.tester_code_tries enable row level security;
-- No policies: only the functions below (security definer) read or write it.
revoke all on public.tester_code_tries from public, anon, authenticated;
revoke all on sequence public.tester_code_tries_id_seq from public, anon, authenticated;

create or replace function public.check_tester_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_wrong integer;
  s       record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'sign_in');
  end if;
  delete from public.tester_code_tries where user_id = v_uid and at < now() - interval '2 days';
  select count(*) into v_wrong from public.tester_code_tries
   where user_id = v_uid and not ok and at > now() - interval '1 hour';
  if v_wrong >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  select tester_code, tester_code_on into s from public.store_settings where id = 1;
  if found and s.tester_code_on and s.tester_code is not null and v_code = s.tester_code then
    insert into public.tester_code_tries (user_id, ok) values (v_uid, true);
    return jsonb_build_object('ok', true, 'code', s.tester_code);
  end if;
  -- Wrong, or switched off: the same answer, so the switch can't be probed.
  insert into public.tester_code_tries (user_id, ok) values (v_uid, false);
  return jsonb_build_object('ok', false, 'reason', 'wrong');
end;
$$;
revoke all on function public.check_tester_code(text) from public, anon;
grant execute on function public.check_tester_code(text) to authenticated;

-- ══════ 3. The code on an order ══════
alter table public.orders add column if not exists tester_code text;

create or replace function public.orders_tester_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  s      record;
begin
  if tg_op = 'UPDATE' then
    new.tester_code := old.tester_code;
    return new;
  end if;
  v_code := upper(regexp_replace(coalesce(new.tester_code, ''), '\s', '', 'g'));
  if v_code = '' then
    new.tester_code := null;
    return new;
  end if;
  select tester_code, tester_code_on into s from public.store_settings where id = 1;
  if not found or not s.tester_code_on or s.tester_code is null or v_code <> s.tester_code
     or not exists (select 1 from public.tester_code_tries t
                     where t.user_id = new.user_id and t.ok and t.at > now() - interval '1 day') then
    raise exception 'The tester code % doesn''t work any more. Remove it to order at the normal price.', left(v_code, 24)
      using errcode = 'MP007';
  end if;
  new.tester_code   := s.tester_code;
  new.quote         := coalesce(new.quote, '{}'::jsonb)
                       || jsonb_build_object('tester', jsonb_build_object(
                            'code', s.tester_code, 'real_total', new.quote -> 'total'));
  new.quoted_amount := 0;
  return new;
end;
$$;
revoke all on function public.orders_tester_code() from public, anon, authenticated;

drop trigger if exists orders_tester_code_trg on public.orders;
create trigger orders_tester_code_trg
  before insert or update on public.orders
  for each row execute function public.orders_tester_code();

-- ══════ 4. A tester order pays itself ══════
create or replace function public.claim_tester_order(p_order_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o     public.orders;
  codes text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in to order.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Order not found.' using errcode = 'MP008';
  end if;
  if o.tester_code is null then
    raise exception 'This order isn''t free with a tester code.' using errcode = 'MP008';
  end if;
  -- Asked twice (a retry after a lost answer): it is already done.
  if o.status = 'paid' and o.payment_status = 'paid' then
    return;
  end if;
  if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' then
    raise exception 'This order can''t be marked paid now.' using errcode = 'MP008';
  end if;
  update public.orders
     set status         = 'paid',
         payment_status = 'paid',
         amount         = 0,
         status_history = coalesce(status_history, '[]'::jsonb)
                          || jsonb_build_object('status', 'paid', 'at', now(), 'by', 'tester_code')
   where id = o.id;
  -- The memory years the order was placed with start now, read from the album
  -- copy exactly as apply_order_hosting_term (0030) does at "Mark paid".
  if o.hosting_years is not null then
    select array_agg(distinct f ->> 'code') into codes
      from jsonb_array_elements(coalesce(o.album_snapshot -> 'pages', '[]'::jsonb)) p,
           jsonb_array_elements(
             coalesce(p -> 'qrFills', p -> 'qr_fills', '[]'::jsonb)
             || coalesce(p -> 'textSlotQr', p -> 'text_slot_qr', '[]'::jsonb)) f
     where jsonb_typeof(f) = 'object' and (f ->> 'code') ~ '^[a-z2-9]{4,32}$';
    if codes is not null then
      update public.qr_memories m
         set expires_at = m.created_at + make_interval(years => o.hosting_years)
       where m.code = any(codes)
         and m.user_id = o.user_id
         and m.kind = 'clip';
    end if;
  end if;
end;
$$;
revoke all on function public.claim_tester_order(uuid) from public, anon;
grant execute on function public.claim_tester_order(uuid) to authenticated;

-- ══════ 5. The console sees which orders are tests ══════
-- 0055's operator_orders plus tester_code (every operator, not only the owner).
drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer, hd_memories boolean,
  ship_name text, ship_phone text, ship_address text, tracking text,
  payment_reference text, payment_proof_path text, payment_submitted_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  copy_of_order_id uuid, copy_of_order_number text, event_booking_number text,
  quoted_amount integer, quote jsonb, tester_code text
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if;
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.hosting_years, o.hd_memories,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.payment_reference, o.payment_proof_path, o.payment_submitted_at,
           o.created_at, o.updated_at,
           o.copy_of_order_id, src.order_number, eb.booking_number,
           case when r = 'owner' then o.quoted_amount else null end,
           case when r = 'owner' then o.quote else null end,
           o.tester_code
    from public.orders o
    left join public.orders src on src.id = o.copy_of_order_id
    left join public.event_bookings eb on eb.id = o.event_booking_id
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.operator_orders(integer, integer) from public;
revoke execute on function public.operator_orders(integer, integer) from anon;
grant execute on function public.operator_orders(integer, integer) to authenticated;

-- ══════ Verify ══════
select 'store_settings has the tester code (MEGYTEST, on, unless the owner changed it)' as check,
  (select (tester_code is not null)::text from public.store_settings where id = 1) as result
union all
select 'orders_tester_code_trg in place',
  exists (select 1 from pg_trigger where tgname = 'orders_tester_code_trg' and not tgisinternal)::text
union all
select 'check/claim: authenticated yes, anon no; the trigger function nobody',
  (has_function_privilege('authenticated', 'public.check_tester_code(text)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.check_tester_code(text)', 'EXECUTE')
   and has_function_privilege('authenticated', 'public.claim_tester_order(uuid)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.claim_tester_order(uuid)', 'EXECUTE')
   and not has_function_privilege('authenticated', 'public.orders_tester_code()', 'EXECUTE'))::text
union all
select 'tester_code_tries closed to customers',
  (not has_table_privilege('authenticated', 'public.tester_code_tries', 'SELECT')
   and not has_table_privilege('anon', 'public.tester_code_tries', 'SELECT'))::text;
