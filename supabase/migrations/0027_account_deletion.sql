-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0027_account_deletion.sql  (idempotent; safe to re-run)
--
--  WHY: Google Play's User Data policy (full enforcement since 2024-04-15)
--  requires that any app which lets users CREATE an account also lets them
--  DELETE it — through BOTH an in-app path and a public web URL. Megyprints
--  creates accounts (email/password + Google OAuth), so without this the app is
--  a straight rejection at review. This migration is the server half.
--
--  ---------------------------------------------------------------------------
--  THE PROBLEM THIS HAD TO SOLVE FIRST
--
--  `orders.user_id` was declared `references auth.users on delete CASCADE`.
--  So the obvious implementation — delete the auth user, let the cascades do the
--  rest — would silently destroy every ORDER that customer ever placed: the
--  order numbers, the amounts, the paid/shipped history. Those are the shop's
--  financial records. A customer exercising a privacy right must not be able to
--  erase the bookkeeping for a sale that actually happened (BIR keeps its own
--  opinion about that, and so does every tax authority).
--
--  Google's policy explicitly allows retaining data for legitimate purposes —
--  legal compliance among them — provided it is DISCLOSED. So the split is:
--
--    DELETED OUTRIGHT   the account itself, the profile, every album, every QR
--                       "living memory" link, every print-ready PDF (which
--                       contains the customer's photos), and the frozen
--                       album_snapshot on each order (photos again).
--    RETAINED, SCRUBBED the bare financial record: order number, amount,
--                       currency, status + its timestamp history, size /
--                       material / page count. Detached from any user, with
--                       every piece of personal data (name, phone, the whole
--                       structured address, tracking number) nulled out.
--
--  To make that possible, orders.user_id becomes NULLABLE with ON DELETE SET
--  NULL. The RLS policies are unchanged and still hold: they compare
--  `auth.uid() = user_id`, and `auth.uid() = NULL` is NULL, never true — so a
--  scrubbed order is invisible to every customer, including a future account
--  that somehow reuses the id. Operators still see it (their policy keys off
--  operator_role(), not user_id), which is the point — the books stay readable.
--
--  ---------------------------------------------------------------------------
--  THE SECOND PROBLEM: THE SHIPPING CHECK CONSTRAINTS
--
--  0009/0010/0011 added six CHECK constraints demanding ship_name, ship_phone,
--  ship_address, ship_zip, ship_region and the structured parts all be present
--  and well-formed. They are NOT VALID, which grandfathers PRE-EXISTING rows —
--  but NOT VALID does not exempt UPDATEs. Scrubbing those columns to NULL would
--  therefore be rejected by the very constraints that protect checkout.
--
--  Rewriting them as `customer_deleted_at is not null OR (<original rule>)` is
--  the honest reading: the rule was always "a LIVE order must be deliverable."
--  An anonymized record is not a live order and has nothing left to deliver.
--  Each constraint keeps its original text verbatim inside the OR, and stays
--  NOT VALID so no full-table validation is triggered on production.
--
--  ---------------------------------------------------------------------------
--  WHAT IS DELIBERATELY *NOT* HERE
--
--  • No service-role key. This project has never shipped one (see api/m.mjs) and
--    this doesn't introduce one. Deletion runs as a SECURITY DEFINER RPC scoped
--    hard to auth.uid(), taking no arguments — there is no id to tamper with.
--  • No deletion of the storage BLOB from SQL, and no customer-side storage
--    policy either — section 4 records why both were tried and rejected.
--    api/delete-account.mjs removes the PDFs through the Storage API first; this
--    function REFUSES to run while any of them remain (see the guard below), so
--    "your photos are deleted" is never a claim we cannot back.
--  • No self-service deletion while money is in flight. An order that is paid
--    but not yet delivered is blocked with a readable error naming the order.
--    That is the "ongoing transaction" carve-out in the policy, and the public
--    /delete-account.html page carries the email route for those cases.
--
--  Run AFTER 0026.
-- ════════════════════════════════════════════════════════════════════════════

-- ══════ 1. The marker that says "this row outlived its customer" ══════
alter table public.orders
  add column if not exists customer_deleted_at timestamptz;

comment on column public.orders.customer_deleted_at is
  'Set when the customer deleted their account. The row is retained as a '
  'financial record only: user_id is detached and every personal field is '
  'nulled. Never set by the client — only by public.delete_own_account().';

create index if not exists idx_orders_customer_deleted
  on public.orders(customer_deleted_at)
  where customer_deleted_at is not null;

-- ══════ 2. orders.user_id must SURVIVE the user (was: ON DELETE CASCADE) ══════
alter table public.orders alter column user_id drop not null;

-- Drop whatever the FK is actually called in this database rather than assuming
-- the default name, so a hand-created environment doesn't silently keep CASCADE.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'orders'
       and con.contype = 'f'
       and con.conkey = array[
             (select attnum from pg_attribute
               where attrelid = con.conrelid and attname = 'user_id')
           ]::int2[]
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- ══════ 3. Shipping CHECKs tolerate the anonymized state ══════
-- Each keeps its 0009/0010/0011 rule verbatim inside the OR; only the escape
-- hatch for a customer-deleted row is new. All stay NOT VALID (unchanged
-- grandfathering semantics — see the go-live notes in 0009/0010/0011).

alter table public.orders drop constraint if exists orders_ship_name_chk;
alter table public.orders
  add constraint orders_ship_name_chk
    check (
      customer_deleted_at is not null
      or (
        ship_name is not null
        and char_length(btrim(ship_name)) between 2 and 80
        and ship_name ~ '[[:alpha:]]'
      )
    ) not valid;

alter table public.orders drop constraint if exists orders_ship_phone_chk;
alter table public.orders
  add constraint orders_ship_phone_chk
    check (
      customer_deleted_at is not null
      or (ship_phone is not null and ship_phone ~ '^\+639\d{9}$')
    ) not valid;

alter table public.orders drop constraint if exists orders_ship_address_chk;
alter table public.orders
  add constraint orders_ship_address_chk
    check (
      customer_deleted_at is not null
      or (ship_address is not null and char_length(btrim(ship_address)) between 10 and 600)
    ) not valid;

alter table public.orders drop constraint if exists orders_ship_zip_chk;
alter table public.orders
  add constraint orders_ship_zip_chk
    check (
      customer_deleted_at is not null
      or (ship_zip is not null and ship_zip ~ '^\d{4}$')
    ) not valid;

alter table public.orders drop constraint if exists orders_ship_region_chk;
alter table public.orders
  add constraint orders_ship_region_chk
    check (
      customer_deleted_at is not null
      or (char_length(btrim(coalesce(ship_region, ''))) between 1 and 120)
    ) not valid;

alter table public.orders drop constraint if exists orders_ship_structured_chk;
alter table public.orders
  add constraint orders_ship_structured_chk
    check (
      customer_deleted_at is not null
      or (
        char_length(btrim(coalesce(ship_province, ''))) between 1 and 120
        and char_length(btrim(coalesce(ship_city, '')))     between 1 and 120
        and char_length(btrim(coalesce(ship_barangay, ''))) between 1 and 120
        and char_length(btrim(coalesce(ship_street, '')))   between 3 and 120
        and ship_street ~ '[[:alnum:]]'
      )
    ) not valid;

-- ══════ 4. NO customer-side storage policy — and the reason, so it isn't re-added ══════
-- The obvious design was a DELETE policy on storage.objects letting a customer
-- remove the print PDF for their own non-active order, so the browser could
-- clear its own photos before calling the function below. It was written, and it
-- does not work. Proven against a live local stack:
--
--   • The policy predicate matched (`policy_would_allow = t` for a delivered
--     order belonging to the caller).
--   • The Storage API still returned 403 AccessDenied. It LOOKS THE OBJECT UP
--     before deleting it, and 0008 gives customers no SELECT on print-pdfs, so
--     the request dies at the lookup and the delete rule is never consulted.
--     (`select count(*) from storage.objects` as that customer returns 0.)
--
-- Adding the SELECT policy needed to get past the lookup would let every
-- customer download their print-ready PDF — precisely what 0008 exists to
-- prevent ("so the finished album can't be taken to another printer"). A privacy
-- feature must not quietly undo a business rule.
--
-- Bypassing storage.protect_delete from SQL (it honors a
-- `storage.allow_delete_query` GUC) was rejected for the same class of reason:
-- it deletes the ROW and leaves the FILE, so the customer's photos would remain
-- on disk after we told them they were gone.
--
-- The removal therefore happens in api/delete-account.mjs with the service key,
-- scoped to print-pdfs objects belonging to an order owned by the verified
-- caller. That endpoint still calls delete_own_account() below with the
-- CUSTOMER's token, so the database — not the endpoint — decides whether the
-- deletion may proceed. The guard in step (b) of that function is what makes the
-- arrangement safe: if the PDFs are not actually gone, nothing is deleted.
drop policy if exists "print_pdfs_delete_own_inactive_order" on storage.objects;

-- ══════ 5. Preflight — what deletion will actually do, before it does it ══════
-- Lets the UI show real numbers and name any blocking order instead of a vague
-- "something went wrong" after the user has already typed DELETE.
create or replace function public.account_deletion_preflight()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_albums   int;
  v_memories int;
  v_orders   int;
  v_blocking jsonb;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  select count(*) into v_albums   from public.albums      a where a.user_id = v_uid;
  select count(*) into v_memories from public.qr_memories m where m.user_id = v_uid;
  select count(*) into v_orders   from public.orders      o where o.user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_number', o.order_number,
           'status',       o.status
         ) order by o.created_at), '[]'::jsonb)
    into v_blocking
    from public.orders o
   where o.user_id = v_uid
     and o.status in ('paid', 'in_production', 'printed', 'shipped');

  return jsonb_build_object(
    'albums',   v_albums,
    'memories', v_memories,
    'orders',   v_orders,
    'blocking', v_blocking
  );
