/* ══════════════════════════════════════════════════════════════════════════
   LOOK SCENES, MEASURED ON A REAL FOLDER OF PHOTOS.

   Runs the website's own look pass (src/lib/photoCheckRunner.ts: the small
   copy, MobileNet v2 on the graphics chip, the text a photo keeps) on every
   photo of a folder, in headless Chromium, then makes the album twice with
   the website's own generator (src/pages/builder/generateAlbum.ts): with
   the looks, and without (as before 2026-11-09). Nothing here is a copy of
   the app's code: the page imports the source files through Vite.

   It writes, next to each other:
     <out>.json   every photo's size, capture time, look and timings; the
                  scenes; both albums' pages; the numbers printed below
     <out>.html   a picture page: the album's pages with the looks and
                  without, and the scenes (open it from the photo folder:
                  it shows the photos by their file names)

   Run (from the repo root; `npm ci` in tools/golden once, for Chromium's
   driver, or point PLAYWRIGHT_CORE at a playwright-core / playwright folder):
     node tools/look-scenes/lookAlbum.mjs "C:\Users\me\Pictures\HongKong"
     node tools/look-scenes/lookAlbum.mjs <folder> --size 6x8 --per-page 4 --out <folder>/megy-look-album
   The photos are read on this computer only. Nothing is uploaded.

   The page runs under the live site's Content-Security-Policy (vercel.json),
   so a model address the live site would block is blocked here too.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

async function loadChromium() {
  const tries = [
    process.env.PLAYWRIGHT_CORE,
    path.join(root, 'tools', 'golden', 'node_modules', 'playwright-core'),
    path.join(root, 'tools', 'photo-check', 'node_modules', 'playwright-core'),
  ].filter(Boolean);
  for (const dir of tries) {
    try {
      const entry = createRequire(path.join(dir, 'package.json')).resolve(dir);
      const mod = await import(pathToFileURL(entry).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch { /* try the next */ }
  }
  throw new Error('No playwright-core found. Run `npm ci` in tools/golden, or set PLAYWRIGHT_CORE to its folder.');
}

const args = process.argv.slice(2);
const flag = (name, fallback) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args.splice(k, 2)[1] : fallback; };
const size = flag('size', '8x8');
const perPage = flag('per-page', '');
const outArg = flag('out', '');
const folder = args[0] && path.resolve(args[0]);
if (!folder || !fs.existsSync(folder)) { console.error('Give the folder of photos.'); process.exit(1); }
const out = outArg ? path.resolve(outArg) : path.join(folder, 'megy-look-album');
const files = fs.readdirSync(folder).filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('megy-')).sort();
if (files.length === 0) { console.error('No photos in that folder.'); process.exit(1); }

// The live site's policy: which hosts a page may reach.
const sitePolicy = (JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers ?? [])
  .flatMap((h) => h.headers ?? []).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
if (!sitePolicy) console.warn('vercel.json has no Content-Security-Policy: the page runs without one.');

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1', hmr: false } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const chromium = await loadChromium();
// The graphics chip when this computer lets headless Chromium have it (the
// look pass needs WebGL; without a chip Chromium draws WebGL on the CPU).
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=default'] });

