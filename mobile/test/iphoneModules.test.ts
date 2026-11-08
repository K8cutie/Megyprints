/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S OWN NATIVE MODULES ON BOTH PHONES (modules/*): each has an
   Android half (Kotlin) and an iPhone half (Swift) under the SAME module
   name, offering the same calls, so the JS side (index.ts,
   requireOptionalNativeModule) works unchanged on both. Autolinking builds
   a half only when expo-module.config.json lists its platform.

   The only differences allowed are the ones listed here, on purpose:
     • photo-files pickPhotos: Android's "Choose from Files" (iPhone photos
       come from Photos only: lib/filePhotos FILES_OFFERED);
     • order-keeper requestNotifications: iPhone asks for notifications
       through the module (Android through PermissionsAndroid in JS).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { IPHONE_LIGHT_WEIGHT_PX, PHONE_LIGHT_WEIGHT_PX, phoneLightWeightPx } from '../src/render/pageText';

const MODULES = path.join(__dirname, '..', 'modules');

/** The calls a half offers: Function("x") and AsyncFunction("x"). */
function calls(source: string): string[] {
  return [...source.matchAll(/(?:Async)?Function\("([A-Za-z]+)"\)/g)].map((m) => m[1]).sort();
}
function find(dir: string, ext: string): string {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith(ext)) out.push(p);
    }
  };
  walk(dir);
  const main = out.find((p) => /Module\.(kt|swift)$/.test(p));
  if (!main) throw new Error(`No *Module${ext} in ${dir}`);
  return fs.readFileSync(main, 'utf8');
}

const BOTH = ['photo-files', 'photo-pixels', 'video-shrink', 'order-keeper'] as const;
const ANDROID_ONLY_CALLS: Record<string, string[]> = { 'photo-files': ['pickPhotos'] };
const IPHONE_ONLY_CALLS: Record<string, string[]> = { 'order-keeper': ['requestNotifications'] };

describe.each(BOTH)('modules/%s on Android and iPhone', (name) => {
  const dir = path.join(MODULES, name);
  const kotlin = find(path.join(dir, 'android'), '.kt');
  const swift = find(path.join(dir, 'ios'), '.swift');
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'expo-module.config.json'), 'utf8')) as {
    platforms: string[]; ios?: { modules: string[] };
  };

  it('autolinking builds both halves', () => {
    expect(cfg.platforms).toEqual(['android', 'ios']);
    expect(cfg.ios?.modules).toHaveLength(1);
    expect(swift).toContain(`public class ${cfg.ios!.modules[0]}: Module`);
    expect(fs.readdirSync(path.join(dir, 'ios')).some((f) => f.endsWith('.podspec'))).toBe(true);
  });

  it('the same module name', () => {
    const kName = /Name\("([A-Za-z]+)"\)/.exec(kotlin)?.[1];
    expect(kName).toBeTruthy();
    expect(swift).toContain(`Name("${kName}")`);
  });

  it('the same calls, apart from the listed differences', () => {
    const k = calls(kotlin).filter((c) => !(ANDROID_ONLY_CALLS[name] ?? []).includes(c));
    const s = calls(swift).filter((c) => !(IPHONE_ONLY_CALLS[name] ?? []).includes(c));
    expect(s).toEqual(k);
  });

  it('the same events', () => {
    const events = (src: string) => [...src.matchAll(/Events\("([A-Za-z]+)"\)/g)].map((m) => m[1]).sort();
    expect(events(swift)).toEqual(events(kotlin));
  });
});

/* Print: light letters (white, cream) get a hairline of extra weight on
   Android's phones, where native Skia draws them thinner than the website's
   print files; iPhone's Skia does not (its golden run, 2026-11-09: every
   light text within the 6 % ink bar at 0 px, up to 24 % off with the
   Android hairline). Both the album builder and the golden run use it. */
describe("light letters' hairline per phone (render/pageText.ts)", () => {
  it('Android keeps its measured 0.2 px; iPhone none', () => {
    expect(phoneLightWeightPx('android')).toBe(PHONE_LIGHT_WEIGHT_PX);
    expect(PHONE_LIGHT_WEIGHT_PX).toBe(0.2);
    expect(phoneLightWeightPx('ios')).toBe(IPHONE_LIGHT_WEIGHT_PX);
    expect(IPHONE_LIGHT_WEIGHT_PX).toBe(0);
  });

  it('the album builder and the golden run draw with the phone\'s own', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    expect(read('src/builder/BuilderProvider.tsx')).toContain('new PageText(Skia, files, phoneLightWeightPx(Platform.OS))');
    expect(read('src/app/golden-pages.tsx')).toContain('phoneLightWeightPx: phoneLightWeightPx(Platform.OS)');
  });
});
