-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0008_print_pdfs.sql  (idempotent; safe to re-run)
--
--  Fulfillment print PDFs. The print-ready PDF for an order is built on the
--  CUSTOMER's device (their photos live only in their browser's IndexedDB) and
--  uploaded here at order time. Only OPERATORS (owner / fulfillment) can download
--  it — customers cannot — so the finished album can't be taken to another
--  printer. PDF printing therefore happens strictly inside fulfillment.
--
--  Bucket: private "print-pdfs". Path convention:  "<order_id>.pdf".
--
--  NOTE: if the storage.buckets insert below is rejected by your environment's
--  privileges, create the bucket once in the Dashboard (Storage → New Bucket →
--  "print-pdfs", Public = OFF), then re-run — the policies are the important part.
-- ══════════════════════════════════════════════════════════════════════════

do $$
begin
  insert into storage.buckets (id, name, public)
  values ('print-pdfs', 'print-pdfs', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'Could not auto-create the "print-pdfs" bucket (%). Create it once in the Dashboard (Storage -> New Bucket -> print-pdfs, Public = OFF); the policies below still apply.', sqlerrm;
end $$;

-- ── Customer may UPLOAD / REPLACE the PDF only for an order they own ──
drop policy if exists "print_pdfs_insert_own_order" on storage.objects;
create policy "print_pdfs_insert_own_order"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name = o.id::text || '.pdf'
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "print_pdfs_update_own_order" on storage.objects;
create policy "print_pdfs_update_own_order"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'print-pdfs'
    and exists (
      select 1 from public.orders o
      where storage.objects.name = o.id::text || '.pdf'
        and o.user_id = auth.uid()
    )
  );

-- ── Only OPERATORS (owner or fulfillment) can READ / download print PDFs ──
--    Customers have no SELECT policy here, so they can never download it.
drop policy if exists "print_pdfs_select_operators" on storage.objects;
create policy "print_pdfs_select_operators"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'print-pdfs'
    and public.operator_role() is not null
  );
