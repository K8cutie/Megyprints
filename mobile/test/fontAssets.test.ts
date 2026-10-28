/* The app bundles exactly the page fonts the renderer lists: every file in
   render/fontTable.ts BUNDLED_FONTS has its require() in builder/fontAssets.ts
   (Metro needs each written out), and nothing else. Read as text: jest has
   no Metro to turn a .ttf require into an asset. */
import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_FONTS } from '../src/render/fontTable';

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'builder', 'fontAssets.ts'), 'utf8');

it('every bundled font file is required once, under its own name, and exists', () => {
  const pairs = [...source.matchAll(/'([^']+\.ttf)': require\('([^']+\.ttf)'\)/g)].map((m) => [m[1], m[2]]);
  expect(pairs.map(([k]) => k).sort()).toEqual(BUNDLED_FONTS.map((f) => f.file).sort());
  for (const [k, file] of pairs) {
    expect(file).toBe(k);
    expect(fs.existsSync(path.join(__dirname, '..', 'node_modules', file))).toBe(true);
  }
});
