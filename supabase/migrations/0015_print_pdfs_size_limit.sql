-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0015_print_pdfs_size_limit.sql  (idempotent; safe to re-run)
--
--  Print PDFs are big: a 40+ page album at 300 DPI is tens of MB even as JPEG
--  (and was HUNDREDS of MB as lossless PNG — the original upload-rejection bug).
--  Supabase Storage's DEFAULT per-file limit is ~50 MB, which the upload blew
--  past ("The object exceeded the maximum allowed size"). Raise THIS bucket's
--  limit to 300 MB so print files fit.
--
--  NOTE: a per-bucket file_size_limit is still capped by the PROJECT-WIDE upload
--  limit (Dashboard → Project Settings → Storage → "Upload file size limit").
--  On the Free plan that global cap is 50 MB and cannot be raised — a print
--  product needs the Pro plan to store full-resolution album PDFs. This
--  migration removes the BUCKET as the limiter; the global setting is the other.
-- ══════════════════════════════════════════════════════════════════════════

update storage.buckets
   set file_size_limit = 314572800   -- 300 MB
 where id = 'print-pdfs';
