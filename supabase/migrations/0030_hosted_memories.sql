-- 0030 — Hosted living memories + tiered hosting terms (owner decisions, 2026-09-09)
--
-- WHAT CHANGES
--   1. A QR memory can now be a CLIP the customer uploads in the app (kind='clip'),
--      stored in the public `memory-clips` bucket at `<code>.<ext>`; the memory row's
--      destination is that object's public URL. The printed QR is unchanged: it
--      still encodes /m/<code>, and the resolver plays the clip on the branded page.
--      Existing 'link' memories (YouTube etc.) keep resolving forever — they are
--      printed in people's homes.
--   2. Hosting is sold by TERM: pricing_model.hosting_tiers = [{years, price}].
--      The chosen term is stored on the order (hosting_years) and stamped on each
--      memory row as expires_at. An expired memory shows a renewal page instead
--      of the clip (never a dead link). Link memories carry no expiry (they cost
--      nothing to host).
--   3. resolve_memory() now also returns kind + expires_at (return type changed →
--      drop + recreate; grants re-applied).
--
-- SAFETY
--   Additive. The live client ignores `hosting_tiers`/`kind`/`expires_at`; the new
--   client turns hosted mode ON only when the schedule carries hosting_tiers — so
--   deploying the client before this migration keeps the old link flow working.
--   The bucket insert is best-effort (some environments reject storage DDL from
--   SQL); if the verify block reports it missing, create the bucket in the
--   dashboard: name `memory-clips`, PUBLIC, 100 MB limit, video/* mime types.

-- ── 1. Hosting tiers on the pricing model ───────────────────────────────────
alter table public.pricing_model
  add column if not exists hosting_tiers jsonb not null default
  '[{"years":5,"price":0},{"years":10,"price":99},{"years":15,"price":149},{"years":20,"price":199}]'::jsonb;

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
    return null;
  end if;

  select to_jsonb(s) into srow from public.store_settings s where s.id = 1;
  mult     := coalesce((srow ->> 'price_multiple')::numeric, 3);
  disabled := coalesce(srow -> 'disabled_sizes', '[]'::jsonb);

  for k, v in select * from jsonb_each(m.sizes) loop
    out_sizes := out_sizes || jsonb_build_object(k, jsonb_build_object(
      'pps',       (v ->> 'pps')::int,
      'soft_rate', (m.soft_cover_cost + m.soft_bind_cost) * mult + (v ->> 'surcharge')::numeric,
      'hard_rate', (v ->> 'hb')::numeric * mult + (v ->> 'surcharge')::numeric
    ));
  end loop;

  return jsonb_build_object(
    'min_pages',       m.min_pages,
    'sheet_rate',      m.sheet_cost * mult,
    'hosting_reserve', m.hosting_reserve,
    'hosting_tiers',   m.hosting_tiers,     -- flat add-ons, NOT multiplied
    'disabled_sizes',  disabled,
    'sizes',           out_sizes
  );
end
$$;

revoke all on function public.public_price_schedule() from public;
grant execute on function public.public_price_schedule() to anon, authenticated;

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
    'hosting_reserve', m.hosting_reserve,
    'hosting_tiers',   m.hosting_tiers,
    'sizes',           m.sizes,
    'price_multiple',  coalesce((srow ->> 'price_multiple')::numeric, 3)
  );
end
$$;

revoke all on function public.owner_pricing_model() from public;
grant execute on function public.owner_pricing_model() to authenticated;

-- Owner write: retune the tiers from the Pricing panel. Shape-validated so a
-- malformed save can't break checkout for everyone.
create or replace function public.set_hosting_tiers(p_tiers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t jsonb;
  n integer := 0;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_tiers is null or jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) < 1
     or jsonb_array_length(p_tiers) > 8 then
    raise exception 'hosting tiers must be an array of 1–8 entries' using errcode = '22023';
  end if;
  for t in select * from jsonb_array_elements(p_tiers) loop
    n := n + 1;
    if jsonb_typeof(t -> 'years') <> 'number' or jsonb_typeof(t -> 'price') <> 'number'
       or (t ->> 'years')::numeric < 1 or (t ->> 'years')::numeric > 50
       or (t ->> 'price')::numeric < 0 or (t ->> 'price')::numeric > 100000 then
      raise exception 'tier % must be {years: 1–50, price: 0–100000}', n using errcode = '22023';
    end if;
  end loop;
  update public.pricing_model
     set hosting_tiers = p_tiers, updated_at = now()
   where id = 1;
  return p_tiers;
end
$$;

revoke all on function public.set_hosting_tiers(jsonb) from public;
grant execute on function public.set_hosting_tiers(jsonb) to authenticated;

-- ── 2. Memory rows: kind + expiry ───────────────────────────────────────────
alter table public.qr_memories
  add column if not exists kind text not null default 'link';
alter table public.qr_memories drop constraint if exists qr_memories_kind_chk;
alter table public.qr_memories
  add constraint qr_memories_kind_chk check (kind in ('link', 'clip'));
alter table public.qr_memories
  add column if not exists expires_at timestamptz;

-- The customer's client may stamp AT MOST the included term at checkout (the
-- shortest tier); the PAID term is applied by the operator once the order is
-- marked paid (apply_order_hosting_term below) — the same trust model as the
-- order amount, which the client can't set either. The UPDATE column grant
-- stays (destination, title) from 0013, so no customer can extend a term.
create or replace function public.included_hosting_years()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select min((t ->> 'years')::int)
       from public.pricing_model m, jsonb_array_elements(m.hosting_tiers) t
      where m.id = 1 and jsonb_typeof(t -> 'years') = 'number'),
    5);
$$;
revoke all on function public.included_hosting_years() from public;
grant execute on function public.included_hosting_years() to anon, authenticated;

drop policy if exists "Users create own memories" on public.qr_memories;
create policy "Users create own memories"
  on public.qr_memories for insert
  with check (
    auth.uid() = user_id
    and scan_count = 0
    and (expires_at is null
         or expires_at <= now() + make_interval(years => public.included_hosting_years()) + interval '1 day')
  );

revoke update on public.qr_memories from authenticated;
grant  update (destination, title) on public.qr_memories to authenticated;

-- Operator: after "Mark paid", extend every CLIP memory on the order's album
-- to the term the customer bought (orders.hosting_years). Reads the codes out
-- of the frozen album_snapshot (both QR homes, camelCase or snake_case keys).
-- Idempotent: expiry is created_at + years, so re-running never stacks.
create or replace function public.apply_order_hosting_term(p_order_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  o     public.orders%rowtype;
  codes text[];
  n     integer := 0;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.hosting_years is null then return 0; end if;

  select array_agg(distinct f ->> 'code') into codes
    from jsonb_array_elements(coalesce(o.album_snapshot -> 'pages', '[]'::jsonb)) p,
         jsonb_array_elements(
           coalesce(p -> 'qrFills', p -> 'qr_fills', '[]'::jsonb)
           || coalesce(p -> 'textSlotQr', p -> 'text_slot_qr', '[]'::jsonb)) f
   where jsonb_typeof(f) = 'object' and (f ->> 'code') ~ '^[a-z2-9]{4,32}$';
  if codes is null then return 0; end if;

  update public.qr_memories m
     set expires_at = m.created_at + make_interval(years => o.hosting_years)
   where m.code = any(codes)
     and m.user_id = o.user_id
     and m.kind = 'clip';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.apply_order_hosting_term(uuid) from public;
grant execute on function public.apply_order_hosting_term(uuid) to authenticated;

drop function if exists public.resolve_memory(text);
create function public.resolve_memory(p_code text)
returns table(destination text, title text, kind text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.qr_memories m
       set scan_count = m.scan_count + 1
     where m.code = p_code
    returning m.destination, m.title, m.kind, m.expires_at;
end;
$$;
revoke all on function public.resolve_memory(text) from public;
grant execute on function public.resolve_memory(text) to anon, authenticated;

-- Operator renewal: extend a memory's term (after the customer pays). Owner-gated.
create or replace function public.renew_memory(p_code text, p_years integer)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare new_exp timestamptz;
begin
  if coalesce(auth.jwt() ->> 'email', '')
     not in ('archgarcia@gmail.com', 'megyprints@gmail.com') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_years is null or p_years < 1 or p_years > 50 then
    raise exception 'years must be 1–50' using errcode = '22023';
  end if;
  update public.qr_memories
     set expires_at = greatest(coalesce(expires_at, now()), now()) + make_interval(years => p_years)
   where code = p_code
  returning expires_at into new_exp;
  return new_exp;
end
$$;
revoke all on function public.renew_memory(text, integer) from public;
grant execute on function public.renew_memory(text, integer) to authenticated;

-- ── 3. The chosen term on the order ─────────────────────────────────────────
alter table public.orders add column if not exists hosting_years integer;
alter table public.orders drop constraint if exists orders_hosting_years_chk;
alter table public.orders
  add constraint orders_hosting_years_chk
  check (hosting_years is null or (hosting_years between 1 and 50));

drop function if exists public.operator_orders(integer, integer);
create function public.operator_orders(p_limit integer default 100, p_offset integer default 0)
returns table (
  id uuid, order_number text, status text, payment_status text, amount numeric,
  currency text, album_size text, material text, cover text, page_count integer,
  hosting_years integer,
  ship_name text, ship_phone text, ship_address text, tracking text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare r text;
begin
  r := public.operator_role();
  if r is null then return; end if;
  return query
    select o.id, o.order_number, o.status::text, o.payment_status,
           case when r = 'owner' then o.amount else null end,
           o.currency, o.album_size, o.material, o.cover, o.page_count,
           o.hosting_years,
           o.ship_name, o.ship_phone, o.ship_address, o.tracking,
           o.created_at, o.updated_at
    from public.orders o
    order by o.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0));
end;
$$;
revoke all on function public.operator_orders(integer, integer) from public;
grant execute on function public.operator_orders(integer, integer) to authenticated;

-- ── 4. Clip storage: public bucket, upload by signed-in customers ────────────
-- PUBLIC read: the 8-char code (~40 bits, crypto RNG) is the secret, exactly as
-- it is for the printed QR; the bucket is never listable (no SELECT policy), so
-- the public URL is reachable only by someone who already holds the code.
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('memory-clips', 'memory-clips', true, 104857600,
          array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception when others then
  raise notice 'memory-clips bucket not created via SQL (%): create it in the dashboard', sqlerrm;
end $$;

drop policy if exists "Customers upload memory clips"     on storage.objects;
drop policy if exists "Owners replace own memory clips"   on storage.objects;
drop policy if exists "Owners delete own memory clips"    on storage.objects;

-- Upload: any signed-in customer, ONLY into this bucket, ONLY at a code-shaped
-- name with a video extension, and at most 200 clips per account (a wallet
-- guard: the bucket caps a FILE at 100 MB, this caps an ACCOUNT at ~20 GB).
-- No listing, no reading through the API.
create policy "Customers upload memory clips"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'memory-clips'
    and name ~ '^[a-z2-9]{4,32}\.(mp4|mov|webm|m4v)$'
    and (select count(*) from storage.objects o
          where o.bucket_id = 'memory-clips' and o.owner_id = auth.uid()::text) < 200
  );

-- Replace / delete: only the uploader (storage stamps owner_id = auth.uid()).
create policy "Owners replace own memory clips"
  on storage.objects for update to authenticated
  using  (bucket_id = 'memory-clips' and owner_id = auth.uid()::text)
  with check (bucket_id = 'memory-clips' and owner_id = auth.uid()::text
              and name ~ '^[a-z2-9]{4,32}\.(mp4|mov|webm|m4v)$');

create policy "Owners delete own memory clips"
  on storage.objects for delete to authenticated
  using (bucket_id = 'memory-clips' and owner_id = auth.uid()::text);

-- ── Verify ──────────────────────────────────────────────────────────────────
select
  'schedule carries hosting_tiers' as check,
  (jsonb_typeof(public.public_price_schedule() -> 'hosting_tiers') = 'array')::text as result
union all
select 'schedule still leaks no cost/multiple',
  (not (public.public_price_schedule() ?| array['price_multiple','sheet_cost','hb','surcharge']))::text
union all
select 'qr_memories.kind + expires_at exist',
  (select count(*) = 2 from information_schema.columns
    where table_schema = 'public' and table_name = 'qr_memories'
      and column_name in ('kind', 'expires_at'))::text
union all
select 'authenticated cannot update expires_at',
  (not has_column_privilege('authenticated', 'public.qr_memories', 'expires_at', 'UPDATE'))::text
union all
select 'memory-clips bucket exists (else create in dashboard)',
  (exists (select 1 from storage.buckets where id = 'memory-clips'))::text
union all
select 'memory-clips bucket is public',
  (coalesce((select public from storage.buckets where id = 'memory-clips'), false))::text
union all
select 'anon cannot set tiers / renew / apply term',
  (not has_function_privilege('anon', 'public.set_hosting_tiers(jsonb)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.renew_memory(text, integer)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.apply_order_hosting_term(uuid)', 'EXECUTE'))::text
union all
select 'included term resolves (default 5)',
  (public.included_hosting_years() between 1 and 50)::text;
