#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE FACE DIFFERENCES, AS PICTURES, so a person can see which finder is
   right. Run after compare.mjs.
     • out/eyes-sheet.png: every face where the website (face-api.js) and
       the phone (ML Kit) judge the eyes differently, cut out of its photo,
       with both scores under it;
     • out/faces-sheet.png: the photos where the two find the most
       different numbers of faces, with the website's boxes (blue) and the
       phone's (terracotta) drawn on.

   Each face is the pair the comparison matched (website box ↔ phone box,
   overlap ≥ 0.2), cut around the website's box with some room. Under it:
     W = the website's eye aspect ratios (right, left; shut under 0.19),
     P = the phone's open chances (right, left; shut under 0.3),
   and which side calls the face's eyes shut.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const web = JSON.parse(fs.readFileSync(path.join(OUT, 'web.json'), 'utf8'));
const phone = JSON.parse(fs.readFileSync(path.join(OUT, 'phone.json'), 'utf8'));
const P = new Map(phone.rows.map((r) => [r.file, r]));

const EAR = 0.19, MIN_SHARE = 0.08;
// The phone's line between open and shut (mobile/src/lib/phoneFaces.ts EYE_SHUT_BELOW).
const OPEN = Number(/export const EYE_SHUT_BELOW = ([0-9.]+);/.exec(fs.readFileSync(path.join(HERE, '..', '..', 'mobile', 'src', 'lib', 'phoneFaces.ts'), 'utf8'))[1]);
const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.width * a.height + b.width * b.height - inter);
};

const cases = [];
for (const w of web.rows) {
  const p = P.get(w.file);
  if (!p?.mlFaces) continue;
  const h = w.faces.h;
  const wf = w.faces.faces.filter((f) => f.box.height >= h * MIN_SHARE);
  const pf = p.mlFaces.filter((f) => f.box.height >= h * MIN_SHARE);
  const used = new Set();
  for (const a of wf) {
    let best = -1, bi = -1;
    pf.forEach((b, j) => { if (!used.has(j)) { const v = iou(a.box, b.box); if (v > best) { best = v; bi = j; } } });
    if (best < 0.2) continue;
    used.add(bi);
    const b = pf[bi];
    const webShut = a.earLeft < EAR && a.earRight < EAR;
    const phoneShut = b.leftEyeOpen != null && b.rightEyeOpen != null && b.leftEyeOpen < OPEN && b.rightEyeOpen < OPEN;
    if (webShut !== phoneShut) {
      cases.push({ file: w.file, scale: w.width / w.faces.w, box: a.box, webEar: [a.earRight, a.earLeft], phoneOpen: [b.rightEyeOpen, b.leftEyeOpen], webShut, phoneShut });
    }
  }
}
console.log(`${cases.length} faces judged differently`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.route('http://pics.local/**', (route) => {
  const name = decodeURIComponent(path.basename(new URL(route.request().url()).pathname));
  if (name === 'index.html') return route.fulfill({ body: '<!doctype html><body style="margin:0;background:#fff"></body>', contentType: 'text/html' });
  route.fulfill({ body: fs.readFileSync(path.join(OUT, 'pictures', name)), contentType: 'image/jpeg' });
});
await page.goto('http://pics.local/index.html');
const png = await page.evaluate(async (cases) => {
  const CELL = 200, LABEL = 58, COLS = 6;
  const rows = Math.max(1, Math.ceil(cases.length / COLS));
  const c = document.createElement('canvas');
  c.width = COLS * CELL; c.height = rows * (CELL + LABEL) + 40;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2b2420'; g.font = 'bold 16px sans-serif';
  g.fillText(`Faces where the website and the phone judge the eyes differently (${cases.length})`, 8, 24);
  for (let i = 0; i < cases.length; i++) {
    const k = cases[i];
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `http://pics.local/${encodeURIComponent(k.file)}`; });
    const s = k.scale, b = k.box;
    const side = Math.max(b.width, b.height) * s * 1.5;
    const cx = (b.x + b.width / 2) * s, cy = (b.y + b.height / 2) * s;
    const x = (i % COLS) * CELL, y = 40 + Math.floor(i / COLS) * (CELL + LABEL);
    g.drawImage(img, cx - side / 2, cy - side / 2, side, side, x + 4, y + 4, CELL - 8, CELL - 8);
    g.fillStyle = '#2b2420'; g.font = '12px sans-serif';
    g.fillText(k.file.replace('.jpg', ''), x + 6, y + CELL + 12);
    g.fillText(`W ${k.webEar.map((v) => v.toFixed(2)).join(' ')}  P ${k.phoneOpen.map((v) => v.toFixed(2)).join(' ')}`, x + 6, y + CELL + 28);
    g.fillStyle = k.phoneShut ? '#b3261e' : '#1f5fa8'; g.font = 'bold 12px sans-serif';
    g.fillText(k.phoneShut ? 'phone: shut, web: open' : 'web: shut, phone: open', x + 6, y + CELL + 44);
  }
  return c.toDataURL('image/png').split(',')[1];
}, cases);
fs.writeFileSync(path.join(OUT, 'eyes-sheet.png'), Buffer.from(png, 'base64'));
fs.writeFileSync(path.join(OUT, 'eyes-cases.json'), JSON.stringify(cases, null, 1));

