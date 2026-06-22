# Journey-Completion Loop

An **agentic-loop harness** for Megy Prints. Multiple personas ("agents") attack
the build → order wizard, each with a different behavior. The single success
criterion is functional, not visual: **did the persona reach the fulfillment
screen (an `order_number`)?** That deliberately sidesteps the un-automatable
"does the album *look* good?" eyeball test and focuses the loop on what a machine
can verify — reachability.

## Why this shape

A loop is only as good as its verifier. "Reached fulfillment = true/false" is a
perfect verifier, so we make *that* the goal and vary how each persona behaves on
the way there. Different behaviors trip different guards, surfacing roadblocks.

```
persona (varied behavior) → drives funnel from step 1
   → hits first roadblock → FIX it → RE-RUN (re-verify) → repeat → 🎯 fulfillment
```

## Run it

```bash
npm run test:loop      # just this harness, with the journey report
npm test               # whole suite
```

The run prints a per-persona report (furthest step + first roadblock) and then
the assertions.

## Files

| File | Role |
|---|---|
| `personas.ts` | The agents and their behavior knobs (signed-in-when, fills-shipping, #albums…) |
| `journey.ts` | Drives one persona through the funnel; replicates Order.tsx guards + calls the **real** `createOrderFromLatestAlbum` |
| `mockSupabase.ts` | In-memory Supabase double (auth + RLS + albums/orders) so the real order logic runs with no network/credentials |
| `journey.test.ts` | The loop: runs every persona, prints the report, asserts outcomes |

## The self-healing protocol

1. **Run** `npm run test:loop`.
2. **Read** the report — see where each persona stalls.
3. **Fix** the app code for one roadblock.
4. **Re-run.** A `LOOP TARGET` test marked `it.fails` will flip from pass → fail.
   That flip means **"fixed!"** — now delete its `.fails` to lock the win in.
5. Repeat until no loop targets remain.

`it.fails` is the trick that lets the suite stay green while documenting a live
bug: the test asserts the *desired* end-state, which currently throws, so
`.fails` passes. The moment the bug is fixed the assertion passes and `.fails`
turns red — a positive signal that the roadblock is cleared.

## Current findings (first loop pass)

| Persona | Outcome | Class |
|---|---|---|
| Prepared Paula | 🎯 Fulfillment | control — funnel works |
| Guest Gary | 🚧 `AUTH_REQUIRED` | expected gate (must sign in to order) |
| Rushing Rico | 🚧 `VALIDATION` | expected gate (shipping required) |
| **Late-Binder Lena** | 🚧 `NO_ALBUM` | **BUG** — album built while signed-out never syncs to cloud; lost at checkout |
| **Serial Sofia** | 🎯 but wrong album | **BUG** — orders *latest-updated* album, not the one being viewed |

The two bugs are the active **loop targets**. Fixing them is the next iteration.

## Extending

Add a persona to `PERSONAS` (e.g. "uploads 0 photos", "session expires
mid-checkout") and the loop covers it automatically. To graduate to driving the
real browser UI, swap `journey.ts`'s internals for Playwright steps against a
staging build with live Supabase — the personas and the fulfillment verifier
stay identical.
