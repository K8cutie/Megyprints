/* Video-fee parity: src/lib/pricing.ts videoFee() against the database's
   0073 video_memory_fee(), on a local test database, for many offers and
   counts. Run (after 0073 is on the local DB, or inside a transaction):
     npx vite-node scripts/video-fee-parity.ts > parity.sql
     docker exec -i supabase_db_megyprints_testers psql -U postgres -At < parity.sql
   It prints SQL that ends by listing every disagreement (none = parity). */
import { videoFee, type VideoOffer } from '../src/lib/pricing';

const offers: { label: string; json: unknown; ts: VideoOffer }[] = [
  { label: 'before 0073 (packs only)', json: { single: null, pack: { size: 3, price: 100, name: null, until: null } }, ts: { single: null, pack: { size: 3, price: 100, name: null, until: null } } },
  { label: 'no sale, ₱50 each', json: { single: 50, pack: null }, ts: { single: 50, pack: null } },
  { label: 'Christmas sale 3 for ₱100', json: { single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } }, ts: { single: 50, pack: { size: 3, price: 100, name: 'Christmas sale', until: '2026-12-31' } } },
  { label: '5 for ₱180 at ₱40', json: { single: 40, pack: { size: 5, price: 180, name: 'Graduation', until: '2027-06-30' } }, ts: { single: 40, pack: { size: 5, price: 180, name: 'Graduation', until: '2027-06-30' } } },
  { label: '2 for ₱60 at ₱35', json: { single: 35, pack: { size: 2, price: 60, name: 'Promo', until: '2027-01-15' } }, ts: { single: 35, pack: { size: 2, price: 60, name: 'Promo', until: '2027-01-15' } } },
  { label: '4 for ₱110 at ₱30', json: { single: 30, pack: { size: 4, price: 110, name: 'Sale', until: '2027-02-14' } }, ts: { single: 30, pack: { size: 4, price: 110, name: 'Sale', until: '2027-02-14' } } },
];

const rows: string[] = [];
let n = 0;
for (const o of offers) {
  for (let extra = 0; extra <= 40; extra++) {
    const f = videoFee(extra, o.ts);
    rows.push(`(${JSON.stringify(o.label).replace(/'/g, "''").replace(/^"|"$/g, "'")}, ${extra}, '${JSON.stringify(o.json).replace(/'/g, "''")}'::jsonb, ${f.fee}, ${f.packs}, ${f.singles})`);
    n++;
  }
}

console.log(`create temp table c(label text, extra int, offer jsonb, fee int, packs int, singles int);
insert into c values\n${rows.join(',\n')};
select 'cases: ' || count(*) || ', disagreements: ' || count(*) filter (where (public.video_memory_fee(extra, offer) ->> 'fee')::int <> fee
  or (public.video_memory_fee(extra, offer) ->> 'packs')::int <> packs
  or (public.video_memory_fee(extra, offer) ->> 'singles')::int <> singles) from c;
select label || ' extra=' || extra || ' ts=' || fee || '/' || packs || '/' || singles || ' sql=' || public.video_memory_fee(extra, offer)::text
  from c where (public.video_memory_fee(extra, offer) ->> 'fee')::int <> fee
  or (public.video_memory_fee(extra, offer) ->> 'packs')::int <> packs
  or (public.video_memory_fee(extra, offer) ->> 'singles')::int <> singles;`);
console.error(`${n} cases`);
