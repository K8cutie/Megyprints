#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   THE PHONE'S ANSWERS for the test pictures: the 2.0 app's own photo check
   and face centring (mobile/src/lib/phonePhotoCheck.ts), run by the app's
   test screen (mobile/src/app/photo-check-lab.tsx) on an Android emulator
   or phone.

     cd tools/photo-check && node phoneServer.mjs --serial emulator-5590 [--metro 8081] [--pc-port 8095]

   Needs: the dev app (com.megyprints.app.dev) installed on that device, and
   Metro running for it (cd mobile && npx expo start, with adb reverse
   tcp:8081 tcp:8081: this script sets that up too). It:
     1. copies out/pictures/*.jpg to the device's Pictures/MegyCheck folder
        (skip with --no-push) and has Android index them;
     2. lets the app read all photos (READ_MEDIA_IMAGES) and forwards the
        device's localhost:8095 to this PC (adb reverse);
     3. opens the test screen (megyprints-dev://photo-check-lab), serves it
        the list of pictures (GET /manifest) and takes its answers
        (POST /results) into out/phone.json;
     4. saves a screenshot of the finished screen as out/phone-lab.png.
   Only made-up pictures and the website's sample photos are ever copied.
   ══════════════════════════════════════════════════════════════════════════ */
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PICTURES = path.join(HERE, 'out', 'pictures');
const OUT = path.join(HERE, 'out');
const APP = 'com.megyprints.app.dev';
const FOLDER = '/sdcard/Pictures/MegyCheck';
/** The test screen asks the device's localhost:8095 (forwarded to this PC). */
const DEVICE_PORT = 8095;
const ADB = process.env.ADB || 'C:\\Android\\sdk\\platform-tools\\adb.exe';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const serial = opt('--serial');
if (!serial) { console.error('Say which device: --serial emulator-5590'); process.exit(2); }
const push = !args.includes('--no-push');
const timeoutMin = Number(opt('--minutes') ?? 40);
// This PC's ports (so two runs on one PC don't collide): the answers, and Metro.
const PORT = Number(opt('--pc-port') ?? DEVICE_PORT);
const METRO = Number(opt('--metro') ?? 8081);

/** adb on THIS device only. */
const adb = (...a) => execFileSync(ADB, ['-s', serial, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const adbBytes = (...a) => execFileSync(ADB, ['-s', serial, ...a], { maxBuffer: 64 * 1024 * 1024 });

const manifest = JSON.parse(fs.readFileSync(path.join(PICTURES, 'manifest.json'), 'utf8'));
for (const m of manifest) {
  if (!/^(pc-|megy-sample-)[\w.-]+\.jpg$/.test(m.file)) throw new Error(`Not a test picture: ${m.file}`);
}

function indexedNames() {
  const out = adb('shell', 'content', 'query', '--uri', 'content://media/external/images/media', '--projection', '_display_name', '--where', `"relative_path='Pictures/MegyCheck/'"`);
  return new Set([...out.matchAll(/_display_name=([^,\n]+)/g)].map((m) => m[1].trim()));
}

if (push) {
  adb('shell', 'mkdir', '-p', FOLDER);
  const files = manifest.map((m) => path.join(PICTURES, m.file));
  for (let i = 0; i < files.length; i += 20) {
    adb('push', ...files.slice(i, i + 20), `${FOLDER}/`);
    process.stdout.write(`pushed ${Math.min(i + 20, files.length)}/${files.length}\r`);
  }
  console.log('');
  // Android lists a pushed file at once but reads its details (size, EXIF turn)
  // only when it is scanned: ask for a scan of each.
  adb('shell', `for f in ${FOLDER}/*.jpg; do am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://$f" >/dev/null; done`);
  let have = indexedNames();
  for (let t = 0; t < 60; t++) {
    have = indexedNames();
    if (manifest.every((m) => have.has(m.file))) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`Android indexed ${manifest.filter((m) => have.has(m.file)).length}/${manifest.length} pictures`);
}

adb('shell', 'pm', 'grant', APP, 'android.permission.READ_MEDIA_IMAGES');
adb('reverse', `tcp:${DEVICE_PORT}`, `tcp:${PORT}`);
adb('reverse', 'tcp:8081', `tcp:${METRO}`);

const done = new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/manifest') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(manifest.map((m) => ({ file: m.file }))));
      return;
    }
    if (req.method === 'POST' && req.url === '/results') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  setTimeout(() => { server.close(); reject(new Error(`No answers after ${timeoutMin} minutes`)); }, timeoutMin * 60_000).unref();
});

adb('shell', 'am', 'force-stop', APP); // a fresh start, so the screen runs again
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', 'megyprints-dev://photo-check-lab', APP);
const report = await done;
await new Promise((r) => setTimeout(r, 1500));
fs.writeFileSync(path.join(OUT, 'phone-lab.png'), adbBytes('exec-out', 'screencap', '-p'));
const t = report.totals;
console.log(`${report.rows.length} pictures → out/phone.json (blur+repeats ${Math.round(t.basicMs / t.photos)} ms a photo, faces ${Math.round(t.facesMs / t.photos)} ms, centring ${Math.round(t.centreMs / t.photos)} ms)`);
