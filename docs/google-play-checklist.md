# Megyprints → Google Play (TWA) checklist

Megyprints ships to Play as a **TWA** (Trusted Web Activity): a thin Android
wrapper that opens the live web app fullscreen. **The big win:** once published,
every web deploy reaches Play users automatically — you only resubmit to Play if
you change the *wrapper* (name, icon, package), never for app/content changes.

Current target domain: **https://megyprints.vercel.app** (swap later if you move
to a custom domain — see the last section).

---

## ✅ Already done (code side, in this repo)

- Installable PWA: web manifest (`vite.config.ts`) with `id`, `scope`, standalone
  display, theme/background colors, and 192/512 icons; service worker (offline +
  auto-update).
- **Privacy policy page** at `https://megyprints.vercel.app/#/privacy` — Play
  requires a privacy URL; use exactly that.
- **Digital Asset Links** scaffolded at `public/.well-known/assetlinks.json`
  (served at `/.well-known/assetlinks.json`; excluded from the SPA rewrite). It
  has the package name filled in and **one placeholder to replace** — see step 3.

---

## 🔲 What you do

### 1. Google Play Developer account
- Sign up at **play.google.com/console** — **$25 one-time fee.**

### 2. Generate the Android package (easiest: PWABuilder)
- Go to **pwabuilder.com**, paste **https://megyprints.vercel.app**, let it
  validate the PWA, then **Package for stores → Android**.
- **Package name: `com.megyprints.app`** — this is **PERMANENT** (can't change
  after publishing) and must match `assetlinks.json`. Keep it as-is.
- Download the generated `.aab` (upload to Play) **and the signing key** — store
  the key + password somewhere safe; losing it means you can't update the app.
- (Alternative for the CLI-inclined: Google's **Bubblewrap** does the same.)

### 3. Link the app to the site (assetlinks fingerprint)
- Get the **SHA-256 signing fingerprint**:
  - PWABuilder shows it after packaging, OR
  - Play Console → your app → **Test and release → Setup → App integrity → App
    signing** → copy the **SHA-256 certificate fingerprint**.
- Open `public/.well-known/assetlinks.json`, replace
  `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` with that value, commit, and
  deploy. **If this doesn't match, the app opens with a browser address bar** (the
  giveaway that verification failed).
- Verify it's live: `https://megyprints.vercel.app/.well-known/assetlinks.json`
  should return the JSON.

### 4. Store listing
- App icon (512×512), feature graphic (1024×500), 2–8 phone screenshots.
- Short description + full description.
- **Privacy policy URL:** `https://megyprints.vercel.app/#/privacy`
- Category: Shopping (or Photography), contact email.

### 5. Compliance forms
- **Data safety form** — declare what the privacy policy says: collects email +
  order/shipping details + album files for fulfillment; no selling of data.
- Content rating questionnaire + target audience (not aimed at children).

### 6. Upload & roll out
- Upload the `.aab`, push to **Internal testing** first (install on your own
  phone, confirm it opens fullscreen with **no address bar**), then promote to
  Production.

---

## Do at TWA time (code side)
- **Real landscape for the album Preview.** Today the preview uses a CSS 90°
  rotate ("hold your phone sideways") because a *browser tab* isn't allowed to
  lock the device orientation. An installed app / TWA **is** allowed. So when we
  package the TWA, upgrade the Preview page to a progressive enhancement:
  try `screen.orientation.lock('landscape')` on enter and `.unlock()` on leave;
  if it throws/rejects (plain browser tab) fall back to the existing CSS rotate.
  This gives installed/Play users a *true* forced landscape — like a game —
  that works **even when the phone's rotation is locked** (fixes the exact
  problem where tilting a rotation-locked phone did nothing). Requires the
  manifest `orientation` to allow landscape on that screen (currently hard
  `'portrait'` in `vite.config.ts`) — loosen to `'any'` and lock per-screen, or
  keep portrait as default and let the API override on Preview only.

## Notes
- **Auto-update:** after launch, deploying a new web version updates Play users
  automatically. Resubmit to Play only for wrapper changes (icon/name/package).
- **Custom domain later:** if you move to e.g. `megyprints.com`, you must (a) host
  `assetlinks.json` on the new domain, (b) rebuild the TWA pointing at it, (c)
  update the privacy URL, and (d) resubmit. Easiest to decide the domain *before*
  first publish to avoid a rebuild.
- **Icon polish (optional):** PWABuilder generates launcher icons from the 512.
  For a crisper adaptive icon, supply a dedicated maskable icon (the Megy
  character centered on a filled background with ~20% safe padding).
