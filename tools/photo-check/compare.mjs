#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   PHONE vs WEBSITE: how often the 2.0 app's photo check and face centring
   give the website's answers on the same test pictures.

     node makePictures.mjs && node runWeb.mjs && node phoneServer.mjs --serial … && node compare.mjs

   Reads out/web.json, out/phone.json and out/pictures/manifest.json; writes
   out/report.json and out/report.html (the same numbers as a page).

   The verdicts are worked out with the website's own album rules
   (src/lib/photoCheck.ts, bundled as they are), on three albums: the
   made-up pictures, the sample photos with their copies, and all of them
   together. Each side uses its own measurements, as each device would:
     • blur:     isBlurry with that side's own album median;
     • repeats:  findRepeats (the taken times from the manifest);
     • leave-out suggestions: suggestLeaveOut (blur + repeats + closed eyes
       picking the keeper).
   Faces: counts, closed eyes, box overlap and the centring point. These come
   from different face finders (face-api.js on the website, Google ML Kit on
   the phone), so they are expected to differ: the report says how much. The
   phone's eye rule (EYE_SHUT_BELOW, MIN_EYE_FACE_PX) is read from the app's
   own mobile/src/lib/phoneFaces.ts, bundled as it is, never copied here.
   Also: the verdicts the app showed on its own screen (phone.json
   "verdicts"), the app's memory (phone.json "memory", from phoneServer.mjs)
   and the pictures over the app's 24 MP whole-decode limit.
   ══════════════════════════════════════════════════════════════════════════ */
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
const REPO = path.resolve(HERE, '..', '..');

// The website's rules and the app's eye rule, as they are (sheets.mjs reads this too).
const RULES = path.join(OUT, 'rules.mjs');
await build({
  stdin: {
    contents: `export * from '../../src/lib/photoCheck'; export { faceGroupCentre } from '../../src/pages/builder/faceCentre';
export { EYE_SHUT_BELOW, MIN_EYE_FACE_PX, eyesJudged, phoneEyesShut } from '../../mobile/src/lib/phoneFaces';`,
    resolveDir: HERE, loader: 'ts',
  },
  alias: { '@web': path.join(REPO, 'src') },
  bundle: true, platform: 'node', format: 'esm', outfile: RULES, logLevel: 'error',
});
const R = await import(pathToFileURL(RULES).href);

const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'pictures', 'manifest.json'), 'utf8'));
const web = JSON.parse(fs.readFileSync(path.join(OUT, 'web.json'), 'utf8'));
const phone = JSON.parse(fs.readFileSync(path.join(OUT, 'phone.json'), 'utf8'));
const W = new Map(web.rows.map((r) => [r.file, r]));
const P = new Map(phone.rows.map((r) => [r.file, r]));
const files = manifest.map((m) => m.file).filter((f) => W.has(f) && P.get(f)?.basic);
const missing = manifest.map((m) => m.file).filter((f) => !files.includes(f));
const M = new Map(manifest.map((m) => [m.file, m]));

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
const setKey = (sets) => sets.map((s) => [...s].sort().join('+')).sort();

/* ── Sizes: the phone must measure each picture as the website does ───── */
const sizeMismatch = files.filter((f) => { const p = P.get(f), m = M.get(f); return p.width !== m.width || p.height !== m.height; })
  .map((f) => ({ file: f, manifest: [M.get(f).width, M.get(f).height], phone: [P.get(f).width, P.get(f).height] }));

