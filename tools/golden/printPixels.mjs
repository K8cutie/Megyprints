#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE PIXEL PART OF THE PRINT-FILE CHECK, in plain Node (pixel loops run
   dozens of times slower inside jest): the app's print-file check
   (mobile/test/printFiles.check.ts) hands it a list of picture pairs and
   gets back, for each, the golden page comparison (mobile/test/golden/
   compare.ts, the very same code and bars as the golden pages).

     node printPixels.mjs <jobs.json> <results.json>

   jobs.json: [{ ref, refBare, app, appBare, zones: [[x0, y0, x1, y1, kind]…] }]
   (kind 'word': a page's words, held to the golden bars; 'label': a press
   sheet's label, held to LABEL_BARS below)
   (picture files, PNG or JPEG, decoded by CanvasKit; refBare / appBare may
   be null: no bare picture, the ink bars are then not judged).
   Every input picture is deleted once compared, unless `keep` is set.
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, '..', '..', 'mobile');

async function loadCompare() {
  const outfile = path.join(os.tmpdir(), `print-compare-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(MOBILE, 'test', 'golden', 'compare.ts')],
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
  });
  const mod = await import(pathToFileURL(outfile).href);
  fs.rmSync(outfile, { force: true });
  return mod;
}

/* A press sheet's labels (order number, "pile 1 · pages 1–2", the piece
   numbers) are the console's, not the customer's: the console draws them in
   Arial with Windows' DirectWrite, the app in Arimo (the same letter widths
   and kerning: textPainter.ts) with FreeType, 7 pt and 6 pt grey. The same
   shared code puts each label picture in the same spot (the numbers check
   holds that to 0.01 pt); only the letters inside differ by font engine. So
   they are held to their own bars, set just above what the three albums
   measured on 2026-10-28 (shift ≤ 1.00 px, ink ≤ 28.4%, an 8×8 block ≤ 41.7
   levels on a 6 pt grey piece number): where the ink sits, within 1.5 px at
   300 DPI (0.13 mm); its amount within 35%; its 8×8 blocks within 50 levels. */
const LABEL_BARS = { inkDiff: 0.35, worstBlock: 50, shiftPx: 1.5 };

function labelFailures(words) {
  const out = [];
  words.forEach((w, i) => {
    if (!(w.inkDiff <= LABEL_BARS.inkDiff)) out.push(`label ${i + 1}: ink ${(w.inkDiff * 100).toFixed(1)}% off (label bar ${LABEL_BARS.inkDiff * 100}%)`);
    if (!(w.worstBlock <= LABEL_BARS.worstBlock)) out.push(`label ${i + 1}: an 8x8 block ${w.worstBlock.toFixed(1)} levels off (label bar ${LABEL_BARS.worstBlock})`);
    if (!(Math.abs(w.shift.x) < LABEL_BARS.shiftPx && Math.abs(w.shift.y) < LABEL_BARS.shiftPx)) out.push(`label ${i + 1}: sits ${w.shift.x.toFixed(2)}, ${w.shift.y.toFixed(2)} px off (label bar ${LABEL_BARS.shiftPx})`);
  });
  return out;
}

async function main() {
  const [jobsFile, resultsFile] = process.argv.slice(2);
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  const { comparePage, pageFailures, INK_MARGIN_PX } = await loadCompare();
  const dir = path.join(MOBILE, 'node_modules', 'canvaskit-wasm', 'bin', 'full');
  const CK = await require(path.join(dir, 'canvaskit.js'))({ locateFile: (f) => path.join(dir, f) });
  const decode = (file) => {
    const img = CK.MakeImageFromEncoded(fs.readFileSync(file));
    if (!img) throw new Error(`could not decode ${file}`);
    const info = { width: img.width(), height: img.height(), colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB };
    const data = img.readPixels(0, 0, info);
    img.delete();
    return { width: info.width, height: info.height, data };
  };
  const results = [];
  for (const job of jobs) {
    const ref = decode(job.ref);
    const app = decode(job.app);
    if (ref.width !== app.width || ref.height !== app.height) {
      results.push({ error: `${app.width}x${app.height} in the app, ${ref.width}x${ref.height} on the website` });
      continue;
    }
    const kinds = job.zones.map((z) => z[4] ?? 'word');
    let zones = job.zones.map(([x0, y0, x1, y1]) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }));
    if (!job.refBare) {
      // No bare pictures (a zip's JPEG): the labels can't be told from what is
      // under them, so each label's box (and INK_MARGIN_PX round it) is left
      // out of both pictures, white, and only the rest is held to the bars.
      for (const z of zones) {
        const x0 = Math.max(0, Math.floor(z.x) - INK_MARGIN_PX), y0 = Math.max(0, Math.floor(z.y) - INK_MARGIN_PX);
        const x1 = Math.min(ref.width, Math.ceil(z.x + z.w) + INK_MARGIN_PX), y1 = Math.min(ref.height, Math.ceil(z.y + z.h) + INK_MARGIN_PX);
        for (let y = y0; y < y1; y++) {
          ref.data.fill(255, (y * ref.width + x0) * 4, (y * ref.width + x1) * 4);
          app.data.fill(255, (y * ref.width + x0) * 4, (y * ref.width + x1) * 4);
        }
      }
      zones = [];
    }
    const refBare = job.refBare ? decode(job.refBare).data : ref.data;
    const appBare = job.appBare ? decode(job.appBare).data : app.data;
    const cmp = comparePage({ ref: ref.data, refBare, app: app.data, appBare, W: ref.width, H: ref.height }, zones, 0);
    // Without bare pictures there is no ink to judge: only the pixel bars count.
    // The golden bars for the page and its words; the labels' own bars for labels.
    const asWords = { ...cmp, words: cmp.words.filter((_, i) => kinds[i] !== 'label') };
    const labels = cmp.words.filter((_, i) => kinds[i] === 'label');
    const failures = [...pageFailures(asWords), ...labelFailures(labels)];
    results.push({
      W: ref.width, H: ref.height, outsideWordsPct: cmp.outsideWordsPct, worstTilePct: cmp.worstTilePct, worstTileAt: cmp.worstTileAt,
      over8LevelsPct: cmp.over8LevelsPct, maxChannelDiff: cmp.maxChannelDiff, differingPct: cmp.differingPct,
      words: job.refBare ? cmp.words.map((w, i) => ({ kind: kinds[i], zone: w.zone, inkDiff: w.inkDiff, refInk: w.refInk, appInk: w.appInk, worstBlock: w.worstBlock, shift: w.shift })) : [],
      failures,
    });
    if (!job.keep) for (const f of [job.ref, job.refBare, job.app, job.appBare]) if (f) fs.rmSync(f, { force: true });
  }
  fs.writeFileSync(resultsFile, JSON.stringify(results));
}

main().catch((e) => { console.error(e); process.exit(1); });