/* ── The face boxes on the photos where the counts differ most ─────────── */
const boxRows = web.rows.map((w) => {
  const p = P.get(w.file);
  const h = w.faces.h, big = (b) => b.height >= h * MIN_SHARE;
  return { file: w.file, scale: w.width / w.faces.w, web: w.faces.faces.map((f) => f.box).filter(big), phone: (p?.mlFaces ?? []).map((f) => f.box).filter(big) };
}).filter((r) => r.web.length !== r.phone.length)
  .sort((a, b) => Math.abs(b.phone.length - b.web.length) - Math.abs(a.phone.length - a.web.length) || a.file.localeCompare(b.file))
  .slice(0, 12);
const png2 = await page.evaluate(async (rows) => {
  const CELL = 300, LABEL = 22, COLS = 4;
  const c = document.createElement('canvas');
  c.width = COLS * CELL; c.height = Math.ceil(rows.length / COLS) * (CELL + LABEL) + 40;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2b2420'; g.font = 'bold 16px sans-serif';
  g.fillText('Faces big enough to judge: website (blue) vs phone (terracotta), where the counts differ most', 8, 24);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `http://pics.local/${encodeURIComponent(r.file)}`; });
    const fit = Math.min((CELL - 8) / img.width, (CELL - 8) / img.height);
    const x = (i % COLS) * CELL + 4, y = 40 + Math.floor(i / COLS) * (CELL + LABEL);
    g.drawImage(img, x, y, img.width * fit, img.height * fit);
    const k = r.scale * fit;
    g.lineWidth = 3; g.strokeStyle = '#1f5fa8';
    for (const b of r.web) g.strokeRect(x + b.x * k, y + b.y * k, b.width * k, b.height * k);
    g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeStyle = '#B85C38';
    for (const b of r.phone) g.strokeRect(x + b.x * k, y + b.y * k, b.width * k, b.height * k);
    g.setLineDash([]);
    g.fillStyle = '#2b2420'; g.font = '12px sans-serif';
    g.fillText(`${r.file.replace('.jpg', '')}: website ${r.web.length}, phone ${r.phone.length}`, x + 2, y + CELL + 10);
  }
  return c.toDataURL('image/png').split(',')[1];
}, boxRows);
fs.writeFileSync(path.join(OUT, 'faces-sheet.png'), Buffer.from(png2, 'base64'));
await browser.close();
console.log('→ out/eyes-sheet.png, out/faces-sheet.png');