/* ── Measurements, picture by picture ───────────────────────────────── */
const meas = files.map((f) => {
  const w = W.get(f).check, p = P.get(f).basic, m = M.get(f);
  return { file: f, megapixels: Math.round((m.width * m.height) / 1e5) / 10, webSharp: w.sharp, phoneSharp: p.sharp, ratio: p.sharp / Math.max(1e-9, w.sharp), hashBits: R.hamming(w.hash, p.hash) };
});
// Over the app's whole-decode limit (PhotoPixelsModule.kt MAX_FULL_PIXELS, 24 MP):
// decoded at half size first, so close to, not exactly, the website's copy.
const overLimit = meas.filter((m) => m.megapixels > 24).map((m) => ({ file: m.file, megapixels: m.megapixels, webSharp: r1(m.webSharp), phoneSharp: r1(m.phoneSharp), ratio: r3(m.ratio), hashBits: m.hashBits }));
const ratios = meas.map((m) => m.ratio);
const hashBits = meas.map((m) => m.hashBits);

/* ── Album verdicts ─────────────────────────────────────────────────── */
const ALBUMS = {
  'made-up pictures': files.filter((f) => f.startsWith('pc-') && !/^pc-s(blur|near)-/.test(f)),
  'sample photos and their copies': files.filter((f) => f.startsWith('megy-sample-') || /^pc-s(blur|near)-/.test(f)),
  'everything together': files,
};

/** The album as the builder holds it, with one side's checks. */
function album(list, side) {
  return list.map((f) => {
    const m = M.get(f);
    const check = side === 'web'
      ? { ...W.get(f).check }
      : { ...P.get(f).basic, faces: P.get(f).faces?.faces ?? null, eyesClosed: P.get(f).faces?.eyesClosed ?? false };
    return { id: f, width: m.width, height: m.height, capturedAt: m.capturedAt, check };
  });
}
const noEyes = (ps) => ps.map((p) => ({ ...p, check: { ...p.check, eyesClosed: false } }));

const verdicts = {};
for (const [name, list] of Object.entries(ALBUMS)) {
  const a = album(list, 'web'), b = album(list, 'phone');
  const mw = R.medianSharpness(a), mp = R.medianSharpness(b);
  const blurW = a.filter((p) => R.isBlurry(p, mw)).map((p) => p.id).sort();
  const blurP = b.filter((p) => R.isBlurry(p, mp)).map((p) => p.id).sort();
  const perPhotoBlur = list.filter((f, i) => R.isBlurry(a[i], mw) === R.isBlurry(b[i], mp)).length;
  const repW = setKey(R.findRepeats(a)), repP = setKey(R.findRepeats(b));
  // Every pair: does each side call it a repeat?
  let pairs = 0, pairsSame = 0, pairsEither = 0, pairsBoth = 0;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const x = R.areRepeats(a[i], a[j]), y = R.areRepeats(b[i], b[j]);
    pairs++; if (x === y) pairsSame++; if (x || y) pairsEither++; if (x && y) pairsBoth++;
  }
  const sugBasicW = R.suggestLeaveOut(noEyes(a)), sugBasicP = R.suggestLeaveOut(noEyes(b));
  const sugW = R.suggestLeaveOut(a), sugP = R.suggestLeaveOut(b);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const sortS = (s) => ({ blurry: [...s.blurry].sort(), repeats: [...s.repeats].sort(), keeperOf: Object.fromEntries(Object.entries(s.keeperOf).sort()) });
  verdicts[name] = {
    photos: list.length,
    median: { web: r1(mw), phone: r1(mp) },
    blurry: { web: blurW, phone: blurP, same: same(blurW, blurP), perPhotoAgreement: pct(perPhotoBlur, list.length) },
    repeatSets: { web: repW, phone: repP, same: same(repW, repP) },
    repeatPairs: { pairs, agree: pct(pairsSame, pairs), flaggedByEither: pairsEither, flaggedByBoth: pairsBoth },
    leaveOutWithoutEyes: { same: same(sortS(sugBasicW), sortS(sugBasicP)), web: sortS(sugBasicW), phone: sortS(sugBasicP) },
    leaveOutWithEyes: { same: same(sortS(sugW), sortS(sugP)), web: sortS(sugW), phone: sortS(sugP) },
  };
}

