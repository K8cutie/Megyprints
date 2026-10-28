#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE FACE DIFFERENCES, AS PICTURES, so a person can see which finder is
   right. Run after compare.mjs.
     • out/eyes-sheet.png: every face behind a picture where the website
       (face-api.js) and the phone (ML Kit) judge the eyes differently, cut
       out of its photo, with both scores under it: faces both finders found
       and judge differently, faces only the phone found that it calls shut,
       and faces only the website found that it calls shut;
     • out/faces-sheet.png: the photos where the two find the most
       different numbers of faces, with the website's boxes (blue) and the
       phone's (terracotta) drawn on;
     • out/phone-only-faces.png: EVERY face (big enough to count) that only
       the phone found, cut out of its photo, so each one can be looked at:
       a real face the website's finder missed, or something that is not a
       face. Matched the way compare.mjs matches (greedy, overlap ≥ 0.2), so
       the count is compare.mjs's "phone" minus "matched".

   A face both found is the pair the comparison matched (website box ↔ phone
   box, overlap ≥ 0.2), cut around the website's box with some room; a face
   one side alone found is cut around that side's box. Under it:
     W = the website's eye aspect ratios (right, left; shut under 0.19),
     P = the phone's open chances (right, left; shut under EYE_SHUT_BELOW,
         read only on faces of MIN_EYE_FACE_PX or more: mobile/src/lib/
         phoneFaces.ts, read through out/rules.mjs, which compare.mjs makes),
   the face's height in the 800 px copy, and which side calls it shut.
   ══════════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const web = JSON.parse(fs.readFileSync(path.join(OUT, 'web.json'), 'utf8'));
const phone = JSON.parse(fs.readFileSync(path.join(OUT, 'phone.json'), 'utf8'));
const P = new Map(phone.rows.map((r) => [r.file, r]));

// The website's rules and the app's eye rule, as compare.mjs bundled them.
const R = await import(pathToFileURL(path.join(OUT, 'rules.mjs')).href);
const EAR = R.EYE_CLOSED_EAR, MIN_SHARE = R.MIN_FACE_SHARE;
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
  const scale = w.width / w.faces.w;
  for (const a of wf) {
    let best = -1, bi = -1;
    pf.forEach((b, j) => { if (!used.has(j)) { const v = iou(a.box, b.box); if (v > best) { best = v; bi = j; } } });
    const webShut = a.earLeft < EAR && a.earRight < EAR;
    if (best < 0.2) {
      // Only the website found this face.
      if (webShut) cases.push({ file: w.file, scale, box: a.box, webEar: [a.earRight, a.earLeft], phoneOpen: null, webShut, phoneShut: false, only: 'website' });
      continue;
    }
    used.add(bi);
    const b = pf[bi];
    const phoneShut = R.phoneEyesShut(b);
    if (webShut !== phoneShut) {
      cases.push({ file: w.file, scale, box: a.box, faceHeight: b.box.height, webEar: [a.earRight, a.earLeft], phoneOpen: [b.rightEyeOpen, b.leftEyeOpen], judged: R.eyesJudged(b), webShut, phoneShut, only: null });
    }
  }
  // Only the phone found these faces.
  pf.forEach((b, j) => {
    if (!used.has(j) && R.phoneEyesShut(b)) {
      cases.push({ file: w.file, scale, box: b.box, faceHeight: b.box.height, webEar: null, phoneOpen: [b.rightEyeOpen, b.leftEyeOpen], judged: true, webShut: false, phoneShut: true, only: 'phone' });
    }
  });
}
// Every picture whose verdicts differ has its faces here.
const differ = web.rows.filter((w) => P.get(w.file)?.faces && P.get(w.file).faces.eyesClosed !== w.check.eyesClosed).map((w) => w.file);
const covered = new Set(cases.map((c) => c.file));
const notShown = differ.filter((f) => !covered.has(f));
console.log(`${cases.length} faces behind ${covered.size} pictures; pictures whose eye verdicts differ: ${differ.length}${notShown.length ? `, not on the sheet: ${notShown.join(', ')}` : ', all on the sheet'}`);

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
  g.fillText(`Faces behind every picture where the website and the phone judge the eyes differently (${cases.length} faces)`, 8, 24);
  for (let i = 0; i < cases.length; i++) {
    const k = cases[i];
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `http://pics.local/${encodeURIComponent(k.file)}`; });
    const s = k.scale, b = k.box;
    const side = Math.max(b.width, b.height) * s * 1.5;
    const f2 = (v) => (v == null ? '–' : v.toFixed(2));
    const cx = (b.x + b.width / 2) * s, cy = (b.y + b.height / 2) * s;
    const x = (i % COLS) * CELL, y = 40 + Math.floor(i / COLS) * (CELL + LABEL);
    g.drawImage(img, cx - side / 2, cy - side / 2, side, side, x + 4, y + 4, CELL - 8, CELL - 8);
    g.fillStyle = '#2b2420'; g.font = '12px sans-serif';
    g.fillText(k.file.replace('.jpg', ''), x + 6, y + CELL + 12);
    g.fillText(`W ${k.webEar ? k.webEar.map(f2).join(' ') : 'no face'}  P ${k.phoneOpen ? k.phoneOpen.map(f2).join(' ') : 'no face'}${k.faceHeight ? `  ${Math.round(k.faceHeight)}px` : ''}`, x + 6, y + CELL + 28);
    g.fillStyle = k.phoneShut ? '#b3261e' : '#1f5fa8'; g.font = 'bold 12px sans-serif';
    const says = k.only === 'phone' ? 'phone: shut, web: no face'
      : k.only === 'website' ? 'web: shut, phone: no face'
      : k.phoneShut ? 'phone: shut, web: open'
      : k.judged ? 'web: shut, phone: open' : 'web: shut, phone: not read';
    g.fillText(says, x + 6, y + CELL + 44);
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

