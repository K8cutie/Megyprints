-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0068_unsent_orders.sql  (idempotent; safe to re-run)
--
--  WHY: MP-2026-9M5572U (2026-11-22), a Megy Mini with 4 video memories. The
--  phone made the order row, sent the cover and the first video, then
--  stopped: the person left the "Placing your order" screen and the app's
--  background keeper stopped with it. The pages file, 3 videos and all 4 QR
--  rows never arrived. In the console the order looked like any other, and it
--  was moved to In production. Nothing in the database knew it was half-sent.
--  The owner, the same day: "this is a bug if its paid and the order didnt
--  push through".
--
--  What this adds:
--    1. order_files_missing(order): what of an order isn't in yet, read from
--       Storage and the QR rows, never from the phone: 'cover', 'pages',
--       'video:<code>' for each memory video of its frozen album, and
--       'memory:<code>' for each of its QRs with no memory row. Internal.
--    2. my_unsent_orders(): the signed-in customer's own open orders
--       (waiting for payment, paid, in production) with something missing.
--       The app shows them as "didn't finish sending" and finishes them from
--       the phone that made the album.
--    3. operator_orders_unsent(ids): the same for the console.
--    4. submit_payment_proof refuses "I've sent the payment" for an order
--       with something missing (MP030): nobody pays for an order we can't
--       print. Every client sends its files before its payment step, so a
--       whole order is never refused.
--    5. An order can't be moved to In production, Printed or Shipped while
--       something is missing (MP031), whoever moves it.
--  Tester-code and event orders are left out of 2: checkout finishes a tester
--  order with its code, and events are paused. An order whose files were
--  removed (files_purged_at) has nothing "missing".
--  Run AFTER 0066.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. What of an order isn't in yet ══════
create or replace function public.order_files_missing(p_order_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with o as (
    select id, album_snapshot
      from public.orders
     where id = p_order_id
       and files_purged_at is null
  ),
  fills as (
    -- Every QR on the frozen album's pages, both homes (a QR slot, a QR in a
    -- caption box), in either spelling (the app's memoryCodesInSnapshot).
    select distinct f.fill ->> 'code' as code,
           coalesce(nullif(f.fill ->> 'kind', ''), 'link') as kind
      from o
     cross join lateral jsonb_array_elements(
           case when jsonb_typeof(o.album_snapshot -> 'pages') = 'array' then o.album_snapshot -> 'pages' else '[]'::jsonb end
         ) as p(page)
     cross join lateral jsonb_array_elements(
              (case when jsonb_typeof(p.page -> 'qrFills') = 'array' then p.page -> 'qrFills' else '[]'::jsonb end)
           || (case when jsonb_typeof(p.page -> 'qr_fills') = 'array' then p.page -> 'qr_fills' else '[]'::jsonb end)
           || (case when jsonb_typeof(p.page -> 'textSlotQr') = 'array' then p.page -> 'textSlotQr' else '[]'::jsonb end)
           || (case when jsonb_typeof(p.page -> 'text_slot_qr') = 'array' then p.page -> 'text_slot_qr' else '[]'::jsonb end)
         ) as f(fill)
     where jsonb_typeof(f.fill) = 'object'
       and (f.fill ->> 'code') ~ '^[a-z2-9]{4,32}$'
  ),
  missing as (
    select 1 as part, 'cover'::text as what
      from o
     where not exists (select 1 from storage.objects s where s.bucket_id = 'print-pdfs' and s.name = o.id::text || '-cover.pdf')
    union all
    select 2, 'pages'
      from o
     where not exists (select 1 from storage.objects s where s.bucket_id = 'print-pdfs' and s.name = o.id::text || '.pdf')
    union all
    select 3, 'video:' || fills.code
      from fills
     where fills.kind = 'clip'
       and not exists (select 1 from storage.objects s where s.bucket_id = 'memory-clips' and s.name like fills.code || '.%')
    union all
    select 4, 'memory:' || fills.code
      from fills
     where not exists (select 1 from public.qr_memories q where q.code = fills.code)
  )
  select coalesce(array_agg(what order by part, what), '{}'::text[]) from missing;
$$;

revoke all on function public.order_files_missing(uuid) from public, anon, authenticated;

-- The missing parts in words, for the refusals below:
-- 'the pages, 3 memory videos and 4 QR codes'.
create or replace function public.order_missing_words(p_missing text[])
returns text
language sql
immutable
set search_path = ''
as $$
  with n as (
    select count(*) filter (where m like 'video:%') as videos,
           count(*) filter (where m like 'memory:%') as qrs
      from unnest(coalesce(p_missing, '{}'::text[])) as m
  ),
  parts as (
    select array_remove(array[
      case when 'cover' = any(p_missing) then 'the cover' end,
      case when 'pages' = any(p_missing) then 'the pages' end,
      case when n.videos = 1 then '1 memory video' when n.videos > 1 then n.videos || ' memory videos' end,
      case when n.qrs = 1 then '1 QR code' when n.qrs > 1 then n.qrs || ' QR codes' end
    ], null) as a
      from n
  )
  select case
           when cardinality(a) = 0 then ''
           when cardinality(a) = 1 then a[1]
           else array_to_string(a[1:cardinality(a) - 1], ', ') || ' and ' || a[cardinality(a)]
         end
    from parts;
$$;

revoke all on function public.order_missing_words(text[]) from public, anon, authenticated;

-- ══════ 2. The customer's own orders that didn't finish sending ══════
create or replace function public.my_unsent_orders()
returns table (order_id uuid, order_number text, album_id uuid, status text, created_at timestamptz, missing text[])
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.order_number, o.album_id, o.status::text, o.created_at, m.missing
    from public.orders o
   cross join lateral (select public.order_files_missing(o.id) as missing) m
   where auth.uid() is not null
     and o.user_id = auth.uid()
     and o.status in ('pending_payment', 'paid', 'in_production')
     and o.tester_code is null
     and o.event_booking_id is null
     and cardinality(m.missing) > 0
   order by o.created_at desc
   limit 20;
$$;

revoke all on function public.my_unsent_orders() from public, anon;
grant execute on function public.my_unsent_orders() to authenticated;

-- ══════ 3. The same, for the console ══════
create or replace function public.operator_orders_unsent(p_ids uuid[])
returns table (order_id uuid, missing text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.operator_role() is null then
    raise exception 'not authorized';
  end if;
  if cardinality(coalesce(p_ids, '{}'::uuid[])) > 500 then
    raise exception 'at most 500 orders at a time';
  end if;
  return query
    select o.id, m.missing
      from public.orders o
     cross join lateral (select public.order_files_missing(o.id) as missing) m
     where o.id = any(coalesce(p_ids, '{}'::uuid[]))
       and o.status in ('pending_payment', 'paid', 'in_production')
       and cardinality(m.missing) > 0;
end;
$$;

revoke all on function public.operator_orders_unsent(uuid[]) from public, anon;
grant execute on function public.operator_orders_unsent(uuid[]) to authenticated;

-- ══════ 4. No payment for an order that didn't finish sending (0033's function + one check) ══════
create or replace function public.submit_payment_proof(p_order_id uuid, p_reference text default null, p_proof_path text default null)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to submit a payment.';
  end if;
  if p_proof_path is not null
     and p_proof_path !~ ('^' || p_order_id::text || '\.(jpg|png|webp|pdf)$') then
    raise exception 'Receipt path does not belong to this order.';
  end if;

  -- 0068: the whole order must be here first (its files, videos and QRs).
  if exists (select 1 from public.orders o
              where o.id = p_order_id and o.user_id = auth.uid()
                and o.payment_status = 'unpaid' and o.status = 'pending_payment')
     and cardinality(public.order_files_missing(p_order_id)) > 0 then
    raise exception 'This order didn''t finish sending from your phone, so we can''t print it yet. Update the Megy Prints app, open Your orders on the phone you made the album on and tap Finish sending, then tap I''ve sent the payment again. If you already sent the money, it''s safe: we''ll match it to this order.'
      using errcode = 'MP030';
  end if;

  update public.orders
     set payment_reference    = nullif(left(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), ''),
         payment_proof_path   = coalesce(p_proof_path, payment_proof_path),
         payment_submitted_at = now()
   where id = p_order_id
     and user_id = auth.uid()
     and payment_status = 'unpaid'
     and status = 'pending_payment';

  if not found then
    select o.status::text into v_status from public.orders o where o.id = p_order_id and o.user_id = auth.uid();
    if v_status = 'cancelled' then
      raise exception 'This order closed because it wasn''t paid within % days. If you already sent the money, message us with your receipt and we''ll sort it out. Your album is still saved, so you can also order it again.',
        public.unpaid_order_days()
        using errcode = 'MP003';
    end if;
    raise exception 'Order not found, or it is already paid.';
  end if;
end;
$$;

-- ══════ 5. Nothing goes to print while something is missing ══════
create or replace function public.orders_files_in_before_printing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
begin
  if new.status is distinct from old.status
     and new.status in ('in_production', 'printed', 'shipped')
     and new.files_purged_at is null then
    v_missing := public.order_files_missing(new.id);
    if cardinality(v_missing) > 0 then
      raise exception 'This order didn''t finish sending from the customer''s phone: % never arrived, so it can''t be printed yet. Ask the customer to open Your orders in the Megy Prints app on the phone they made the album on and tap Finish sending.',
        public.order_missing_words(v_missing)
        using errcode = 'MP031';
    end if;
  end if;
  return new;
end;
$$;

-- A trigger function is nobody's to call.
revoke all on function public.orders_files_in_before_printing() from public, anon, authenticated;

drop trigger if exists orders_files_in_before_printing on public.orders;
create trigger orders_files_in_before_printing
  before update of status on public.orders
  for each row execute function public.orders_files_in_before_printing();

-- ══════ Verify ══════
-- Every function where it should be, callable by whom it should be.
select 'order_files_missing: internal' as check,
       (not has_function_privilege('anon', 'public.order_files_missing(uuid)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.order_files_missing(uuid)', 'EXECUTE'))::text as result
union all
select 'my_unsent_orders: signed in only',
       (has_function_privilege('authenticated', 'public.my_unsent_orders()', 'EXECUTE')
        and not has_function_privilege('anon', 'public.my_unsent_orders()', 'EXECUTE'))::text
union all
select 'operator_orders_unsent: signed in only (operators inside)',
       (has_function_privilege('authenticated', 'public.operator_orders_unsent(uuid[])', 'EXECUTE')
        and not has_function_privilege('anon', 'public.operator_orders_unsent(uuid[])', 'EXECUTE'))::text
union all
select 'print guard trigger on orders',
       exists (select 1 from pg_trigger where tgname = 'orders_files_in_before_printing' and tgrelid = 'public.orders'::regclass)::text
union all
select 'missing words',
       (public.order_missing_words(array['pages', 'video:a2b3', 'video:c4d5', 'memory:a2b3']) = 'the pages, 2 memory videos and 1 QR code')::text;
