/* ══════════════════════════════════════════════════════════════════════════
   Config plugin: a walk build that talks to a test server on this PC.

   A walk against the local test database builds the app with
   mobile/.env.local pointing at the PC as the emulator sees it
   (EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:…, plain http). A debug build
   may talk plain http (React Native's debug manifest allows it), but a
   release-type build (-Variant release, the APK the testers walk) may not:
   Android refuses every call, and the app says "Could not reach Megy
   Prints. Check that the phone is online" (beta testers, 2026-11-04: no
   sign-in reached the test database).

   So, only when a server address the app is built with is plain http, this
   plugin lets the app talk plain http (usesCleartextTraffic on the app).
   The live build's addresses are https, so it never gets it, and the Play
   build refuses a plain-http address outright (app.config.js).
   ══════════════════════════════════════════════════════════════════════════ */
const { withAndroidManifest } = require('expo/config-plugins');

/** The server addresses the app is built with (mobile/.env.example). */
const SERVER_ENV = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_DELETE_ACCOUNT_URL', 'EXPO_PUBLIC_WEBSITE_URL'];

/** The ones that are plain http (a test server), in that order. */
function localServerUrls(env) {
  return SERVER_ENV.map((name) => env[name]).filter((url) => typeof url === 'string' && /^http:\/\//i.test(url.trim()));
}

/** The manifest with plain http allowed on the app. */
function allowPlainHttp(manifest) {
  const app = manifest.manifest.application[0];
  app.$ = { ...app.$, 'android:usesCleartextTraffic': 'true' };
  return manifest;
}

function withLocalServer(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = allowPlainHttp(cfg.modResults);
    return cfg;
  });
}

module.exports = withLocalServer;
module.exports.localServerUrls = localServerUrls;
module.exports.allowPlainHttp = allowPlainHttp;
