-- ════════════════════════════════════════════════════════════════════════════
--  0050 — 6x6 PRINTS 12 PAGES TO A SHEET
--
--  The owner (2026-10-22) drew his 6x6 press sheet: 2 pages across, 3 down,
--  the pages touching (1 3 / 5 7 / 9 11 on the front), and chose "yes, 6 a
--  side". Two 6" pages are exactly the 12" the printer prints across the
--  12.5 × 19 sheet, so a 6x6 sheet now holds 6 leaves = 12 pages, not 6
--  (0046). The geometry is builder/printSheet.ts (BUTTED_SIZES); pricing's
--  pps must equal sheetLayout().pagesPerSheet (printSheet.spec holds them).
--
--  The price follows: a 6x6 album uses half the sheets, so it costs less.
--
--  Run AFTER the code that lays 6x6 out 12 to a sheet is deployed: before
--  it, the console would still print 6 to a sheet and twice the sheets
--  this price pays for.
-- ════════════════════════════════════════════════════════════════════════════

update public.pricing_model
   set sizes = jsonb_set(sizes, '{6x6,pps}', '12'),
       updated_at = now()
 where id = 1;

-- Verify: select sizes->'6x6'->>'pps' as pps from public.pricing_model where id = 1;  -- 12
