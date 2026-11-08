#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE IPHONE'S ANSWERS for the test pictures: phoneServer.mjs for an iPhone
   simulator (on a Mac, where the simulator's localhost IS this computer, so
   no port forwarding is needed). Same test screen
   (mobile/src/app/photo-check-lab.tsx), same /manifest and /results, same
   out/phone.json for compare.mjs.

     cd tools/photo-check && node phoneServerIos.mjs --udid <simulator udid> [--minutes 40]

   Needs: the test app (com.megyprints.app.dev) installed on that booted
   simulator (a Release build: its code is inside, no Metro). It:
     1. adds out/pictures/*.jpg to the simulator's Photos (simctl addmedia;
        skip with --no-push) and gives the app Photos access;
     2. opens the test screen (megyprints-dev://photo-check-lab), serves it
        the list of pictures and their taken times (GET /manifest) and takes
        its answers (POST /results) into out/phone.json;
     3. samples the app's memory every 2 s while it works and for 30 s after
        (a simulator app is a process on this Mac: ps RSS, in MB), into
        phone.json's "memory";
     4. saves a screenshot of the finished screen as out/phone-lab-1.png.
   Only made-up pictures and the website's sample photos are ever added.
   ══════════════════════════════════════════════════════════════════════════ */
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PICTURES = path.join(HERE, 'out', 'pictures');
const OUT = path.join(HERE, 'out');
const APP = 'com.megyprints.app.dev';
const PORT = 8095;

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const udid = opt('--udid');
if (!udid) { console.error('Say which simulator: --udid <udid> (xcrun simctl list devices booted)'); process.exit(2); }
const push = !args.includes('--no-push');
const timeoutMin = Number(opt('--minutes') ?? 40);

const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

const manifest = JSON.parse(fs.readFileSync(path.join(PICTURES, 'manifest.json'), 'utf8'));
for (const m of manifest) {
  if (!/^(pc-|megy-sample-)[\w.-]+\.jpg$/.test(m.file)) throw new Error(`Not a test picture: ${m.file}`);
}

if (push) {
  const files = manifest.map((m) => path.join(PICTURES, m.file));
  for (let i = 0; i < files.length; i += 20) {
    simctl('addmedia', udid, ...files.slice(i, i + 20));
    process.stdout.write(`added ${Math.min(i + 20, files.length)}/${files.length}\r`);
  }
  console.log('');
}
simctl('privacy', udid, 'grant', 'photos', APP);

/* iPhone renames a photo added to Photos (IMG_0001.JPG…) and keeps the file's
   own name only as its "original" name; the app's photo grid (expo-media-library)
   gives the Photos name. The test screen finds pictures by name, so it is
   asked for the Photos names (read from the simulator's Photos records), and
   its answers are put back under the test pictures' own names. */
function photosNames() {
  const db = path.join(os.homedir(), 'Library', 'Developer', 'CoreSimulator', 'Devices', udid, 'data', 'Media', 'PhotoData', 'Photos.sqlite');
  try {
    const out = execFileSync('sqlite3', ['-readonly', '-separator', '|', db,
      'SELECT a.ZFILENAME, aa.ZORIGINALFILENAME FROM ZASSET a JOIN ZADDITIONALASSETATTRIBUTES aa ON aa.ZASSET = a.Z_PK;'], { encoding: 'utf8' });
    return new Map(out.trim().split('\n').filter(Boolean).map((l) => { const [inPhotos, original] = l.split('|'); return [original, inPhotos]; }));
  } catch (e) {
    console.warn(`Could not read the simulator's Photos names (${e.message}); asking by the files' own names.`);
    return new Map();
  }
}
let names = photosNames();
for (let t = 0; t < 60 && !manifest.every((m) => names.has(m.file)); t++) {
  await new Promise((r) => setTimeout(r, 1000));
  names = photosNames();
}
const iosName = (file) => names.get(file) ?? file;
const ownName = new Map(manifest.map((m) => [iosName(m.file), m.file]));
console.log(`Photos holds ${manifest.filter((m) => names.has(m.file)).length}/${manifest.length} test pictures, e.g. ${manifest.slice(0, 3).map((m) => `${m.file} → ${iosName(m.file)}`).join(', ')}`);
/** Every string in the answers that is a Photos name, back to the picture's own name. */
const backToOwnNames = (v) => (typeof v === 'string' ? (ownName.get(v) ?? v)
  : Array.isArray(v) ? v.map(backToOwnNames)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, backToOwnNames(x)]))
  : v);
