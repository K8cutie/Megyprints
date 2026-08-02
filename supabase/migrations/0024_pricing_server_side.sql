-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0024_pricing_server_side.sql  (idempotent; safe to re-run)
--
--  Moves the COST MODEL off the client.
--
--  BEFORE: src/lib/pricing.ts carried the raw cost constants (SHEET = 26.5, the
--  per-size hardbound costs, SOFT_COVER/SOFT_BIND, and SIZE_SURCHARGE — which the
--  file itself labels "PURE PROFIT"), and 0014 made store_settings.price_multiple
--  world-readable to anon. Both shipped in the JS bundle, so anyone could read the
--  full cost structure AND the margin with devtools. 0014's comment claimed the
--  multiplier was safe because "production cost lives only in client code" — but
--  client code IS public, which is what made the pair readable.
--
--  AFTER: the cost model lives here, owner-readable only. The customer path calls
--  public_price_schedule(), which returns PRE-MULTIPLIED RATES — enough to
--  reproduce the exact same totals client-side, not enough to separate cost from
--  multiple. Final prices stay visible (they must; it is a shop), but the cost
--  structure behind them does not.
--
--  EXACTNESS (why the schedule reproduces the old totals bit for bit):
--      old: round(costOf * mult) + surcharge
--         = round((sheets*SHEET + cover) * mult) + surcharge
--      new: round(sheets*sheet_rate + rate)
--         where sheet_rate = SHEET*mult,  rate = cover*mult + surcharge
--         = round(sheets*SHEET*mult + cover*mult + surcharge)
--         = round(sheets*SHEET*mult + cover*mult) + surcharge   [surcharge is an
--           integer, and round(x + n) = round(x) + n for integer n]
--  Holds while the multiple lands on a quarter step (the Pricing panel slider is
--  step=0.25) and the sheet cost stays a .5 multiple — both exact in float64, so
--  no rounding can drift between Postgres numeric and the browser.
--
--  AUTHORIZATION: deliberately mirrors the existing owner email gate from 0014 /
--  0007 rather than introducing a new one. Re-rooting owner authority on a
--  verified auth.uid() is a separate, larger change (see the deferred Kraken
--  finding); this migration must not quietly alter who counts as an owner.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Cost model (owner-only; never reaches the client) ───────────────────────
create table if not exists public.pricing_model (
  id              integer   primary key default 1,
  sheet_cost      numeric   not null default 26.5 check (sheet_cost >= 0),
  soft_cover_cost numeric   not null default 50   check (soft_cover_cost >= 0),
  soft_bind_cost  numeric   not null default 100  check (soft_bind_cost >= 0),
  min_pages       integer   not null default 40   check (min_pages > 0),
  -- { "<size>": { "pps": int, "hb": numeric, "surcharge": integer } }
  sizes           jsonb     not null,
  updated_at      timestamptz not null default now(),
  constraint pricing_model_singleton check (id = 1)
);

-- Seeded from the constants that were in src/lib/pricing.ts at 0023.
insert into public.pricing_model (id, sheet_cost, soft_cover_cost, soft_bind_cost, min_pages, sizes)
values (1, 26.5, 50, 100, 40, '{
  "6x4":    {"pps": 16, "hb": 250, "surcharge": 0},
  "8x6":    {"pps": 4,  "hb": 350, "surcharge": 0},
  "6x8":    {"pps": 4,  "hb": 350, "surcharge": 0},
  "6x6":    {"pps": 12, "hb": 280, "surcharge": 0},
  "8x8":    {"pps": 4,  "hb": 350, "surcharge": 0},
  "9x9":    {"pps": 4,  "hb": 380, "surcharge": 150},
  "11.5x8": {"pps": 4,  "hb": 450, "surcharge": 300},
  "8.5x11": {"pps": 4,  "hb": 500, "surcharge": 300}
}'::jsonb)
on conflict (id) do nothing;

alter table public.pricing_model enable row level security;

drop policy if exists "Owners manage pricing model" on public.pricing_model;
create policy "Owners manage pricing model"
  on public.pricing_model for all
  using      ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('archgarcia@gmail.com', 'megyprints@gmail.com'));

-- Belt-and-braces: no table grant at all for anon.
revoke all on table public.pricing_model from anon;

-- ── store_settings public read is NOT dropped here — see 0025 ───────────────
-- This migration is deliberately ADDITIVE ONLY, so it is safe to apply against
-- production while the CURRENT client is still live.
--
-- Dropping the public read in this migration would have been a live money bug:
-- the deployed client reads store_settings directly and fails OPEN to its
-- built-in DEFAULT_MULTIPLE of 3. Production is running a multiple of 4, so the
-- moment the policy vanished every checkout would have quietly priced at 3x —
-- a 25% undercharge with no error surfaced to anyone.
--
-- Expand here, contract in 0025 once the new client (which reads the schedule
-- RPC instead) is deployed and confirmed.

-- ── Customer-facing schedule (anon) ─────────────────────────────────────────
create or replace function public.public_price_schedule()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m         public.pricing_model%rowtype;
  srow      jsonb;
  mult      numeric;
  disabled  jsonb;
  out_sizes jsonb := '{}'::jsonb;
  k         text;
  v         jsonb;
begin
  select * into m from public.pricing_model where id = 1;
  if not found then
    return null;                     -- client falls back to its safe defaults
  end if;

  -- to_jsonb keeps this resilient to disabled_sizes (0016) not existing yet.
  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;
  mult     := coalesce((srow ->> 'price_multiple')::numeric, 3);
  disabled := coalesce(srow -> 'disabled_sizes', '[]'::jsonb);

  for k, v in select * from jsonb_each(m.sizes) loop
    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      -- cover cost × multiple, with the size premium folded in. Folding is exact
      -- because the premium is an integer (see the header note on rounding).
      'soft_rate', (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric,
      'hard_rate', (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric
    ));
  end loop;

  return jsonb_build_object(
    'min_pages',      m.min_pages,
    'sheet_rate',     m.sheet_cost * mult,
    'disabled_sizes', disabled,
    'sizes',          out_sizes
  );
end
$$;

revoke all on function public.public_price_schedule() from public;
grant execute on function public.public_price_schedule() to anon, authenticated;

-- ── Owner-facing raw model (admin Pricing panel) ────────────────────────────
create or replace function public.owner_pricing_model()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m    public.pricing_model%rowtype;
  srow jsonb;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into m from public.pricing_model where id = 1;
  if not found then return null; end if;
  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;

  return jsonb_build_object(
    'sheet_cost',      m.sheet_cost,
    'soft_cover_cost', m.soft_cover_cost,
    'soft_bind_cost',  m.soft_bind_cost,
    'min_pages',       m.min_pages,
    'sizes',           m.sizes,
    'price_multiple',  coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
grant execute on function public.owner_pricing_model() to authenticated;

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'pricing_model rls'  as check,
  (select rowsecurity from pg_tables
    where schemaname = 'public' and tablename = 'pricing_model')::text as result
union all
select
  'schedule rpc callable',
  (public.public_price_schedule() is not null)::text
union all
select
  'schedule leaks no cost/multiple',
  (not (public.public_price_schedule() ?| array['price_multiple','sheet_cost','hb','surcharge']))::text;
