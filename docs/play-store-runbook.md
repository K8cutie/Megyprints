# Megy Prints — Google Play Store Runbook

Everything is built and verified; this file is the click-path from here to a live
store listing. The app ships as a **TWA (Trusted Web Activity)**: the Play app is
a thin signed wrapper around https://megyprints.vercel.app — web deploys keep
shipping instantly with **no store re-submission** (only wrapper changes — icon,
name, versionCode — need a new upload).

## What already exists (built + verified 2026-08-12)

| Artifact | Where | Status |
| --- | --- | --- |
| Signed App Bundle (upload this) | `android/app-release-bundle.aab` | ✅ signed, 2.84 MB |
| Signed APK (sideload/test) | `android/app-release-signed.apk` | ✅ signed, 2.72 MB |
| Upload keystore | `android/megyprints-upload.keystore` (+ backup in `Documents\megyprints-signing\`) | ✅ NEVER commit; password in `android/signing.local.txt` |
| Digital Asset Links | https://megyprints.vercel.app/.well-known/assetlinks.json | ✅ live, upload-key SHA-256 `53:1A:E2:…:C0:AE` |
| PWA manifest + icons | live (`pwa-192/512`, maskable pair) | ✅ verified HTTP 200 |
| Store listing icon 512 | `store/playstore-icon-512.png` | ✅ FINAL — MEGY cube art (source: `megy icon logo.png`, master: `store/megy-icon-master.png`) |
| Feature graphic 1024×500 | `store/feature-graphic-1024x500.png` | ✅ |
| Privacy policy | https://megyprints.vercel.app/#/privacy | ✅ live route |
| TWA config | `android/twa-manifest.json` (`com.megyprints.app`, target SDK 36) | ✅ exceeds Play's current target-API rule |

## Step 1 — Developer account (one-time, ~10 min)

1. Go to https://play.google.com/console/signup → **Personal** account.
2. Pay the **one-time $25 USD** fee (~₱1,400–1,500 on a PH card).
3. Complete identity verification (government ID; Google takes hours–days).

> Organization account also costs $25 but needs a D-U-N-S number (slow to get).
> Personal is the pragmatic start; the shop can migrate later.

## Step 2 — Create the app + closed testing (day 1)

1. Play Console → **Create app** → name **Megy Prints**, App/Free.
2. **DON'T aim at Production yet.** New personal accounts must first run a
   **closed test with ≥12 testers opted-in for 14 consecutive days** before
   production access unlocks (Google cut it from 20 to 12 in Dec 2024).
3. Testing → **Closed testing** → create track → upload `android/app-release-bundle.aab`.
4. Add a tester email list (Google accounts). Recruit 12–15 from the shop's
   customer base / church network / family — **each must install from the
   opt-in link and keep the app installed**; dropping under 12 resets the clock.
5. Share the opt-in URL the Console gives you.

While the 14 days run, finish Steps 3–5 (all doable immediately).

## Step 3 — Store listing

- **App name (30 max):** `Megy Prints: AI Photo Albums`
- **Short description (80 max):**
  `Megy designs your printed photo album for you — you just approve and order.`
- **Full description:** see `store/listing-copy.md`.
- **Graphics:** icon `store/playstore-icon-512.png`, feature graphic
  `store/feature-graphic-1024x500.png`, plus 2–8 phone screenshots
  (screenshot the live site on your phone: wizard → generated pages → checkout;
  min 320px, up to 3840px, 16:9-ish portrait is fine).
- **Category:** Photography. **Tags:** photo books, printing.
- **Contact email:** the shop's public email.

## Step 4 — App content declarations (Policy → App content)

- **Privacy policy URL:** `https://megyprints.vercel.app/#/privacy`
- **Ads:** No ads.
- **App access:** **Not** "available without special access" — the builder is
  open, but the HARD gates (adding a QR memory, checkout) require sign-in, so a
  reviewer cannot reach them. Choose *All or some functionality is restricted*
  and supply a working demo email + password. A review that can't reach checkout
  fails.
- **Account deletion URL:** `https://megyprints.vercel.app/delete-account.html`
  (goes in the Data safety form). Static page, no login wall — deliberately not
  a HashRouter route, since a `#`-less URL would render the homepage.
- **Content rating questionnaire:** Utility/Productivity → answers all "No" →
  Everyone.
- **Target audience:** 18+ (simplest; avoids Families policy overhead).
- **Data safety form:**
  - Collected: **Photos** — no. Photos stay on-device (IndexedDB) until the
    customer places an order; then the finished album **PDF is uploaded** to a
    private bucket for printing. Declare: *Photos and videos → collected,
    optional at order time, for app functionality, not shared, not sold.*
  - **Personal info (name, address, phone):** collected at checkout for
    delivery, app functionality, not shared beyond fulfillment.
  - **Crash logs / diagnostics:** YES — Sentry is wired (`@sentry/react`).
    Declare *Crash logs + Diagnostics, collected, not shared, not linked to
    identity.*
  - **Account deletion:** answer YES to *users can request account deletion* and
    give the URL above. Both the in-app path (My Profile → Delete my account)
    and the web URL are required — one is not a substitute for the other.

## Step 4b — Before deploying: one server env var

`api/delete-account.mjs` needs **`SUPABASE_SERVICE_ROLE_KEY`** in Vercel →
Project → Settings → Environment Variables (all environments). Server-only —
never prefix it with `VITE_`. Without it the endpoint refuses deletion with
"Account deletion is misconfigured" rather than deleting an account and leaving
the customer's photos in the bucket. Also apply migration `0027_account_deletion`
(`npx supabase db push`) before deploying, or the endpoint's RPC won't exist.

## Step 5 — Payments note (why no Play Billing)

Megy Prints sells **physical goods** (printed albums). Google Play Billing is
**not allowed** for physical goods — your own checkout (manual pay today,
Xendit later) is the required path, and Google takes **0% of sales**.

## Step 6 — ✅ DONE 2026-09-03: Play App Signing cert added + Google-verified

Play signing cert `2E:D4:9B:E6:…:ED:EE:76` is live in assetlinks alongside the
upload key (commit 4bd420f), and Google's Digital Asset Links API returns BOTH
statements for com.megyprints.app. Store installs verify full-screen. If a
device installed the app BEFORE this fix and shows a browser bar: uninstall +
reinstall from the tester link (verification runs at install time).

Original instructions (for reference):

Play re-signs the app with **Play App Signing**, so the store build's
certificate is Google's, not the upload key. Until that cert is in assetlinks,
the installed app opens with a **browser URL bar** (verification fails).

1. Play Console → **Test and release → Setup → App signing** (path can vary; it
   lives under Release/Setup) → copy the **App signing key certificate**
   SHA-256.
2. Add it to `public/.well-known/assetlinks.json` as a SECOND entry in the
   `sha256_cert_fingerprints` array (keep the upload-key one).
3. Commit + push (Vercel redeploys), then verify:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://megyprints.vercel.app&relation=delegate_permission/common.handle_all_urls`
4. Reinstall the app from the testing track — it must open full-screen, no URL bar.

## Step 7 — Production (after the 14 days)

1. Console shows **Apply for production access** once the closed test qualifies
   (12+ testers, 14 straight days). Answer its questions honestly.
2. Promote the tested release to **Production** → choose countries
   (start: Philippines) → submit for review (typically hours–3 days).

## Updating the app later

- **Web changes** (layouts, quotes, checkout…): just deploy to Vercel. Store app
  updates instantly. No Play work at all.
- **Wrapper changes** (final icon art, app name, splash): bump
  `appVersionCode` (+1) and `appVersion` in `android/twa-manifest.json`, then:

```bash
cd android && bubblewrap update --skipVersionUpgrade && bubblewrap build --skipPwaValidation
```

  (Passwords come from `BUBBLEWRAP_KEYSTORE_PASSWORD`/`BUBBLEWRAP_KEY_PASSWORD`
  env vars — see `android/signing.local.txt`. Machine setup notes:
  `~/.bubblewrap/config.json` points at `C:\Java17` + `C:\Android\Sdk`; both are
  junctions/paths already configured on this machine.)
  Upload the new AAB to the track.

## Final icon art — DONE (2026-08-15)

The MEGY cube (`megy icon logo.png`, full-bleed 1021px PNG) is now the icon
everywhere: Play listing 512, pwa-192/512, maskable pair, launcher mipmaps,
and the splash (backgrounds moved to icon-edge orange `#F05239`). AAB + APK
rebuilt and emulator-verified — proof shots `store/emulator-splash-newicon.png`
and `store/emulator-drawer-newicon.png`. `public/megy-character.png` stays the
IN-APP mascot only. If the art ever changes again: replace the source file,
re-run the generator, push, `bubblewrap update && build`, re-upload.
