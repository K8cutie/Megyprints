// Phase 3a website walk, as the Android app at phone size (390x844).
// Usage: node walk3a.cjs <port> <label> <sample|normal> <outDir> <photosDir>
//   sample: Step 1 -> "Make a sample album" -> page 1 welcome card -> Preview
//           -> its last page ("You're done with today's test!" + the stamp)
//   normal: Name -> Size -> Photos (12 synthetic + the sample-photos offer) -> Cover
//           -> Make my album -> flip pages -> edit one caption (fit check)
//           -> reload -> album and photos back
// Every tap waits 750 ms after (past the 400-700 ms double-tap guards).
const { chromium } = require('C:/app/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const [port, label, mode, outDir, photosDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const GUIDE = '[role="dialog"][aria-label="Megy\'s guide"]';
const PACE = 750;
const result = { label, mode, port: Number(port), steps: [], errors: [], shots: [] };
const log = (what, data) => { const row = { what, ...(data || {}) }; result.steps.push(row); console.log(what, data ? JSON.stringify(data) : ''); };
let shotN = 0;
const shot = async (page, name) => {
  shotN += 1;
  const file = `${label}-${mode}-${String(shotN).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(outDir, file) });
  result.shots.push(file);
  return file;
};

// The builder's context value from the CURRENT fiber tree (a DOM node's own
// fiber can be a stale alternate): from the root container down.
const CTX = `(() => {
  const rootEl = document.getElementById('root');
  const key = rootEl && Object.keys(rootEl).find((k) => k.startsWith('__reactContainer$'));
  const hostRoot = key && rootEl[key];
  const current = hostRoot && hostRoot.stateNode && hostRoot.stateNode.current;
  const stack = current ? [current] : [];
  while (stack.length) {
    const f = stack.pop();
    const v = f.memoizedProps && f.memoizedProps.value;
    if (v && typeof v === 'object' && 'uploadedPhotos' in v && typeof v.goToPage === 'function') return v;
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
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
  measured: c.uploadedPhotos.filter((p) => p.width > 0 && p.height > 0).length,
  checked: c.uploadedPhotos.filter((p) => p.check).length,
  sampleNames: c.uploadedPhotos.filter((p) => /^megy-sample-\\d{2}\\.jpg$/.test(p.name)).length,
  syntheticNames: c.uploadedPhotos.filter((p) => /^synthetic-\\d{2}\\.jpg$/.test(p.name)).length,
  title: c.albumTitle,
  filledSlotsAll: c.albumPages.reduce((n, pg) => n + (pg.slotFills || []).filter((f) => f !== null && f !== undefined).length, 0),
  captions: c.albumPages.reduce((n, pg) => n + (pg.textElements || []).filter((t) => t.boxIndex !== undefined && t.boxIndex !== null && t.text).length, 0),
})`);
const albumShape = (page) => builder(page, `({
  pages: c.albumPages.length,
  photos: c.uploadedPhotos.map((p) => p.name).join('|'),
  fills: JSON.stringify(c.albumPages.map((pg) => (pg.slotFills || []).map((f) => (f === null || f === undefined) ? null : (c.uploadedPhotos[f] || {}).name || 'x'))),
  texts: JSON.stringify(c.albumPages.map((pg) => (pg.textElements || []).map((t) => [t.boxIndex ?? null, t.text, t.fontSize ?? null]))),
})`);
const screen = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const photoImgs = [...document.querySelectorAll('img')].filter(vis).filter((i) => i.src.startsWith('blob:'));
  return {
    blobImgsShown: photoImgs.length,
    blobImgsLoaded: photoImgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    blobImgsBroken: photoImgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    notes: [...document.querySelectorAll('[data-testid="tester-page-note-title"]')].filter(vis).map((s) => s.innerText),
    stamps: [...document.querySelectorAll('[data-testid="tester-page-stamp"]')].filter(vis).map((s) => s.innerText.replace(/\s+/g, ' ')),
    previewCaption: [...document.querySelectorAll('[data-testid="preview-caption"]')].filter(vis).map((s) => s.innerText.replace(/\s+/g, ' ')),
    doneText: document.body.innerText.includes("You're done with today's test!"),
    buttons: [...document.querySelectorAll('button')].filter((b) => b.offsetParent && vis(b)).map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 30),
  };
});
const idb = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('megy-photos');
  req.onerror = () => resolve({ error: String(req.error) });
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('photos')) { resolve({ stores: [...db.objectStoreNames] }); db.close(); return; }
    const all = db.transaction('photos', 'readonly').objectStore('photos').getAll();
    all.onsuccess = () => { const rows = all.result; resolve({ count: rows.length, withBlob: rows.filter((r) => r.blob && r.blob.size > 0).length }); db.close(); };
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
const tap = async (page, locator) => {
  await locator.waitFor({ state: 'visible', timeout: 15000 });
  await locator.click();
  await page.waitForTimeout(PACE);
};
const tapButton = (page, re) => tap(page, page.getByRole('button', { name: re }).filter({ visible: true }).first());

// Long enough not to fit a caption box at its size, so the fit checks speak.
const LONG = 'The castle lights came on and none of us wanted this happy day to end, so we stayed a little longer together by the water. The little ones fell asleep on the way home, and we talked about it for the whole week after. We want to go back next year with everyone, grandma too.';
const LONG2 = 'Our first trip with the whole family, every cousin and every aunt, and the rain could not stop a single one of us from laughing. We ate at the same small place every night because the cook remembered our names, and on the last night she made us her own soup and would not let us pay for it at all.';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; });
  // The same Math.random sequence on every run (mulberry32), so main and the
  // branch lay out the same album and the two walks can be compared page by page.
  await ctx.addInitScript(() => {
    let a = 20261029;
    Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => result.errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => { if (m.type() === 'error') result.errors.push('console.error: ' + m.text().slice(0, 300)); });
  page.on('requestfailed', (r) => { if (!/supabase|google|facebook|vercel/.test(r.url())) result.errors.push('requestfailed: ' + r.url().slice(0, 160) + ' ' + (r.failure() || {}).errorText); });

  await page.goto(`${base}/#/builder`);
  await page.waitForTimeout(5000);
  log('platform', await page.evaluate(() => ({ platform: window.Capacitor.getPlatform(), native: window.Capacitor.isNativePlatform() })));
  const cont = page.getByText('Continue without an account');
  if (await cont.count()) { await tap(page, cont.first()); }
  const start = page.getByRole('button', { name: /Let's Get Started/ }).filter({ visible: true });
  if (await start.count()) { await tap(page, start.first()); await page.waitForTimeout(800); }
  const guide = page.locator(GUIDE);
  log('step1', await screen(page));
  await shot(page, 'step1');

  if (mode === 'sample') {
    await tap(page, page.locator('[data-testid="sample-album-make"]').filter({ visible: true }).first());
    log('tapped Make a sample album');
    await until(page, 'sample album made', async () => {
      const s = await state(page);
      const sc = await screen(page);
      return { ok: !!s && s.phase === 'edit' && s.pages >= 20 && s.photos >= 40 && sc.notes.length > 0, s, notes: sc.notes };
    }, 120000);
    await page.waitForTimeout(4000);
    const made = await state(page);
    log('album made', made);
    log('page 1 screen', await screen(page));
    log('idb', await idb(page));
    await shot(page, 'page1-welcome');
    // Preview: a "Preview" button on the welcome page if there is one, else
    // turn the pages to the end and "Done — Preview my album".
    const previewNow = page.getByRole('button', { name: /preview/i }).filter({ visible: true });
    const names = await previewNow.allInnerTexts().catch(() => []);
    log('preview buttons on page 1', { names });
    if (names.length) {
      await tap(page, previewNow.first());
      log('tapped', { button: names[0] });
    } else {
      const total = made.pages;
      let taps = 0;
      while ((await state(page)).page < total - 1 && taps < 90) {
        await tapButton(page, /^Next page/);
        taps += 1;
      }
      log('next page taps', { taps });
      await page.waitForTimeout(1500);
      await shot(page, 'lastpage-edit');
      await tapButton(page, /Done — Preview my album/);
    }
    await page.waitForTimeout(5000);
    log('preview opened', { ...(await state(page)), screen: await screen(page) });
    await shot(page, 'preview');
  } else {
    // Step 1: name + occasion
    await guide.locator('input:not([type="file"])').first().fill('Walk test album');
    await page.waitForTimeout(300);
    await tap(page, guide.getByText('Family', { exact: true }).first());
    await shot(page, 'step1-filled');
    await tap(page, guide.getByRole('button', { name: /Next/ }).first());
    await page.waitForTimeout(800);
    await shot(page, 'size');
    await tap(page, guide.getByText(/8×8/).first());
    await page.waitForTimeout(800);
    log('photos step (empty)', await screen(page));
    await shot(page, 'photos-empty');
    const files = fs.readdirSync(photosDir).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(photosDir, f));
    await page.locator('input[type="file"][multiple]').first().setInputFiles(files);
    log('picked', { files: files.length });
    await until(page, `${files.length} photos in`, async () => { const s = await state(page); return { ok: s && s.photos >= files.length && s.measured >= files.length, s }; }, 60000);
    await page.waitForTimeout(1500);
    await shot(page, 'photos-12');
    await tap(page, page.locator('[data-testid="sample-photos-add"]').filter({ visible: true }).first());
    await until(page, '40 photos in', async () => { const s = await state(page); return { ok: s && s.photos >= 40 && s.measured >= 40, s }; }, 90000);
    await until(page, 'photo check done', async () => { const s = await state(page); return { ok: s && s.checked >= s.photos, s }; }, 120000).catch((e) => log('photo check wait', { note: String(e).slice(0, 300) }));
    await page.waitForTimeout(1500);
    log('after samples', { ...(await state(page)), screen: await screen(page), idb: await idb(page) });
    await shot(page, 'photos-40');
    await tapButton(page, /Next: pick your cover/);
    await page.waitForTimeout(1800);
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
      await page.waitForTimeout(800);
      log(`flip ${i + 1}`, { ...(await state(page)), screen: await screen(page) });
      await shot(page, `page${i + 2}`);
    }

    // ── Edit one caption: a page whose caption box holds words.
    const target = await builder(page, `(() => {
      for (let i = 0; i < c.albumPages.length; i++) {
        const pg = c.albumPages[i];
        const t = (pg.textElements || []).find((t) => t.boxIndex !== undefined && t.boxIndex !== null && t.text);
        if (t) return { kind: 'filled', index: i, box: t.boxIndex, text: t.text, fontSize: t.fontSize ?? null, fontFamily: t.fontFamily ?? null };
      }
      // Else an empty box Megy dealt for words ("Your words here").
      for (let i = 0; i < c.albumPages.length; i++) {
        const pg = c.albumPages[i];
        const rolls = pg.textSlotRoll || [];
        for (let j = 0; j < rolls.length; j++) {
          if (rolls[j] === 'text' && !(pg.textElements || []).some((t) => t.boxIndex === j)) return { kind: 'empty', index: i, box: j };
        }
      }
      return null;
    })()`);
    log('caption target', { target });
    let caption = null;
    if (target) {
      // Turn the pages to it, one tap at a time.
      let guard = 0;
      while ((await state(page)).page !== target.index && guard < 60) {
        const at = (await state(page)).page;
        await tapButton(page, at < target.index ? /^Next page/ : /^Previous page/);
        guard += 1;
      }
      await page.waitForTimeout(1200);
      await shot(page, 'caption-page');
      await tap(page, page.getByText(target.kind === 'filled' ? target.text : 'Your words here', { exact: true }).filter({ visible: true }).first());
      const editWords = page.getByRole('button', { name: /Edit the words/ }).filter({ visible: true });
      let viaPool = false;
      if (await editWords.count()) { viaPool = true; await shot(page, 'caption-pool'); await tap(page, editWords.first()); }
      const box = page.locator('textarea[placeholder="Type your text…"]').filter({ visible: true }).first();
      await box.waitFor({ state: 'visible', timeout: 10000 });
      await box.fill(LONG);
      await page.waitForTimeout(PACE);
      const tooLong = page.locator('[data-testid="text-too-long"]').filter({ visible: true });
      const fitNote = (await tooLong.count()) ? (await tooLong.first().innerText()).replace(/\s+/g, ' ') : null;
      await shot(page, 'caption-typed');
      const makeFit = page.locator('[data-testid="text-make-fit"]').filter({ visible: true });
      let madeFit = null;
      if (await makeFit.count()) {
        madeFit = (await makeFit.first().innerText()).trim();
        await tap(page, makeFit.first());
      }
      const stillLong = await page.locator('[data-testid="text-too-long"]').filter({ visible: true }).count();
      await shot(page, 'caption-fitted');
      await tapButton(page, /Done/);
      await page.waitForTimeout(800);
      const saved = await builder(page, `(() => { const t = (c.albumPages[${target.index}].textElements || []).find((t) => t.text === ${JSON.stringify(LONG)}); return t ? { text: t.text, fontSize: t.fontSize ?? null, boxIndex: t.boxIndex ?? null, fontFamily: t.fontFamily ?? null } : null; })()`);
      caption = { viaPool, fitNote, madeFit, tooLongAfterMakeFit: stillLong > 0, saved };
      log('caption edited', caption);
      await shot(page, 'caption-saved');
    }
    // The builder's own fit check (useBuilderState addTextElement, which now
    // asks the platform for its text measurer): a builder call, not a tap.
    const added = await builder(page, `(() => { const r = c.addTextElement(undefined, undefined, ${JSON.stringify(LONG2)}); return r; })()`);
    await until(page, 'added text in the album', async () => {
      const n = await builder(page, `c.albumPages.reduce((n, pg) => n + (pg.textElements || []).filter((t) => t.text === ${JSON.stringify(LONG2)}).length, 0)`);
      return { ok: n > 0, n };
    }, 10000).catch((e) => log('added text wait', { note: String(e).slice(0, 200) }));
    await page.waitForTimeout(800);
    const addedEl = await builder(page, `(() => { const pg = c.albumPages[c.currentPageIndex]; const t = (pg.textElements || []).find((t) => t.text === ${JSON.stringify(LONG2)}); return t ? { page: c.currentPageIndex, fontSize: t.fontSize ?? null, boxIndex: t.boxIndex ?? null } : null; })()`);
    log('builder add text (fit check)', { result: added, element: addedEl });
    await shot(page, 'text-added');

    const before = await albumShape(page);
    log('idb before reload', await idb(page));
    await page.waitForTimeout(3000); // let the draft save settle
    await page.reload();
    await page.waitForTimeout(6000);
    const contAgain = page.getByText('Continue without an account');
    if (await contAgain.count() && await contAgain.first().isVisible()) { await tap(page, contAgain.first()); }
    await shot(page, 'after-reload-raw');
    const back = await until(page, 'album back after reload', async () => {
      const s = await state(page);
      return { ok: !!s && s.pages === madeState.pages && s.photos === madeState.photos && s.withUrl === s.photos, s };
    }, 60000).catch((e) => ({ ok: false, err: String(e).slice(0, 400) }));
    await page.waitForTimeout(3000);
    const after = await albumShape(page);
    log('after reload', {
      waited: back.ok, ...(await state(page)), screen: await screen(page), idb: await idb(page),
      samePages: !!before && !!after && before.pages === after.pages,
      samePhotoNames: !!before && !!after && before.photos === after.photos,
      sameFills: !!before && !!after && before.fills === after.fills,
      sameTexts: !!before && !!after && before.texts === after.texts,
      captionBack: caption && caption.saved ? after.texts.includes(JSON.stringify(caption.saved.text).slice(1, -1)) : null,
    });
    await shot(page, 'after-reload');
    const nb = page.getByRole('button', { name: /^Next page/ }).filter({ visible: true });
    if (await nb.count()) { await tap(page, nb.first()); await page.waitForTimeout(800); log('flip after reload', { ...(await state(page)), screen: await screen(page) }); await shot(page, 'after-reload-next'); }
    result.shape = { before, after, caption, added, addedEl };
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
