-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0066_video_packs.sql  (idempotent; safe to re-run)
--
--  WHY: the owner, 2026-11-19: "2 free video memory, once they see that add
--  they'd want more. Lets set the price … at 3 videos per 100 php", with
--  albums at 2.8× ("middle 2.8 2 free videos"). The album is the hook; the
--  video memories — unique to Megy Prints — are the add-on people buy.
--
--  What changes: order_quote() (0062), the price the database saves with
--  every order (orders.quote / quoted_amount):
--    • an album includes 2 video memories (was 7); a Megy Mini keeps its own
--      free count (pricing_model.mini_free_qr, 2);
--    • past those, videos come in packs of 3 for ₱100 (was ₱20 each): 1–3
--      extra = ₱100, 4–6 = ₱200, and so on. The quote records 'qr_packs'.
--  Nothing else in the price changes. The store multiple (2.8×) is a
--  setting, changed with this migration going live, not here.
--
--  The website and the app say and charge the same (src/lib/pricing.ts
--  FREE_QR_MEMORIES = 2, QR_PACK_SIZE = 3, QR_PACK_PRICE = 100;
--  orderQuote.spec holds them to this file).
--  Run AFTER 0062.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.order_quote(
  p_size text, p_cover text, p_pages integer, p_qr integer, p_years integer, p_hd boolean,
  p_schedule jsonb default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  s         jsonb := coalesce(p_schedule, public.public_price_schedule());
  z         jsonb;
  min_p     integer;
  pps       integer;
  cover     float8;
  sheet     float8;
  reserve   integer := 0;
  pages     integer := greatest(coalesce(p_pages, 0), 0);
  qr        integer := greatest(coalesce(p_qr, 0), 0);
  album_min integer;
  album     integer;
  qr_fee    integer;
  term      integer := 0;
  years     integer := null;
  hd        integer := 0;
  n         float8;
  free_qr   integer;
  price     integer;
  ship      integer;
  packs     integer := 0;
begin
  if s is null or p_size is null then return null; end if;

  -- hostingTermCharge(): the chosen term's tier price. The checkout only sets a
  -- term when the book carries QR memories (effectiveYears).
  if qr > 0 and p_years is not null and jsonb_typeof(s -> 'hosting_tiers') = 'array' then
    years := p_years;
    select greatest(0, floor((t ->> 'price')::float8 + 0.5))::integer into term
      from jsonb_array_elements(s -> 'hosting_tiers') with ordinality x(t, i)
     where jsonb_typeof(t) = 'object'
       and (t ->> 'years') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
       and (t ->> 'price') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
       and floor((t ->> 'years')::float8 + 0.5) >= 1
       and floor((t ->> 'years')::float8 + 0.5) = p_years
     order by floor((t ->> 'years')::float8 + 0.5), i
     limit 1;
    term := coalesce(term, 0);
  end if;

  -- hdMemoriesCharge(): only when the book carries memories.
  if coalesce(p_hd, false) and qr > 0 then
    n := (s ->> 'hd_memories_price')::float8;
    if n > 0 then hd := floor(n + 0.5)::integer; end if;
  end if;

  -- ── Megy Mini: a set price, shipping on top, its own free QR count ──
  if p_size = '5.8x8.3' then
    z := s -> 'mini';
    if z is null or jsonb_typeof(z) <> 'object' or p_cover is distinct from 'staple' then
      return null;
    end if;
    price   := (z ->> 'price')::integer;
    ship    := (z ->> 'shipping_fee')::integer;
    free_qr := greatest(coalesce((z ->> 'free_qr')::integer, 0), 0);
    if price is null or ship is null then return null; end if;
    packs  := ceil(greatest(0, qr - free_qr)::numeric / 3)::integer;
    qr_fee := packs * 100;
    return jsonb_build_object(
      'product',         'mini',
      'total',           price + ship + qr_fee + term + hd,
      'album',           price,
      'shipping',        ship,
      'extra_pages',     0,
      'extra_pages_fee', 0,
      'qr',              qr,
      'free_qr',         free_qr,
      'extra_qr',        greatest(0, qr - free_qr),
      'qr_packs',        packs,
      'qr_fee',          qr_fee,
      'years',           years,
      'term_fee',        term,
      'hd_fee',          hd
    );
  end if;

  -- ── Albums (0055, unchanged) ──
  z := s -> 'sizes' -> p_size;
  if z is null or jsonb_typeof(z) <> 'object' then return null; end if;
  min_p := (s ->> 'min_pages')::integer;
  pps   := (z ->> 'pps')::integer;
  sheet := (s ->> 'sheet_rate')::float8;
  -- pricing.ts: binding = cover === 'softcover' ? 'soft' : 'hard'
  cover := case when p_cover = 'softcover' then (z ->> 'soft_rate')::float8 else (z ->> 'hard_rate')::float8 end;
  if min_p is null or pps is null or pps < 1 or sheet is null or cover is null then return null; end if;
  n := (s ->> 'hosting_reserve')::float8;
  if n > 0 then reserve := floor(n + 0.5)::integer; end if;

  -- priceOf(): Math.round(sheets × sheet_rate + cover rate) + the reserve;
  -- sheets = ceil(max(min pages, pages) / pages a sheet).
  album_min := floor(ceil(min_p::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;
  album     := floor(ceil(greatest(min_p, pages)::numeric / pps)::integer * sheet + cover + 0.5)::integer + reserve;
  -- qrMemoryCharge(): 2 included, then packs of 3 for ₱100 (FREE_QR_MEMORIES, QR_PACK_SIZE, QR_PACK_PRICE).
  packs  := ceil(greatest(0, qr - 2)::numeric / 3)::integer;
  qr_fee := packs * 100;

  return jsonb_build_object(
    'total',           album + qr_fee + term + hd,
    'album',           album_min,
    'extra_pages',     greatest(0, pages - min_p),
    'extra_pages_fee', album - album_min,
    'qr',              qr,
    'free_qr',         2,
    'extra_qr',        greatest(0, qr - 2),
    'qr_packs',        packs,
    'qr_fee',          qr_fee,
    'years',           years,
    'term_fee',        term,
    'hd_fee',          hd
  );
end
$$;

-- ══════ Verify ══════
-- Album 8×8 softcover, 40 pages, the live list: 2 videos free; 3 → one pack;
-- 5 → one pack; 6 → two packs; 9 → three packs. The Megy Mini the same past
-- its own free count (when it is on sale; null otherwise).
select qr, (public.order_quote('8x8', 'softcover', 40, qr, null, false) ->> 'qr_fee') as album_fee,
       (public.order_quote('8x8', 'softcover', 40, qr, null, false) ->> 'qr_packs') as album_packs,
       (public.order_quote('5.8x8.3', 'staple', 16, qr, null, false) ->> 'qr_fee') as mini_fee
  from unnest(array[0, 2, 3, 5, 6, 8, 9]) as qr;
