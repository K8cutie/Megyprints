/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE PLAY BUILD (Phase 7: app.config.js, plugins/withPlaySigning.js,
   scripts/build-android.ps1 -Play).

   2.0 replaces the 1.x app on Google Play, so the Play build must be 1.x's
   app, for Google Play and for Google sign-in:
     • the same app name (com.megyprints.app) and name as 1.x
       (capacitor.config.ts), and a higher version code than 1.x's;
     • the same ways back from Google sign-in as 1.x's Android manifest,
       which the website's auth-native page and assetlinks.json point at
       (read from the manifest Expo makes, not only from our settings);
     • signed with the upload key: lines added to android/app/build.gradle
       once, the key read from a file that is never in git;
     • the dev build stays as it was (app.json), and everything else is the
       same in both builds.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GOOGLE_RETURN_PAGE, parseAuthReturn } from '../src/lib/googleSignIn';

/* eslint-disable @typescript-eslint/no-require-imports */
type Config = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const appConfig = require('../app.config.js') as ((arg: { config: Config }, env?: Record<string, string | undefined>) => Config) & {
  playConfig: (c: Config) => Config;
};
const signing = require('../plugins/withPlaySigning') as { addPlaySigning: (s: string) => string; MARK: string };
/* eslint-enable @typescript-eslint/no-require-imports */

const MOBILE = path.join(__dirname, '..');
const REPO = path.join(MOBILE, '..');
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8');
const appJson = JSON.parse(read('mobile/app.json')) as { expo: Config };

// The 1.x app on Google Play today.
const oneX = {
  capacitor: read('capacitor.config.ts'),
  gradle: read('android-native/app/build.gradle'),
  manifest: read('android-native/app/src/main/AndroidManifest.xml'),
  assetLinks: JSON.parse(read('public/.well-known/assetlinks.json')) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[],
  authPage: read('public/auth-native.js'),
};
const oneXVersionCode = Number(oneX.gradle.match(/versionCode (\d+)/)![1]);

const play = appConfig({ config: appJson.expo }, { MEGY_PLAY: '1' });

/** The Android manifest and strings Expo makes for a build (its own
 *  "introspect" run: every plugin, nothing written). */
async function madeByExpo(megyPlay: string | undefined) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { getPrebuildConfigAsync } = require('@expo/prebuild-config') as typeof import('@expo/prebuild-config');
  const { compileModsAsync } = require('expo/config-plugins') as typeof import('expo/config-plugins');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const before = process.env.MEGY_PLAY;
  if (megyPlay === undefined) delete process.env.MEGY_PLAY; else process.env.MEGY_PLAY = megyPlay;
  try {
    const { exp } = await getPrebuildConfigAsync(MOBILE, { platforms: ['android'] });
    const out = await compileModsAsync(exp, { projectRoot: MOBILE, introspect: true, platforms: ['android'], assertMissingModProviders: false });
    const results = (out._internal as { modResults: { android: Config } }).modResults.android;
    const activity = results.manifest.manifest.application[0].activity[0];
    const filters = (activity['intent-filter'] as Config[]).map((f) => ({
      autoVerify: f.$?.['android:autoVerify'] === 'true',
      actions: (f.action ?? []).map((a: Config) => a.$['android:name']),
      categories: (f.category ?? []).map((c: Config) => c.$['android:name']).sort(),
      data: (f.data ?? []).map((d: Config) => ({ ...d.$ })),
    }));
    const appName = (results.strings.resources.string as Config[]).find((s) => s.$.name === 'app_name')!._;
    return { exp, filters, appName, orientation: activity.$['android:screenOrientation'] };
  } finally {
    if (before === undefined) delete process.env.MEGY_PLAY; else process.env.MEGY_PLAY = before;
  }
}

