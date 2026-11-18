-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0065_affiliate_mini_full_price.sql  (idempotent; safe to re-run)
--
--  WHY: the owner, 2026-11-19, asked whether an affiliate code's client
--  discount (₱100) should apply to the Megy Mini: "only mini" — the Mini has
--  no client discount. A ₱100 discount on a ₱350 booklet is 29% off and took
--  almost half of what a Mini keeps. The affiliate still earns their
--  commission on it: the code still names them, and the commission is their
--  rate of the full Mini price (0061's orders_affiliate_commission takes the
--  quote's album price less the recorded discount, which is now 0).
--
--  What changes: orders_with_affiliate_code() (0061) sets the discount to 0
--  for a Megy Mini order (album_size '5.8x8.3' or cover 'staple', 0062's
--  test). Albums keep the program's discount. Nothing else changes.
--
--  The app and the website say the same (src/lib/orderCodes.ts
--  affiliateDiscountOn / checkoutPayTotal / affiliateLine; the terms).
--  Run AFTER 0061 and 0062.
-- ════════════════════════════════════════════════════════════════════════════

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
  -- 0065: a Megy Mini takes no client discount (the owner, 2026-11-19: "only
  -- mini"). The code still names the affiliate, who earns on the full price.
  if new.album_size = '5.8x8.3' or new.cover = 'staple' then
    v_discount := 0;
  end if;
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

-- ══════ Verify ══════
select 'a Megy Mini order takes no affiliate discount' as check,
  (pg_get_functiondef('public.orders_with_affiliate_code'::regproc) like '%album_size = ''5.8x8.3'' or new.cover = ''staple''%v_discount := 0%')::text as result
union all
select 'the trigger is still in place',
  (exists (select 1 from pg_trigger where tgname = 'orders_with_affiliate_code_trg' and not tgisinternal))::text
union all
select 'customers still can''t call it directly',
  (not has_function_privilege('authenticated', 'public.orders_with_affiliate_code()', 'execute'))::text;
