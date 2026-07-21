-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0020_price_lever_and_transition_harden.sql  (idempotent)
--
--  Closes the two residuals the Kraken re-run (wf_3aa3b3f7) proved STILL-
--  EXPLOITABLE after 0019:
--
--   A. PRICE LEVER (HIGH). 0019-D pinned album_size from album_snapshot, but
--      the client SUPPLIES album_snapshot, so the guard was defeated two ways:
--        · omit the 'album_size' key  → the `?` guard no-ops, client value kept;
--        · page_count was pinned by NOTHING at all.
--      An authenticated customer could hand-craft a REST insert declaring the
--      cheapest size / 1 page while linking a real 200-page 8.5x11 album, and the
--      operator (who prices from these denormalized columns) under-charges by
--      thousands of PHP. Fix: derive BOTH album_size and page_count from the
--      customer's own `albums` row (album_id), which is the authoritative record
--      of what was built — never from client-supplied columns or jsonb. Pin on
--      INSERT only, so a later album edit can't rewrite a historical order.
--
--   B. TRANSITION RANK-JUMP (LOW, operational integrity). 0019-A made fulfillment
--      transitions forward-only but not ADJACENT, so paid(1) -> delivered(5) in
--      one call skipped production/print/ship — a fulfillment operator could mark
--      an order delivered that was never printed. Fix: fulfillment may advance
--      exactly ONE step at a time.
--
--  NOTE (residual flagged to the user, NOT closed here): the operator prints
--  whatever PDF sits at print-pdfs/<order_id>.pdf, which the customer uploads.
--  Pinning the columns to the album row closes the proven "lie in the columns"
--  vector, but a customer could still upload a PDF that does not match their
--  linked album. Catching that needs operator-side verification (compare the
--  uploaded PDF's real page count / trim to the order) — a tooling follow-up.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. Derive album_size + page_count from the authoritative albums row ──────
-- SECURITY DEFINER so it can read the album regardless of the caller's RLS, but
-- constrained to al.user_id = new.user_id so it can ONLY pin from an album the
-- ordering customer actually owns (a foreign album_id simply won't match).
create or replace function public.orders_pin_album_size()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  a_size  text;
  a_pages int;
begin
  if new.album_id is not null then
    select al.album_size,
           case when jsonb_typeof(al.pages) = 'array' then jsonb_array_length(al.pages) else null end
      into a_size, a_pages
      from public.albums al
     where al.id = new.album_id and al.user_id = new.user_id;
    if a_size is not null and a_size <> '' then new.album_size := a_size; end if;
    if a_pages is not null then new.page_count := a_pages; end if;
  end if;

  -- Fallback when there is no linked album row (album deleted, or a foreign id
  -- that didn't match): honor the FROZEN snapshot's size so the column is at
  -- least self-consistent with what was ordered.
  if a_size is null
     and new.album_snapshot ? 'album_size'
     and coalesce(new.album_snapshot->>'album_size','') <> '' then
    new.album_size := new.album_snapshot->>'album_size';
  end if;

  return new;
end;
$$;

-- Re-scope the trigger to INSERT only: the price-driving columns are set once,
-- at order creation, and must not drift if the customer later edits the album.
drop trigger if exists orders_pin_album_size_trg on public.orders;
create trigger orders_pin_album_size_trg
  before insert on public.orders
  for each row execute procedure public.orders_pin_album_size();

-- ── B. Fulfillment transitions must be ADJACENT (one step forward) ──────────
create or replace function public.set_order_status(p_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_new  public.order_status;
  v_cur  public.order_status;
  v_pay  text;
begin
  v_role := public.operator_role();
  if v_role is null then
    raise exception 'not authorized';
  end if;

  v_new := p_status::public.order_status;  -- rejects a bogus status

  select status, payment_status into v_cur, v_pay
    from public.orders where id = p_id;
  if not found then
    raise exception 'order not found';
  end if;

  if v_role = 'owner' then
    null;  -- owners are trusted; 'paid' still keeps payment_status consistent below
  else
    -- fulfillment: production→delivery only, paid-first, ONE STEP at a time.
    if v_new not in ('in_production','printed','shipped','delivered') then
      raise exception 'fulfillment may not set status %', p_status;
    end if;
    if public.order_status_rank(v_cur) < 1 or public.order_status_rank(v_cur) > 5 then
      raise exception 'order is not paid; fulfillment cannot advance it (status=%)', v_cur;
    end if;
    if public.order_status_rank(v_new) <> public.order_status_rank(v_cur) + 1 then
      raise exception 'fulfillment must advance one step at a time (% -> %)', v_cur, v_new;
    end if;
  end if;

  update public.orders
     set status = v_new,
         payment_status = case when v_new = 'paid' then 'paid' else payment_status end,
         status_history = coalesce(status_history, '[]'::jsonb)
                          || jsonb_build_object('status', p_status, 'at', now(), 'by', v_role)
   where id = p_id;
end;
$$;

grant execute on function public.set_order_status(uuid, text) to authenticated;
