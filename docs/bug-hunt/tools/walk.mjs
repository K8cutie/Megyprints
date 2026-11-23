// Tiny emulator driver: node walk.mjs <cmd> [arg]
//   ids            list resource-ids (testIDs) and texts on screen
//   tap <id|text>  tap the element whose resource-id or text matches
//   has <id|text>  exit 0 when it is on screen
//   shot <file>    screenshot to file
//   type <text>    type text into the focused box
//   back           Android back
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ADB = 'C:/Android/sdk/platform-tools/adb.exe';
const DEV = ['-s', 'emulator-5554'];
const adb = (...a) => execFileSync(ADB, [...DEV, ...a], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function dump() {
  for (let i = 0; i < 4; i++) {
    try {
      adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
      return adb('shell', 'cat', '/sdcard/ui.xml');
    } catch { /* idle state: try again */ }
  }
  throw new Error('could not dump');
}
function nodes(xml) {
  const out = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const n = m[0];
    const get = (k) => (n.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || '';
    const b = get('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    out.push({ id: get('resource-id'), text: get('text'), desc: get('content-desc'), b: b ? b.slice(1).map(Number) : null });
  }
  return out;
}
const find = (q) => nodes(dump()).find((n) => n.id === q || n.id.endsWith(`/${q}`) || n.text === q || n.desc === q || (q.startsWith('~') && (n.text.includes(q.slice(1)) || n.desc.includes(q.slice(1)))));

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'ids') {
  for (const n of nodes(dump())) if (n.id || n.text) console.log(`${n.id || '-'} | ${n.text.slice(0, 90)} | ${n.b?.join(',')}`);
} else if (cmd === 'tap') {
  const n = find(arg);
  if (!n?.b) { console.error(`not found: ${arg}`); process.exit(1); }
  const [x1, y1, x2, y2] = n.b;
  adb('shell', 'input', 'tap', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
  console.log(`tapped ${arg}`);
} else if (cmd === 'has') {
  process.exit(find(arg) ? 0 : 1);
} else if (cmd === 'shot') {
  fs.writeFileSync(arg, execFileSync(ADB, [...DEV, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 }));
  console.log(`saved ${arg}`);
} else if (cmd === 'type') {
  adb('shell', 'input', 'text', arg.replace(/ /g, '%s'));
} else if (cmd === 'back') {
  adb('shell', 'input', 'keyevent', '4');
} else {
  console.error('cmd?'); process.exit(2);
}
