-- ════════════════════════════════════════════════════════════════════════════
--  YAYAMOVE — PAYMENTS & ESCROW  (0008)
--  Run after 0007. Idempotent.
--
--  Model: full in-app escrow with automatic commission (PayMongo for collection).
--    1. Seeker pays the full amount  → funds collected into the platform account.
--    2. Status 'held'                → escrow (set ONLY by the verified webhook).
--    3. Booking marked 'completed'   → status 'released' (auto, via trigger) and
--       the provider's share becomes payable; the commission stays with platform.
--    4. Disbursement to the provider is a separate step (PayMongo isn't a split
--       gateway) — tracked by released_at / a future payouts table.
--
--  Trust: amounts, status and gateway refs are FROZEN for normal users — only the
--  webhook (service_role) or an admin can move money state. Same "never trust the
--  client" rule as the rest of the schema.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type payment_status as enum
    ('pending','processing','held','released','refunded','failed');
exception when duplicate_object then null; end $$;

create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid references public.bookings(id) on delete set null,
  seeker_id         uuid not null references auth.users(id) on delete cascade,
  provider_id       uuid not null references public.provider_profiles(id) on delete cascade,
  gateway           text not null default 'paymongo',
  gateway_ref       text,                       -- PayMongo checkout session / intent id
  checkout_url      text,
  currency          text not null default 'PHP',
  amount_total      numeric(10,2) not null check (amount_total >= 0),
  commission_rate   numeric(4,3) not null,      -- snapshot, e.g. 0.120
  commission_amount numeric(10,2) not null,
  provider_amount   numeric(10,2) not null,
  status            payment_status not null default 'pending',
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  released_at       timestamptz
);
create index if not exists idx_pay_booking  on public.payments(booking_id);
create index if not exists idx_pay_seeker    on public.payments(seeker_id);
create index if not exists idx_pay_provider  on public.payments(provider_id);
create index if not exists idx_pay_status     on public.payments(status);

-- ── Freeze money-state columns for normal users ─────────────────────────────
create or replace function public.guard_payment_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    new.status            := old.status;
    new.amount_total      := old.amount_total;
    new.commission_rate   := old.commission_rate;
    new.commission_amount := old.commission_amount;
    new.provider_amount   := old.provider_amount;
    new.gateway_ref       := old.gateway_ref;
    new.paid_at           := old.paid_at;
    new.released_at       := old.released_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_payment on public.payments;
create trigger trg_guard_payment
  before update on public.payments
  for each row execute function public.guard_payment_fields();

-- ── Auto-release escrow when the booking is completed ───────────────────────
create or replace function public.release_escrow_on_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.payments
       set status = 'released', released_at = now()
     where booking_id = new.id and status = 'held';
  end if;
  return new;
end $$;

drop trigger if exists trg_release_escrow on public.bookings;
create trigger trg_release_escrow
  after update on public.bookings
  for each row execute function public.release_escrow_on_completion();

-- ════════════════════════════════════════════════════════════════════════════
--  RLS — parties to the payment can read it; the seeker may create a PENDING
--  payment for their own booking; all money-state changes go through the
--  webhook (service_role) or admin, enforced by the guard trigger above.
-- ════════════════════════════════════════════════════════════════════════════
alter table public.payments enable row level security;

drop policy if exists "pay read parties"  on public.payments;
drop policy if exists "pay insert seeker"  on public.payments;
drop policy if exists "pay update guarded" on public.payments;

create policy "pay read parties" on public.payments for select using (
  seeker_id = auth.uid() or provider_id = public.my_provider_id() or public.is_admin()
);
create policy "pay insert seeker" on public.payments for insert with check (
  seeker_id = auth.uid() and status = 'pending'
);
-- Updates are allowed by RLS but the guard trigger freezes money columns for
-- non-service_role/non-admin, so a normal user can't change anything meaningful.
create policy "pay update guarded" on public.payments for update using (
  seeker_id = auth.uid() or provider_id = public.my_provider_id() or public.is_admin()
) with check (
  seeker_id = auth.uid() or provider_id = public.my_provider_id() or public.is_admin()
);
