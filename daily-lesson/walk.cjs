/* THE DAILY LESSON ("User tutorial"): walk it on one phone over several days.
 * Real Chrome 390x844, local Vite with a FAKE Supabase host answered here
 * (nothing leaves this machine; no sign-up, no sign-in). Taps > 700 ms apart.
 * The phone's storage is carried from day to day (the features-tried count);
 * only the date moves to each day (timers stay real: every minute is real).
 * Usage: node walk.cjs <outdir> [days...]   days like 2026-10-29
 * Env: BASE (default http://127.0.0.1:5294), EXTRAS=0 to skip the extras. */
const { chromium } = require('C:/app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:5294';
const OUT = path.resolve(process.argv[2] || 'out');
const DAYS = process.argv.slice(3).length ? process.argv.slice(3) : ['2026-10-29', '2026-10-30'];
const EXTRAS = process.env.EXTRAS !== '0';
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

async function phone(browser, label, { inApp = true, when = null, storageState = undefined } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', storageState });
  // The fake Supabase host: every call answered here, empty.
  await ctx.route(/supabase-fake\.localhost/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${label} pageerror: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/supabase-fake|Failed to load resource|ERR_NAME_NOT_RESOLVED/.test(m.text())) errors.push(`${label} console: ${m.text().slice(0, 300)}`); });
  await page.addInitScript(HOOK);
  if (inApp) await page.addInitScript(ANDROID);
  if (when) {
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
  }
  return { ctx, page };
}
const shot = async (page, name) => {
  await page.waitForTimeout(600);
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
const progress = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('megy-daily-test-progress') || 'null'));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The coach mark as drawn: what it points at, its words, and where things are. */
const coachFacts = (page) => page.evaluate(() => {
  const mark = document.querySelector('[data-testid="coach-mark"]');
  if (!mark) return null;
  const target = document.querySelector(mark.dataset.coachTarget);
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const bubble = document.querySelector('[data-testid="coach-mark-bubble"]');
  const arrow = document.querySelector('[data-testid="coach-mark-arrow"]');
  const tr = target && target.getBoundingClientRect();
  const ar = arrow && arrow.getBoundingClientRect();
  return {
    target: mark.dataset.coachTarget, step: mark.dataset.coachStep,
    targetWhat: target ? `${target.tagName.toLowerCase()}${target.getAttribute('role') ? `[role=${target.getAttribute('role')}]` : ''}${target.dataset.testid ? `#${target.dataset.testid}` : ''}` : null,
    text: (document.querySelector('[data-testid="coach-mark-text"]')?.textContent || '').trim(),
    mascot: !!bubble?.querySelector('img'),
    bubble: r(bubble), targetBox: r(target), ring: r(document.querySelector('[data-testid="coach-mark-ring"]')),
    arrowSide: arrow?.dataset.side ?? null,
    // The arrow's tip is over the target's span (left to right) and next to it (top or bottom edge).
    arrowPointsAtTarget: !!(ar && tr && ar.left + ar.width / 2 >= tr.left && ar.left + ar.width / 2 <= tr.right
      && (Math.abs(ar.bottom - tr.top) < 24 || Math.abs(ar.top - tr.bottom) < 24)),
    takesTaps: getComputedStyle(mark).pointerEvents !== 'none' || getComputedStyle(bubble).pointerEvents !== 'none',
  };
});

async function walkDay(browser, iso, n, state) {
  const [y, m, d] = iso.split('-').map(Number);
  const when = new Date(y, m - 1, d, 10, 0, 0);
  const tag = `day${n}-${iso}`;
  const f = facts[tag] = { iso };
  console.log(`== ${tag}`);
  const { ctx, page } = await phone(browser, tag, { when, storageState: state });
  try {
    await walkDayIn(page, f, tag, n, m, d);
    return await ctx.storageState();
  } catch (e) {
    f.failDiag = await page.evaluate(() => ({
      phase: window.__ctx && window.__ctx.phase, run: localStorage.getItem('megy-daily-test-run'), text: document.body.innerText.slice(0, 500),
    })).catch((x) => String(x));
    await page.screenshot({ path: path.join(OUT, `${tag}-FAIL.png`) }).catch(() => {});
    throw e;
  } finally {
    await ctx.close();
  }
}

