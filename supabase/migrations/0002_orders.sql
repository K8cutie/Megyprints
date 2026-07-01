-- ══════════════════════════════════════════════════════════════════════════
-- Megy Prints — 0002_orders.sql
-- Orders / fulfillment: order_status enum, order-number sequence, orders table,
-- owner-scoped RLS with the customer pricing lock, updated_at trigger.
-- Run AFTER 0001_init.sql — it reuses public.handle_updated_at.
-- (Migrated verbatim from the former root `orders-setup.sql`.)
-- ══════════════════════════════════════════════════════════════════════════

-- ══════ 1. Order status enum ══════
do $$ begin
  create type public.order_status as enum
    ('pending_payment','paid','in_production','printed','shipped','delivered','cancelled');
exception when duplicate_object then null; end $$;

-- ══════ 2. Human-friendly order number sequence ══════
create sequence if not exists public.orders_seq;

-- ══════ 3. Orders table ══════
create table if not exists public.orders (
  -- gen_random_uuid() is Postgres-native (PG13+) — no uuid-ossp extension /
  -- search_path dependency, so it resolves under the CLI's migration role too.
  id uuid default gen_random_uuid() primary key,
  -- MP-2026-0001 — generated server-side so the client never sets it
  order_number text unique not null
    default ('MP-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.orders_seq')::text, 4, '0')),
  user_id uuid references auth.users on delete cascade not null,
  album_id uuid references public.albums on delete set null,   -- live back-link
  -- FROZEN copy of the album at submit time (so later edits don't change the print)
  album_snapshot jsonb not null,
  -- denormalized specs for the operator
  album_size text,
  material text,
  cover text,
  page_count integer default 0,
  -- lifecycle
  status public.order_status default 'pending_payment',
  amount numeric,
  currency text default 'PHP',
  payment_status text default 'unpaid',
  -- shipping
  ship_name text,
  ship_phone text,
  ship_address text,
  tracking text,
  -- audit trail of status changes
  status_history jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_status  on public.orders(status);

-- ══════ 4. Row-Level Security ══════
alter table public.orders enable row level security;

-- Customers can see and create ONLY their own orders.
create policy "Users can view own orders"
  on public.orders for select
  using (auth.uid() = user_id);

create policy "Users can create own orders"
  on public.orders for insert
  with check (
    auth.uid() = user_id
    -- A customer may only create a fresh, UNPAID quote. They cannot self-mark
    -- an order paid, nor set its price — both are pinned here so a hand-crafted
    -- REST insert can't sneak status:'paid' / amount:1 past RLS. The operator
    -- backend (service_role, bypasses RLS) sets amount + flips status to 'paid'.
    and status = 'pending_payment'
    and payment_status = 'unpaid'
    and amount is null
    and tracking is null
  );

-- NOTE: no customer UPDATE/DELETE policy on purpose. Once an order is placed,
-- only the operator (via the backend using the service_role key) changes its
-- status. service_role bypasses RLS, so it needs no policy here.

-- ══════ 5. Auto-update updated_at ══════
-- Reuses public.handle_updated_at() created in 0001_init.sql.
drop trigger if exists on_order_updated on public.orders;
create trigger on_order_updated
  before update on public.orders
  for each row execute procedure public.handle_updated_at();

-- ══════ 6. Verify ══════
-- select order_number, status, page_count, amount, created_at from public.orders order by created_at desc;