end;
$$;

-- ══════ 6. The deletion itself ══════
-- Takes NO arguments on purpose: there is no id for a caller to swap. Everything
-- it touches is keyed to auth.uid(), and the whole thing is one transaction —
-- if the auth.users delete fails, the scrub rolls back with it, so an account
-- can never be left half-erased.
create or replace function public.delete_own_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_blocked  text;
  v_pdfs     int;
  v_albums   int;
  v_memories int;
  v_orders   int;
begin
  if v_uid is null then
    raise exception 'You are not signed in.' using errcode = '28000';
  end if;

  -- (a) Money in flight: paid but not yet delivered. Refuse, and name it.
  select string_agg(o.order_number, ', ' order by o.created_at)
    into v_blocked
    from public.orders o
   where o.user_id = v_uid
     and o.status in ('paid', 'in_production', 'printed', 'shipped');

  if v_blocked is not null then
    raise exception
      'Order % is paid and not yet delivered, so the account cannot be deleted yet. Contact the shop to cancel or complete it first.',
      v_blocked
      using errcode = 'P0001';
  end if;

  -- (b) The print PDFs hold the customer's photos. SQL can only unlink the row,
  --     which would strand the file — so the client must have removed them
  --     through the Storage API before calling. Verify rather than assume.
  select count(*) into v_pdfs
    from storage.objects s
    join public.orders o on s.name = o.id::text || '.pdf'
   where s.bucket_id = 'print-pdfs'
     and o.user_id = v_uid;

  if v_pdfs > 0 then
    raise exception
      'Could not remove % print file(s) holding your photos, so nothing was deleted. Please try again.',
      v_pdfs
      using errcode = 'P0001';
  end if;

  -- (c) Retain the financial record, strip the person out of it.
  --     status_history is KEPT: it is only {status, at} pairs (0022) — the audit
  --     trail for a real sale, with no personal data in it.
  update public.orders o
     set status              = case when o.status = 'pending_payment'
                                    then 'cancelled'::public.order_status
                                    else o.status end,
         ship_name           = null,
         ship_phone          = null,
         ship_address        = null,
         ship_region         = null,
         ship_province       = null,
         ship_city           = null,
         ship_barangay       = null,
         ship_street         = null,
         ship_zip            = null,
         tracking            = null,
         album_snapshot      = '{}'::jsonb,   -- the frozen copy of their photos
         album_id            = null,
         customer_deleted_at = now(),
         user_id             = null           -- detach; RLS then hides it from every customer
   where o.user_id = v_uid;
  get diagnostics v_orders = row_count;

  -- (d) Everything that is purely theirs goes.
  delete from public.qr_memories m where m.user_id = v_uid;
  get diagnostics v_memories = row_count;

  delete from public.albums a where a.user_id = v_uid;
  get diagnostics v_albums = row_count;

  delete from public.user_profiles p where p.id = v_uid;

  -- (e) The account. Anything still referencing it cascades away here by design.
  delete from auth.users u where u.id = v_uid;

  return jsonb_build_object(
    'deleted_albums',    v_albums,
    'deleted_memories',  v_memories,
    'anonymized_orders', v_orders
  );
end;
$$;

-- ══════ 7. Grants (0026's lesson: never rely on ambient default privileges) ══════
revoke all on function public.account_deletion_preflight() from public;
grant execute on function public.account_deletion_preflight() to authenticated;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

-- ══════ 8. Verify ══════
-- As a signed-in customer:
--   select public.account_deletion_preflight();
--   select public.delete_own_account();
-- As the operator, the books should still be there, minus the person:
--   select order_number, status, amount, customer_deleted_at, user_id, ship_name
--     from public.orders where customer_deleted_at is not null;
-- Anonymous must be refused outright:
--   select public.delete_own_account();  -- expect: permission denied for function
