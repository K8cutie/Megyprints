select a.id, a.album_size, a.photos_per_page, a.updated_at,
  coalesce(jsonb_array_length(case when jsonb_typeof(a.photos)='array' then a.photos end), 0) as photo_count,
  (select coalesce(jsonb_agg(p->>'id'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(a.photos)='array' then a.photos else '[]'::jsonb end) p) as photo_ids,
  a.pages, a.cover_front,
  (select o.cover from public.orders o where o.album_id = a.id order by o.created_at desc limit 1) as order_cover,
  (select o.material from public.orders o where o.album_id = a.id order by o.created_at desc limit 1) as order_material,
  (select count(*) from public.orders o where o.album_id = a.id) as orders
from public.albums a
order by a.updated_at desc;
