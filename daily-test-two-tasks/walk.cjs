/* TODAY'S TEST: date + 1 of 10 before-tasks + 1 of 5 in-album tasks + a minute.
 * Real Chrome 390x844, local Vite with a FAKE Supabase host answered here
 * (nothing leaves this machine; no sign-up, no sign-in).
 * Usage: node walk.cjs <outdir> [days...]   days like 2026-10-29
 * Env: BASE (default http://127.0.0.1:5293), REAL=2026-10-29 (that day waits the real minute). */
const { chromium } = require('C:/app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5293';
const OUT = path.resolve(process.argv[2] || 'out');
const DAYS = process.argv.slice(3).length ? process.argv.slice(3) : ['2026-10-29'];
const REAL = process.env.REAL || '';
const LEAVE = process.env.LEAVE || '';   // that day: reload while the task is open (leave + come back)
const RELOAD = process.env.RELOAD || ''; // that day: reload during the countdown
const EXTRAS = process.env.EXTRAS !== '0';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });
const facts = {};
const errors = [];

const HOOK = () => {
  const dfs = (root) => {
    const stack = [root.current];
    while (stack.length) {
      const f = stack.pop(); if (!f) continue;
      const v = f.memoizedProps && f.memoizedProps.value;
      if (v && typeof v.goToPage === 'function' && Array.isArray(v.albumPages)) { window.__ctx = v; return; }
      if (f.child) stack.push(f.child); if (f.sibling) stack.push(f.sibling);
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(), _id: 0,
    inject() { return ++this._id; }, checkDCE() {}, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) { try { dfs(root); } catch { /* ignore */ } },
  };
};
const ANDROID = () => { window.CapacitorCustomPlatform = { name: 'android', plugins: {} }; };

async function phone(browser, label, { inApp = true, when = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  // The fake Supabase host: every call answered here, empty.
  await ctx.route(/supabase-fake\.localhost/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/supabase-fake|Failed to load resource/.test(m.text())) errors.push(`${label} console: ${m.text().slice(0, 300)}`); });
  await page.addInitScript(HOOK);
  if (inApp) await page.addInitScript(ANDROID);
  if (when && process.env.DATESHIM) {
    // Only the date moves (to that day); timers and animation frames stay real.
    await page.addInitScript((target) => {
      const RealDate = Date;
      const off = target - RealDate.now();
      class ShiftedDate extends RealDate {
        constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + off); }
        static now() { return RealDate.now() + off; }
      }
      window.Date = ShiftedDate;
    }, when.getTime());
  } else if (when && !process.env.NOCLOCK) await page.clock.install({ time: when });
  return { ctx, page };
}
const shot = async (page, name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('  shot', name);
};
// Taps more than 700 ms apart.
const gap = (page) => page.waitForTimeout(800);
const tapSel = async (page, sel) => { await gap(page); await page.locator(sel).first().click(); };
const tapEl = async (page, loc) => { await gap(page); await loc.click(); };
const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.replace(/\s+/g, ' ').trim()).catch(() => null);
const visible = (page, sel) => page.locator(sel).first().isVisible().catch(() => false);
const run = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('megy-daily-test-run') || 'null'));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function walkDay(browser, iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const when = new Date(y, m - 1, d, 10, 0, 0);
  const tag = `day${n}-${iso}`;
  const f = facts[tag] = { iso };
  console.log(`== ${tag}`);
  const { ctx, page } = await phone(browser, tag, { when });
  try { await walkDayIn(page, ctx, f, tag, iso, n, m, d); } catch (e) {
    f.failDiag = await page.evaluate(() => ({
      active: document.activeElement && document.activeElement.tagName + '#' + (document.activeElement.getAttribute('data-testid') || document.activeElement.className || '').toString().slice(0, 60),
      modals: [...document.querySelectorAll('[aria-modal="true"]')].map((el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || '').slice(0, 60)),
      phase: window.__ctx && window.__ctx.phase, step: window.__ctx && window.__ctx.wizardStep,
      photos: window.__ctx && window.__ctx.uploadedPhotos.length, size: window.__ctx && window.__ctx.albumSize,
      run: localStorage.getItem('megy-daily-test-run'), text: document.body.innerText.slice(0, 400),
    })).catch((x) => String(x));
    await page.screenshot({ path: path.join(OUT, `${tag}-FAIL.png`) }).catch(() => {});
    await ctx.close();
    throw e;
  }
}

