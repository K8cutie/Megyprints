/* ══════════════════════════════════════════════════════════════════════════
   THE TWO BUILDS OF 2.0 (Phase 7).

   app.json is the dev build: "Megy Prints 2.0 (dev)", com.megyprints.app.dev,
   signed with the public debug key. It sits next to the 1.x app on a phone
   and never replaces it.

   The Play build (MEGY_PLAY=1, set by scripts/build-android.ps1 -Play) is the
   real app, made to replace 1.x on Google Play:
     • the same name and app name as 1.x ("Megy Prints", com.megyprints.app;
       capacitor.config.ts), and a higher version number than 1.x's;
     • the same ways back from Google sign-in as 1.x
       (android-native/app/src/main/AndroidManifest.xml): the verified link
       https://megyprints.vercel.app/auth-native.html and megyprints://auth,
       which the website's auth-native.html hands the sign-in to;
     • signed with the owner's Play upload key, the one 1.x is signed with
       (plugins/withPlaySigning.js; the key and its passwords never in git).
   Everything else (screens, permissions, plugins) is the same in both,
   except that the Play build hides the start screen's test buttons and
   "Test version" note (extra.build, src/lib/buildKind.ts).
   Held by test/playRelease.test.ts.
   ══════════════════════════════════════════════════════════════════════════ */

/** The Play build's settings on top of app.json's. */
function playConfig(config) {
  return {
    ...config,
    name: 'Megy Prints',
    scheme: 'megyprints',
    android: {
      ...config.android,
      package: 'com.megyprints.app',
      intentFilters: [
        {
          // Google sign-in's way back: assetlinks.json on the website lists
          // this app (the same as 1.x), so Android opens it without asking.
          action: 'VIEW',
          autoVerify: true,
          category: ['BROWSABLE', 'DEFAULT'],
          data: [{ scheme: 'https', host: 'megyprints.vercel.app', path: '/auth-native.html' }],
        },
      ],
    },
    plugins: [...(config.plugins ?? []), './plugins/withPlaySigning'],
    // The app reads it (src/lib/buildKind.ts) to hide what is only for testing.
    extra: { ...(config.extra ?? {}), build: 'play' },
  };
}

/** Which build this is: the Play build only when MEGY_PLAY is '1'. */
function appConfig({ config }, env = process.env) {
  return env.MEGY_PLAY === '1' ? playConfig(config) : config;
}

module.exports = appConfig;
module.exports.playConfig = playConfig;
