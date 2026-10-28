/* The golden test pages go into a build only when it is made for that
   (build-android.ps1 -GoldenPages: MEGY_GOLDEN_PAGES=1 for Metro). Every
   other build gets `null` for 'megy-golden-pages', so a customer build never
   carries them, and the debug screen and its link stay hidden. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goldenBundle } from '../src/dev/goldenBundle';
import { fromBase64 } from '../src/dev/goldenRun';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const golden = require('../goldenPages') as {
  GOLDEN_MODULE: string; BUNDLE_FILE: string; NO_BUNDLE_FILE: string;
  goldenModuleFile: (env?: Record<string, string | undefined>, bundleFile?: string) => string;
};

describe('golden pages only in a -GoldenPages test build', () => {
  it('a normal build gets the empty stand-in (null)', () => {
    expect(golden.goldenModuleFile({})).toBe(golden.NO_BUNDLE_FILE);
    expect(golden.goldenModuleFile({ MEGY_GOLDEN_PAGES: '0' })).toBe(golden.NO_BUNDLE_FILE);
    expect(JSON.parse(fs.readFileSync(golden.NO_BUNDLE_FILE, 'utf8'))).toBeNull();
    // jest is a normal build: the screen sees no golden pages.
    expect(goldenBundle).toBeNull();
  });

  it('a -GoldenPages build gets golden-phone/bundle.json, and stops when it is missing', () => {
    const tmp = path.join(os.tmpdir(), `golden-${process.pid}.json`);
    fs.writeFileSync(tmp, '{"cases":[]}');
    try {
      expect(golden.goldenModuleFile({ MEGY_GOLDEN_PAGES: '1' }, tmp)).toBe(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    expect(() => golden.goldenModuleFile({ MEGY_GOLDEN_PAGES: '1' }, tmp)).toThrow(/golden-phone-assets\.cjs/);
    expect(golden.BUNDLE_FILE).toBe(path.join(__dirname, '..', 'golden-phone', 'bundle.json'));
  });

  it('Metro turns the module name into that file', () => {
    const metro = fs.readFileSync(path.join(__dirname, '..', 'metro.config.js'), 'utf8');
    expect(metro).toMatch(/moduleName === GOLDEN_MODULE/);
    expect(metro).toMatch(/goldenModuleFile\(\)/);
    expect(golden.GOLDEN_MODULE).toBe('megy-golden-pages');
    const ignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
    expect(ignore).toMatch(/^\/golden-phone\/$/m);
  });

  it('the bundle files come back byte for byte (base64)', () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37 + 11) & 255);
    for (const n of [0, 1, 2, 3, 998, 999, 1000]) {
      const part = bytes.subarray(0, n);
      expect(Array.from(fromBase64(Buffer.from(part).toString('base64')))).toEqual(Array.from(part));
    }
  });
});