/* ── Faces ──────────────────────────────────────────────────────────── */
const iou = (a, b) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.width, b.x + b.width), y1 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return inter / (a.width * a.height + b.width * b.height - inter);
};
/** Greedy one-to-one matching by overlap (IoU ≥ 0.2). */
function match(as, bs) {
  const cand = [];
  as.forEach((a, i) => bs.forEach((b, j) => { const v = iou(a, b); if (v >= 0.2) cand.push({ i, j, v }); }));
  cand.sort((x, y) => y.v - x.v);
  const ui = new Set(), uj = new Set(), out = [];
  for (const c of cand) if (!ui.has(c.i) && !uj.has(c.j)) { ui.add(c.i); uj.add(c.j); out.push(c); }
  return out;
}

const faceRows = files.map((f) => {
  const w = W.get(f), p = P.get(f);
  const h = w.faces.h;
  const big = (b) => b.height >= h * R.MIN_FACE_SHARE;
  const wFaces = w.faces.faces.filter((x) => big(x.box));
  const pFaces = (p.mlFaces ?? []).filter((x) => big(x.box));
  const pairs = match(wFaces.map((x) => x.box), pFaces.map((x) => x.box));
  const eyes = pairs.map(({ i, j, v }) => {
    const a = wFaces[i], b = pFaces[j];
    return {
      iou: v,
      webClosed: a.earLeft < R.EYE_CLOSED_EAR && a.earRight < R.EYE_CLOSED_EAR,
      webEar: [r3(a.earRight), r3(a.earLeft)],
      phoneOpen: [r3(b.rightEyeOpen), r3(b.leftEyeOpen)],
      phoneClosed: R.phoneEyesShut(b),
      phoneJudged: R.eyesJudged(b),
    };
  });
  const sizeOk = p.faces != null;
  return {
    file: f,
    webFaces: w.check.faces, phoneFaces: sizeOk ? p.faces.faces : null,
    webClosed: w.check.eyesClosed, phoneClosed: sizeOk ? p.faces.eyesClosed : null,
    webBoxes: wFaces.length, phoneBoxes: pFaces.length, matched: pairs.length, eyes,
    webCentre: w.centre, phoneCentre: p.centre ?? null,
  };
});
const fr = faceRows.filter((r) => r.phoneFaces != null);
const countSame = fr.filter((r) => r.webFaces === r.phoneFaces).length;
const anySame = fr.filter((r) => (r.webFaces > 0) === (r.phoneFaces > 0)).length;
const closedSame = fr.filter((r) => r.webClosed === r.phoneClosed).length;
const closedConf = { bothOpen: 0, bothClosed: 0, webOnly: 0, phoneOnly: 0 };
for (const r of fr) {
  if (r.webClosed && r.phoneClosed) closedConf.bothClosed++; else if (r.webClosed) closedConf.webOnly++; else if (r.phoneClosed) closedConf.phoneOnly++; else closedConf.bothOpen++;
}
const totalW = fr.reduce((s, r) => s + r.webBoxes, 0), totalP = fr.reduce((s, r) => s + r.phoneBoxes, 0), totalM = fr.reduce((s, r) => s + r.matched, 0);
const allEyes = fr.flatMap((r) => r.eyes);
const eyeConf = { bothOpen: 0, bothClosed: 0, webOnly: 0, phoneOnly: 0, phoneNotJudged: 0 };
for (const e of allEyes) {
  if (!e.phoneJudged) eyeConf.phoneNotJudged++;
  else if (e.webClosed && e.phoneClosed) eyeConf.bothClosed++; else if (e.webClosed) eyeConf.webOnly++; else if (e.phoneClosed) eyeConf.phoneOnly++; else eyeConf.bothOpen++;
}

