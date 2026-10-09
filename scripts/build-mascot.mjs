#!/usr/bin/env node
// Shrinks the Megy mascot master into the copies the app actually ships.
//
// The master (store/megy-character-master.png) is 1024×1024 and 1.5 MB. The
// app never shows Megy bigger than 128 CSS px (the builder's size screen), and
// the home card shows it at 96. Shipping the master cost a bad-signal phone
// ~14 s for one picture, and the service worker precached it on every install.
//
// Output: public/megy-character-<w>.png for each width in MEGY_MASCOT_WIDTHS
// (src/lib/megyMascot.ts). 256-colour palette PNGs, the same shrink pngquant
// does: alpha (Megy's soft glow) survives, and the files come out as small as
// a lossy WebP, so there is no second format and no <picture> fallback to keep.
//
// Re-run only when the art changes. sharp is not a project dependency (native
// binaries on every `npm ci` and every Vercel build, for a one-off job):
//
//   npm i --no-save --legacy-peer-deps sharp@0.34.4
//   node scripts/build-mascot.mjs
//
// The size budget is guarded by src/lib/megyMascot.spec.ts.
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = path.join(root, 'store', 'megy-character-master.png');

// Read the widths from the one list the app uses, so the two cannot drift.
const lib = readFileSync(path.join(root, 'src', 'lib', 'megyMascot.ts'), 'utf8');
const match = lib.match(/MEGY_MASCOT_WIDTHS\s*=\s*\[([^\]]+)\]/);
if (!match) throw new Error('MEGY_MASCOT_WIDTHS not found in src/lib/megyMascot.ts');
const widths = match[1].split(',').map((s) => Number(s.trim())).filter(Boolean);

for (const w of widths) {
  const out = path.join(root, 'public', `megy-character-${w}.png`);
  await sharp(MASTER)
    .resize(w, w, { kernel: 'lanczos3' })
    .png({ palette: true, colours: 256, quality: 100, effort: 10, compressionLevel: 9 })
    .toFile(out);
  console.log(`${path.relative(root, out)}  ${w}×${w}  ${(statSync(out).size / 1024).toFixed(1)} KB`);
}