describe('the dev build stays as it was', () => {
  it('without MEGY_PLAY=1, app.json as it is', () => {
    expect(appConfig({ config: appJson.expo }, {})).toBe(appJson.expo);
    expect(appConfig({ config: appJson.expo }, { MEGY_PLAY: '0' })).toBe(appJson.expo);
    expect(appJson.expo.android.package).toBe('com.megyprints.app.dev');
  });

  it('Expo makes the dev app: its own name, no Google sign-in way back (that goes to the Play app)', async () => {
    const dev = await madeByExpo(undefined);
    expect(dev.exp.android?.package).toBe('com.megyprints.app.dev');
    expect(dev.appName).toBe('Megy Prints 2.0 (dev)');
    expect(dev.filters.some((f) => f.data.some((d: Config) => d['android:host'] === 'megyprints.vercel.app'))).toBe(false);
    expect(dev.filters.some((f) => f.data.some((d: Config) => d['android:scheme'] === 'megyprints'))).toBe(false);
  });
});

describe('the Play build is the 1.x app, a newer version', () => {
  it('the same app name and name as 1.x', () => {
    expect(oneX.capacitor).toContain(`appId: '${play.android.package}'`);
    expect(oneX.capacitor).toContain(`appName: '${play.name}'`);
    expect(oneX.gradle).toContain(`applicationId "${play.android.package}"`);
    expect(play.android.package).toBe('com.megyprints.app');
    expect(play.name).toBe('Megy Prints');
  });

  it('a higher version code than 1.x (Play takes only a higher one); version 2.0.0', () => {
    expect(oneXVersionCode).toBeGreaterThan(0);
    expect(play.android.versionCode).toBeGreaterThan(oneXVersionCode);
    expect(play.version).toBe('2.0.0');
  });

  it('everything else is the dev build\'s: screens, permissions, plugins (and the signing)', () => {
    const { name, scheme, android, plugins, ...rest } = play;
    const { name: n2, scheme: s2, android: a2, plugins: p2, ...devRest } = appJson.expo;
    expect([name, scheme, n2, s2]).toEqual(['Megy Prints', 'megyprints', 'Megy Prints 2.0 (dev)', 'megyprints-dev']);
    expect(rest).toEqual(devRest);
    const { package: pkg, intentFilters, ...androidRest } = android;
    const { package: devPkg, ...devAndroidRest } = a2;
    expect([pkg, devPkg]).toEqual(['com.megyprints.app', 'com.megyprints.app.dev']);
    expect(intentFilters).toHaveLength(1);
    expect(androidRest).toEqual(devAndroidRest);
    expect(plugins).toEqual([...p2, './plugins/withPlaySigning']);
  });

  it('Expo makes the Play app: its name, upright, and both of 1.x\'s ways back from Google sign-in', async () => {
    const made = await madeByExpo('1');
    expect(made.exp.android?.package).toBe('com.megyprints.app');
    expect(made.exp.android?.versionCode).toBe(play.android.versionCode);
    expect(made.appName).toBe('Megy Prints');
    expect(made.orientation).toBe('portrait');
    // 1.x: <data android:scheme="https" android:host="megyprints.vercel.app" android:path="/auth-native.html" />, verified.
    const link = oneX.manifest.match(/<intent-filter android:autoVerify="true">[\s\S]*?<data android:scheme="(https)" android:host="([^"]+)" android:path="([^"]+)" \/>/)!;
    expect(made.filters).toContainEqual({
      autoVerify: true,
      actions: ['android.intent.action.VIEW'],
      categories: ['android.intent.category.BROWSABLE', 'android.intent.category.DEFAULT'],
      data: [{ 'android:scheme': link[1], 'android:host': link[2], 'android:path': link[3] }],
    });
    // 1.x: <data android:scheme="megyprints" android:host="auth" />; the Play app takes every megyprints:// link.
    expect(oneX.manifest).toContain('<data android:scheme="megyprints" android:host="auth" />');
    expect(made.filters).toContainEqual({
      autoVerify: false,
      actions: ['android.intent.action.VIEW'],
      categories: ['android.intent.category.BROWSABLE', 'android.intent.category.DEFAULT'],
      data: [{ 'android:scheme': 'megyprints' }],
    });
  });

  it('the website hands Google sign-in to this app, and the app reads it', () => {
    const filter = play.android.intentFilters[0];
    expect(GOOGLE_RETURN_PAGE).toBe(`https://${filter.data[0].host}${filter.data[0].path}`);
    expect(oneX.authPage).toContain(`'#Intent;scheme=${play.scheme};package=${play.android.package};end'`);
    expect(oneX.assetLinks.map((l) => l.target.package_name)).toEqual([play.android.package]);
    expect(parseAuthReturn(`${play.scheme}://auth?n=abc&access_token=A&refresh_token=R`)).not.toBeNull();
    expect(parseAuthReturn(`${GOOGLE_RETURN_PAGE}?n=abc#access_token=A&refresh_token=R`)).not.toBeNull();
  });
});

