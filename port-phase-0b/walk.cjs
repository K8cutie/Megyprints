// Phase 0b website walk, as the Android app at phone size.
// Usage: node walk.cjs <port> <label> <sample|normal> <outDir> <photosDir>
//   sample: Step 1 -> "Make a sample album" -> page 1 welcome card -> pages to the end
//           -> "Done — Preview my album" -> Preview's last page ("You're done…" + stamp)
//   normal: Name -> Size -> Photos (12 synthetic + "Add … sample photos") -> Cover
//           -> Make my album -> flip pages -> reload -> album and photos back
const { chromium } = require('C:/app/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [port, label, mode, outDir, photosDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const GUIDE = '[role="dialog"][aria-label="Megy\'s guide"]';
const result = { label, mode, port: Number(port), steps: [], errors: [], shots: [] };
const log = (what, data) => { const row = { what, ...(data || {}) }; result.steps.push(row); console.log(what, data ? JSON.stringify(data) : ''); };
let shotN = 0;
const shot = async (page, name) => {
  shotN += 1;
  const file = `${label}-${mode}-${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(outDir, file) });
  result.shots.push(file);
};

const CTX = `(() => {
  for (const node of document.querySelectorAll('body *')) {
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
    let f = key && node[key];
    while (f) {
      const v = f.memoizedProps && f.memoizedProps.value;
      if (v && typeof v === 'object' && 'uploadedPhotos' in v && typeof v.goToPage === 'function') return v;
      f = f.return;
    }
  }
  return null;
})()`;
const builder = (page, expr) => page.evaluate(`(() => { const c = ${CTX}; return c ? (${expr}) : null; })()`);
const state = (page) => builder(page, `({
  phase: c.phase,
  page: c.currentPageIndex,
  pages: c.albumPages.length,
  photos: c.uploadedPhotos.length,
  withUrl: c.uploadedPhotos.filter((p) => p.previewUrl).length,
  blobUrls: c.uploadedPhotos.filter((p) => String(p.previewUrl).startsWith('blob:')).length,
  measured: c.uploadedPhotos.filter((p) => p.width > 0 && p.height > 0).length,
  checked: c.uploadedPhotos.filter((p) => p.check).length,
  facesTried: c.uploadedPhotos.filter((p) => p.check && p.check.facesTried).length,
  leftOut: c.uploadedPhotos.filter((p) => p.leftOut).length,
  sampleNames: c.uploadedPhotos.filter((p) => /^megy-sample-\\d{2}\\.jpg$/.test(p.name)).length,
  syntheticNames: c.uploadedPhotos.filter((p) => /^synthetic-\\d{2}\\.jpg$/.test(p.name)).length,
  title: c.albumTitle,
  filledSlotsAll: c.albumPages.reduce((n, pg) => n + (pg.slotFills || []).filter((f) => f !== null && f !== undefined).length, 0),
  pageFills: (c.albumPages[c.currentPageIndex] && c.albumPages[c.currentPageIndex].slotFills || []).filter((f) => f !== null && f !== undefined).length,
})`);
const screen = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const imgs = [...document.querySelectorAll('img')].filter(vis);
  const photoImgs = imgs.filter((i) => i.src.startsWith('blob:'));
  const canvases = [...document.querySelectorAll('canvas')].filter(vis).map((cv) => {
    let colours = -1;
    try {
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const set = new Set();
        const W = cv.width, H = cv.height;
        for (let y = 1; y < 12; y++) for (let x = 1; x < 12; x++) {
          const d = ctx.getImageData(Math.floor((x / 12) * W), Math.floor((y / 12) * H), 1, 1).data;
          set.add(`${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`);
        }
        colours = set.size;
      }
    } catch { colours = -2; }
    return { w: cv.width, h: cv.height, cls: cv.className, colours };
  });
  return {
    blobImgsShown: photoImgs.length,
    blobImgsLoaded: photoImgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    blobImgsBroken: photoImgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    canvases,
    notes: [...document.querySelectorAll('[data-testid="tester-page-note-title"]')].filter(vis).map((s) => s.innerText),
    stamps: [...document.querySelectorAll('[data-testid="tester-page-stamp"]')].filter(vis).map((s) => s.innerText.replace(/\s+/g, ' ')),
    saysForTesting: document.body.innerText.includes('For Testing purposes'),
    sampleAlbumOffer: [...document.querySelectorAll('[data-testid="sample-album"]')].filter(vis).length,
    samplePhotosOffer: [...document.querySelectorAll('[data-testid="sample-photos"]')].filter(vis).length,
    buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && vis(b)).map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 25),
  };
});
const idb = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('megy-photos');
  req.onerror = () => resolve({ error: String(req.error) });
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('photos')) { resolve({ stores: [...db.objectStoreNames] }); db.close(); return; }
    const tx = db.transaction('photos', 'readonly');
    const all = tx.objectStore('photos').getAll();
    all.onsuccess = () => {
      const rows = all.result;
      resolve({ count: rows.length, withBlob: rows.filter((r) => r.blob && r.blob.size > 0).length });
      db.close();
    };
    all.onerror = () => { resolve({ error: String(all.error) }); db.close(); };
  };
}));
async function until(page, what, fn, timeoutMs) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    last = await fn().catch((e) => ({ err: String(e) }));
    if (last && last.ok) return last;
    await page.waitForTimeout(500);
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(last)}`);
}
const tapButton = async (page, re) => {
  const b = page.getByRole('button', { name: re }).filter({ visible: true }).first();
  await b.waitFor({ state: 'visible', timeout: 15000 });
  await b.click();
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => { if (!/supabase|google|facebook|vercel/.test(r.url())) result.errors.push('requestfailed: ' + r.url().slice(0, 160) + ' ' + (r.failure() || {}).errorText); });

  await page.goto(`${base}/#/builder`);
  await page.waitForTimeout(5000);
  log('platform', await page.evaluate(() => ({ platform: window.Capacitor.getPlatform(), native: window.Capacitor.isNativePlatform() })));
  const cont = page.getByText('Continue without an account');
  if (await cont.count()) { await cont.first().click(); await page.waitForTimeout(1000); }
  const start = page.getByRole('button', { name: /Let's Get Started/ }).filter({ visible: true });
  if (await start.count()) { await start.first().click(); await page.waitForTimeout(1500); }
  const guide = page.locator(GUIDE);
  log('step1', await screen(page));
  await shot(page, 'step1');

  if (mode === 'sample') {
    await page.locator('[data-testid="sample-album-make"]').filter({ visible: true }).first().click();
    log('tapped Make a sample album');
    const made = await until(page, 'sample album made', async () => {
      const s = await state(page);
      const sc = await screen(page);
      return { ok: !!s && s.phase === 'edit' && s.pages >= 40 && s.photos >= 40 && sc.notes.length > 0, s, notes: sc.notes };
    }, 120000);
    await page.waitForTimeout(4000);
    log('album made', await state(page));
    log('page 1 screen', await screen(page));
    log('idb', await idb(page));
    await shot(page, 'page1-welcome');
    // To the last page, one "Next page" at a time
    const total = (await state(page)).pages;
    let taps = 0;
    while ((await state(page)).page < total - 1 && taps < 90) {
      const was = (await state(page)).page;
      await tapButton(page, /^Next page/);
      taps += 1;
      await until(page, `page after ${was}`, async () => { const s = await state(page); return { ok: s.page !== was, s }; }, 5000).catch(() => {});
      // Past the page bar's 400 ms double-tap guard (lib/settleGuard), as a person's next tap would be.
      await page.waitForTimeout(650);
      if (taps === 1) { await page.waitForTimeout(1500); log('page 2', { ...(await state(page)), screen: await screen(page) }); await shot(page, 'page2'); }
    }
    log('next page taps', { taps });
    await page.waitForTimeout(2500);
    log('last page (edit)', await state(page));
    await shot(page, 'lastpage-edit');
    await tapButton(page, /Done — Preview my album/);
    await page.waitForTimeout(5000);
    log('preview opened', { ...(await state(page)), screen: await screen(page) });
    await shot(page, 'preview-last');
  } else {
    // Step 1: name + occasion
    await guide.locator('input:not([type="file"])').first().fill('Walk test album');
    await guide.getByText('Family', { exact: true }).first().click();
    await page.waitForTimeout(500);
    await shot(page, 'step1-filled');
    await guide.getByRole('button', { name: /Next/ }).first().click();
    await page.waitForTimeout(1500);
    // Size
    await shot(page, 'size');
    await guide.getByText(/8×8/).first().click();
    await page.waitForTimeout(1500);
    log('photos step (empty)', await screen(page));
    await shot(page, 'photos-empty');
    // 12 synthetic photos through the photo step's own picker
    const files = fs.readdirSync(photosDir).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(photosDir, f));
    const inputs = page.locator('input[type="file"][multiple]');
    const n = await inputs.count();
    await inputs.first().setInputFiles(files);
    log('picked', { inputs: n, files: files.length });
    await until(page, `${files.length} photos in`, async () => { const s = await state(page); return { ok: s && s.photos >= files.length && s.measured >= files.length, s }; }, 60000);
    await page.waitForTimeout(2000);
    log('after pick', { ...(await state(page)), screen: await screen(page) });
    await shot(page, 'photos-12');
    // Make up the rest with the sample-photos offer
    await page.locator('[data-testid="sample-photos-add"]').filter({ visible: true }).first().click();
    await until(page, '40 photos in', async () => { const s = await state(page); return { ok: s && s.photos >= 40 && s.measured >= 40, s }; }, 90000);
    // let the photo check finish
    await until(page, 'photo check done', async () => { const s = await state(page); return { ok: s && s.checked >= s.photos, s }; }, 120000).catch((e) => log('photo check wait', { note: String(e).slice(0, 300) }));
    await page.waitForTimeout(1500);
    log('after samples', { ...(await state(page)), screen: await screen(page), idb: await idb(page) });
    await shot(page, 'photos-40');
    // Cover
    await tapButton(page, /Next: pick your cover/);
    await page.waitForTimeout(2500);
    log('cover step', await screen(page));
    await shot(page, 'cover');
    await tapButton(page, /Make my album/);
    await until(page, 'album made', async () => { const s = await state(page); return { ok: s && s.phase === 'edit' && s.pages >= 20 && s.filledSlotsAll > 0, s }; }, 120000);
    await page.waitForTimeout(4000);
    const madeState = await state(page);
    log('album made', { ...madeState, screen: await screen(page) });
    await shot(page, 'page1');
    for (let i = 0; i < 3; i++) {
      await tapButton(page, /^Next page/);
      await page.waitForTimeout(1500);
      log(`flip ${i + 1}`, { ...(await state(page)), screen: await screen(page) });
      await shot(page, `page${i + 2}`);
    }
    const before = await builder(page, `({ pages: c.albumPages.length, photos: c.uploadedPhotos.map((p) => p.name).join('|'), fills: JSON.stringify(c.albumPages.map((pg) => (pg.slotFills || []).map((f) => (f === null || f === undefined) ? null : (c.uploadedPhotos[f] || {}).name || 'x'))) })`);
    log('idb before reload', await idb(page));
    // Reload: the album and its photos come back
    await page.waitForTimeout(3000); // let the draft save settle
    await page.reload();
    await page.waitForTimeout(6000);
    const contAgain = page.getByText('Continue without an account');
    if (await contAgain.count() && await contAgain.first().isVisible()) { await contAgain.first().click(); await page.waitForTimeout(1000); }
    log('after reload screen', await screen(page));
    await shot(page, 'after-reload-raw');
    const back = await until(page, 'album back after reload', async () => {
      const s = await state(page);
      return { ok: !!s && s.pages === madeState.pages && s.photos === madeState.photos && s.withUrl === s.photos, s };
    }, 60000).catch((e) => ({ ok: false, err: String(e).slice(0, 400) }));
    await page.waitForTimeout(3000);
    const after = await builder(page, `({ pages: c.albumPages.length, photos: c.uploadedPhotos.map((p) => p.name).join('|'), fills: JSON.stringify(c.albumPages.map((pg) => (pg.slotFills || []).map((f) => (f === null || f === undefined) ? null : (c.uploadedPhotos[f] || {}).name || 'x'))) })`);
    log('after reload', { waited: back.ok, ...(await state(page)), screen: await screen(page), idb: await idb(page),
      samePages: !!before && !!after && before.pages === after.pages,
      samePhotoNames: !!before && !!after && before.photos === after.photos,
      sameFills: !!before && !!after && before.fills === after.fills });
    await shot(page, 'after-reload');
    // one more flip after the reload
    const nb = page.getByRole('button', { name: /^Next page/ }).filter({ visible: true });
    if (await nb.count()) { await nb.first().click(); await page.waitForTimeout(1500); log('flip after reload', { ...(await state(page)), screen: await screen(page) }); await shot(page, 'after-reload-next'); }
    // A page holding one of the 12 photos picked through the file picker (the path whose type changed)
    const sp = await builder(page, `c.albumPages.findIndex((pg) => (pg.slotFills || []).some((f) => f !== null && f !== undefined && /^synthetic-/.test((c.uploadedPhotos[f] || {}).name)))`);
    const pagesWithPicked = await builder(page, `c.albumPages.filter((pg) => (pg.slotFills || []).some((f) => f !== null && f !== undefined && /^synthetic-/.test((c.uploadedPhotos[f] || {}).name))).length`);
    if (sp >= 0) {
      await builder(page, `c.goToPage(${sp})`);
      await page.waitForTimeout(2500);
      const onPage = await builder(page, `(c.albumPages[c.currentPageIndex].slotFills || []).filter((f) => f !== null && f !== undefined).map((f) => (c.uploadedPhotos[f] || {}).name)`);
      log('page with a picked photo (after reload)', { pageIndex: sp, pagesWithPicked, onPage, screen: await screen(page) });
      await shot(page, 'picked-photo-page');
    } else log('no page with a picked photo', { pagesWithPicked });
  }
  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(outDir, `${label}-${mode}.json`), JSON.stringify(result, null, 1));
  console.log('ERRORS', JSON.stringify(result.errors, null, 1));
})().catch((e) => {
  console.error('WALK FAILED', e);
  result.failed = String(e);
  fs.writeFileSync(path.join(outDir, `${label}-${mode}.json`), JSON.stringify(result, null, 1));
  process.exit(1);
});