async function walkDayIn(page, ctx, f, tag, iso, n, m, d) {
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-todays-sample-make"]', { timeout: 30000 });
  f.homeLine = await text(page, '[data-testid="home-todays-sample-how"]');
  if (n === 1) await shot(page, `${tag}-01-home`);
  await tapSel(page, '[data-testid="home-todays-sample-make"]');
  await page.waitForSelector('[data-testid="todays-test"]');
  f.task = await page.locator('[data-testid="todays-test-task"]').getAttribute('data-task');
  f.taskLine = await text(page, '[data-testid="todays-test-task-line"]');
  f.options = await page.locator('[data-testid="todays-test-option"]').evaluateAll((els) => els.map((e) => e.innerText.trim() || e.getAttribute('aria-label')));
  const answerLabel = await page.locator('[data-testid="todays-test-task-line"] b').first().innerText().catch(() => null);
  f.answerLabel = answerLabel;
  // Make my album with nothing done: the date first.
  await tapSel(page, '[data-testid="todays-test-make"]');
  f.missing1 = await text(page, '[data-testid="todays-test-missing"]');
  // A wrong date is refused.
  await tapEl(page, page.locator('[data-testid="todays-test-name"]'));
  await page.keyboard.type('Jan 1', { delay: 60 });
  await page.locator('[data-testid="todays-test-name"]').blur();
  f.refused = await text(page, '[data-testid="todays-test-date-refused"]');
  if (n === 1) await shot(page, `${tag}-02-wrong-date`);
  // Today's date.
  await page.locator('[data-testid="todays-test-name"]').fill('');
  await page.keyboard.type(`${MONTHS[m - 1]} ${d}`, { delay: 60 });
  await page.locator('[data-testid="todays-test-name"]').blur();
  f.dateOk = await text(page, '[data-testid="todays-test-date-ok"]');
  await tapSel(page, '[data-testid="todays-test-make"]');
  f.missing2 = await text(page, '[data-testid="todays-test-missing"]');
  // A wrong pick (prescribed tasks).
  const options = page.locator('[data-testid="todays-test-option"]');
  const count = await options.count();
  let right = null; let wrong = null;
  for (let i = 0; i < count; i++) {
    const o = options.nth(i);
    const label = ((await o.innerText()).trim() || await o.getAttribute('aria-label') || '').replace(/\s+/g, ' ');
    if (answerLabel && label === answerLabel) right = o; else if (!wrong) wrong = o;
  }
  if (!answerLabel) right = options.nth(3); // the cover: any photo
  if (answerLabel && wrong) {
    await tapEl(page, wrong);
    f.wrongMsg = await text(page, '[data-testid="todays-test-wrong"]');
    await shot(page, `${tag}-03-wrong-pick`);
  }
  await tapEl(page, right);
  f.picked = await right.getAttribute('data-value');
  await page.locator('[data-testid="todays-test-task"]').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-04-test-done`);
  const t0 = Date.now();
  await tapSel(page, '[data-testid="todays-test-make"]');
  // The album is made; today's task in the album opens.
  await page.waitForSelector('[data-testid="daily-test-bar"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r1 = await run(page);
  f.albumTask = r1 && r1.task;
  f.target = r1 && r1.target;
  f.hint = await text(page, '[data-testid="daily-test-hint"]');
  f.phaseAtTask = await page.evaluate(() => window.__ctx && window.__ctx.phase);
  await shot(page, `${tag}-05-album-task`);
  if (LEAVE === iso) {
    // Leave the album before finishing (the app reloads), then come back: the task opens again.
    await gap(page);
    await page.reload();
    await page.waitForSelector('[data-testid="daily-test-bar"]', { timeout: 60000 });
    await page.waitForTimeout(2500);
    f.afterLeave = {
      bar: await text(page, '[data-testid="daily-test-hint"]'),
      toolOpen: await visible(page, '[data-testid="picker-photo"]') || await visible(page, '[data-testid="studio-sheet-look"]') || await visible(page, 'textarea') || await visible(page, '[role="dialog"] button[aria-pressed="false"]'),
      fgMs: (await run(page))?.fgMs,
    };
    await shot(page, `${tag}-05b-back-in-album-task-reopened`);
  }
  // Do it.
  switch (f.albumTask) {
    case 'layout': {
      const alt = page.locator('[role="dialog"] button[aria-pressed="false"]');
      await alt.first().waitFor({ timeout: 10000 });
      await tapEl(page, alt.first());
      if (await visible(page, '[data-testid="layout-leftover-apply"]')) await tapSel(page, '[data-testid="layout-leftover-apply"]');
      else if (await visible(page, '[data-testid="layout-leftover-new-page"]')) await tapSel(page, '[data-testid="layout-leftover-new-page"]');
      break;
    }
    case 'caption': {
      await page.waitForSelector('textarea', { timeout: 10000 });
      await page.locator('textarea').first().click();
      await page.keyboard.type('Lola', { delay: 80 });
      await shot(page, `${tag}-06-typing`);
      await tapEl(page, page.getByRole('button', { name: /Done/ }).first());
      break;
    }
    case 'look': {
      await page.waitForSelector('[data-testid="studio-sheet-look"]', { timeout: 10000 });
      const looks = page.locator('[data-testid="studio-sheet-look"] [data-testid^="look-"]:not([data-testid="look-none"])');
      await tapEl(page, looks.first());
      await shot(page, `${tag}-06-look-picked`);
      break;
    }
    case 'swap': {
      await page.waitForSelector('[data-testid="picker-photo"]', { timeout: 10000 });
      const here = (f.target?.page ?? 0) + 1;
      const other = page.locator(`[data-testid="picker-photo"][data-placed-on]:not([data-placed-on="${here}"])`);
      await tapEl(page, other.nth(5));
      break;
    }
    case 'openBook': {
      await page.waitForSelector('[data-testid="preview-open-book"]', { timeout: 10000 });
      f.glow = await page.locator('[data-testid="preview-open-book"]').getAttribute('data-glow');
      await tapSel(page, '[data-testid="preview-open-book"]');
      break;
    }
  }
  await page.waitForTimeout(1500);
  const r2 = await run(page);
  f.albumDone = r2 && r2.albumDone;
  f.fgAtTaskDone = r2 && r2.fgMs;
  f.secondsToTaskDone = Math.round((Date.now() - t0) / 1000);
  // The countdown, then "You're done".
  if (await visible(page, '[data-testid="daily-test-countdown"]')) {
    f.countdown1 = await text(page, '[data-testid="daily-test-countdown"]');
    f.doneCardBeforeMinute = await visible(page, '[data-testid="tester-page-note-title"]') ? await text(page, '[data-testid="tester-page-note-title"]') : null;
    await shot(page, `${tag}-07-countdown`);
    if (RELOAD === iso) {
      const before = await text(page, '[data-testid="daily-test-left"]');
      await page.reload();
      await page.waitForSelector('[data-testid="daily-test-countdown"]', { timeout: 60000 });
      f.reloadCountdown = { before, after: await text(page, '[data-testid="daily-test-left"]'), doneCard: await visible(page, '[data-testid="tester-page-note-proof"]') };
      f.afterReloadDiag = await page.evaluate(() => ({
        active: document.activeElement && document.activeElement.tagName,
        modals: [...document.querySelectorAll('[aria-modal="true"]')].map((el) => (el.getAttribute('aria-label') || el.textContent || '').slice(0, 60)),
      }));
      await shot(page, `${tag}-07b-countdown-after-reload`);
    }
    if (REAL === iso || REAL === 'all') {
      // The real minute: wait it out (taps none), checking the count goes down.
      const start = Date.now();
      await page.waitForTimeout(5000);
      f.countdown2 = await text(page, '[data-testid="daily-test-countdown"]');
      await page.waitForSelector('[data-testid="tester-page-note-proof"]', { timeout: 80000 });
      f.realWaitSeconds = Math.round((Date.now() - start) / 1000);
    } else {
      await page.clock.runFor(10_000);
      f.countdown2 = await text(page, '[data-testid="daily-test-countdown"]');
      await page.clock.runFor(60_000);
      await page.waitForSelector('[data-testid="tester-page-note-proof"]', { timeout: 20000 });
    }
  } else {
    await page.waitForSelector('[data-testid="tester-page-note-proof"]', { timeout: 80000 });
  }
  await page.waitForTimeout(1500);
  const r3 = await run(page);
  f.fgAtDone = r3 && r3.fgMs;
  f.doneTitle = await text(page, '[data-testid="tester-page-note-title"]');
  f.doneLine = await text(page, '[data-testid="tester-page-note-proof-text"]');
  f.stamp = await page.locator('[data-testid="tester-page-stamp"]').first().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => null);
  f.atPage = await page.evaluate(() => window.__ctx && `${window.__ctx.currentPageIndex + 1} of ${window.__ctx.albumPages.length} (${window.__ctx.phase})`);
  await shot(page, `${tag}-08-youre-done`);
  // The album: what the before-task set.
  f.album = await page.evaluate(() => {
    const c = window.__ctx;
    const title = (c.coverFront?.textElements || []).find((t) => t.boxIndex === 0) || null;
    const bgs = c.albumPages.map((p) => (p.background?.type === 'solid' ? p.background.solid : p.background?.type));
    return {
      name: c.albumTitle, size: c.albumSize, occasion: localStorage.getItem('megy-album-theme'),
      pages: c.albumPages.length, pageBackgrounds: [...new Set(bgs)],
      coverPhoto: c.uploadedPhotos.find((p) => p.id === c.coverFront?.background?.photoId)?.name ?? null,
      title: title && { text: title.text, fontFamily: title.fontFamily, color: title.color, alignment: title.alignment, bold: title.bold, italic: title.italic, fontSize: title.fontSize, shadow: title.shadow },
    };
  });
  // The front cover, to see the title: page 1, then "Previous page".
  await page.evaluate(() => window.__ctx.goToPage(0));
  await page.waitForTimeout(1200);
  const prev = page.locator('[data-testid="preview-prev"]');
  if (await prev.isVisible().catch(() => false)) { await tapEl(page, prev); await page.waitForTimeout(1500); }
  await shot(page, `${tag}-09-cover`);
  await ctx.close();
}

async function step1Opens(browser) {
  const tag = 'x1-step1';
  const f = facts[tag] = {};
  console.log(`== ${tag}`);
  const { ctx, page } = await phone(browser, tag, { when: new Date(2026, 9, 29, 11, 0) });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-albums-card"]', { timeout: 30000 });
  const start = page.locator('[data-testid="home-albums-card"]').getByRole('button', { name: /Start Creating/i }).first();
  await tapEl(page, start);
  await page.waitForTimeout(2500);
  // The sign-in nudge Start Creating already shows (not part of this change): no account.
  const noAccount = page.getByRole('button', { name: /Continue without an account/i }).first();
  if (await noAccount.isVisible().catch(() => false)) { await shot(page, `${tag}-00-sign-in-nudge`); await tapEl(page, noAccount); await page.waitForTimeout(1200); }
  const started = page.getByRole('button', { name: /Get Started/i }).first();
  if (await started.isVisible().catch(() => false)) { await tapEl(page, started); }
  await page.waitForSelector('[data-testid="sample-album-make"]', { timeout: 30000 });
  await shot(page, `${tag}-01-step1`);
  await tapSel(page, '[data-testid="sample-album-make"]');
  await page.waitForSelector('[data-testid="todays-test"]', { timeout: 15000 });
  f.opened = await text(page, '#todays-test-title');
  f.task = await page.locator('[data-testid="todays-test-task"]').getAttribute('data-task');
  f.photosFetchedBefore = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/sample-photos/megy-sample-') && !e.name.includes('megy-sample-0')).length);
  await shot(page, `${tag}-02-todays-test`);
  // Finish it: the album is made with the test, today's task in the album opens.
  await page.locator('[data-testid="todays-test-name"]').click();
  await page.keyboard.type('Oct 29', { delay: 60 });
  const label = await page.locator('[data-testid="todays-test-task-line"] b').first().innerText().catch(() => null);
  const opts = page.locator('[data-testid="todays-test-option"]');
  const n = await opts.count();
  for (let i = 0; i < n; i++) { const o = opts.nth(i); if (!label || (await o.innerText()).trim() === label) { await tapEl(page, o); break; } }
  await tapSel(page, '[data-testid="todays-test-make"]');
  await page.waitForSelector('[data-testid="daily-test-bar"]', { timeout: 60000 });
  f.after = { name: await page.evaluate(() => window.__ctx.albumTitle), hint: await text(page, '[data-testid="daily-test-hint"]'), run: await run(page) };
  await shot(page, `${tag}-03-album-with-task`);
  await ctx.close();
}

async function plainBrowser(browser) {
  const tag = 'x2-browser';
  const f = facts[tag] = {};
  console.log(`== ${tag}`);
  const { ctx, page } = await phone(browser, tag, { inApp: false, when: new Date(2026, 9, 29, 11, 0) });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-albums-card"]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  f.homeBox = await page.locator('[data-testid="home-todays-sample"]').count();
  await shot(page, `${tag}-01-home`);
  const start = page.locator('[data-testid="home-albums-card"]').getByRole('button', { name: /Start Creating/i }).first();
  await tapEl(page, start);
  await page.waitForSelector('[data-step="pick_theme"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  f.step1Offer = await page.locator('[data-testid="sample-album"]').count();
  f.todaysTest = await page.locator('[data-testid="todays-test"]').count();
  f.bar = await page.locator('[data-testid="daily-test-bar"]').count();
  await shot(page, `${tag}-02-step1`);
  await ctx.close();
}

async function autoReload(browser) {
  const tag = 'x3-auto-reload';
  const f = facts[tag] = {};
  console.log(`== ${tag}`);
  const { ctx, page } = await phone(browser, tag, { when: new Date(2026, 9, 29, 11, 0) });
  let versionHits = 0;
  // A newer build is live (this local copy is 'dev').
  await ctx.route(/\/version\.json/, (route) => { versionHits++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ build: 'newer-build-2026-10-29' }) }); });
  const comeBack = () => page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' });
    window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-todays-sample-make"]', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__sameCopy = true; });
  const reloaded = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
  await comeBack();
  f.home = { reloaded: await reloaded, versionHits };
  await page.waitForSelector('[data-testid="home-todays-sample-make"]', { timeout: 30000 });
  f.home.sameCopyAfter = await page.evaluate(() => window.__sameCopy === true);
  f.home.updateNote = await page.evaluate(() => sessionStorage.getItem('megy-update-note'));
  await shot(page, `${tag}-01-home-after-reload`);
  // In the builder: never.
  const start = page.locator('[data-testid="home-albums-card"]').getByRole('button', { name: /Start Creating/i }).first();
  await tapEl(page, start);
  await page.waitForSelector('[data-step="pick_theme"]', { timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__sameCopy = true; });
  const hitsBefore = versionHits;
  const reloaded2 = page.waitForEvent('load', { timeout: 6000 }).then(() => true).catch(() => false);
  await comeBack();
  f.builder = { reloaded: await reloaded2, versionChecks: versionHits - hitsBefore, sameCopyAfter: await page.evaluate(() => window.__sameCopy === true), url: page.url() };
  await shot(page, `${tag}-02-builder-no-reload`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    let n = 0;
    for (const iso of DAYS) { n++; try { await walkDay(browser, iso, n); } catch (e) { errors.push(`${iso}: ${String(e).slice(0, 400)}`); console.log('FAILED', iso, String(e).slice(0, 400)); } }
    if (EXTRAS) {
      for (const fn of [step1Opens, plainBrowser, autoReload].filter((x) => !ONLY.length || ONLY.includes(x.name))) {
        try { await fn(browser); } catch (e) { errors.push(`${fn.name}: ${String(e).slice(0, 400)}`); console.log('FAILED', fn.name, String(e).slice(0, 400)); }
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify({ facts, errors }, null, 2));
    console.log(JSON.stringify({ facts, errors }, null, 2));
  }
})();