describe('signed with the upload key, never in git', () => {
  const template = [
    'android {',
    '    buildTypes {',
    '        release {',
    '            signingConfig signingConfigs.debug',
    '        }',
    '    }',
    '}',
    '',
  ].join('\n');

  it('the lines are added at the end of android/app/build.gradle, once', () => {
    const once = signing.addPlaySigning(template);
    expect(once.startsWith(template.trimEnd())).toBe(true);
    expect(once.split(signing.MARK)).toHaveLength(2);
    expect(signing.addPlaySigning(once)).toBe(once);
    // After the template's release signing, so they win.
    expect(once.lastIndexOf('signingConfig signingConfigs.megyUpload')).toBeGreaterThan(once.indexOf('signingConfig signingConfigs.debug'));
  });

  it('the key and its passwords come from the file MEGY_KEYSTORE_PROPERTIES names, with 1.x\'s four lines', () => {
    const gradle = signing.addPlaySigning(template);
    expect(gradle).toContain("System.getenv('MEGY_KEYSTORE_PROPERTIES')");
    for (const name of ['storeFile', 'storePassword', 'keyAlias', 'keyPassword']) {
      expect(oneX.gradle).toContain(`keystoreProps['${name}']`);
      expect(gradle).toContain(`megyKeys['${name}']`);
    }
    // A relative storeFile is read from keystore.properties' own folder, as 1.x's rootProject.file().
    expect(gradle).toContain("new File(megyKeysFile.parentFile, megyKeys['storeFile'])");
    // Without it, a release build stops instead of being signed with the debug key.
    expect(gradle).toMatch(/whenReady[\s\S]*contains\('release'\)[\s\S]*throw new GradleException/);
  });

  it('the key\'s files stay out of git', () => {
    expect(read('.gitignore')).toMatch(/^android-native\/keystore\.properties$/m);
    const mobileIgnore = read('mobile/.gitignore');
    expect(mobileIgnore).toMatch(/^\/android$/m);
    expect(mobileIgnore).toMatch(/^\*\.jks$/m);
  });

  it('build-android.ps1 -Play: the Play settings, 1.x\'s key file, an app bundle for Play Console', () => {
    const ps1 = read('mobile/scripts/build-android.ps1');
    expect(ps1).toContain('[switch] $Play,');
    expect(ps1).toContain("$env:MEGY_PLAY = '1'");
    expect(ps1).toContain('$env:MEGY_KEYSTORE_PROPERTIES = (Resolve-Path $KeystoreProperties).Path');
    expect(ps1).toContain("$KeystoreProperties = Join-Path $Repo 'android-native\\keystore.properties'");
    expect(ps1).toContain("@('bundleRelease', 'assembleRelease')");
    expect(ps1).toContain("throw '-GoldenPages is for test builds only, never with -Play.'");
    // A dev build clears them, so a dev build after a Play build is a dev build again.
    expect(ps1).toContain('Remove-Item Env:\\MEGY_PLAY -ErrorAction SilentlyContinue');
  });
});
