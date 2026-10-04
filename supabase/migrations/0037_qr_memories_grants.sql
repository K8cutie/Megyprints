-- ══════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0037_qr_memories_grants.sql  (idempotent; safe to re-run)
--
--  The memory table's privileges, stated. Checkout writes a qr_memories row
--  for every video memory (the "reliability belt" in Order.tsx, REQUIRED for
--  hosted clips), but no migration ever GRANTED select / insert / delete on
--  the table: the live project has them only from its old default privileges.
--  A database built from these migrations alone (a fresh local stack, a
--  rebuilt project) refused the write — "permission denied for table
--  qr_memories" — so every order with a video memory failed at checkout
--  (found 2026-10-04 by the 1-star testers' local copy of the live app).
--
--  On the live project this is a no-op: these are already granted there.
--  Row security still decides WHICH rows (0012 / 0030 policies: own rows
--  only), and UPDATE stays column-limited to (destination, title) per 0013.
-- ══════════════════════════════════════════════════════════════════════════

grant select, insert, delete on public.qr_memories to authenticated;
grant update (destination, title) on public.qr_memories to authenticated;