async function openPage(context) {
  const page = await context.newPage();
  await page.route('**/look-scenes.html', (r) => r.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': sitePolicy }, body: '<!doctype html><title>look scenes</title>' }));
  await page.route('**/look-photo/*', (r) => {
    const i = Number(new URL(r.request().url()).pathname.split('/').pop());
    r.fulfill({ path: path.join(folder, files[i]) });
  });
  const modelRequests = [];
  page.on('request', (q) => { if (/tfhub\.dev|kaggle|storage\.googleapis\.com/.test(q.url())) modelRequests.push(q.url().split('?')[0]); });
  page.on('requestfailed', (q) => { if (/tfhub\.dev|kaggle|storage\.googleapis\.com/.test(q.url())) console.error(`[blocked or failed] ${q.url().split('?')[0]} ${q.failure()?.errorText ?? ''}`); });
  await page.goto(`${base}/look-scenes.html`);
  return { page, modelRequests };
}

try {
  const context = await browser.newContext();
  const { page, modelRequests } = await openPage(context);
  page.on('console', (m) => { if (m.type() === 'error' && !/ebSocket|websocket/.test(m.text())) console.error('[page]', m.text().slice(0, 300)); });

  // 1. The model: fetched the first time, then kept in this browser.
  const first = await page.evaluate(async () => {
    const t0 = performance.now();
    const m = await (await import('/src/lib/mobileNet.ts')).loadMobileNet();
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return { ms: Math.round(performance.now() - t0), backend: m.backend, renderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'none' };
  });
  console.log(`model: ${first.backend} on ${first.renderer}; first load ${first.ms} ms (${modelRequests.length} requests to the model store)`);
  // Kept? Give the save a moment, then load it in a new page of the same browser.
  await page.waitForTimeout(4000);
  const again = await openPage(context);
  const second = await again.page.evaluate(async () => {
    const t0 = performance.now();
    await (await import('/src/lib/mobileNet.ts')).loadMobileNet();
    return Math.round(performance.now() - t0);
  });
  console.log(`model, next visit: ${second} ms (${again.modelRequests.length} requests to the model store)`);
  await again.page.close();

  // 2. Every photo through the website's own check and look pass.
  const read = await page.evaluate(async ({ names }) => {
    const runner = await import('/src/lib/photoCheckRunner.ts');
    const { readCaptureTime } = await import('/src/pages/builder/exif.ts');
    const photos = [];
    for (let i = 0; i < names.length; i++) {
      const blob = await (await fetch(`/look-photo/${i}`)).blob();
      const file = new File([blob], names[i], { type: blob.type || 'image/jpeg' });
      const bmp = await createImageBitmap(blob);
      const [width, height] = [bmp.width, bmp.height];
      bmp.close();
      let capturedAt = null;
      try { capturedAt = await readCaptureTime(file); } catch { /* none */ }
      const id = `photo-${i}`;
      const t0 = performance.now();
      const check = await runner.checkPhoto(blob, width, height, { faces: false, lookId: id });
      const t1 = performance.now();
      const keptCopy = runner.lookPassReport().keptCopies > 0;
      const look = await runner.lookOfPhoto(id, blob);
      const t2 = performance.now();
      photos.push({ id, name: names[i], size: blob.size, width, height, capturedAt, check: { ...check, ...(look ? { look } : {}) }, checkMs: t1 - t0, lookMs: t2 - t1, keptCopy });
    }
    return { photos, pass: runner.lookPassReport(), looksOn: runner.looksForPhotos() };
  }, { names: files });

  // 3. The album, with the looks and without, by the website's generator.
  const made = await page.evaluate(async ({ photos, size, perPage }) => {
    const gen = await import('/src/pages/builder/generateAlbum.ts');
    const { lookOf, likeness, LOOK_ALIKE } = await import('/src/lib/photoLook.ts');
    const album = photos.map((p) => ({ id: p.id, previewUrl: '', name: p.name, type: 'image/jpeg', size: p.size, width: p.width, height: p.height, ...(p.capturedAt ? { capturedAt: p.capturedAt } : {}), check: p.check }));
    const t0 = performance.now();
    const plan = gen.planScenes(album);
    const planMs = performance.now() - t0;
    const fills = (pages) => pages.map((p) => (p.slotFills ?? []).filter((f) => f != null));
    const ppp = perPage ? Number(perPage) : undefined;
    const t1 = performance.now();
    const withLooks = fills(gen.generateAlbum(album, size, ppp, undefined, { scenes: plan }));
    const makeMs = performance.now() - t1;
    const without = fills(gen.generateAlbum(album, size, ppp, undefined, { scenes: false }));
    // Each photo's closest other photo, and how alike.
    const looks = album.map((p) => lookOf(p));
    const closest = looks.map((a, i) => {
      let best = -1; let s = -1;
      if (a) looks.forEach((b, j) => { if (b && j !== i) { const v = likeness(a, b); if (v > s) { s = v; best = j; } } });
      return { best, s };
    });
    return { scenes: album.map((p) => plan.get(p.id)), untimed: plan.untimed ?? null, after: plan.after ? [...plan.after] : null, planMs, makeMs, withLooks, without, closest, alike: LOOK_ALIKE };
  }, { photos: read.photos, size, perPage });

  // ── The numbers ──
  const n = read.photos.length;
  const looked = read.photos.filter((p) => p.check.look).length;
  const dated = read.photos.filter((p) => p.capturedAt).length;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sceneSizes = new Map();
  made.scenes.forEach((s) => sceneSizes.set(s, (sceneSizes.get(s) ?? 0) + 1));
  const groups = [...sceneSizes.values()].sort((a, b) => b - a);
  const inGroups = groups.filter((g) => g > 1).reduce((a, b) => a + b, 0);
  const measure = (pages) => {
    const order = pages.flat();
    const pageOf = new Map();
    pages.forEach((p, k) => p.forEach((i) => pageOf.set(i, k)));
    let rightAfter = 0;
    for (let k = 1; k < order.length; k++) if (made.scenes[order[k]] === made.scenes[order[k - 1]]) rightAfter++;
    const withAlike = made.closest.map((c, i) => ({ i, ...c })).filter((c) => c.s >= made.alike);
    const samePage = withAlike.filter((c) => pageOf.get(c.i) === pageOf.get(c.best)).length;
    const near = withAlike.filter((c) => Math.abs(pageOf.get(c.i) - pageOf.get(c.best)) <= 1).length;
    const multi = pages.filter((p) => p.length > 1);
    const oneScene = multi.filter((p) => new Set(p.map((i) => made.scenes[i])).size === 1).length;
    return { pages: pages.length, rightAfter, withAlike: withAlike.length, samePage, near, pagesOf2: multi.length, oneScene };
  };
  const numbers = {
    folder, photos: n, dated, undated: n - dated, squares: read.photos.filter((p) => Math.abs(p.width - p.height) <= Math.max(p.width, p.height) * 0.05).length,
    model: { ...first, nextVisitMs: second, storeRequestsFirst: modelRequests.length, storeRequestsNext: again.modelRequests.length },
    lookPass: { photosWithALook: looked, off: read.pass.off, firstFiveMs: read.pass.firstMs.map(Math.round), medianLookMs: Math.round(median(read.photos.map((p) => p.lookMs))), medianCheckMs: Math.round(median(read.photos.map((p) => p.checkMs))), totalLookS: Math.round(read.photos.reduce((a, p) => a + p.lookMs, 0) / 100) / 10, fromKeptCopy: read.photos.filter((p) => p.keptCopy).length },
    scenes: { all: groups.length, of2plus: groups.filter((g) => g > 1).length, photosInScenesOf2plus: inGroups, singles: groups.filter((g) => g === 1).length, sizes: groups.filter((g) => g > 1).join(','), planMs: Math.round(made.planMs) },
    album: { size, perPage: perPage || 'Surprise', makeMs: Math.round(made.makeMs), withLooks: measure(made.withLooks), without: measure(made.without) },
  };
  console.log(JSON.stringify(numbers, null, 1));
  fs.writeFileSync(`${out}.json`, JSON.stringify({ made: new Date().toISOString(), numbers, photos: read.photos, scenes: made.scenes, untimed: made.untimed, after: made.after, withLooks: made.withLooks, without: made.without }, null, 1));

  // ── The picture page ──
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const colour = (s) => (sceneSizes.get(s) > 1 ? `hsl(${(s * 47) % 360} 70% 45%)` : '#c9c4bc');
  const thumb = (i) => `<figure style="--c:${colour(made.scenes[i])}"><img loading="lazy" src="${esc(encodeURI(files[i]))}" title="${esc(files[i])}"></figure>`;
  const sheet = (pages) => pages.map((p, k) => `<div class="page"><span>${k + 1}</span>${p.map(thumb).join('')}</div>`).join('');
  const a = numbers.album;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The album, sorted by place</title>
<style>
:root{color-scheme:light;--ink:#2a2622;--muted:#6b6b6b;--line:#e8e4de}
body{margin:0;padding:24px 16px 64px;font:15px/1.45 system-ui,Segoe UI,Roboto,sans-serif;color:var(--ink);background:#fbf8f4}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 6px}
p{margin:4px 0;color:var(--muted);max-width:76ch}
table{border-collapse:collapse;font-size:14px;margin:10px 0}td,th{padding:3px 14px 3px 0;text-align:left}th{color:var(--muted);font-weight:600}
.pages{display:flex;flex-wrap:wrap;gap:8px}
.page{display:flex;gap:2px;align-items:flex-end;background:#fff;border:1px solid var(--line);border-radius:6px;padding:4px 5px 5px;position:relative}
.page span{position:absolute;top:-8px;left:4px;font-size:10px;color:var(--muted);background:#fbf8f4;padding:0 3px}
figure{margin:0;width:58px;height:58px;overflow:hidden;border-radius:3px 3px 0 0;background:#eee;border-bottom:5px solid var(--c,#ccc)}
figure img{width:100%;height:100%;object-fit:cover;display:block}
.note{background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:12px 0;max-width:76ch}
</style></head><body>
<h1>The album, sorted by place</h1>
<p>${n} photos from ${esc(path.basename(folder))}: ${dated} with a capture time, ${n - dated} with none. Album ${esc(size)}, ${perPage ? `${esc(perPage)} per page` : 'Surprise'}. Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} by the website's own look pass and album maker (tools/look-scenes).</p>
<div class="note"><strong>How to read it.</strong> Each box is one album page, in order. The colour under a photo is its scene (photos that look alike); grey is a photo that looks like no other. First the album with the looks, then the same photos without them (the order they were added).</div>
<table>
<tr><th></th><th>with looks</th><th>without</th></tr>
<tr><td>Pages</td><td>${a.withLooks.pages}</td><td>${a.without.pages}</td></tr>
<tr><td>Photos right after one of their scene</td><td>${a.withLooks.rightAfter}</td><td>${a.without.rightAfter}</td></tr>
<tr><td>Of ${a.withLooks.withAlike} photos with a look-alike: on its page</td><td>${a.withLooks.samePage}</td><td>${a.without.samePage}</td></tr>
<tr><td>... on its page or the next</td><td>${a.withLooks.near}</td><td>${a.without.near}</td></tr>
<tr><td>Pages of 2+ photos that hold one scene</td><td>${a.withLooks.oneScene} of ${a.withLooks.pagesOf2}</td><td>${a.without.oneScene} of ${a.without.pagesOf2}</td></tr>
</table>
<p>${numbers.scenes.of2plus} scenes of two or more photos (${numbers.scenes.photosInScenesOf2plus} photos), ${numbers.scenes.singles} photos on their own. The look pass read ${looked} of ${n} photos, about ${numbers.lookPass.medianLookMs} ms each on ${esc(first.renderer)}.</p>
<h2>With looks</h2><div class="pages">${sheet(made.withLooks)}</div>
<h2>Without looks</h2><div class="pages">${sheet(made.without)}</div>
</body></html>`;
  fs.writeFileSync(`${out}.html`, html);
  console.log(`wrote ${out}.json and ${out}.html`);
} finally {
  await browser.close();
  await server.close();
}
