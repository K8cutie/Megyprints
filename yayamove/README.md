# Yayamove 🧹🔧

**Find trusted local help in the Philippines** — verified maids, carpenters, plumbers,
computer technicians, and aircon pros near you. Browse profiles or post a job and get quotes.

Mobile-first PWA. Built with React + Vite + TypeScript + Tailwind on Supabase.

> ⚠️ This is a **separate app** from Megyprints. They share nothing but a repo root.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, framer-motion, PWA |
| Forms | react-hook-form + Zod |
| Backend | Supabase — Postgres + Auth + Storage (private buckets) |
| Auth | Email/password (hardened policy), session persistence |

## Services (v1)
Maid / Kasambahay · Carpentry · Plumbing · Computer Technician · Aircon Service

## Features
- Browse & search verified pros · post-a-job flow · provider profiles
- Provider onboarding wizard (skills, experience, certificates, NBI upload)
- **Real-time messaging** (Supabase Realtime; fully interactive demo mode)
- Booking requests · ratings & reviews (server-computed)
- **Admin NBI-verification dashboard** (`/admin/verification`, admin-gated)
- Hardened auth · RLS everywhere · private document storage · PWA

## Getting started

```bash
cd yayamove
npm install
cp .env.example .env     # then fill in your Supabase URL + anon key
npm run dev
```

Without `.env` the app runs in **demo mode** (sample data, auth disabled) so you can
view the design immediately — with a loud banner so it's never mistaken for live.

### Database setup
Run the SQL in `supabase/migrations/` **in order** in the Supabase SQL editor:

1. `0001_init.sql` — tables, enums, triggers (incl. server-field guards)
2. `0002_rls_lockdown.sql` — Row-Level Security on every table (+ verification query)
3. `0003_storage.sql` — buckets & storage policies (NBI/certs are **private**)
4. `0004_messaging_bookings.sql` — conversations, messages (realtime), bookings + RLS
5. `0005_admin_and_ratings.sql` — admin role, NBI approval policies, server-side rating triggers
6. `seed.sql` — optional

To grant yourself admin (NBI verification queue at `/admin/verification`):
```sql
insert into public.admins (user_id) values ('<your-auth-user-id>');
```

## Security posture (carried over from the Megyprints audit)

- **RLS on every table**, with `USING` *and* `WITH CHECK` — the anon key is public,
  so RLS is the only lock.
- **NBI clearances & certificates live in PRIVATE buckets** — never public URLs.
  Access is owner-only via short-lived signed URLs; the verification team uses
  `service_role`.
- **Server-trust:** `verification_status`, ratings, and `jobs_completed` are frozen
  for normal users by DB triggers — a provider can never self-verify.
- **No silent missing-config:** the Supabase client fails loudly and the UI shows a
  demo banner instead of a silent `?? ''` fallback.
- **Hardened passwords** (10+ chars, mixed case + number), global error boundary,
  unhandled-rejection handler, and an explicit Data Privacy Act 2012 consent gate on
  NBI upload.

See `SECURITY.md` for the full checklist.

## Project structure

```
yayamove/
├── src/
│   ├── components/      # UI primitives + shared components
│   ├── hooks/          # useAuth
│   ├── lib/            # supabase client, categories, utils, sample data
│   ├── pages/          # Landing, Browse, ProviderDetail, auth, PostJob, onboarding…
│   └── types/          # database types
└── supabase/migrations # SQL schema + RLS + storage
```
