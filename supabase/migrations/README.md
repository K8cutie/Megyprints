# Megy Prints — Database Migrations

Versioned, ordered SQL migrations. This folder is the **single source of truth** for the
Megy Prints schema. Run them in numeric order; each file is idempotent (safe to re-run).

| # | File | What it does |
|---|------|--------------|
| 0001 | `0001_init.sql` | `user_profiles` + `albums` tables, signup & `updated_at` triggers, album-photo storage policies, base RLS. |
| 0002 | `0002_orders.sql` | `orders` table (order-number sequence, frozen `album_snapshot`), owner-scoped RLS with the customer pricing lock. Run after 0001. |
| 0003 | `0003_rls_lockdown.sql` | Idempotent re-lockdown of RLS across all customer-facing tables, with a verification query at the bottom. Re-run any time you suspect drift. |

## How to apply

Until the Supabase CLI is wired up, apply manually:
**Supabase Dashboard → SQL Editor → New Query →** paste each file's contents **in order** → Run.

Also do the one Dashboard-click step that SQL can't: create the **PRIVATE** Storage bucket
`album-photos` (Public = **OFF**) before/with 0001 — see [SUPABASE_SETUP.md](../../SUPABASE_SETUP.md).

## Adding a new migration

Create the next number (`0004_<short_name>.sql`), make it idempotent
(`create ... if not exists`, `drop policy if exists` before `create policy`), and append a row
to the table above. Never edit an already-applied migration — add a new one.

> History: 0001–0003 were migrated verbatim from the former root files
> `supabase-setup.sql`, `orders-setup.sql`, and `security-rls-lockdown.sql`, which have been
> removed so the schema has one home.