async function walkDayIn(page, f, tag, n, m, d) {
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-todays-sample-make"]', { timeout: 30000 });
  f.homeButton = await text(page, '[data-testid="home-todays-sample-make"]');
  f.homeLine = await text(page, '[data-testid="home-todays-sample-how"]');
  f.progressBefore = await progress(page);
  await shot(page, `${tag}-01-home`);
  await tapSel(page, '[data-testid="home-todays-sample-make"]');
  await page.waitForSelector('[data-testid="todays-test"]');
  await page.waitForTimeout(400);
  f.title = await text(page, '#todays-test-title');
  f.subtitle = await text(page, '[data-testid="todays-test-subtitle"]');
  f.lessonLine = await text(page, '[data-testid="lesson-progress-line"]');
  f.task = await page.locator('[data-testid="todays-test-task"]').getAttribute('data-task');
  f.teach = await text(page, '[data-testid="todays-test-task-teach"]');
  f.tryIt = await text(page, '[data-testid="todays-test-task-line"]');
  f.steps = await page.locator('[data-testid="lesson-step-chip"]').evaluateAll((els) => els.map((e) => e.dataset.step));
  f.filledButtons = await page.locator('[data-testid="todays-test"] button').evaluateAll((els) => els.filter((e) => /bg-peach/.test(e.className)).map((e) => e.innerText.trim()));
  await shot(page, `${tag}-02-lesson`);
  const answerLabel = await page.locator('[data-testid="todays-test-task-line"] b').first().innerText().catch(() => null);
  f.answerLabel = answerLabel;
  // "Make my album" with nothing done: the date first.
  await tapSel(page, '[data-testid="todays-test-make"]');
  f.missing1 = await text(page, '[data-testid="todays-test-missing"]');
  // A wrong date is refused.
  await tapEl(page, page.locator('[data-testid="todays-test-name"]'));
  await page.keyboard.type('Jan 1', { delay: 60 });
  await page.locator('[data-testid="todays-test-name"]').blur();
  f.refused = await text(page, '[data-testid="todays-test-date-refused"]');
  // Today's date.
  await page.locator('[data-testid="todays-test-name"]').fill('');
  await page.keyboard.type(`${MONTHS[m - 1]} ${d}`, { delay: 60 });
  await page.locator('[data-testid="todays-test-name"]').blur();
  f.dateOk = await text(page, '[data-testid="todays-test-date-ok"]');
  await tapSel(page, '[data-testid="todays-test-make"]');
  f.missing2 = await text(page, '[data-testid="todays-test-missing"]');
  // A wrong pick, then the right one.
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
  }
  await tapEl(page, right);
  f.picked = await right.getAttribute('data-value');
  await page.locator('[data-testid="todays-test-task"]').scrollIntoViewIfNeeded();
  await shot(page, `${tag}-03-tip-done`);
  const t0 = Date.now();
  await tapSel(page, '[data-testid="todays-test-make"]');
  // The album is made; today's task in the album opens, with the coach mark on it.
  await page.waitForSelector('[data-testid="daily-test-bar"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="coach-mark"][data-coach-step="0"]', { timeout: 15000 });
  await page.waitForTimeout(1200); // the sheet's slide in
  const r1 = await run(page);
  f.albumTask = r1 && r1.task;
  f.target = r1 && r1.target;
  f.strip = await text(page, '[data-testid="daily-test-hint"]');
  f.coach = await coachFacts(page);
  f.progressAfterAlbumMade = await progress(page);
  await shot(page, `${tag}-04-coach-mark`);
  if (n === 1 && f.albumTask !== 'openBook') {
    // Close the tool: the coach mark moves to the strip's button; that button opens it again.
    await gap(page);
    if (f.albumTask === 'layout') await page.locator('[role="dialog"][aria-labelledby="layout-picker-title"] button[aria-label="Close"]').click();
    else await page.mouse.click(195, 120);
    await page.waitForTimeout(1500);
    f.coachClosed = await coachFacts(page);
    await shot(page, `${tag}-04b-tool-closed-coach-on-button`);
    await tapSel(page, '[data-testid="daily-test-show"]');
    await page.waitForSelector('[data-testid="coach-mark"][data-coach-step="0"]', { timeout: 10000 });
    await page.waitForTimeout(1200);
    f.coachReopened = await coachFacts(page);
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
      f.coachWhileTyping = await coachFacts(page);
      await shot(page, `${tag}-05-typing`);
      await tapEl(page, page.getByRole('button', { name: /Done/ }).first());
      break;
    }
    case 'look': {
      await page.waitForSelector('[data-testid="studio-sheet-look"]', { timeout: 10000 });
      const looks = page.locator('[data-testid="studio-sheet-look"] [data-testid^="look-"]:not([data-testid="look-none"])');
      await tapEl(page, looks.first());
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
  await page.waitForTimeout(2000);
  const r2 = await run(page);
  f.albumDone = r2 && r2.albumDone;
  f.coachAfterDone = await page.locator('[data-testid="coach-mark"]').count();
  f.progressAfterTaskDone = await progress(page);
  f.secondsToTaskDone = Math.round((Date.now() - t0) / 1000);
  // The minute's countdown, then the done page.
  if (await visible(page, '[data-testid="daily-test-countdown"]')) {
    f.countdown1 = await text(page, '[data-testid="daily-test-countdown"]');
    await shot(page, `${tag}-06-countdown`);
    const start = Date.now();
    await page.waitForTimeout(5000);
    f.countdown2 = await text(page, '[data-testid="daily-test-countdown"]');
    await page.waitForSelector('[data-testid="tester-page-note-proof"]', { timeout: 90000 });
    f.realWaitSeconds = Math.round((Date.now() - start) / 1000);
  } else {
    await page.waitForSelector('[data-testid="tester-page-note-proof"]', { timeout: 90000 });
  }
  await page.waitForTimeout(1500);
  f.fgAtDone = (await run(page))?.fgMs;
  f.doneTitle = await text(page, '[data-testid="tester-page-note-title"]');
  f.doneBody = await text(page, '[data-testid="tester-page-note-body"]');
  f.doneLine = await text(page, '[data-testid="tester-page-note-proof-text"]');
  f.stamp = await page.locator('[data-testid="tester-page-stamp"]').first().innerText().then((t) => t.replace(/\s+/g, ' ')).catch(() => null);
  f.atPage = await page.evaluate(() => window.__ctx && `${window.__ctx.currentPageIndex + 1} of ${window.__ctx.albumPages.length} (${window.__ctx.phase})`);
  // The card's height, and #229's card on the same page (its words and its spacing): no taller.
  f.cardHeight = await page.evaluate(() => {
    const note = document.querySelector('[data-testid="tester-page-note"]');
    const h = (el) => Math.round(el.getBoundingClientRect().height * 10) / 10;
    const now = h(note);
    const font = Number.parseFloat(note.style.fontSize);
    const old = note.cloneNode(true);
    const title = old.querySelector('[data-testid="tester-page-note-title"]');
    title.textContent = "You're done with today's test!";
    title.style.lineHeight = '';
    old.querySelector('[data-testid="tester-page-note-body"]').style.marginTop = `${Math.round(font * 0.35)}px`;
    const proofRow = old.querySelector('[data-testid="tester-page-note-proof"]');
    proofRow.style.marginTop = `${Math.round(font * 0.45)}px`;
    proofRow.style.lineHeight = '1.25';
    const proof = old.querySelector('[data-testid="tester-page-note-proof-text"]');
    proof.textContent = proof.textContent.replace(/^Today you tried: /, 'Today: ');
    old.style.padding = `${Math.round(font * 0.75)}px ${Math.round(font * 0.9)}px`;
    old.style.lineHeight = '1.35';
    old.style.visibility = 'hidden';
    note.parentElement.appendChild(old);
    const before = h(old);
    old.remove();
    return { now, was229: before, top: Math.round(note.getBoundingClientRect().top), font };
  });
  await shot(page, `${tag}-07-finished`);
  f.progressAtEnd = await progress(page);
  // Back on Home: the lesson screen again shows the features tried so far (then closed, nothing changed).
  await gap(page);
  await page.goto(`${BASE}/`);
  await page.waitForSelector('[data-testid="home-todays-sample-make"]', { timeout: 30000 });
  await tapSel(page, '[data-testid="home-todays-sample-make"]');
  await page.waitForSelector('[data-testid="todays-test"]');
  await page.waitForTimeout(400);
  f.lessonLineAfter = await text(page, '[data-testid="lesson-progress-line"]');
  await shot(page, `${tag}-08-lesson-count-after`);
  await tapSel(page, '[data-testid="todays-test-close"]');
  await page.waitForTimeout(500);
  f.runStillDone = (await run(page))?.doneShown === true;
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
  const noAccount = page.getByRole('button', { name: /Continue without an account/i }).first();
  if (await noAccount.isVisible().catch(() => false)) await tapEl(page, noAccount);
  const started = page.getByRole('button', { name: /Get Started/i }).first();
  if (await started.isVisible().catch(() => false)) await tapEl(page, started);
  await page.waitForSelector('[data-testid="sample-album-make"]', { timeout: 30000 });
  f.offer = await text(page, '[data-testid="sample-album"]');
  await shot(page, `${tag}-01-step1-offer`);
  await tapSel(page, '[data-testid="sample-album-make"]');
  await page.waitForSelector('[data-testid="todays-test"]', { timeout: 15000 });
  f.opened = await text(page, '#todays-test-title');
  f.subtitle = await text(page, '[data-testid="todays-test-subtitle"]');
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
  f.homeSaysTutorial = await page.evaluate(() => /User tutorial|lesson/i.test(document.body.innerText));
  await shot(page, `${tag}-01-home`);
  const start = page.locator('[data-testid="home-albums-card"]').getByRole('button', { name: /Start Creating/i }).first();
  await tapEl(page, start);
  await page.waitForSelector('[data-step="pick_theme"]', { timeout: 30000 });
  await page.waitForTimeout(1200);
  f.step1Offer = await page.locator('[data-testid="sample-album"]').count();
  f.lessonScreen = await page.locator('[data-testid="todays-test"]').count();
  f.strip = await page.locator('[data-testid="daily-test-bar"]').count();
  f.coach = await page.locator('[data-testid="coach-mark"]').count();
  f.step1SaysTutorial = await page.evaluate(() => /User tutorial|Today's lesson/i.test(document.body.innerText));
  await shot(page, `${tag}-02-step1`);
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
    let state;
    for (const iso of DAYS) {
      n++;
      try { state = await walkDay(browser, iso, n, state); } catch (e) { errors.push(`${iso}: ${String(e).slice(0, 400)}`); console.log('FAILED', iso, String(e).slice(0, 400)); break; }
    }
    if (EXTRAS) {
      for (const fn of [step1Opens, plainBrowser]) {
        try { await fn(browser); } catch (e) { errors.push(`${fn.name}: ${String(e).slice(0, 400)}`); console.log('FAILED', fn.name, String(e).slice(0, 400)); }
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, 'facts.json'), JSON.stringify({ facts, errors }, null, 2));
    console.log(JSON.stringify({ facts, errors }, null, 2));
  }
})();