// Where the phone's "shut" line (EYE_SHUT_BELOW, an ML Kit open chance)
// could sit, with and without the smallest face whose eyes are read
// (MIN_EYE_FACE_PX): how many pictures each calls shut, and how often that
// agrees with the website. (A face counts when it is big enough to judge.)
const eyeLines = [];
for (const minPx of [0, R.MIN_EYE_FACE_PX]) {
  for (const line of [0.05, 0.1, 0.15, 0.2, 0.3, 0.5]) {
    let shut = 0, same = 0;
    for (const f of files) {
      const p = P.get(f), h = W.get(f).faces.h;
      const phoneShut = (p.mlFaces ?? []).some((x) => x.box.height >= h * R.MIN_FACE_SHARE && x.box.width >= minPx && x.box.height >= minPx
        && x.leftEyeOpen != null && x.rightEyeOpen != null && x.leftEyeOpen < line && x.rightEyeOpen < line);
      if (phoneShut) shut++;
      if (phoneShut === W.get(f).check.eyesClosed) same++;
    }
    eyeLines.push({ line, minFacePx: minPx, picturesShut: shut, agreeWithWebsite: pct(same, files.length), inUse: line === R.EYE_SHUT_BELOW && minPx === R.MIN_EYE_FACE_PX });
  }
}

// Centring: web detectFaceCenter (whole picture) vs phone detectFaceCenter.
const cen = { bothNone: 0, bothFound: 0, webOnly: 0, phoneOnly: 0, dist: [] };
for (const f of files) {
  const a = W.get(f).centre, b = P.get(f).centre ?? null;
  if (!a && !b) cen.bothNone++;
  else if (a && b) { cen.bothFound++; cen.dist.push(Math.hypot(a.x - b.x, a.y - b.y)); }
  else if (a) cen.webOnly++; else cen.phoneOnly++;
}

/* ── Speed and the screen ───────────────────────────────────────────── */
const pr = files.map((f) => P.get(f));
const steps = (k, s) => pr.map((r) => r[k]?.[s]).filter((x) => typeof x === 'number');
const speed = {
  device: { engine: phone.engine, dev: phone.dev },
  blurAndRepeats: { medianMs: r1(q(pr.map((r) => r.basicMs), 0.5)), p95Ms: r1(q(pr.map((r) => r.basicMs), 0.95)), decodeMedianMs: r1(q(steps('basicSteps', 'pixels'), 0.5)), jsMedianMs: r1(q(pr.map((r) => r.basicMs - (r.basicSteps?.pixels ?? 0)), 0.5)) },
  facesAndEyes: { medianMs: r1(q(pr.map((r) => r.facesMs).filter(Number.isFinite), 0.5)), p95Ms: r1(q(pr.map((r) => r.facesMs).filter(Number.isFinite), 0.95)), decodeAndMlKitMedianMs: r1(q(steps('facesSteps', 'find'), 0.5)) },
  faceCentringCold: { medianMs: r1(q(pr.map((r) => r.centreMs).filter(Number.isFinite), 0.5)), p95Ms: r1(q(pr.map((r) => r.centreMs).filter(Number.isFinite), 0.95)) },
  faceCentringAgain: { medianMs: r1(q(pr.map((r) => r.centreAgainMs).filter(Number.isFinite), 0.5)), sameAnswer: pr.every((r) => r.centreAgainSame !== false) },
  totals: phone.totals,
  screenWaits: phone.lag,
  galleryReads: phone.gallery ?? null,
  websiteOnThisPC: { basicMedianMs: r1(q(web.rows.map((r) => r.basicMs), 0.5)), fullCheckMedianMs: r1(q(web.rows.map((r) => r.fullCheckMs), 0.5)), centreMedianMs: r1(q(web.rows.map((r) => r.centreMs), 0.5)), faceApiBackend: web.faceApiBackend },
};

/* ── The first try, through a wrapper library (when out/phone-wrapper.json is
   kept): the app's first small copy (JPEG decoder's own shrink + bilinear)
   and @infinitered/react-native-mlkit-face-detection 5.0.0 on a JPEG of it. ── */
