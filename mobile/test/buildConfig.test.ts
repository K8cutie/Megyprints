/* The Android build settings that live in git (android/ itself is made by
   prebuild and is not in git). */
import { readFileSync } from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
type Item = { type: 'property'; key: string; value: string } | { type: 'comment'; value: string };
const plugin = require('../plugins/withShortCmakeObjectPaths') as {
  setObjectPathMax: (items: Item[]) => Item[];
  PROPERTY: string;
  OBJECT_PATH_MAX: number;
};

const appJson = JSON.parse(readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')) as {
  expo: { name: string; android: { package: string; versionCode: number }; plugins: unknown[] };
};

describe('Android build settings', () => {
  it('a dev build never replaces the real app', () => {
    expect(appJson.expo.android.package).toBe('com.megyprints.app.dev');
    expect(appJson.expo.name).toBe('Megy Prints 2.0 (dev)');
    expect(appJson.expo.android.versionCode).toBeGreaterThanOrEqual(100);
  });

  it('the short CMake object paths plugin is on', () => {
    expect(appJson.expo.plugins).toContain('./plugins/withShortCmakeObjectPaths');
  });

  it("sets Expo's CMake object path limit in gradle.properties once, keeping the rest", () => {
    expect(plugin.PROPERTY).toBe('expo.android.cmakeObjectPathMax');
    const before: Item[] = [
      { type: 'comment', value: 'Project-wide Gradle settings.' },
      { type: 'property', key: 'hermesEnabled', value: 'true' },
      { type: 'property', key: plugin.PROPERTY, value: '1024' },
    ];
    const once = plugin.setObjectPathMax(before);
    expect(once).toEqual([
      before[0],
      before[1],
      { type: 'property', key: plugin.PROPERTY, value: String(plugin.OBJECT_PATH_MAX) },
    ]);
    expect(plugin.setObjectPathMax(once)).toEqual(once);
  });

  it('the limit is one CMake accepts (128 or more) and leaves room under the Windows limit', () => {
    expect(plugin.OBJECT_PATH_MAX).toBeGreaterThanOrEqual(128);
    expect(plugin.OBJECT_PATH_MAX).toBeLessThanOrEqual(248);
  });
});