/* ── Every face only the phone found ───────────────────────────────────── */
/** compare.mjs's matching: greedy one-to-one by overlap (IoU ≥ 0.2). */
function matchedPhone(as, bs) {
  const cand = [];
  as.forEach((a, i) => bs.forEach((b, j) => { const v = iou(a, b); if (v >= 0.2) cand.push({ i, j, v }); }));
  cand.sort((x, y) => y.v - x.v);
  const ui = new Set(), uj = new Set();
  for (const c of cand) if (!ui.has(c.i) && !uj.has(c.j)) { ui.add(c.i); uj.add(c.j); }
  return uj;
}
const phoneOnly = [];
for (const w of web.rows) {
  const p = P.get(w.file);
  if (!p?.mlFaces) continue;
  const h = w.faces.h, big = (b) => b.height >= h * MIN_SHARE;
  const wf = w.faces.faces.map((f) => f.box).filter(big);
  const pf = p.mlFaces.filter((f) => big(f.box));
  const used = matchedPhone(wf, pf.map((f) => f.box));
  pf.forEach((f, j) => { if (!used.has(j)) phoneOnly.push({ file: w.file, scale: w.width / w.faces.w, box: f.box, judged: R.eyesJudged(f), shut: R.phoneEyesShut(f), open: [f.leftEyeOpen, f.rightEyeOpen] }); });
}
const png3 = await page.evaluate(async (faces) => {
  const CELL = 150, LABEL = 30, COLS = 8;
  const c = document.createElement('canvas');
  c.width = COLS * CELL; c.height = Math.max(1, Math.ceil(faces.length / COLS)) * (CELL + LABEL) + 40;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2b2420'; g.font = 'bold 16px sans-serif';
  g.fillText(`Every face only the phone found (${faces.length}), cut out of its photo with room around it`, 8, 24);
  const imgs = new Map();
  for (let i = 0; i < faces.length; i++) {
    const k = faces[i];
    if (!imgs.has(k.file)) imgs.set(k.file, await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `http://pics.local/${encodeURIComponent(k.file)}`; }));
    const img = imgs.get(k.file), s = k.scale, b = k.box;
    const side = Math.max(b.width, b.height) * s * 1.6;
    const cx = (b.x + b.width / 2) * s, cy = (b.y + b.height / 2) * s;
    const x = (i % COLS) * CELL, y = 40 + Math.floor(i / COLS) * (CELL + LABEL);
    g.drawImage(img, cx - side / 2, cy - side / 2, side, side, x + 3, y + 3, CELL - 6, CELL - 6);
    g.fillStyle = '#2b2420'; g.font = '11px sans-serif';
    g.fillText(`${i + 1}. ${k.file.replace('.jpg', '').replace('megy-sample-', 's')} ${Math.round(b.height)}px`, x + 4, y + CELL + 10);
    g.fillStyle = k.shut ? '#b3261e' : '#6b5d54';
    g.fillText(k.judged ? (k.shut ? 'eyes: shut' : 'eyes: open') : 'eyes: not judged', x + 4, y + CELL + 23);
  }
  return c.toDataURL('image/png').split(',')[1];
}, phoneOnly);
fs.writeFileSync(path.join(OUT, 'phone-only-faces.png'), Buffer.from(png3, 'base64'));
fs.writeFileSync(path.join(OUT, 'phone-only-faces.json'), JSON.stringify(phoneOnly, null, 1));
await browser.close();
console.log(`${phoneOnly.length} faces only the phone found → out/phone-only-faces.png`);
console.log('→ out/eyes-sheet.png, out/faces-sheet.png, out/phone-only-faces.png');
