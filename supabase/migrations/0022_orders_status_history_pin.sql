-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0022_orders_status_history_pin.sql  (idempotent; safe to re-run)
--
--  orders.status_history was client-supplied on INSERT: the customer INSERT
--  policy (0003_rls_lockdown) pins user_id/status/payment_status/amount/tracking
--  but says NOTHING about status_history, and nothing seeded it server-side. So a
--  hand-crafted PostgREST insert could plant an arbitrary lifecycle history on a
--  brand-new order (e.g. a fake "paid" entry) to mislead the operator's audit view.
--
--  FIX: a BEFORE INSERT trigger that force-sets status_history to the single
--  correct initial entry, ignoring whatever the client sent. RLS-independent, so
--  it fires for EVERY writer (authenticated via PostgREST and service_role).
--  set_order_status (0019/0020) still owns all later appends on UPDATE.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.orders_seed_status_history()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Ignore any client-provided history; a new order always starts here.
  new.status_history := jsonb_build_array(
    jsonb_build_object('status', 'pending_payment', 'at', now())
  );
  return new;
end;
$$;

drop trigger if exists trg_orders_seed_status_history on public.orders;
create trigger trg_orders_seed_status_history
  before insert on public.orders
  for each row execute function public.orders_seed_status_history();
