-- ════════════════════════════════════════════════════════════════════════════
--  0052 — PAGES TOUCHING ON EVERY SIZE: 6x4, 6x8 AND 8x6 FIT MORE A SHEET
--
--  The owner's 6x6 sheet (2026-10-22, 0050) put the pages touching across the
--  12.5 × 19 sheet; on 2026-10-23 he asked for the same on the other sizes.
--  Where pages touching fits one more column across the 12" the printer
--  prints:
--      6x4   3 × 3 turned = 9 leaves a sheet → 18 pages (was 12)
--      6x8   2 × 2        = 4 leaves         →  8 pages (was 6)
--      8x6   2 × 2 turned = 4 leaves         →  8 pages (was 6)
--  8x8, 9x9, 11.5x8 and 8.5x11 gain nothing and stay at 4. The geometry is
--  builder/printSheet.ts (BUTTED_SIZES); pricing's pps must equal
--  sheetLayout().pagesPerSheet (printSheet.spec holds them).
--
--  The price follows: fewer sheets, so these albums cost less.
--
--  Run AFTER the code that lays these sizes out this way is deployed: before
--  it, the console would still print fewer pages to a sheet than this price
--  pays for.
-- ════════════════════════════════════════════════════════════════════════════

update public.pricing_model
   set sizes = jsonb_set(jsonb_set(jsonb_set(sizes,
         '{6x4,pps}', '18'),
         '{6x8,pps}', '8'),
         '{8x6,pps}', '8'),
       updated_at = now()
 where id = 1;

-- Verify: select sizes->'6x4'->>'pps', sizes->'6x8'->>'pps', sizes->'8x6'->>'pps'
--           from public.pricing_model where id = 1;  -- 18, 8, 8
