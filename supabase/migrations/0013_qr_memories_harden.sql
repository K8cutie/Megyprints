-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0013_qr_memories_harden.sql
-- Red-team hardening for qr_memories (data-layer audit). All findings were
-- owner-scoped self-tampering + missing length caps — no cross-tenant path.
--
--  MED-1  The UPDATE policy is owner-scoped but had no COLUMN guard, so an owner
--         could mutate their own scan_count (or any column) via a direct
--         supabase-js call — falsifying the "scans" metric. Fix: restrict the
--         `authenticated` role to UPDATE only (destination, title). scan_count,
--         user_id, code, created_at, updated_at become client-immutable.
--         resolve_memory() is SECURITY DEFINER (runs as the function owner, not
--         `authenticated`), so it still bumps scan_count — unaffected by this
--         column grant.
--
--  MED-2  destination CHECK enforced only the https:// scheme, with NO length
--         cap → an unbounded-length write was a storage/DoS vector. Fix: cap at
--         2048 chars. (The HOST allowlist stays app-side by design: the client
--         validateDestination is UX, and api/m.mjs is the sole auto-redirect
--         authority — non-allowlisted hosts get a manual interstitial, never an
--         auto-forward. Keeping the allowlist out of the DB avoids a third copy
--         of it drifting from the client + resolver.)
--
--  LOW-1  title was stored raw with no length cap (escaped on every render, so
--         no stored-XSS, but unbounded). Fix: cap at 200 chars.
-- ══════════════════════════════════════════════════════════════════════════

-- MED-1 — client may only ever change destination + title. Revoke the blanket
-- UPDATE, then grant back exactly the two mutable columns.
revoke update on public.qr_memories from authenticated;
grant  update (destination, title) on public.qr_memories to authenticated;

-- MED-2 / LOW-1 — length caps (kill unbounded-storage writes).
alter table public.qr_memories drop constraint if exists qr_memories_destination_len_chk;
alter table public.qr_memories drop constraint if exists qr_memories_title_len_chk;
alter table public.qr_memories
  add constraint qr_memories_destination_len_chk
    check (char_length(destination) <= 2048);
alter table public.qr_memories
  add constraint qr_memories_title_len_chk
    check (title is null or char_length(title) <= 200);
