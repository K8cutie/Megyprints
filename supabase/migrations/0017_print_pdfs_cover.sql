-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0017_print_pdfs_cover.sql  (idempotent; safe to re-run)
--
--  The album cover (front·spine·back) prints as a SEPARATE flat-wrap PDF, a
--  different size than the interior pages, so it is uploaded as its own object
--  "<order_id>-cover.pdf" alongside the interior "<order_id>.pdf".
--
--  0008's insert/update policies hard-require the object name to equal EXACTLY
--  "<order_id>.pdf", which would REJECT the cover upload. This migration widens
--  both policies to also accept the "-cover.pdf" name for an order the customer
--  owns. The operator SELECT policy (0008) already grants read on ANY object in
--  the bucket, so cover downloads need no change there.
-- ══════════════════════════════════════════════════════════════════════════

-- ── Customer may UPLOAD the interior OR the cover PDF for an order they own ──
drop policy if exists "print_pdfs_insert_own_order" on storage.objects;
create policy "print_pdfs_insert_own_order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
        and o.user_id = auth.uid()
    )
  );

-- ── …and REPLACE either (upsert re-order on the same id) ──
drop policy if exists "print_pdfs_update_own_order" on storage.objects;
create policy "print_pdfs_update_own_order"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name in (o.id::text || '.pdf', o.id::text || '-cover.pdf')
        and o.user_id = auth.uid()
    )
  );
