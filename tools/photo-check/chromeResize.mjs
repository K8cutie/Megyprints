#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   HOW CHROME MAKES THE PHOTO CHECK'S SMALL COPY, checked against Chrome.

   The website's check decodes each photo with
     createImageBitmap(blob, { resizeWidth, resizeHeight, resizeQuality: 'medium' })
   and the 2.0 app must make the same pixels (mobile/modules/photo-pixels,
   PhotoPixelsModule.kt shrinkLikeChrome). This script rebuilds that resize
   in plain JavaScript from Chrome's own whole-photo decode, the way the app
   does it, and compares it with Chrome's answer pixel by pixel:
     1. the halvings (Skia's mipmaps): each pixel the average of 2×2, or
        1-2-1 weights along a side that is odd, rounded down;
     2. the level: log2(1 / smaller scale) − 0.5 (Skia's "sharpen" bias),
        read bilinear from the two levels around it and blended by the
        fraction, rounded once.
   Also prints what plain bilinear from one level would give, to show the
   blend matters. Needs out/pictures (node makePictures.mjs).

     node chromeResize.mjs            # 10 pictures of each kind of size
     node chromeResize.mjs --all      # every picture (slow: whole-photo maths in JS)
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PICTURES = path.join(HERE, 'out', 'pictures');
const manifest = JSON.parse(fs.readFileSync(path.join(PICTURES, 'manifest.json'), 'utf8'));
const all = process.argv.includes('--all');
const seen = new Set();
const files = manifest.filter((m) => {
  if (all) return true;
  const k = `${m.width}x${m.height}|${m.orientation ?? 1}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
}).map((m) => m.file);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route('http://p.local/**', (route) => {
  const name = decodeURIComponent(path.basename(new URL(route.request().url()).pathname));
  if (name === 'index.html') return route.fulfill({ body: '<!doctype html>', contentType: 'text/html' });
  route.fulfill({ body: fs.readFileSync(path.join(PICTURES, name)), contentType: 'image/jpeg' });
});
await page.goto('http://p.local/index.html');

const rows = [];
for (const file of files) {
  rows.push(await page.evaluate(async (file) => {
    const LONG = 800; // CHECK_LONG_SIDE
    const read = (bmp, w, h) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, w, h);
      return g.getImageData(0, 0, w, h).data;
    };
    const halve = (src, w, h) => {
      const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), d = new Uint8ClampedArray(nw * nh * 4);
      const oddX = (w & 1) === 1 && w > 1, oddY = (h & 1) === 1 && h > 1, sh = 2 + (oddX ? 1 : 0) + (oddY ? 1 : 0);
      const px = (x, y, c) => src[(Math.min(h - 1, y) * w + Math.min(w - 1, x)) * 4 + c];
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 4; c++) {
        const sx = 2 * x, sy = 2 * y;
        const row = (yy) => (oddX ? px(sx, yy, c) + 2 * px(sx + 1, yy, c) + px(sx + 2, yy, c) : px(sx, yy, c) + px(sx + 1, yy, c));
        d[(y * nw + x) * 4 + c] = (oddY ? row(sy) + 2 * row(sy + 1) + row(sy + 2) : row(sy) + row(sy + 1)) >> sh;
      }
      return { px: d, w: nw, h: nh };
    };
    const bilinear = (L, dw, dh) => {
      const { px: s, w, h } = L, d = new Float64Array(dw * dh * 4), sx = w / dw, sy = h / dh;
      for (let y = 0; y < dh; y++) {
        const fy = Math.max(0, Math.min(h - 1, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
        for (let x = 0; x < dw; x++) {
          const fx = Math.max(0, Math.min(w - 1, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
          for (let c = 0; c < 4; c++) {
            const top = s[(y0 * w + x0) * 4 + c] * (1 - tx) + s[(y0 * w + x1) * 4 + c] * tx;
            const bottom = s[(y1 * w + x0) * 4 + c] * (1 - tx) + s[(y1 * w + x1) * 4 + c] * tx;
            d[(y * dw + x) * 4 + c] = top * (1 - ty) + bottom * ty;
          }
        }
      }
      return d;
    };
    const diff = (a, b) => {
      let s = 0, n = 0, mx = 0;
      for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) { const v = Math.abs(a[i + c] - Math.round(b[i + c])); s += v; n++; if (v > mx) mx = v; }
      return { mean: Math.round((s / n) * 1000) / 1000, max: mx };
    };
    const blob = await (await fetch(`http://p.local/${encodeURIComponent(file)}`)).blob();
    const whole = await createImageBitmap(blob); // EXIF turn applied, as the website's check sees it
    const W = whole.width, H = whole.height;
    const scale = Math.min(1, LONG / Math.max(W, H));
    const w = Math.max(1, Math.round(W * scale)), h = Math.max(1, Math.round(H * scale));
    const chrome = read(await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }), w, h);
    const levels = [{ px: read(whole, W, H), w: W, h: H }];
    whole.close();
    const s = Math.min(w / W, h / H);
    const level = s >= 1 ? 0 : Math.max(-Math.log2(s) - 0.5, 0);
    const lo = Math.floor(level), t = level - lo;
    while (levels.length < lo + 2) { const l = levels[levels.length - 1]; levels.push(halve(l.px, l.w, l.h)); }
    const A = bilinear(levels[lo], w, h);
    const model = t > 0 ? A.map((v, i) => v * (1 - t)) : A;
    if (t > 0) { const B = bilinear(levels[lo + 1], w, h); for (let i = 0; i < model.length; i++) model[i] += B[i] * t; }
    return { file, size: `${W}x${H}`, copy: `${w}x${h}`, level: Math.round(level * 1000) / 1000, model: diff(chrome, model), oneLevelOnly: diff(chrome, A) };
  }, file));
  const r = rows[rows.length - 1];
  console.log(`${r.file.padEnd(26)} ${r.size.padEnd(10)} → ${r.copy.padEnd(8)} level ${String(r.level).padEnd(6)} model: mean ${r.model.mean}, max ${r.model.max}   (one level only: mean ${r.oneLevelOnly.mean}, max ${r.oneLevelOnly.max})`);
}
await browser.close();
const worst = Math.max(...rows.map((r) => r.model.max));
fs.writeFileSync(path.join(HERE, 'out', 'chrome-resize.json'), JSON.stringify(rows, null, 1));
console.log(`\n${rows.length} pictures: the model is within ${worst} of Chrome on every pixel → out/chrome-resize.json`);
