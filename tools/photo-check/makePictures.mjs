#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE TEST PICTURES for comparing the phone's photo check with the website's.
   No personal photos, ever: 60 made-up pictures plus the website's own
   sample photos (public/sample-photos, the sample album's 78 photos, which
   have faces).

     cd tools/photo-check && npm ci && node makePictures.mjs

   Drawn by headless Chromium (playwright-core 1.61.1, Chromium build 1228,
   CPU drawing), seeded, so every run makes the same pictures:
     • 20 made-up scenes at common phone sizes (12, 16 MP; 4:3, 3:4, 1:1,
       16:9; one small; and one 50 MP, a phone's 50 MP mode, which is over
       the app's 24 MP whole-decode limit: scene 20 and its near copy),
       drawn like a photo: sky, hills, objects with soft shading, fine
       texture, words, and camera grain;
     • 10 blurred copies of scenes 1–10 (1.5 to 10 px of blur at full size:
       from "a little soft" to "badly out of focus");
     • 10 burst-style near copies of scenes 11–20 (the camera moved 1–3 %,
       a touch brighter or darker, fresh grain), as a second shot of the
       same moment;
     • 4 copies of scenes 1–4 stored turned, with an EXIF orientation tag
       (6, 8, 3 and 2), so as shown they ARE scenes 1–4: both sides must
       turn them back (same fingerprint);
     • 8 blurred copies and 8 near copies of sample photos (the faces in
       them get soft or move).
   Writes out/pictures/*.jpg and out/pictures/manifest.json (each picture's
   size as shown, what it was made from, and a taken time for the repeat
   rule: copies 20 s after their original, others 10 min apart).
   out/ is not in git.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SAMPLES = path.join(REPO, 'public', 'sample-photos');
const OUT = path.join(HERE, 'out', 'pictures');

const SIZES = [
  [4032, 3024], [3024, 4032], [4000, 3000], [3264, 2448], [4624, 3468],
  [3000, 3000], [4000, 2250], [2448, 3264], [1600, 1200], [4080, 3060],
  [3468, 4624], [4032, 3024], [2250, 4000], [3000, 4000], [4000, 3000],
  [3024, 4032], [3264, 2448], [4032, 3024], [3000, 3000], [8160, 6120],
];
const BLUR_PX = [1.5, 2, 3, 4, 6, 8, 2.5, 5, 10, 3.5];
const NEAR = [ // camera move (share of the size), zoom, brightness
  { dx: 0.01, dy: 0.0, s: 1.0, b: 1.0 }, { dx: -0.02, dy: 0.01, s: 1.02, b: 1.04 },
  { dx: 0.0, dy: -0.015, s: 1.0, b: 0.96 }, { dx: 0.03, dy: 0.0, s: 1.01, b: 1.0 },
  { dx: -0.01, dy: -0.01, s: 0.99, b: 1.06 }, { dx: 0.015, dy: 0.02, s: 1.0, b: 0.95 },
  { dx: 0.0, dy: 0.0, s: 1.03, b: 1.0 }, { dx: -0.025, dy: 0.0, s: 1.0, b: 1.03 },
  { dx: 0.02, dy: -0.02, s: 1.02, b: 0.97 }, { dx: 0.005, dy: 0.005, s: 1.0, b: 1.08 },
];
const TURNS = [6, 8, 3, 2];
const SAMPLE_BLUR = [[3, 2], [9, 3], [15, 4], [22, 1.5], [30, 6], [41, 2.5], [52, 5], [66, 8]]; // [sample #, blur px]
const SAMPLE_NEAR = [[5, 0], [12, 1], [19, 2], [27, 3], [35, 4], [44, 5], [58, 6], [71, 7]];   // [sample #, NEAR index]

/** An EXIF block holding only the orientation, put after the JPEG's first segment. */
function withOrientation(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body]);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  // After SOI and the JFIF APP0 segment (if any).
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0) at = 4 + jpeg.readUInt16BE(4);
  return Buffer.concat([jpeg.subarray(0, at), seg, jpeg.subarray(at)]);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--disable-accelerated-2d-canvas', '--disable-gpu-compositing'] });
  const page = await browser.newPage();
  await page.route('http://pictures.local/samples/*', (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    route.fulfill({ body: fs.readFileSync(path.join(SAMPLES, name)), contentType: 'image/jpeg' });
  });
  await page.goto('about:blank');
  await page.addScriptTag({ content: PAGE_CODE });

  const manifest = [];
  const T0 = Date.UTC(2026, 8, 12, 1, 0, 0);
  const save = async (file, b64, entry, orientation = 0) => {
    let bytes = Buffer.from(b64, 'base64');
    if (orientation) bytes = withOrientation(bytes, orientation);
    fs.writeFileSync(path.join(OUT, file), bytes);
    manifest.push({ file, ...entry, bytes: bytes.length });
  };
  const sceneName = (i) => `pc-scene-${String(i + 1).padStart(2, '0')}.jpg`;

  for (let i = 0; i < 20; i++) {
    const [w, h] = SIZES[i];
    const t = T0 + i * 600_000;
    await save(sceneName(i), await page.evaluate(([w, h, i]) => window.mk.scene(w, h, i), [w, h, i]),
      { width: w, height: h, group: 'synthetic', kind: 'scene', base: null, capturedAt: t });
    if (i < 10) {
      await save(`pc-blur-${String(i + 1).padStart(2, '0')}-${String(BLUR_PX[i]).replace('.', 'p')}px.jpg`,
        await page.evaluate(([w, h, i, r]) => window.mk.scene(w, h, i, null, r), [w, h, i, BLUR_PX[i]]),
        { width: w, height: h, group: 'synthetic', kind: 'blur', base: sceneName(i), blurPx: BLUR_PX[i], capturedAt: t + 20_000 });
    } else {
      const cam = NEAR[i - 10];
      await save(`pc-near-${String(i + 1).padStart(2, '0')}.jpg`,
        await page.evaluate(([w, h, i, cam]) => window.mk.scene(w, h, i, cam), [w, h, i, cam]),
        { width: w, height: h, group: 'synthetic', kind: 'near', base: sceneName(i), move: cam, capturedAt: t + 20_000 });
    }
    if (i < 4) {
      const o = TURNS[i];
      await save(`pc-turned-${String(i + 1).padStart(2, '0')}-o${o}.jpg`,
        await page.evaluate(([w, h, i, o]) => window.mk.scene(w, h, i, null, 0, o), [w, h, i, o]),
        { width: w, height: h, group: 'synthetic', kind: 'turned', base: sceneName(i), orientation: o, capturedAt: t + 20_000 }, o);
    }
  }

  const samples = fs.readdirSync(SAMPLES).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const T1 = T0 + 30 * 600_000;
  const sampleTime = new Map(samples.map((f, i) => [f, T1 + i * 600_000]));
  for (const f of samples) {
    const [w, h] = await page.evaluate((f) => window.mk.sizeOf(`http://pictures.local/samples/${f}`), f);
    fs.copyFileSync(path.join(SAMPLES, f), path.join(OUT, f));
    manifest.push({ file: f, width: w, height: h, group: 'sample', kind: 'sample', base: null, capturedAt: sampleTime.get(f), bytes: fs.statSync(path.join(OUT, f)).size });
  }
  const sampleFile = (n) => `megy-sample-${String(n).padStart(2, '0')}.jpg`;
  for (const [n, r] of SAMPLE_BLUR) {
    const f = sampleFile(n);
    const b64 = await page.evaluate(([u, r]) => window.mk.fromSample(u, null, r), [`http://pictures.local/samples/${f}`, r]);
    const base = manifest.find((m) => m.file === f);
    await save(`pc-sblur-${String(n).padStart(2, '0')}-${String(r).replace('.', 'p')}px.jpg`, b64,
      { width: base.width, height: base.height, group: 'sample-copy', kind: 'blur', base: f, blurPx: r, capturedAt: sampleTime.get(f) + 20_000 });
  }
  for (const [n, k] of SAMPLE_NEAR) {
    const f = sampleFile(n);
    const b64 = await page.evaluate(([u, cam]) => window.mk.fromSample(u, cam, 0), [`http://pictures.local/samples/${f}`, NEAR[k]]);
    const base = manifest.find((m) => m.file === f);
    await save(`pc-snear-${String(n).padStart(2, '0')}.jpg`, b64,
      { width: base.width, height: base.height, group: 'sample-copy', kind: 'near', base: f, move: NEAR[k], capturedAt: sampleTime.get(f) + 20_000 });
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const made = manifest.filter((m) => m.group !== 'sample').length;
  console.log(`${made} made-up pictures + ${samples.length} sample photos → ${OUT}`);
}

