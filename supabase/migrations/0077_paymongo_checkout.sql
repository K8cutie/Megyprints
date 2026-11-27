-- ═══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0077_paymongo_checkout.sql  (idempotent; safe to re-run)
--
--  WHY (owner, 2026-11-27: "Yes, start"): customers pay by card, GCash or
--  Maya through PayMongo (Bridgemedia's account), next to the GoTyme QR.
--  PayMongo tells our server when a checkout is paid (a signed webhook to
--  /api/pay). That server marks the order paid with the service role, so the
--  database needs one step it can call that is safe to run from a webhook:
--  it checks the money and can be called twice.
--
--  WHAT:
--   1. store_settings.paymongo_on (off until the owner turns it on, after
--      PayMongo has activated the account). public_pay_options() lets the
--      website and the app read it, signed in or not, with no app release.
--   2. orders.paymongo_checkout_id: the PayMongo checkout made for the order,
--      so asking to pay again reuses it instead of opening a second one.
--   3. mark_order_paid_by_gateway(order, amount in centavos, payment id,
--      checkout id): the webhook's "Mark paid". Only the service role may run
--      it. It returns a word, never raises for an expected case:
--        'paid'            marked paid now;
--        'already_paid'    a repeat delivery (PayMongo sends at least once);
--        'amount_mismatch' the money doesn't match the order's quoted total:
--                          left unpaid for the owner to look at;
--        'not_payable'     cancelled, or past payment: left as it is;
--        'not_found'       no such order.
--      Marking paid starts the memory years exactly as "Mark paid" does
--      (apply_order_hosting_term, 0058), since that one is owner-only.
--
--  Customers can't run (3). Run AFTER 0075.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════ 1. The switch ══════
alter table public.store_settings add column if not exists paymongo_on boolean not null default false;

create or replace function public.public_pay_options()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('paymongo', coalesce((select s.paymongo_on from public.store_settings s where s.id = 1), false));
$$;
revoke all on function public.public_pay_options() from public;
grant execute on function public.public_pay_options() to anon, authenticated;

-- ══════ 2. The checkout made for an order ══════
alter table public.orders add column if not exists paymongo_checkout_id text;
alter table public.orders drop constraint if exists orders_paymongo_checkout_id_chk;
alter table public.orders add constraint orders_paymongo_checkout_id_chk
  check (paymongo_checkout_id is null or paymongo_checkout_id ~ '^cs_[A-Za-z0-9_-]{4,96}$');

-- ══════ 3. The webhook's "Mark paid" ══════
create or replace function public.mark_order_paid_by_gateway(
  p_order_id        uuid,
  p_amount_centavos bigint,
  p_payment_id      text,
  p_checkout_id     text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o     public.orders;
  codes text[];
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    return 'not_found';
  end if;
  -- PayMongo delivers at least once: the second delivery finds it done.
  if o.status = 'paid' and o.payment_status = 'paid' then
    return 'already_paid';
  end if;
  if o.status <> 'pending_payment' or o.payment_status <> 'unpaid' then
    return 'not_payable';
  end if;
  -- The money must be the order's own total, in centavos. Anything else is
  -- left for the owner: never marked paid on a wrong amount.
  if o.quoted_amount is null or p_amount_centavos is null
     or p_amount_centavos <> o.quoted_amount::bigint * 100 then
    return 'amount_mismatch';
  end if;

  begin
    update public.orders
       set status               = 'paid',
           payment_status       = 'paid',
           payment_reference    = nullif(left(regexp_replace(coalesce(p_payment_id, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), ''),
           paymongo_checkout_id = case when p_checkout_id ~ '^cs_[A-Za-z0-9_-]{4,96}$' then p_checkout_id else paymongo_checkout_id end,
           status_history       = coalesce(status_history, '[]'::jsonb)
                                  || jsonb_build_object('status', 'paid', 'at', now(), 'by', 'paymongo')
     where id = o.id;
  exception when sqlstate 'MP002' then
    -- Its print files were cleaned up (0042): nothing to print. Left for the owner.
    return 'not_payable';
  end;

  -- The memory years the order was placed with start now, read from the album
  -- copy exactly as apply_order_hosting_term (0058) does at "Mark paid".
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
  return 'paid';
end;
$$;
revoke all on function public.mark_order_paid_by_gateway(uuid, bigint, text, text) from public, anon, authenticated;
grant execute on function public.mark_order_paid_by_gateway(uuid, bigint, text, text) to service_role;

-- ══════ Checks ══════
select 'paymongo_on: off by default' as check,
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'store_settings' and column_name = 'paymongo_on') = 'false' as ok;
select 'public_pay_options: anyone may read' as check,
  has_function_privilege('anon', 'public.public_pay_options()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.public_pay_options()', 'EXECUTE') as ok;
select 'mark_order_paid_by_gateway: server only' as check,
  not has_function_privilege('anon', 'public.mark_order_paid_by_gateway(uuid, bigint, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.mark_order_paid_by_gateway(uuid, bigint, text, text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mark_order_paid_by_gateway(uuid, bigint, text, text)', 'EXECUTE') as ok;