let wrapperRun = null;
const wrapperFile = path.join(OUT, 'phone-wrapper.json');
if (fs.existsSync(wrapperFile)) {
  const wr = JSON.parse(fs.readFileSync(wrapperFile, 'utf8'));
  const WR = new Map(wr.rows.map((r) => [r.file, r]));
  const rs = files.filter((f) => WR.get(f)?.basic).map((f) => WR.get(f).basic.sharp / Math.max(1e-9, W.get(f).check.sharp));
  const hb = files.filter((f) => WR.get(f)?.basic).map((f) => R.hamming(W.get(f).check.hash, WR.get(f).basic.hash));
  wrapperRun = { when: wr.when, sharpRatio: { median: r3(q(rs, 0.5)), min: r3(Math.min(...rs)), max: r3(Math.max(...rs)) }, hashBits: { median: q(hb, 0.5), max: Math.max(...hb) }, galleryReads: wr.gallery ?? null, screenWaits: wr.lag };
}

/* ── What the app showed on its own screen (its verdicts, worked out on the
   phone with the same album rules), against this comparison's ── */
let onScreen = null;
if (phone.verdicts) {
  const v = phone.verdicts, all = verdicts['everything together'];
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const webShut = files.filter((f) => W.get(f).check.eyesClosed).sort();
  onScreen = {
    photos: v.photos,
    blurry: { phone: v.blurry.length, website: all.blurry.web.length, sameAsWebsite: same(v.blurry, all.blurry.web) },
    repeatSets: { phone: v.repeatSets.length, website: all.repeatSets.web.length, sameAsWebsite: same(setKey(v.repeatSets), all.repeatSets.web) },
    eyesShut: { phone: v.eyesShut.length, website: webShut.length, both: v.eyesShut.filter((f) => webShut.includes(f)).length },
    leaveOut: {
      phone: v.leaveOut.blurry.length + v.leaveOut.repeats.length,
      website: all.leaveOutWithEyes.web.blurry.length + all.leaveOutWithEyes.web.repeats.length,
      sameAsWebsite: same([...v.leaveOut.blurry].sort(), all.leaveOutWithEyes.web.blurry) && same([...v.leaveOut.repeats].sort(), all.leaveOutWithEyes.web.repeats),
    },
    // The app's own sums agree with this tool's, from the same answers.
    sameAsThisTool: same(v.blurry, all.blurry.phone) && same(setKey(v.repeatSets), all.repeatSets.phone),
  };
}

