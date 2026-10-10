-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0039_account_deletion_covers_receipts.sql  (idempotent)
--
--  WHY: Kraken (2026-10-05) found that deleting an account left two of the
--  customer's files behind:
--
--    • the COVER WRAP PDF, "<order id>-cover.pdf" in print-pdfs (0017). It
--      holds the cover photo. 0027's guard (b) and the endpoint only knew the
--      pages PDF "<order id>.pdf";
--    • the PAYMENT RECEIPT, "<order id>.<jpg|png|webp|pdf>" in payment-proofs
--      (0033). A bank receipt screenshot shows the sender's name, and the
--      record we keep after deletion is promised to carry no name.
--
--  api/delete-account.mjs now removes both (with the service key, for the
--  caller's own orders only). This makes the database check it, the same way
--  (b) and (b2) already check the pages PDF and the videos: if the files are
--  not actually gone, nothing is deleted.
--
--  It also clears orders.payment_proof_path on the kept record, so the console
--  never points at a receipt that is gone. payment_reference stays: it is the
--  bank's transfer number, part of the sale record, not the person.
--
--  ORDER OF DEPLOY: the endpoint first, then this. With this applied under the
--  OLD endpoint, a customer with a cover wrap would be refused ("Could not
--  remove N print file(s)") until the new endpoint is live. Never the reverse
--  problem: the new endpoint under the old function just removes more.
--
--  Everything in delete_own_account() except (b), (b3) and payment_proof_path
--  is 0035's body unchanged. Run AFTER 0035.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_blocked  text;
  v_pdfs     int;
  v_clips    int;
  v_proofs   int;
  v_albums   int;
  v_memories int;
  v_orders   int;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  -- (a) Money in flight: paid but not yet delivered. Refuse, and name it.
  select string_agg(o.order_number, ', ' order by o.created_at)
    into v_blocked
    from public.orders o
   where o.user_id = v_uid
     and o.status in ('paid', 'in_production', 'printed', 'shipped');

  if v_blocked is not null then
    raise exception
      'Order % is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.',
      v_blocked
      using errcode = 'P0001';
  end if;

  -- (b) The print PDFs hold the customer's photos: the pages and the cover
  --     wrap (0017). SQL can only unlink the row, which would strand the file,
  --     so the endpoint removes them through the Storage API before calling.
  --     Verify rather than assume.
  select count(*) into v_pdfs
    from storage.objects s
    join public.orders o on s.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
   where s.bucket_id = 'print-pdfs'
     and o.user_id = v_uid;

  if v_pdfs > 0 then
    raise exception
      'Could not remove % print file(s) holding your photos, so nothing was deleted. Please try again.',
      v_pdfs
      using errcode = 'P0001';
  end if;

  -- (b2) The memory videos sit in a PUBLIC bucket: anyone holding the link can
  --      play them. Same rule as (b): the endpoint removes them through the
  --      Storage API first, and this refuses if any are still there.
  select count(*) into v_clips
    from storage.objects s
   where s.bucket_id = 'memory-clips'
     and s.owner_id = v_uid::text;

  if v_clips > 0 then
    raise exception
      'Could not remove % memory video(s), so nothing was deleted. Please try again.',
      v_clips
      using errcode = 'P0001';
  end if;

  -- (b3) The payment receipts (0033) show the customer's name. Same rule.
  select count(*) into v_proofs
    from storage.objects s
    join public.orders o on s.name in (o.id::text || '.jpg', o.id::text || '.png',
                                       o.id::text || '.webp', o.id::text || '.pdf')
   where s.bucket_id = 'payment-proofs'
     and o.user_id = v_uid;

  if v_proofs > 0 then
    raise exception
      'Could not remove % payment receipt(s), so nothing was deleted. Please try again.',
      v_proofs
      using errcode = 'P0001';
  end if;

  -- (c) Retain the financial record, strip the person out of it.
  --     status_history is KEPT: it is only {status, at} pairs (0022) — the audit
  --     trail for a real sale, with no personal data in it.
  update public.orders o
     set status              = case when o.status = 'pending_payment'
                                    then 'cancelled'::public.order_status
                                    else o.status end,
         ship_name           = null,
         ship_phone          = null,
         ship_address        = null,
         ship_region         = null,
         ship_province       = null,
         ship_city           = null,
         ship_barangay       = null,
         ship_street         = null,
         ship_zip            = null,
         tracking            = null,
         album_snapshot      = '{}'::jsonb,   -- the frozen copy of their photos
         album_id            = null,
         payment_proof_path  = null,          -- the receipt itself is gone (b3)
         customer_deleted_at = now(),
         user_id             = null           -- detach; RLS then hides it from every customer
   where o.user_id = v_uid;
  get diagnostics v_orders = row_count;

  -- (d) Everything that is purely theirs goes.
  delete from public.qr_memories m where m.user_id = v_uid;
  get diagnostics v_memories = row_count;

  delete from public.albums a where a.user_id = v_uid;
  get diagnostics v_albums = row_count;

  delete from public.user_profiles p where p.id = v_uid;

  -- (e) The account. Anything still referencing it cascades away here by design.
  delete from auth.users u where u.id = v_uid;

  return jsonb_build_object(
    'deleted_albums',    v_albums,
    'deleted_memories',  v_memories,
    'anonymized_orders', v_orders
  );
end;
$$;

-- ══════ Grants (0026 + 0028: explicit, and never to anon) ══════
revoke all on function public.delete_own_account() from public;
revoke execute on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;

-- ══════ Verify ══════
select
  'delete_own_account guards cover wraps and receipts' as check,
  (pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%-cover.pdf%'
   and pg_get_functiondef('public.delete_own_account()'::regprocedure) like '%''payment-proofs''%')::text as result
union all
select 'anon still cannot delete',
  (not has_function_privilege('anon', 'public.delete_own_account()', 'EXECUTE'))::text
union all
select 'print-pdfs, memory-clips, payment-proofs versioning off (a delete really deletes)',
  (not exists (select 1 from storage.buckets b
                where b.id in ('memory-clips', 'print-pdfs', 'payment-proofs')
                  and coalesce(to_jsonb(b) ->> 'versioning_status', 'DISABLED') <> 'DISABLED'))::text;
