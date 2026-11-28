-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0080_payment_proof_keep_reference.sql  (idempotent; safe to re-run)
--
--  WHY (bug hunt, 2026-11-28, both confirmed by Mother on the test database):
--   B-D1  a second "I've sent the payment" with the reference box empty (the
--         same order paid from a second phone, or the step opened again)
--         ERASED the reference the customer had sent first, and moved the sent
--         time. The shop matches money to orders by that reference.
--   B-D2  paying an order the customer (or the shop) cancelled said "This
--         order closed because it wasn't paid within 7 days": the wrong reason.
--
--  What changes, in submit_payment_proof() only (0068's text otherwise, line
--  for line: the receipt-path check, MP030 for an order that didn't finish
--  sending, MP003 for a closed order):
--    1. an empty reference keeps the one already saved; a new one replaces it;
--    2. the sent time moves only with a new reference (a new payment to
--       match); a second "I've sent" with no reference, or the same one,
--       keeps the time the reference was sent;
--    3. a cancelled order's words say who closed it: the 7-day close
--       (cancelled_by = 'auto-expire'), or a plain cancel (the customer or the
--       shop). Both stay MP003, so every app reads them as before.
--
--  No price, order or file rule changes. Older apps send the same arguments.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.submit_payment_proof(p_order_id uuid, p_reference text default null, p_proof_path text default null)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_status text;
  v_by     text;
  v_ref    text := nullif(left(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9 _./-]', '', 'g'), 64), '');
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
     -- 0080: an empty reference keeps the saved one (B-D1).
     set payment_reference    = coalesce(v_ref, payment_reference),
         payment_proof_path   = coalesce(p_proof_path, payment_proof_path),
         -- 0080: the time goes with the reference (B-D1). SET reads the old row.
         payment_submitted_at = case
           when v_ref is not null and v_ref is distinct from payment_reference then now()
           else coalesce(payment_submitted_at, now())
         end
   where id = p_order_id
     and user_id = auth.uid()
     and payment_status = 'unpaid'
     and status = 'pending_payment';

  if not found then
    select o.status::text, o.cancelled_by into v_status, v_by from public.orders o where o.id = p_order_id and o.user_id = auth.uid();
    if v_status = 'cancelled' and v_by = 'auto-expire' then
      raise exception 'This order closed because it wasn''t paid within % days. If you already sent the money, message us with your receipt and we''ll sort it out. Your album is still saved, so you can also order it again.',
        public.unpaid_order_days()
        using errcode = 'MP003';
    end if;
    -- 0080: cancelled by the customer or the shop: say that (B-D2).
    if v_status = 'cancelled' then
      raise exception 'This order was cancelled, so it can''t be paid. If you already sent the money, message us with your receipt and we''ll sort it out. Your album is still saved, so you can order it again.'
        using errcode = 'MP003';
    end if;
    raise exception 'Order not found, or it is already paid.';
  end if;
end;
$$;

revoke all on function public.submit_payment_proof(uuid, text, text) from public;
revoke execute on function public.submit_payment_proof(uuid, text, text) from anon;
grant execute on function public.submit_payment_proof(uuid, text, text) to authenticated;

-- ══════ Verify ══════
select 'submit_payment_proof keeps a saved reference when the new one is empty' as check,
       position('coalesce(v_ref, payment_reference)' in pg_get_functiondef('public.submit_payment_proof(uuid, text, text)'::regprocedure)) > 0 as ok
union all
select 'the sent time moves only with a new reference',
       position('when v_ref is not null and v_ref is distinct from payment_reference then now()' in pg_get_functiondef('public.submit_payment_proof(uuid, text, text)'::regprocedure)) > 0
union all
select 'a plain cancel has its own words (MP003)',
       position('This order was cancelled, so it can''''t be paid' in pg_get_functiondef('public.submit_payment_proof(uuid, text, text)'::regprocedure)) > 0
union all
select 'anon can''t call it; customers can',
       not has_function_privilege('anon', 'public.submit_payment_proof(uuid, text, text)', 'execute')
       and has_function_privilege('authenticated', 'public.submit_payment_proof(uuid, text, text)', 'execute');