const groups = {
  madeUp: ALBUMS['made-up pictures'].length,
  samples: files.filter((f) => f.startsWith('megy-sample-')).length,
  sampleCopies: files.filter((f) => /^pc-s(blur|near)-/.test(f)).length,
};
const report = {
  when: new Date().toISOString(),
  wrapperRun,
  pictures: { compared: files.length, ...groups, missing, sizeMismatch },
  onScreen,
  memory: phone.memory ? { peakPssMB: phone.memory.peakPssMB, peakRssMB: phone.memory.peakRssMB, lastPssMB: phone.memory.lastPssMB, firstPssMB: phone.memory.samples[0]?.pss ?? null, how: phone.memory.how } : null,
  measurements: {
    sharpRatio: { median: r3(q(ratios, 0.5)), min: r3(Math.min(...ratios)), max: r3(Math.max(...ratios)), within5pct: pct(ratios.filter((x) => Math.abs(x - 1) <= 0.05).length, ratios.length), within15pct: pct(ratios.filter((x) => Math.abs(x - 1) <= 0.15).length, ratios.length) },
    hashBits: { median: q(hashBits, 0.5), max: Math.max(...hashBits), zero: pct(hashBits.filter((x) => x === 0).length, hashBits.length), atMost3: pct(hashBits.filter((x) => x <= 3).length, hashBits.length) },
    worstSharp: [...meas].sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, 5).map((m) => ({ ...m, ratio: r3(m.ratio), webSharp: r1(m.webSharp), phoneSharp: r1(m.phoneSharp) })),
    worstHash: [...meas].sort((a, b) => b.hashBits - a.hashBits).slice(0, 5).map((m) => ({ file: m.file, hashBits: m.hashBits })),
    worstSharpPct: r3(Math.max(...ratios.map((x) => Math.abs(x - 1))) * 100),
    overLimit,
  },
  verdicts,
  faces: {
    picturesCompared: fr.length,
    faceCountSame: pct(countSame, fr.length),
    hasFaceSame: pct(anySame, fr.length),
    eyesClosedSame: pct(closedSame, fr.length),
    eyesClosedPictures: closedConf,
    boxes: { web: totalW, phone: totalP, matched: totalM, webFoundByPhone: pct(totalM, totalW), phoneFoundByWeb: pct(totalM, totalP), medianIoU: r3(q(allEyes.map((e) => e.iou), 0.5)) },
    eyesOnMatchedFaces: eyeConf,
    websitePicturesShut: files.filter((f) => W.get(f).check.eyesClosed).length,
    phoneShutLines: eyeLines,
    differences: fr.filter((r) => r.webFaces !== r.phoneFaces || r.webClosed !== r.phoneClosed)
      .map((r) => ({ file: r.file, faces: [r.webFaces, r.phoneFaces], closed: [r.webClosed, r.phoneClosed], eyes: r.eyes.map((e) => ({ webEar: e.webEar, phoneOpen: e.phoneOpen })) })),
  },
  centring: {
    bothNone: cen.bothNone, bothFound: cen.bothFound, webOnly: cen.webOnly, phoneOnly: cen.phoneOnly,
    sameDecision: pct(cen.bothNone + cen.bothFound, files.length),
    distance: { median: r3(q(cen.dist, 0.5)), p90: r3(q(cen.dist, 0.9)), within005: pct(cen.dist.filter((d) => d <= 0.05).length, cen.dist.length), within01: pct(cen.dist.filter((d) => d <= 0.1).length, cen.dist.length) },
  },
  speed,
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));

