#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S MASK PICTURES FOR THE APP.

     node scripts/mask-files.cjs        (from mobile/)

   Writes src/builder/maskFiles.ts: every PNG in the website's public/masks
   (the textured photo edges, torn paper's white rim), as base64, byte for
   byte. In the app's code rather than as image files: an Android build
   turns a bundled PNG into a resource it may re-encode, and hands it to the
   screen without a file whose bytes the print step could read (the golden
   phone build carries its pictures the same way, golden-phone-assets.cjs).
   Run it again when public/masks changes: test/maskFiles.test.ts fails until
   the two match.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');

const MOBILE = path.resolve(__dirname, '..');
const MASKS = path.join(MOBILE, '..', 'public', 'masks');
const OUT = path.join(MOBILE, 'src', 'builder', 'maskFiles.ts');

const files = fs.readdirSync(MASKS).filter((f) => f.endsWith('.png')).sort();
const lines = files.map((f) => `  '/masks/${f}':\n    '${fs.readFileSync(path.join(MASKS, f)).toString('base64')}',`);
fs.writeFileSync(OUT, `/* Made by scripts/mask-files.cjs from the website's public/masks: do not
   edit. Each picture's address on the website, and its bytes as base64. */
export const MASK_FILES: Record<string, string> = {
${lines.join('\n')}
};
`);
console.log(`Wrote ${path.relative(MOBILE, OUT)}: ${files.length} pictures, ${Math.round(fs.statSync(OUT).size / 1024)} KB.`);
