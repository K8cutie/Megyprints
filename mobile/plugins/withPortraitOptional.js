/* ══════════════════════════════════════════════════════════════════════════
   Config plugin: the app runs upright, but does not REQUIRE an upright screen.

   app.json says "orientation": "portrait", so the app's screen is locked
   upright (screenOrientation=portrait). From that alone Android counts the
   app as needing the "android.hardware.screen.portrait" feature, and Google
   Play flagged 2.1.4 (2026-11-19): "Required hardware feature declarations",
   which can hide the app from devices that don't report that feature
   (tablets, Chromebooks).

   Saying the feature out loud with required="false" keeps the screen upright
   on every phone and stops it counting as a requirement.
   ══════════════════════════════════════════════════════════════════════════ */
const { withAndroidManifest } = require('expo/config-plugins');

const PORTRAIT = 'android.hardware.screen.portrait';

/** The manifest with the upright screen declared as not required (once). */
function portraitNotRequired(manifest) {
  const root = manifest.manifest;
  const features = (root['uses-feature'] ?? []).filter((f) => f?.$?.['android:name'] !== PORTRAIT);
  features.push({ $: { 'android:name': PORTRAIT, 'android:required': 'false' } });
  root['uses-feature'] = features;
  return manifest;
}

function withPortraitOptional(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = portraitNotRequired(cfg.modResults);
    return cfg;
  });
}

module.exports = withPortraitOptional;
module.exports.portraitNotRequired = portraitNotRequired;
module.exports.PORTRAIT = PORTRAIT;