/* ── The same numbers as a page (for a screenshot) ──────────────────── */
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const yes = (b) => (b ? '<b class="ok">same</b>' : '<b class="no">different</b>');
const rowsV = Object.entries(verdicts).map(([n, v]) => `<tr><td>${esc(n)}</td><td>${v.photos}</td><td>${yes(v.blurry.same)} (${v.blurry.web.length} / ${v.blurry.phone.length})</td><td>${yes(v.repeatSets.same)} (${v.repeatSets.web.length} / ${v.repeatSets.phone.length} sets)</td><td>${v.repeatPairs.agree}%</td><td>${yes(v.leaveOutWithoutEyes.same)}</td><td>${yes(v.leaveOutWithEyes.same)}</td></tr>`).join('');
const m = report.measurements, F = report.faces, C = report.centring, S = speed;
const html = `<!doctype html><meta charset="utf-8"><title>Photo check: phone vs website</title>
<style>body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#2b2420;max-width:1100px}h1{color:#B85C38;font-size:22px}h2{font-size:17px;margin-top:22px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #e3d6cc;padding:5px 8px;text-align:left;vertical-align:top}th{background:#f6eee8}.ok{color:#1f7a3a}.no{color:#b3261e}.small{color:#6b5d54;font-size:13px}</style>
<h1>Megy photo check: the 2.0 app (Android, ML Kit) vs the website (face-api.js)</h1>
<p class="small">${files.length} pictures: ${groups.madeUp} made-up (scenes, blurred copies, near copies, EXIF-turned copies, one scene and its near copy at 50 MP), the ${groups.samples} sample photos and ${groups.sampleCopies} altered copies of them. ${missing.length ? `Missing on the phone: ${missing.length}.` : 'None missing.'} Sizes measured differently: ${sizeMismatch.length}.</p>
<h2>Blur and repeats (the same shared rules, each side's own decoding)</h2>
<table><tr><th>Album</th><th>Photos</th><th>Blurry (web / phone)</th><th>Repeat sets</th><th>Repeat pairs agree</th><th>Leave-out list, no eyes</th><th>Leave-out list, with eyes</th></tr>${rowsV}</table>
<p class="small">Sharpness phone÷web: median ${m.sharpRatio.median}, range ${m.sharpRatio.min}–${m.sharpRatio.max} (worst ${m.worstSharpPct}% apart), within 5%: ${m.sharpRatio.within5pct}% of pictures. Fingerprint bits different: median ${m.hashBits.median}, max ${m.hashBits.max}; identical on ${m.hashBits.zero}%.
${m.overLimit.length ? `Over the app's 24 MP whole-decode limit: ${m.overLimit.map((o) => `${esc(o.file)} (${o.megapixels} MP) sharpness ${o.phoneSharp} vs ${o.webSharp}, fingerprint ${o.hashBits} bits apart`).join('; ')}.` : ''}</p>
${report.onScreen ? `<p>On the phone's own screen (the same album rules, worked out on the phone): blurry ${report.onScreen.blurry.phone} (website ${report.onScreen.blurry.website}, ${report.onScreen.blurry.sameAsWebsite ? 'the same photos' : 'different photos'}), sets of repeats ${report.onScreen.repeatSets.phone} (website ${report.onScreen.repeatSets.website}, ${report.onScreen.repeatSets.sameAsWebsite ? 'the same sets' : 'different sets'}), eyes shut ${report.onScreen.eyesShut.phone} (website ${report.onScreen.eyesShut.website}, both ${report.onScreen.eyesShut.both}), suggested leaving out ${report.onScreen.leaveOut.phone} (website ${report.onScreen.leaveOut.website}, ${report.onScreen.leaveOut.sameAsWebsite ? 'the same photos' : 'different photos'}).</p>` : ''}
<h2>Faces and closed eyes (different face finders)</h2>
<table><tr><th>Same face count</th><th>Same "has a face"</th><th>Same closed-eyes verdict</th><th>Faces matched (web found by phone / phone found by web)</th><th>Median box overlap</th></tr>
<tr><td>${F.faceCountSame}%</td><td>${F.hasFaceSame}%</td><td>${F.eyesClosedSame}% (both shut ${F.eyesClosedPictures.bothClosed}, web only ${F.eyesClosedPictures.webOnly}, phone only ${F.eyesClosedPictures.phoneOnly})</td><td>${F.boxes.matched} of ${F.boxes.web} / ${F.boxes.matched} of ${F.boxes.phone} (${F.boxes.webFoundByPhone}% / ${F.boxes.phoneFoundByWeb}%)</td><td>${F.boxes.medianIoU}</td></tr></table>
<p class="small">The phone's eye rule: shut when both eyes score under ${R.EYE_SHUT_BELOW}, on faces at least ${R.MIN_EYE_FACE_PX} px. Other lines (pictures shut / agreement): ${eyeLines.map((l) => `${l.line}${l.minFacePx ? ` ≥${l.minFacePx}px` : ''}: ${l.picturesShut} / ${l.agreeWithWebsite}%${l.inUse ? ' (in use)' : ''}`).join(', ')}. Website: ${report.faces.websitePicturesShut} pictures shut.</p>
<h2>Face centring</h2>
<p>Same decision (face / no face): ${C.sameDecision}% (both found ${C.bothFound}, neither ${C.bothNone}, website only ${C.webOnly}, phone only ${C.phoneOnly}). Where both found faces, the points are ${C.distance.median} apart (median, share of the picture); within 0.05: ${C.distance.within005}%, within 0.1: ${C.distance.within01}%.</p>
<h2>Speed on the phone (${esc(S.device.engine)}${S.device.dev ? ', dev build' : ''})</h2>
<table><tr><th>Blur + repeats</th><th>Faces + eyes</th><th>Face centring (cold / again)</th><th>Screen waits (p95 / max)</th><th>Gallery read p95 (idle / blur pass / faces pass)</th></tr>
<tr><td>${S.blurAndRepeats.medianMs} ms median (decode ${S.blurAndRepeats.decodeMedianMs}, maths ${S.blurAndRepeats.jsMedianMs}); p95 ${S.blurAndRepeats.p95Ms}</td><td>${S.facesAndEyes.medianMs} ms median (small copy made again + ML Kit); p95 ${S.facesAndEyes.p95Ms}</td><td>${S.faceCentringCold.medianMs} / ${S.faceCentringAgain.medianMs} ms</td><td>blur ${r1(S.screenWaits.basic.p95)} / ${r1(S.screenWaits.basic.max)} ms; faces ${r1(S.screenWaits.faces.p95)} / ${r1(S.screenWaits.faces.max)} ms</td><td>${S.galleryReads ? `${r1(S.galleryReads.idle.p95)} / ${r1(S.galleryReads.basic.p95)} / ${r1(S.galleryReads.faces.p95)} ms` : 'not measured'}</td></tr></table>
${report.memory ? `<p>App memory (dumpsys meminfo, every 2 s): ${report.memory.firstPssMB} MB PSS at the start, peak ${report.memory.peakPssMB} MB PSS (${report.memory.peakRssMB} MB RSS) while checking, ${report.memory.lastPssMB} MB PSS 30 s after the last photo.</p>` : ''}
${report.wrapperRun ? `<p class="small">First try, through the wrapper library and the JPEG decoder's own shrink: sharpness phone÷web ${report.wrapperRun.sharpRatio.median} (range ${report.wrapperRun.sharpRatio.min}–${report.wrapperRun.sharpRatio.max}), fingerprints up to ${report.wrapperRun.hashBits.max} bits apart; gallery read p50 / p95 during the faces pass ${r1(report.wrapperRun.galleryReads?.faces?.p50)} / ${r1(report.wrapperRun.galleryReads?.faces?.p95)} ms (now ${r1(S.galleryReads?.faces?.p50)} / ${r1(S.galleryReads?.faces?.p95)} ms).</p>` : ''}
<p class="small">Website on this PC (headless Chromium, face-api ${esc(S.websiteOnThisPC.faceApiBackend)} backend): blur ${S.websiteOnThisPC.basicMedianMs} ms, full check ${S.websiteOnThisPC.fullCheckMedianMs} ms, centring ${S.websiteOnThisPC.centreMedianMs} ms (for reference only).</p>`;
fs.writeFileSync(path.join(OUT, 'report.html'), html);

console.log(JSON.stringify({ pictures: report.pictures, onScreen: report.onScreen, memory: report.memory, eyeLines, measurements: { sharpRatio: m.sharpRatio, worstSharpPct: m.worstSharpPct, overLimit: m.overLimit, hashBits: { median: m.hashBits.median, max: m.hashBits.max, zero: m.hashBits.zero } },
  verdicts: Object.fromEntries(Object.entries(verdicts).map(([n, v]) => [n, { blurrySame: v.blurry.same, blurry: [v.blurry.web.length, v.blurry.phone.length], repeatSetsSame: v.repeatSets.same, sets: [v.repeatSets.web.length, v.repeatSets.phone.length], pairsAgree: v.repeatPairs.agree, leaveOutNoEyes: v.leaveOutWithoutEyes.same, leaveOutWithEyes: v.leaveOutWithEyes.same }])),
  faces: { faceCountSame: F.faceCountSame, hasFaceSame: F.hasFaceSame, eyesClosedSame: F.eyesClosedSame, closed: F.eyesClosedPictures, boxes: F.boxes, eyes: F.eyesOnMatchedFaces },
  centring: C, speed: S }, null, 1));