/* Runs inside the page. */
const PAGE_CODE = String.raw`
(() => {
  function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const hsl = (h, s, l, a = 1) => 'hsla(' + h.toFixed(1) + ',' + s.toFixed(1) + '%,' + l.toFixed(1) + '%,' + a + ')';
  async function toB64(canvas) {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }
  /** Camera grain and exposure on the finished picture. */
  function grainAndExposure(g, W, H, seed, bright) {
    const r = rng(seed + 9001);
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() + r() - 1) * 7;
      d[i] = d[i] * bright + n; d[i + 1] = d[i + 1] * bright + n; d[i + 2] = d[i + 2] * bright + n;
    }
    g.putImageData(img, 0, 0);
  }
  /** The scene, drawn on g in a W×H frame. */
  function drawScene(g, W, H, n, cam) {
    const r = rng(n + 1);
    const hue = r() * 360;
    g.save();
    g.translate(W / 2 + cam.dx * W, H / 2 + cam.dy * H); g.scale(cam.s, cam.s); g.translate(-W / 2, -H / 2);
    const sky = g.createLinearGradient(0, -H * 0.1, 0, H * 0.65);
    sky.addColorStop(0, hsl(hue, 55, 62)); sky.addColorStop(1, hsl((hue + 30) % 360, 40, 88));
    g.fillStyle = sky; g.fillRect(-W * 0.2, -H * 0.2, W * 1.4, H * 1.4);
    for (let k = 0; k < 4; k++) { // hills
      const y0 = H * (0.45 + k * 0.12);
      const gr = g.createLinearGradient(0, y0 - H * 0.1, 0, H);
      gr.addColorStop(0, hsl((hue + 90 + k * 25) % 360, 35 + k * 8, 45 - k * 6)); gr.addColorStop(1, hsl((hue + 120 + k * 20) % 360, 30, 20));
      g.fillStyle = gr; g.beginPath(); g.moveTo(-W * 0.2, H * 1.2);
      for (let x = -0.2; x <= 1.21; x += 0.05) g.lineTo(x * W, y0 - Math.sin(x * (3 + k) + r() * 0.3 + k) * H * 0.06 - r() * H * 0.02);
      g.lineTo(W * 1.2, H * 1.2); g.closePath(); g.fill();
    }
    g.lineCap = 'round';
    for (let k = 0; k < 900; k++) { // grass and twigs: fine detail
      const x = r() * W, y = H * (0.55 + r() * 0.45), len = H * (0.005 + r() * 0.02);
      g.strokeStyle = hsl((hue + 100 + r() * 60) % 360, 40, 15 + r() * 40, 0.8); g.lineWidth = Math.max(1, W * 0.0006 * (0.5 + r()));
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * len, y - len); g.stroke();
    }
    for (let k = 0; k < 28; k++) { // objects with shading
      const x = r() * W, y = H * (0.3 + r() * 0.65), s = Math.min(W, H) * (0.03 + r() * 0.12);
      const gr = g.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
      const oh = (hue + r() * 360) % 360;
      gr.addColorStop(0, hsl(oh, 60, 75)); gr.addColorStop(1, hsl(oh, 55, 25));
      g.fillStyle = gr; g.beginPath();
      if (k % 3 === 0) g.arc(x, y, s, 0, Math.PI * 2);
      else if (k % 3 === 1) g.rect(x - s, y - s * 0.6, s * 2, s * 1.2);
      else { g.moveTo(x, y - s); g.lineTo(x + s, y + s * 0.8); g.lineTo(x - s, y + s * 0.8); g.closePath(); }
      g.fill();
      g.strokeStyle = hsl(oh, 30, 12, 0.9); g.lineWidth = Math.max(1, s * 0.03); g.stroke();
    }
    g.fillStyle = 'rgba(20,20,30,0.85)'; // words: hard edges
    for (let k = 0; k < 5; k++) {
      g.font = 'bold ' + Math.round(H * (0.02 + r() * 0.04)) + 'px sans-serif';
      g.fillText(['MEGY', 'Picnic 2026', 'Lola & Lolo', 'Beach day', 'Happy 7th!'][k], r() * W * 0.7, H * (0.1 + r() * 0.8));
    }
    g.restore();
  }
  window.mk = {
    /** Scene n at W×H (as shown). cam: a near copy's move; blur: px; turn: EXIF orientation to store it with. */
    async scene(W, H, n, cam, blur, turn) {
      const shown = new OffscreenCanvas(W, H), g = shown.getContext('2d');
      drawScene(g, W, H, n, cam || { dx: 0, dy: 0, s: 1 });
      grainAndExposure(g, W, H, n * 7 + (cam ? 3 : 0), cam ? cam.b : 1);
      let out = shown;
      if (blur) {
        out = new OffscreenCanvas(W, H); const b = out.getContext('2d');
        b.filter = 'blur(' + blur + 'px)'; b.drawImage(shown, 0, 0);
      }
      if (turn) {
        const turned = turn === 6 || turn === 8;
        out = new OffscreenCanvas(turned ? H : W, turned ? W : H); const t = out.getContext('2d');
        if (turn === 6) { t.translate(0, W); t.rotate(-Math.PI / 2); }      // shown = stored turned 90° clockwise
        else if (turn === 8) { t.translate(H, 0); t.rotate(Math.PI / 2); }  // shown = stored turned 90° anticlockwise
        else if (turn === 3) { t.translate(W, H); t.rotate(Math.PI); }
        else if (turn === 2) { t.translate(W, 0); t.scale(-1, 1); }
        t.drawImage(shown, 0, 0);
      }
      return toB64(out);
    },
    async sizeOf(url) { const b = await createImageBitmap(await (await fetch(url)).blob()); const s = [b.width, b.height]; b.close(); return s; },
    /** A sample photo, moved like a second shot (cam) or blurred (blur px). */
    async fromSample(url, cam, blur) {
      const bmp = await createImageBitmap(await (await fetch(url)).blob());
      const W = bmp.width, H = bmp.height, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
      if (blur) { g.filter = 'blur(' + blur + 'px)'; g.drawImage(bmp, 0, 0); }
      else {
        g.drawImage(bmp, 0, 0); // fills the corners a move uncovers
        g.save(); g.translate(W / 2 + cam.dx * W, H / 2 + cam.dy * H); g.scale(cam.s, cam.s); g.translate(-W / 2, -H / 2);
        g.drawImage(bmp, 0, 0); g.restore();
        grainAndExposure(g, W, H, Math.round(W + H), cam.b);
      }
      bmp.close();
      return toB64(c);
    },
  };
})();
`;

main().catch((e) => { console.error(e); process.exit(1); });
