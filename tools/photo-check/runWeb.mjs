#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE WEBSITE'S ANSWERS for the test pictures: the website's own photo check
   (src/lib/photoCheckRunner.ts checkPhoto) and face centring
   (src/pages/builder/faceDetection.ts detectFaceCenter), bundled as they
   are and run in headless Chromium (Chrome's own createImageBitmap and
   canvas; face-api.js with the weights the website loads from its CDN).

     cd tools/photo-check && node makePictures.mjs && node runWeb.mjs

   For each picture in out/pictures/manifest.json it writes to out/web.json:
     • check:   the PhotoCheck the website stores (sharp, hash, faces,
                eyesClosed), at the picture's size as shown;
     • faces:   the boxes and both eyes' aspect ratios the check's face pass
                saw (face-api, 416 px, score 0.5, on the 800 px copy);
     • centre:  detectFaceCenter's answer, and the boxes it used (face-api,
                320 px, score 0.3, on the whole picture);
     • times on this PC (for reference only: a phone is slower).
   Needs the website's packages (npm ci at the repo root) and network for
   the face-api weights (cdn.jsdelivr.net, as the website does).
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PICTURES = path.join(HERE, 'out', 'pictures');

const ENTRY = `
import { checkPhoto } from '../../src/lib/photoCheckRunner';
import { checkCopySize, eyeAspectRatio } from '../../src/lib/photoCheck';
import { initFaceApi, initFaceLandmarks, detectFaceCenter, faceBackendIsFast } from '../../src/pages/builder/faceDetection';
import * as faceapi from 'face-api.js';

/** The check's face pass, as photoCheckRunner runs it, keeping the boxes. */
async function checkFaces(blob, width, height) {
  const { w, h } = checkCopySize(width, height);
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const found = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks(true);
  canvas.width = canvas.height = 0;
  return { w, h, faces: found.map((f) => {
    const p = f.landmarks.positions.map((q) => ({ x: q.x, y: q.y }));
    const b = f.detection.box;
    return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, score: f.detection.score,
      earRight: eyeAspectRatio(p.slice(36, 42)), earLeft: eyeAspectRatio(p.slice(42, 48)) };
  }) };
}

/** detectFaceCenter's detector on the whole picture, keeping the boxes (0–1). */
async function centreFaces(url) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const found = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }));
  return found.map((d) => ({ x: d.box.x / img.width, y: d.box.y / img.height, width: d.box.width / img.width, height: d.box.height / img.height, score: d.score }));
}

window.web = { checkPhoto, checkFaces, centreFaces, initFaceApi, initFaceLandmarks, detectFaceCenter, faceBackendIsFast, backend: () => faceapi.tf.getBackend() };
`;

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PICTURES, 'manifest.json'), 'utf8'));
  const bundle = await build({
    stdin: { contents: ENTRY, resolveDir: HERE, loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'error',
    define: { 'import.meta.env': '{}' },
  });
  const js = bundle.outputFiles[0].text;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text()); });
  await page.route('http://pictures.local/**', (route) => {
    const name = decodeURIComponent(path.basename(new URL(route.request().url()).pathname));
    if (name === 'index.html') return route.fulfill({ body: '<!doctype html><title>web</title>', contentType: 'text/html' });
    const file = path.join(PICTURES, name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ body: fs.readFileSync(file), contentType: 'image/jpeg' });
  });
  await page.goto('http://pictures.local/index.html');
  await page.addScriptTag({ content: js });
  const ready = await page.evaluate(async () => { await window.web.initFaceApi(); return window.web.initFaceLandmarks(); });
  if (!ready) throw new Error('face-api models did not load (network?)');
  const backend = await page.evaluate(() => window.web.backend());
  console.log(`face-api ready (backend ${backend})`);

  const rows = [];
  for (const m of manifest) {
    const row = await page.evaluate(async ({ file, width, height }) => {
      const url = `http://pictures.local/${encodeURIComponent(file)}`;
      const blob = await (await fetch(url)).blob();
      const t0 = performance.now();
      const check = await window.web.checkPhoto(blob, width, height, { faces: false });
      const t1 = performance.now();
      const withFaces = await window.web.checkPhoto(blob, width, height);
      const t2 = performance.now();
      const faces = await window.web.checkFaces(blob, width, height);
      const t3 = performance.now();
      const centre = await window.web.detectFaceCenter(url);
      const t4 = performance.now();
      const centreBoxes = await window.web.centreFaces(url);
      return { file, width, height, check: { ...check, faces: withFaces.faces, eyesClosed: withFaces.eyesClosed },
        basicMs: t1 - t0, fullCheckMs: t2 - t1, faces, centre, centreMs: t4 - t3, centreBoxes, sameBasic: check.sharp === withFaces.sharp && check.hash === withFaces.hash, _t: t3 - t2 };
    }, m);
    delete row._t;
    rows.push(row);
    process.stdout.write('.');
  }
  await browser.close();
  fs.writeFileSync(path.join(HERE, 'out', 'web.json'), JSON.stringify({ when: new Date().toISOString(), faceApiBackend: backend, rows }, null, 1));
  console.log(`\n${rows.length} pictures → out/web.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
