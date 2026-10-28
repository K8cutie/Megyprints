#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   RUN THE GOLDEN PAGES ON A PHONE OR EMULATOR and bring the pictures back.

     node scripts/golden-phone-run.cjs --device emulator-5562
         [--apk dist/android/megyprints-2.0-dev-release-golden.apk] [--no-install]
         [--out ../tools/golden/phone]

   1. installs the -GoldenPages test build (build-android.ps1 -GoldenPages);
   2. opens its debug screen with megyprints-dev://golden-pages?run=1, which
      draws every golden page with the phone's own Skia into the app's files
      folder (src/dev/goldenRun.ts);
   3. waits for report.json (the run's last file), showing its progress from
      the phone's log;
   4. pulls the folder into tools/golden/phone/, for `npm run golden:phone`.

   The app's files folder is private: on an emulator image without Google
   Play (pwa_test) `adb root` opens it; a debug build is read with run-as.
   ══════════════════════════════════════════════════════════════════════════ */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MOBILE = path.resolve(__dirname, '..');
const PKG = 'com.megyprints.app.dev';
const REMOTE = `/data/data/${PKG}/files/golden-phone`;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const device = arg('device', process.env.ANDROID_SERIAL);
if (!device) {
  console.error('Say which device: --device emulator-5562 (adb devices lists them).');
  process.exit(1);
}
const ADB = process.env.ADB ?? path.join(process.env.ANDROID_HOME ?? 'C:\\Android\\sdk', 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const apk = path.resolve(MOBILE, arg('apk', path.join('dist', 'android', 'megyprints-2.0-dev-release-golden.apk')));
const out = path.resolve(MOBILE, arg('out', path.join('..', 'tools', 'golden', 'phone')));

const adb = (...a) => execFileSync(ADB, ['-s', device, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryAdb = (...a) => { try { return adb(...a); } catch (e) { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!flag('no-install')) {
    if (!fs.existsSync(apk)) throw new Error(`No APK at ${apk}: build it with scripts\\build-android.ps1 -Variant release -GoldenPages`);
    console.log(`Installing ${path.relative(MOBILE, apk)} on ${device}`);
    adb('install', '-r', apk);
  }

  // How to read the app's private folder: root (emulator without Play) or run-as (debug build).
  let shell = (cmd) => adb('shell', cmd);
  const root = tryAdb('root');
  if (root != null && !/cannot run as root/i.test(root)) {
    adb('wait-for-device');
    await sleep(1500);
  }
  if ((tryAdb('shell', 'id -u') ?? '').trim() !== '0') {
    if (tryAdb('shell', `run-as ${PKG} id -u`) == null) throw new Error('Cannot read the app\'s files folder: use an emulator image without Google Play (adb root) or a debug build (run-as).');
    shell = (cmd) => adb('shell', `run-as ${PKG} sh -c '${cmd}'`);
  }

  tryAdb('shell', `am force-stop ${PKG}`);
  shell(`rm -rf ${REMOTE}`);
  tryAdb('logcat', '-c');
  const logcat = spawn(ADB, ['-s', device, 'logcat', '-v', 'brief', 'ReactNativeJS:I', '*:S'], { stdio: ['ignore', 'pipe', 'ignore'] });
  logcat.stdout.on('data', (d) => {
    for (const line of String(d).split('\n')) if (line.includes('[golden]')) console.log(line.slice(line.indexOf('[golden]')).trim());
  });

  console.log('Opening the Golden pages screen (run=1)');
  adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', '"megyprints-dev://golden-pages?run=1"', PKG);

  const t0 = Date.now();
  const LIMIT = 30 * 60 * 1000;
  try {
    for (;;) {
      await sleep(5000);
      const ls = (() => { try { return shell(`ls ${REMOTE}/report.json`); } catch { return ''; } })();
      if (ls.includes('report.json')) break;
      if (Date.now() - t0 > LIMIT) throw new Error('The run did not finish in 30 minutes.');
      if (tryAdb('shell', `pidof ${PKG}`) === '') throw new Error('The app stopped before the run finished (see adb logcat).');
    }
  } finally {
    logcat.kill();
  }
  console.log(`Finished on the phone in ${((Date.now() - t0) / 1000).toFixed(0)} s. Pulling into ${out}`);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if ((tryAdb('shell', 'id -u') ?? '').trim() === '0') {
    adb('pull', REMOTE, out);
  } else {
    // run-as cannot hand files to adb pull: stream them one by one.
    fs.mkdirSync(out, { recursive: true });
    for (const name of shell(`ls ${REMOTE}`).split(/\s+/).filter(Boolean)) {
      const bytes = execFileSync(ADB, ['-s', device, 'exec-out', `run-as ${PKG} cat ${REMOTE}/${name}`], { maxBuffer: 1 << 30 });
      fs.writeFileSync(path.join(out, name), bytes);
    }
  }
  const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  const bad = report.pages.filter((p) => p.error);
  console.log(`${report.pages.length} pictures, ${bad.length} stopped, ${(report.totalMs / 1000).toFixed(1)} s on the phone. Next: npm run golden:phone`);
  for (const p of bad) console.log(`  ${p.file}: ${p.error}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
