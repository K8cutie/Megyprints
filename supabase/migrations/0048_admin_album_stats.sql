-- ════════════════════════════════════════════════════════════════════════════
--  MEGY PRINTS — 0048_admin_album_stats.sql  (idempotent; safe to re-run)
--
--  WHY: the owner wants a statistics page in /admin "to study patterns"
--  (2026-10-21): how many photos people put in an album, what shape those
--  photos are, which sizes and occasions they pick, and how varied the pages
--  come out. Everything the page needs is already saved with each album
--  (albums.photos widths/heights, albums.pages layouts), but albums are
--  private to their owners (RLS), so the owner console can't read them.
--
--  admin_album_stats() returns ONE ROW PER ALBUM, made of numbers only:
--    • no album id, user id, title, photo name, photo link or caption text;
--    • the occasion is one of the 7 occasion chips, or the customer's own
--      words only when at least 3 albums share them (else "Something else"),
--      so a one-off like "Maria's debut" never reaches the page;
--    • each page is "<layout id>|<photos on it>|<boxes holding something>".
--  The page (src/lib/adminAlbumStats.ts) turns these rows into the stats.
--
--  p_exclude_team (on by default) leaves out the owner and Team accounts'
--  albums: they are walkthroughs and tests, not customers.
--
--  Owner only: anyone else, signed in or not, gets 'not authorized'. Newest
--  albums first, at most p_limit (default 2,000, capped at 5,000) so the
--  page stays light as albums grow; total_matching says how many there are.
--
--  Run AFTER 0046. (0047 is the event guest albums branch; this file does
--  not depend on it.)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.admin_album_stats(
  p_paid_only    boolean default false,
  p_exclude_team boolean default true,
  p_since        timestamptz default null,
  p_limit     integer default 2000
)
returns table (
  album_size     text,
  occasion       text,
  photos         integer,
  left_out       integer,
  portrait       integer,
  landscape      integer,
  square         integer,
  extra_wide     integer,
  extra_tall     integer,
  unknown_shape  integer,
  paid           boolean,
  made_on        date,
  pages          text[],
  total_matching bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.operator_role() is distinct from 'owner' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with base as (
    select
      a.album_size,
      nullif(btrim(a.occasion), '') as occ,
      case when jsonb_typeof(a.photos) = 'array' then a.photos else '[]'::jsonb end as ph,
      case when jsonb_typeof(a.pages)  = 'array' then a.pages  else '[]'::jsonb end as pg,
      exists (
        select 1 from public.orders o
         where o.album_id = a.id and o.payment_status = 'paid'
      ) as is_paid,
      a.created_at
    from public.albums a
    left join auth.users u on u.id = a.user_id
    where (p_since is null or a.created_at >= p_since)
      -- "Leave out our own": the owner accounts (the same two as
      -- operator_role() in 0007) and everyone on the Team tab — their albums
      -- are walkthroughs and tests, not customers.
      and (not p_exclude_team or not (
            lower(coalesce(u.email, '')) in ('archgarcia@gmail.com', 'megyprints@gmail.com')
            or exists (select 1 from public.operator_roles r where lower(r.email) = lower(u.email))))
  ),
  kept as (
    select * from base b where not p_paid_only or b.is_paid
  ),
  shared_words as (
    select lower(k.occ) as w, count(*) as n
      from kept k
     where k.occ is not null
     group by 1
  )
  select
    k.album_size,
    case
      when k.occ is null then null
      when lower(k.occ) in ('wedding', 'baptism', 'birthday', 'baby', 'graduation', 'family', 'vacation')
        then initcap(lower(k.occ))
      when (select s.n from shared_words s where s.w = lower(k.occ)) >= 3
        then lower(k.occ)
      else 'Something else'
    end,
    jsonb_array_length(k.ph),
    sh.left_out::integer,
    sh.portrait::integer,
    sh.landscape::integer,
    sh.square::integer,
    sh.extra_wide::integer,
    sh.extra_tall::integer,
    sh.unknown_shape::integer,
    k.is_paid,
    k.created_at::date,
    coalesce((
      select array_agg(
               coalesce(x.page ->> 'templateId', '')
               || '|' ||
               (select count(*) from jsonb_array_elements(
                  case when jsonb_typeof(x.page -> 'slotFills') = 'array' then x.page -> 'slotFills' else '[]'::jsonb end
                ) f where f <> 'null'::jsonb)::text
               || '|' ||
               ((select count(*) from jsonb_array_elements(
                   case when jsonb_typeof(x.page -> 'textElements') = 'array' then x.page -> 'textElements' else '[]'::jsonb end
                 ) t where jsonb_typeof(t -> 'boxIndex') = 'number')
                + (select count(*) from jsonb_array_elements(
                   case when jsonb_typeof(x.page -> 'textSlotFills') = 'array' then x.page -> 'textSlotFills' else '[]'::jsonb end
                 ) f where f <> 'null'::jsonb)
                + (select count(*) from jsonb_array_elements(
                   case when jsonb_typeof(x.page -> 'textSlotQr') = 'array' then x.page -> 'textSlotQr' else '[]'::jsonb end
                 ) q where q <> 'null'::jsonb)
                + (select count(*) from jsonb_array_elements(
                   case when jsonb_typeof(x.page -> 'textSlotOrnament') = 'array' then x.page -> 'textSlotOrnament' else '[]'::jsonb end
                 ) o where o <> 'null'::jsonb))::text
               order by x.ord)
        from jsonb_array_elements(k.pg) with ordinality as x(page, ord)
       where jsonb_typeof(x.page) = 'object'
    ), '{}'::text[]),
    count(*) over ()
  from kept k
  -- Shapes, by width ÷ height. Square is within 5%; past 1.6 (16:9,
  -- panoramas) is extra wide, under 1/1.6 (9:16, phone screenshots) extra
  -- tall; a photo without a usable size is "unknown". The nested CASE makes
  -- the number check run before the cast, so one odd photo can't fail the call.
  cross join lateral (
    select
      count(*) filter (where jsonb_typeof(p) = 'object' and p -> 'leftOut' = 'true'::jsonb) as left_out,
      count(*) filter (where d.r >= 0.625 and d.r < 0.95)  as portrait,
      count(*) filter (where d.r > 1.05 and d.r <= 1.6)    as landscape,
      count(*) filter (where d.r between 0.95 and 1.05)    as square,
      count(*) filter (where d.r > 1.6)                    as extra_wide,
      count(*) filter (where d.r < 0.625)                  as extra_tall,
      count(*) filter (where d.r is null)                  as unknown_shape
    from jsonb_array_elements(k.ph) p
    cross join lateral (
      select case
        when jsonb_typeof(p -> 'width') = 'number' and jsonb_typeof(p -> 'height') = 'number' then
          case when (p ->> 'width')::numeric > 0 and (p ->> 'height')::numeric > 0
               then (p ->> 'width')::numeric / (p ->> 'height')::numeric end
      end as r
    ) d
  ) sh
  order by k.created_at desc
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$$;

revoke all on function public.admin_album_stats(boolean, boolean, timestamptz, integer) from public;
revoke execute on function public.admin_album_stats(boolean, boolean, timestamptz, integer) from anon;
grant execute on function public.admin_album_stats(boolean, boolean, timestamptz, integer) to authenticated;

-- ── Verify (read-only) ─────────────────────────────────────────────────────
-- Owner only: see supabase/security/album-stats-proof.sql.
-- select has_function_privilege('anon', 'public.admin_album_stats(boolean, boolean, timestamptz, integer)', 'execute');  -- false
