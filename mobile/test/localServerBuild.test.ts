/* A walk build against a test server on this PC (http://10.0.2.2:…, the
   emulator's way to the PC) must be allowed to talk plain http: Android
   refuses it in a release-type build otherwise, and the app says "Could not
   reach Megy Prints" (beta testers 2026-11-04: every sign-in failed). Only
   such a build: never the Play build, which must talk to the shop over https. */
/* eslint-disable @typescript-eslint/no-require-imports */
type Config = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
import { readFileSync } from 'node:fs';
import path from 'node:path';
const appConfig = require('../app.config.js') as (arg: { config: Config }, env?: Record<string, string | undefined>) => Config;
const local = require('../plugins/withLocalServer') as { allowPlainHttp: (manifest: Config) => Config; localServerUrls: (env: Record<string, string | undefined>) => string[] };
/* eslint-enable @typescript-eslint/no-require-imports */

const MOBILE = path.join(__dirname, '..');
const appJson = JSON.parse(readFileSync(path.join(MOBILE, 'app.json'), 'utf8')) as { expo: Config };
const PLUGIN = './plugins/withLocalServer';
const LOCAL = { EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:59321', EXPO_PUBLIC_DELETE_ACCOUNT_URL: 'http://10.0.2.2:59390/api/delete-account' };
const LIVE = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' };

describe('a build for a test server on this PC', () => {
  it('names the plain-http server addresses it was given (and only those)', () => {
    expect(local.localServerUrls(LOCAL)).toEqual(['http://10.0.2.2:59321', 'http://10.0.2.2:59390/api/delete-account']);
    expect(local.localServerUrls(LIVE)).toEqual([]);
    expect(local.localServerUrls({})).toEqual([]);
  });

  it('the dev build gets the plugin only when a server address is plain http', () => {
    expect(appConfig({ config: appJson.expo }, LOCAL).plugins).toContain(PLUGIN);
    expect(appConfig({ config: appJson.expo }, LIVE).plugins ?? []).not.toContain(PLUGIN);
    expect(appConfig({ config: appJson.expo }, {}).plugins ?? []).not.toContain(PLUGIN);
  });

  it('the Play build never: it refuses a plain-http server outright', () => {
    expect(() => appConfig({ config: appJson.expo }, { ...LOCAL, MEGY_PLAY: '1' })).toThrow(/Play build.*https/);
    expect(appConfig({ config: appJson.expo }, { ...LIVE, MEGY_PLAY: '1' }).plugins).not.toContain(PLUGIN);
  });

  it('the plugin lets the app talk plain http (Android\'s usesCleartextTraffic on the app)', () => {
    const manifest = { manifest: { $: {}, application: [{ $: { 'android:name': '.MainApplication' } }] } };
    const out = local.allowPlainHttp(manifest);
    expect(out.manifest.application[0].$['android:usesCleartextTraffic']).toBe('true');
    expect(out.manifest.application[0].$['android:name']).toBe('.MainApplication');
  });

  it('what Expo makes for such a build has it, and the live build does not', async () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { getPrebuildConfigAsync } = require('@expo/prebuild-config') as typeof import('@expo/prebuild-config');
    const { compileModsAsync } = require('expo/config-plugins') as typeof import('expo/config-plugins');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const made = async (url: string) => {
      const before = process.env.EXPO_PUBLIC_SUPABASE_URL;
      process.env.EXPO_PUBLIC_SUPABASE_URL = url;
      try {
        const { exp } = await getPrebuildConfigAsync(MOBILE, { platforms: ['android'] });
        const out = await compileModsAsync(exp, { projectRoot: MOBILE, introspect: true, platforms: ['android'], assertMissingModProviders: false });
        return (out._internal as { modResults: { android: Config } }).modResults.android.manifest.manifest.application[0].$['android:usesCleartextTraffic'];
      } finally {
        if (before === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL; else process.env.EXPO_PUBLIC_SUPABASE_URL = before;
      }
    };
    expect(await made('http://10.0.2.2:59321')).toBe('true');
    expect(await made('https://example.supabase.co')).toBeUndefined();
  }, 60_000);
});
