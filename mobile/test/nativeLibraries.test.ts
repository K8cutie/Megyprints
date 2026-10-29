/* react-native.config.js keeps some installed native libraries out of the
   Android build (Reanimated, Worklets, Gesture Handler: big C++ builds this
   app does not use yet). If app code imported one of them anyway, the app
   would build fine and then crash on the phone the moment that screen opens,
   because the native half is missing. This test fails first, naming the file
   and line, and says how to turn the library back on. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../react-native.config.js') as {
  dependencies: Record<string, { platforms?: Record<string, null | object> }>;
};

const APP_DIR = path.join(__dirname, '..', 'src');

/** Libraries switched off for Android in react-native.config.js. */
export function switchedOff(cfg = config): string[] {
  return Object.entries(cfg.dependencies ?? {})
    .filter(([, d]) => d.platforms && d.platforms.android === null)
    .map(([name]) => name);
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return /\.(ts|tsx|js|jsx)$/.test(name) ? [full] : [];
  });
}

/** "file:line  'package'" for every import of a switched-off library. */
export function importsOfSwitchedOff(files: { file: string; text: string }[], off: string[]): string[] {
  const found: string[] = [];
  const spec = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(spec)) {
        const name = m[1];
        if (off.some((pkg) => name === pkg || name.startsWith(`${pkg}/`))) {
          found.push(`${path.relative(path.join(APP_DIR, '..'), file).split(path.sep).join('/')}:${i + 1}  '${name}'`);
        }
      }
    });
  }
  return found;
}

describe('native libraries kept out of the Android build', () => {
  it('react-native.config.js switches off the three big unused ones', () => {
    expect(switchedOff().sort()).toEqual(['react-native-gesture-handler', 'react-native-reanimated', 'react-native-worklets']);
  });

  it('no app file imports a switched-off library (delete its line in react-native.config.js first)', () => {
    const files = filesUnder(APP_DIR).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
    expect(files.length).toBeGreaterThan(5);
    expect(importsOfSwitchedOff(files, switchedOff())).toEqual([]);
  });

  it('catches a planted import', () => {
    const fake = path.join(APP_DIR, 'app', 'editor.tsx');
    expect(importsOfSwitchedOff([{
      file: fake,
      text: [
        "import { View } from 'react-native';",
        "import Animated from 'react-native-reanimated';",
        "import { GestureDetector } from 'react-native-gesture-handler';",
        "const w = require('react-native-worklets/lib');",
      ].join('\n'),
    }], switchedOff())).toEqual([
      "src/app/editor.tsx:2  'react-native-reanimated'",
      "src/app/editor.tsx:3  'react-native-gesture-handler'",
      "src/app/editor.tsx:4  'react-native-worklets/lib'",
    ]);
  });
});