const shot = (name) => { try { simctl('io', udid, 'screenshot', path.join(OUT, name)); } catch { /* none */ } };

const done = new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/manifest') {
      console.log('The test screen asked for the pictures.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifest.map((m) => ({ file: iosName(m.file), capturedAt: m.capturedAt ?? null }))));
      return;
    }
    if (req.method === 'POST' && req.url === '/results') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const report = backToOwnNames(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          fs.writeFileSync(path.join(OUT, 'phone.json'), JSON.stringify(report, null, 1));
          res.writeHead(200).end('ok');
          server.close();
          resolve(report);
        } catch (e) {
          res.writeHead(400).end(String(e));
        }
      });
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(PORT, '127.0.0.1', () => console.log(`Waiting for the app on :${PORT}…`));
  setTimeout(() => { shot('phone-lab-timeout.png'); server.close(); reject(new Error(`No answers after ${timeoutMin} minutes`)); }, timeoutMin * 60_000).unref();
});

/** The app's memory now (MB): the simulator app's process on this Mac. */
function memoryNow() {
  try {
    const pid = execFileSync('pgrep', ['-n', '-f', 'MegyPrints20dev.app/MegyPrints20dev'], { encoding: 'utf8' }).trim();
    if (!pid) return null;
    const kb = Number(execFileSync('ps', ['-o', 'rss=', '-p', pid], { encoding: 'utf8' }).trim());
    return Number.isFinite(kb) ? { rss: Math.round(kb / 102.4) / 10 } : null;
  } catch {
    return null;
  }
}
const memory = [];
let started = 0;
const sample = (phase) => { const m = memoryNow(); if (m?.rss != null) memory.push({ t: Math.round((Date.now() - started) / 100) / 10, phase, ...m }); };

try { simctl('terminate', udid, APP); } catch { /* not running */ }
started = Date.now();
// iPhone asks "Open in …?" before following the app's own link: Maestro
// (installed by the workflow) opens the link and taps Open
// (mobile/maestro/ios-open-link.yaml). Not waited for: this server must
// answer the screen meanwhile.
execFile('maestro', ['--device', udid, 'test', '-e', 'LINK=megyprints-dev://photo-check-lab', path.join(HERE, '..', '..', 'mobile', 'maestro', 'ios-open-link.yaml')],
  { env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: process.env.MAESTRO_DRIVER_STARTUP_TIMEOUT ?? '300000' } },
  (e, out) => {
    process.stdout.write(out ?? '');
    if (e) console.warn(`Opening the test screen did not run (${e.message}); the screen may still be waiting for it.`);
  });
let running = true;
// The screen every 2 minutes (its status line says what it is doing, or why it stopped).
const poll = (async () => {
  let n = 0;
  while (running) {
    sample('checking');
    if (++n % 60 === 0) shot('phone-lab-progress.png');
    await new Promise((r) => setTimeout(r, 2000));
  }
})();
const report = await done;
running = false;
await poll;
const doneAt = Date.now();
while (Date.now() - doneAt < 30_000) { sample('after'); await new Promise((r) => setTimeout(r, 2000)); }
const peak = Math.max(...memory.map((m) => m.rss));
report.memory = {
  samples: memory,
  peakRssMB: Number.isFinite(peak) ? peak : null,
  lastRssMB: memory.at(-1)?.rss ?? null,
  how: 'iPhone simulator: ps -o rss of the app process every 2 s (MB = KB / 1024); a real iPhone differs',
};
fs.writeFileSync(path.join(OUT, 'phone.json'), JSON.stringify(report, null, 1));
await new Promise((r) => setTimeout(r, 2000));
simctl('io', udid, 'screenshot', path.join(OUT, 'phone-lab-1.png'));
const t = report.totals;
console.log(`${report.rows.length} pictures → out/phone.json (blur+repeats ${Math.round(t.basicMs / t.photos)} ms a photo, faces ${Math.round(t.facesMs / t.photos)} ms, centring ${Math.round(t.centreMs / t.photos)} ms; memory peak ${report.memory.peakRssMB} MB RSS)`);
