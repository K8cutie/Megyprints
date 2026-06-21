# Yayamove — Cost Efficiency Notes

Keeping infra cheap is a first-class design constraint (per the Megyprints
audit, the cheapest architecture is one where expensive bytes never touch paid
infra). Decisions made with cost in mind:

## Frontend / bandwidth
- **Route-level code splitting** (`React.lazy`) — only the landing page +
  framework load on first paint; every other screen is a separate small chunk
  fetched on demand. Smaller transfer = lower hosting bandwidth + faster TTI.
- **Vendor chunks split** (react / motion / supabase) so repeat visits hit cache
  instead of re-downloading one giant bundle.
- **SVG logo/icons** (no raster image payloads); fonts loaded from Google with
  `preconnect`. No multi-MB hero images.
- **PWA precache + service worker** — repeat visits serve from cache, cutting
  egress to near zero for returning users.

## Realtime (the easy place to overspend)
- Realtime replication is enabled on **`messages` only**, not every table.
- The client subscribes to **one conversation channel at a time**, not a global
  firehose — fewer concurrent connections and broadcasts billed.
- `last_message_at` is maintained by a **DB trigger**, so conversation lists sort
  without extra client polling/queries.

## Database
- **Indexes** on every foreign key and common filter (category, status,
  conversation+created_at) so reads stay cheap as data grows.
- **Ratings recomputed by a trigger** on write, not recalculated on every read —
  reads are a single indexed column lookup.
- Categories are a Postgres **enum**, not a table + joins.

## Storage (the big potential line item)
- NBI clearances / certificates are small single documents per provider, in
  **private** buckets; served via short-lived **signed URLs** (no CDN egress for
  public hotlinking). Profile/portfolio photos are the only public assets.
- Recommend client-side image **downscale/compress before upload** (next pass)
  to keep storage + egress minimal.

## Supabase free-tier reality
- Stays on free tier well into early traction. First ceiling is typically egress
  → Pro (~$25/mo). Auth MAU and DB size have generous free limits.
- ⚠️ Free projects **auto-pause after ~7 days inactivity** — fine pre-launch,
  but schedule a keep-alive ping once you have a pilot running.

## Payments (PayMongo escrow)
- **Processing fees are the real cost**, not infra: ~2.5–3.5% + ₱ fixed per
  transaction (GCash/cards via PayMongo). Build the commission rate
  (`PLATFORM_COMMISSION_RATE`, currently 12%) to cover the fee + margin.
- Escrow logic adds **no extra infra** — it's a status column + two triggers
  (`held` on webhook, auto `released` on completion). No polling, no cron.
- The webhook is the only money-state writer (one Edge Function invocation per
  paid checkout) — cheap and abuse-resistant.
- **Disbursement to providers** is the cost/ops watch-item: PayMongo isn't a
  split gateway, so payouts are a separate rail (InstaPay/PESONet or a payout
  API). Batch payouts to minimise per-transfer fees.

## Deliberately deferred (cost vs. value)
- In-app payments / escrow — heaviest piece; phase it in once jobs flow (see the
  product discussion). Until then, off-platform payment keeps processing fees at $0.
- Push notifications & SMS — SMS has real per-message cost in PH; start with
  web-push (free) before adding SMS.
