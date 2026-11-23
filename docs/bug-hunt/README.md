# Bug hunt: Megy Prints (starts 2026-11-24)

The owner, 2026-11-23, after two bugs reached customers in one day: an HDR video stopped a Mini order half-way, and a Shrikhand-bold cover title blocked Place order. He asked for the Overseer audit and QA teams to "go through every nook and cranny, forward and back".

| File | What it is |
|---|---|
| `map.md` | The coverage map: every square to test, the money fault trees, situations, the S25 checklist. Draft; Mother audits it first. |
| `briefs.md` | The seekers' (Sonnet) and Mother's (Opus) instructions, and the lane loop. |
| `export-albums.sql` | Read-only export of every album, for the real-album replay. |
| `tools/walk.mjs` | Emulator driver: `node walk.mjs ids · tap <id or text> · has <id or text> · shot <file> · type <text> · back`. |
| `../../mobile/test/realAlbums.check.ts` | The real-album replay: every album through Place order's own print check. |

## Test bench (ready 2026-11-23)

- **Emulator:** `emulator-5554`, adb at `C:/Android/sdk/platform-tools/adb.exe`. App `com.megyprints.app.dev`.
- **The app build:** before a lane, build one from this branch's `native-2.0` code pointed at the local database:
  1. Copy `.claude/worktrees/port-orders/mobile/.env.local` over `mobile/.env.local`.
  2. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File mobile/scripts/build-android.ps1 -Variant release`.
  3. Restore the live `.env.local`.
  4. Run `adb install -r mobile/dist/android/megyprints-2.0-dev-release.apk`.
- **Local database:** Docker stack `megyprints_testers`, API `localhost:59321` (the emulator reaches it at `10.0.2.2:59321`), workdir `.claude/worktrees/testers-clone`.
  - 2026-11-23: database changes 0060–0069 re-applied, so it matches live, including MEGYTEST for admin accounts only (0069). The price function has the live version only.
  - Old unpaid test orders of bea, jun and ana were cancelled, so nobody starts at the 3-unpaid limit.
- **Accounts** (passwords only in `C:/m8hunt-private`, never in chat or git):
  - `bea`, `ana`, `jun`, `dina`, `carlo`, `lito` `.crew1104@example.test`: customers.
  - `admin.crew1104@example.test`: shop owner (operator_roles `owner`; its sign-in is marked as Google so `operator_role()` counts it).
  - Proof, 2026-11-23: admin → MEGYTEST `{"ok":true}`, bea → `{"ok":false,"reason":"wrong"}`.
- **Albums on the local database:** 8x8 (243 with 40+ photos), 6x6 (6), 6x4 (6), 8x6 (4), Mini (2). **None in 6x8 or 11.5x8.** The first L1-30 seekers make those.

## The real-album replay

```
# 1. Export (read-only) from the main checkout:
node_modules/.bin/supabase db query --linked --file docs/bug-hunt/export-albums.sql --output-format json > C:/m8hunt-private/replay/albums.json
# 2. Replay, from mobile/:
REPLAY_ALBUMS=C:/m8hunt-private/replay/albums.json REPLAY_OUT=C:/m8hunt-private/replay/report.json npx jest --testMatch "**/test/realAlbums.check.ts"
```

**First run (2026-11-23): 49 of 311 albums can't be printed by the app.** These are candidates for Mother, not confirmed:
- 29 albums: old theme background pictures `/themes/bg/travel.svg` and `kids.svg`. None has an order.
- 20 albums: a cover background saved as a `blob:` address, a temporary browser address that only lives in one browser tab. 3 of them have orders. The newest was saved 2026-11-06.
- 0 albums: fonts (17 font + style pairs before #319).

The export holds customers' albums: it stays in `C:/m8hunt-private`, never in git. The report names albums by id only.
