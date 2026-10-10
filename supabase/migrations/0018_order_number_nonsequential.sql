-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0018_order_number_nonsequential.sql  (idempotent; safe to re-run)
--
--  WHY: 0002 generated order_number as
--         'MP-' || YYYY || '-' || lpad(nextval('orders_seq'),4,'0')
--       → MP-2026-0001, 0002, 0003 … a bare running counter. That is a
--       "German-tank" / business-volume leak: anyone who places two orders (or
--       is shown two order numbers) can subtract them to estimate total order
--       volume, and sequential IDs read as low engineering maturity to a reviewer.
--
--  FIX: make order_number NON-sequential and UNPREDICTABLE while keeping it
--       UNIQUE, NOT NULL, human-friendly (same MP-YYYY- prefix) and 100 %
--       server-generated. Shape:  MP-<YYYY>-<7 unambiguous base32 chars>
--       e.g.  MP-2026-K7M9P2Q
--
--  HOW:
--    1. gen_order_number()  — SECURITY DEFINER generator. Crypto-strong suffix
--       from extensions.gen_random_bytes(), drawn from a 31-char uppercase
--       alphabet with 0 O 1 I L removed (unambiguous over the phone). It
--       pre-checks the UNIQUE column in a capped retry loop so a collision is
--       regenerated rather than turned into a failed insert.
--    2. A BEFORE INSERT trigger that ALWAYS overwrites order_number with a fresh
--       server value — the client is NEVER trusted. (The insert RLS policy in
--       0002/0003 pins status/amount/tracking but does NOT pin order_number, so
--       a hand-crafted REST insert could otherwise set it to 'MP-2026-0001' to
--       fake order #1, or probe the UNIQUE index as an existence oracle. Always
--       overwriting closes both.)
--    3. The old nextval() column DEFAULT is dropped and orders_seq is dropped, so
--       no code path can ever emit a sequential value again (single source of
--       truth = this trigger).
--
--  Existing rows are untouched: this is INSERT-only, so MP-2026-0001..0007 keep
--  their historical numbers. Only NEW orders get the random format.
--
--  gen_random_bytes() is pgcrypto (NOT in pg_catalog like gen_random_uuid()); on
--  this project it lives in the `extensions` schema, so it is schema-qualified and
--  `extensions` is pinned on the function search_path.
-- ════════════════════════════════════════════════════════════════════════════

-- pgcrypto provides gen_random_bytes. No-op if already installed (it is, in
-- `extensions`); guarded so the migration is self-contained on a fresh DB.
create extension if not exists pgcrypto with schema extensions;

-- ── 1. The non-sequential generator ────────────────────────────────────────
-- SECURITY DEFINER so the uniqueness pre-check can SELECT across ALL orders (not
-- just the caller's RLS-visible rows) — otherwise a customer's insert could only
-- "see" their own order_numbers and might reuse another customer's. search_path
-- is pinned (defense-in-depth for a definer function); extensions is included so
-- the unqualified-name case still resolves gen_random_bytes.
create or replace function public.gen_order_number()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  -- 31 chars, uppercase, with 0 O 1 I L removed → unambiguous when read aloud.
  alphabet     constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  suffix_len   constant int  := 7;      -- 31^7 ≈ 2.75e10 values / year prefix
  max_attempts constant int  := 50;
  rnd          bytea;
  suffix       text;
  candidate    text;
  attempt      int := 0;
  i            int;
begin
  loop
    attempt := attempt + 1;

    -- crypto-strong random suffix, one char per random byte (byte % 31)
    rnd    := extensions.gen_random_bytes(suffix_len);
    suffix := '';
    for i in 0 .. suffix_len - 1 loop
      suffix := suffix || substr(alphabet, (get_byte(rnd, i) % 31) + 1, 1);
    end loop;

    candidate := 'MP-' || to_char(now(), 'YYYY') || '-' || suffix;

    -- Regenerate on the (astronomically rare) chance the value already exists.
    -- The UNIQUE constraint on order_number remains the hard integrity backstop;
    -- this pre-check is what keeps a collision from becoming a failed insert.
    exit when not exists (
      select 1 from public.orders where order_number = candidate
    );

    if attempt >= max_attempts then
      raise exception
        'gen_order_number: could not find a free order number after % attempts', max_attempts;
    end if;
  end loop;

  return candidate;
end;
$$;

-- Internal only — never exposed to clients (no generator oracle, and nothing
-- outside the trigger should mint order numbers).
revoke all on function public.gen_order_number() from public;

-- ── 2. Drop the sequential DEFAULT + the sequence itself ────────────────────
-- Remove the default FIRST so the sequence has no remaining dependency, then
-- drop the sequence. order_number stays NOT NULL — the trigger below always
-- populates it (BEFORE-row triggers fire before the NOT NULL check).
alter table public.orders alter column order_number drop default;
drop sequence if exists public.orders_seq;

-- ── 3. Always-server-generate trigger ───────────────────────────────────────
-- Overwrites unconditionally: whatever the client sends for order_number is
-- ignored. SECURITY DEFINER + pinned search_path; it delegates the privileged
-- uniqueness check to gen_order_number().
create or replace function public.set_order_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.order_number := public.gen_order_number();
  return new;
end;
$$;

drop trigger if exists set_order_number on public.orders;
create trigger set_order_number
  before insert on public.orders
  for each row execute function public.set_order_number();

-- ── 4. Verify (run manually) ────────────────────────────────────────────────
-- select public.gen_order_number() from generate_series(1,5);  -- 5 random numbers
-- Existing rows keep their old numbers; only new inserts use MP-YYYY-<random>.
