/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: Google Play flagged 2.1.4 for "Required hardware feature
   declarations: android.hardware.screen.portrait". The app is locked upright
   (app.json "orientation": "portrait"), which Android reads as REQUIRING an
   upright screen. plugins/withPortraitOptional.js declares the feature with
   required="false": the screen stays upright, the requirement goes.
   ══════════════════════════════════════════════════════════════════════════ */
import appJson from '../app.json';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { portraitNotRequired, PORTRAIT } = require('../plugins/withPortraitOptional');

const manifest = (features?: unknown[]) => ({ manifest: { $: {}, ...(features ? { 'uses-feature': features } : {}) } });
const portraitEntries = (m: { manifest: Record<string, unknown> }) =>
  ((m.manifest['uses-feature'] ?? []) as { $: Record<string, string> }[]).filter((f) => f.$['android:name'] === PORTRAIT);

it('the app stays locked upright', () => {
  expect(appJson.expo.orientation).toBe('portrait');
});

it('every build runs the plugin', () => {
  expect(appJson.expo.plugins).toContain('./plugins/withPortraitOptional');
});

it('declares the upright screen as not required', () => {
  const out = portraitNotRequired(manifest());
  expect(portraitEntries(out)).toEqual([{ $: { 'android:name': PORTRAIT, 'android:required': 'false' } }]);
});

it('replaces a required declaration and keeps the other features', () => {
  const touch = { $: { 'android:name': 'android.hardware.touchscreen', 'android:required': 'false' } };
  const out = portraitNotRequired(manifest([touch, { $: { 'android:name': PORTRAIT, 'android:required': 'true' } }]));
  expect(portraitEntries(out)).toEqual([{ $: { 'android:name': PORTRAIT, 'android:required': 'false' } }]);
  expect(out.manifest['uses-feature']).toContainEqual(touch);
});

it('running twice still leaves one declaration', () => {
  expect(portraitEntries(portraitNotRequired(portraitNotRequired(manifest())))).toHaveLength(1);
});
