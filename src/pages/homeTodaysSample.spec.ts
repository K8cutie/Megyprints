// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/* ══════════════════════════════════════════════════════════════════════════
   "MAKE TODAY'S SAMPLE ALBUM" ON THE APP'S HOME SCREEN (tester, 2026-10-29:
   "maybe a little less text in the steps [too many things to read hah]";
   owner: he meant a faster way to the sample album). In the Android app
   while testing, the first thing on Home is one filled button (#227).

   TODAY'S TEST (owner, the same day: testers screenshot the home page or
   just flip pages; "They should type the correct date so they cant cheat
   the process"; then "Do 10 test pool that shows different feature"): the
   button opens a short screen. Type today's date as the album's name, do
   today's task (one of 10, one tap on a list), then "Make my album" makes it
   the way "Welcome back" does (#208), with today's task in the album
   (assistant/sampleAlbum.spec.ts). The minute in the app starts as the
   screen opens (builder/dailyTestBar.spec.ts).

   THE NEWEST APP ON HOME (owner, 2026-10-29): when the app comes back to the
   front on Home, it checks for a newer version and reloads into it; never
   while Today's test is open, never on the website or with the switch off.

   It never throws a guest's own album away without asking. The website: no
   change.

   START-UP PROMPTS OFF (owner, 2026-10-29: "for now please disable resume
   from where you left off or open existing album feature on the onset"):
   in the app while testing, Start Creating starts a new album straight away
   (no "You have an album in progress"); a guest's own album is still asked
   about first.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => {
  // GSAP's ScrollTrigger reads these when Home loads (jsdom has neither).
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  return { native: true, testing: true, user: null as { id: string } | null, vis: 'visible' as DocumentVisibilityState, update: (async () => 'latest') as (note: unknown) => Promise<string> };
});
vi.mock('../lib/nativeShell', () => ({ isNativeShell: () => h.native }));
vi.mock('../lib/testingPhase', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return { ...real, get TESTING_PHASE() { return h.testing; } };
});
vi.mock('../lib/authContext', () => ({ useAuth: () => ({ user: h.user, loading: false }) }));
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({}) }, supabaseConfigured: false }));
vi.mock('../components/UserProjectsSection', () => ({ UserProjectsSection: () => null, formatRelativeTime: () => '' }));
vi.mock('./BuilderDemoSection', () => ({ default: () => null }));
vi.mock('../lib/appVersion', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()), ensureLatestApp: (note: unknown) => h.update(note),
}));

import Home from './Home';
import { asksBeforeNewAlbum } from './home/KeepAlbumAsk';
import { DRAFT_STORAGE_KEY, readLocalDraftSummary, type LocalDraftSummary } from '../lib/localDraft';
import { samplePhotoName, sampleDayNumber } from '../lib/samplePhotos';
import { coverChoices, todaysBeforeTask, todaysAlbumTask, beforeTaskFor, takeDailyTest, dateExample, type BeforeTaskId } from '../lib/dailyTest';
import { readRun, readTestClock } from '../lib/dailyTestRun';
import { PAGE_COLORS } from './builder/pageColors';
import { FONTS } from './builder/fonts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = (() => {}) as typeof window.scrollTo;
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h.vis });

let host: HTMLDivElement;
let root: Root;
// The question and Today's test are portals on <body>, so look in the whole page.
const $ = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const $$ = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function Where() {
  const l = useLocation();
  return createElement('output', { 'data-testid': 'where' }, l.pathname);
}
const mount = async () => {
  await act(async () => { root.render(null); });
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: ['/'] },
      createElement(Routes, null,
        createElement(Route, { path: '/', element: createElement(Home) }),
        createElement(Route, { path: '*', element: createElement(Where) }))));
  });
};
const tap = async (id: string) => { await act(async () => { $(id)!.click(); }); };
const tapEl = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const storage = () => {
  const local: Record<string, string> = { ...localStorage };
  delete local['megy-daily-test-clock']; // the minute in the app, from Today's test opening
  return JSON.stringify({ local, session: { ...sessionStorage } });
};
/** Today's test is its own chunk: wait for it to load. */
const opened = async () => {
  for (let i = 0; i < 20 && !$('todays-test'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return $('todays-test');
};
const typeDate = async (value: string) => {
  const input = $('todays-test-name') as HTMLInputElement;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const leaveDate = async () => { await act(async () => { ($('todays-test-name') as HTMLInputElement).blur(); }); };

const own = Array.from({ length: 45 }, (_, i) => ({ id: `o${i}`, name: `IMG_${3000 + i}.jpg` }));
const samples = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: samplePhotoName(i + 1) }));
const YESTERDAY = Date.now() - 24 * 3600e3;
const seedDraft = (d: Record<string, unknown>) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ editedAt: 1, ...d }));

// The phone's clock, and the day each task of the pool comes round.
const OCT29 = new Date(2026, 9, 29, 15, 20);
const dayFor = (task: BeforeTaskId) => {
  for (let i = 0; i < 10; i++) { const d = new Date(2026, 9, 29 + i, 15, 20); if (todaysBeforeTask(d) === task) return d; }
  throw new Error(task);
};
const COVER_DAY = dayFor('cover');
const COLOUR_DAY = dayFor('colour');
const FONT_DAY = dayFor('titleFont');
const SIZE_DAY = dayFor('size');
const clock = (at: Date) => vi.setSystemTime(at);
const dateOf = (at: Date) => dateExample(at);
/** The option that is today's answer, and one that isn't. */
const optionFor = (value: string | null) => $$('todays-test-option').find((b) => b.dataset.value === value)!;
const otherOption = () => $$('todays-test-option').find((b) => b.dataset.value !== beforeTaskFor(new Date()).answer)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock(OCT29);
  h.native = true; h.testing = true; h.user = null; h.vis = 'visible';
  h.update = vi.fn(async () => 'latest');
  localStorage.clear(); sessionStorage.clear();
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.useRealTimers(); });

describe('who sees it', () => {
  it('the Android app while testing: one filled button, first on Home, and what to do', async () => {
    await mount();
    const box = $('home-todays-sample')!;
    const make = $('home-todays-sample-make')!;
    expect(text(make)).toBe("Make today's sample album");
    expect(make.className).toContain('bg-peach');
    expect(text($('home-todays-sample-how'))).toBe('Testers: type today\'s date, do today\'s 2 tasks, then screenshot "You\'re done".');
    // Above "Turn your photos into a printed album" (the Albums card).
    expect(box.compareDocumentPosition($('home-albums-card')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One filled button in the box, nothing greyed.
    expect(box.querySelectorAll('button')).toHaveLength(1);
    expect(make.hasAttribute('disabled')).toBe(false);
  });

  it('the website, or the app with TESTING_PHASE off: nothing (Home as it was)', async () => {
    for (const [native, testing] of [[false, true], [true, false], [false, false]]) {
      h.native = native; h.testing = testing;
      await mount();
      expect($('home-todays-sample')).toBeNull();
      expect($('home-albums-card')).not.toBeNull();
    }
  });
});

describe("the button opens Today's test; nothing is made yet", () => {
  it('a short screen: the name, today\'s task, ONE filled "Make my album"', async () => {
    await mount();
    await tap('home-todays-sample-make');
    const screen = (await opened())!;
    expect(screen).not.toBeNull();
    expect(screen.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(text(screen.querySelector('h2'))).toBe("Today's test");
    expect(text(screen.querySelector('label[for="todays-test-name"]'))).toBe("1 Type today's date as your album's name");
    expect(($('todays-test-name') as HTMLInputElement).placeholder).toBe('Oct 29');
    expect(text(screen)).toContain('For example: Oct 29');
    const make = $('todays-test-make')!;
    expect(text(make)).toBe('Make my album');
    expect(make.className).toContain('bg-peach');
    expect(make.hasAttribute('disabled')).toBe(false);
    // The only filled button on it, and nothing greyed anywhere.
    expect([...screen.querySelectorAll('button')].filter((b) => b.className.includes('bg-peach'))).toEqual([make]);
    expect(screen.querySelectorAll('button[disabled]')).toHaveLength(0);
    // Not made yet: still Home, no flags. The minute in the app starts now, from
    // zero, apart from any album an earlier test made (its run is untouched).
    expect($('where')).toBeNull();
    expect(sessionStorage.getItem('megy-fresh-start')).toBeNull();
    expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();
    expect(readTestClock()).toEqual({ day: sampleDayNumber(OCT29), fgMs: 0 });
    expect(readRun()).toBeNull();
  });

  it('✕ (or Escape) closes it and changes nothing', async () => {
    await mount();
    const before = storage();
    await tap('home-todays-sample-make');
    await opened();
    await tap('todays-test-close');
    expect($('todays-test')).toBeNull();
    await tap('home-todays-sample-make');
    await opened();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('todays-test')).toBeNull();
    expect($('where')).toBeNull();
    expect(storage()).toBe(before);
  });
});

describe("step 1: today's date, by the phone's clock", () => {
  it('a wrong date is refused in plain words once they leave the box; today\'s date is accepted', async () => {
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate('Oct 28');
    // Not while they type.
    expect($('todays-test-date-refused')).toBeNull();
    await leaveDate();
    expect(text($('todays-test-date-refused'))).toBe("That's not today's date. Type today's date, for example Oct 29.");
    expect($('todays-test-name')!.getAttribute('aria-invalid')).toBe('true');
    for (const today of ['Oct 29', 'october 29', '10/29', '29/10', '2026-10-29', ' OCT 29 2026 ']) {
      await typeDate(today);
      await leaveDate();
      expect($('todays-test-date-refused'), today).toBeNull();
      expect(text($('todays-test-date-ok'))).toBe("That's today's date.");
    }
    for (const wrong of ['Oct 30', 'Sample Album', '10/28']) {
      await typeDate(wrong);
      await leaveDate();
      expect($('todays-test-date-refused'), wrong).not.toBeNull();
    }
  });
});

describe('step 2: today\'s task, one tap on a list already shown', () => {
  it('a cover day: "Choose your cover", 12 of today\'s photos, any one counts', async () => {
    clock(COVER_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    expect($('todays-test-task')!.dataset.task).toBe('cover');
    expect(text($('todays-test-task-line'))).toBe('2 Choose your cover.');
    expect(text($('todays-test-task-hint'))).toBe('Tap the photo you want on the front of your album.');
    const photos = $$('todays-test-option');
    expect(photos.map((p) => p.dataset.value)).toEqual(coverChoices(COVER_DAY));
    expect(photos[0].querySelector('img')!.getAttribute('src')).toBe(`/sample-photos/${coverChoices(COVER_DAY)[0]}`);
    await tapEl(photos[4]);
    expect($$('todays-test-option').map((p) => p.getAttribute('aria-checked'))).toEqual(photos.map((_, i) => String(i === 4)));
    expect($('todays-test-wrong')).toBeNull();
  });

  it('a colour day: today\'s colour in the owner\'s words, the page colours to tap, only that one counts', async () => {
    clock(COLOUR_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    const t = beforeTaskFor(COLOUR_DAY);
    const name = PAGE_COLORS.find((c) => c.hex === t.answer)!.name;
    expect($('todays-test-task')!.dataset.task).toBe('colour');
    expect(text($('todays-test-task-line'))).toBe(`2 For today, select ${name} for your album background.`);
    expect($$('todays-test-option').map((b) => text(b))).toEqual(PAGE_COLORS.map((c) => c.name));
    await tapEl(otherOption());
    expect(text($('todays-test-wrong'))).toBe(`Today's colour is ${name}. Tap ${name}.`);
    expect($$('todays-test-option').every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
    await tapEl(optionFor(t.answer));
    expect($('todays-test-wrong')).toBeNull();
    expect($$('todays-test-option').filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.value)).toEqual([t.answer]);
  });

  it('a font day: the fonts, each shown in its own face; only today\'s counts', async () => {
    clock(FONT_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    const t = beforeTaskFor(FONT_DAY);
    const name = FONTS.find((f) => f.family === t.answer)!.name;
    expect(text($('todays-test-task-line'))).toBe(`2 For today, pick the font ${name} for your album's title.`);
    const options = $$('todays-test-option');
    expect(options.length).toBeGreaterThan(4);
    for (const o of options) expect((o.querySelector('span[style]') as HTMLElement).style.fontFamily).not.toBe('');
    await tapEl(otherOption());
    expect(text($('todays-test-wrong'))).toBe(`Today's font is ${name}. Tap ${name}.`);
    await tapEl(optionFor(t.answer));
    expect($('todays-test-wrong')).toBeNull();
  });

  it('a size day: the sizes offered, in words', async () => {
    clock(SIZE_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    const t = beforeTaskFor(SIZE_DAY);
    expect(text($('todays-test-task-line'))).toMatch(/^2 Make your album .+×.+\.$/);
    expect($$('todays-test-option').map((b) => text(b))).toContain('8×8');
    await tapEl(optionFor(t.answer));
    expect($('todays-test-wrong')).toBeNull();
  });
});

describe('"Make my album"', () => {
  it('a step missing: says which, in the order of the steps, and makes nothing (the button stays filled and tappable)', async () => {
    clock(FONT_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    const t = beforeTaskFor(FONT_DAY);
    const name = FONTS.find((f) => f.family === t.answer)!.name;
    await tap('todays-test-make');
    expect(text($('todays-test-missing'))).toBe("Type today's date first.");
    // Today's task done, the date wrong: still the date first.
    await tapEl(optionFor(t.answer));
    await typeDate('Oct 1');
    await tap('todays-test-make');
    expect(text($('todays-test-missing'))).toBe("Type today's date first.");
    expect($('todays-test-date-refused')).not.toBeNull();
    await typeDate(dateOf(FONT_DAY));
    expect($('todays-test-missing')).toBeNull();

    // The date done, the task not.
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate(dateOf(FONT_DAY));
    await tap('todays-test-make');
    expect(text($('todays-test-missing'))).toBe(`Pick today's font first: ${name}.`);
    await tapEl(otherOption());
    await tap('todays-test-make');
    expect(text($('todays-test-missing'))).toBe(`Pick today's font first: ${name}.`);
    expect($('todays-test-make')!.hasAttribute('disabled')).toBe(false);
    expect($('where')).toBeNull();
    expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();

    clock(COVER_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate(dateOf(COVER_DAY));
    await tap('todays-test-make');
    expect(text($('todays-test-missing'))).toBe('Choose your cover first.');
    expect($('where')).toBeNull();
  });

  it("done: #208's flags, the typed name and today's task kept for the builder, no sign-in nudge", async () => {
    clock(COVER_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate(dateOf(COVER_DAY).toLowerCase());
    const cover = coverChoices(COVER_DAY)[7];
    await tapEl($$('todays-test-option')[7]);
    await tap('todays-test-make');
    expect($('todays-test')).toBeNull();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1'); // a new album
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1'); // made as the builder opens
    expect(sessionStorage.getItem('megy_soft_auth_dismissed')).toBe('1');
    expect(takeDailyTest(COVER_DAY)).toEqual({ day: sampleDayNumber(COVER_DAY), name: dateOf(COVER_DAY).toLowerCase(), before: 'cover', answer: cover, album: todaysAlbumTask(COVER_DAY) });
  });

  it("a font day, done: the typed name and today's font kept for the builder", async () => {
    clock(FONT_DAY);
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate(`${FONT_DAY.getMonth() + 1}/${FONT_DAY.getDate()}`);
    const t = beforeTaskFor(FONT_DAY);
    await tapEl(optionFor(t.answer));
    await tap('todays-test-make');
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
    expect(takeDailyTest(FONT_DAY)).toEqual({ day: sampleDayNumber(FONT_DAY), name: `${FONT_DAY.getMonth() + 1}/${FONT_DAY.getDate()}`, before: 'titleFont', answer: t.answer, album: todaysAlbumTask(FONT_DAY) });
  });
});

async function finishTest() {
  await opened();
  await typeDate(dateOf(new Date()));
  const t = beforeTaskFor(new Date());
  await tapEl(t.answer == null ? $$('todays-test-option')[0] : optionFor(t.answer));
  await tap('todays-test-make');
}

describe('an album in progress', () => {
  it('a sample album in progress, from yesterday or today: straight to Today\'s test, then today\'s', async () => {
    for (const made of [YESTERDAY, Date.now()]) {
      sessionStorage.clear();
      seedDraft({ title: 'Sample Album · Oct 28', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: made }] });
      await mount();
      await tap('home-todays-sample-make');
      expect($('todays-sample-ask')).toBeNull();
      await finishTest();
      expect($('where')!.textContent).toBe('/builder');
      expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
    }
  });

  it('signed in with their own album: no question (the builder saves it to the account as it puts it away)', async () => {
    h.user = { id: 'u1' };
    seedDraft({ title: 'HK Trip', accountId: 'u1', uploadedPhotos: own });
    await mount();
    await tap('home-todays-sample-make');
    expect($('todays-sample-ask')).toBeNull();
    await finishTest();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
  });
});

describe('signed out, with their own album on this phone', () => {
  beforeEach(() => seedDraft({ title: 'HK Trip', uploadedPhotos: own }));

  it('asks first, in plain words: one filled way on, and "Keep my album"', async () => {
    await mount();
    await tap('home-todays-sample-make');
    const ask = $('todays-sample-ask')!;
    expect(ask).not.toBeNull();
    expect(ask.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    expect(text(ask.querySelector('h2'))).toBe('You have an album in progress on this phone.');
    expect(text(ask.querySelector('p'))).toBe('A sample album starts a new one. Sign in first to keep yours.');
    expect(text($('todays-sample-ask-make'))).toBe('Make the sample album');
    expect($('todays-sample-ask-make')!.className).toContain('bg-peach');
    expect(text($('todays-sample-ask-keep'))).toBe('Keep my album');
    expect($('todays-sample-ask-keep')!.className).not.toContain('bg-peach');
    // Nothing happened yet.
    expect($('todays-test')).toBeNull();
    expect($('where')).toBeNull();
    expect(sessionStorage.getItem('megy-fresh-start')).toBeNull();
    expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();
  });

  it('"Keep my album" changes nothing: the album, the flags, the page', async () => {
    await mount();
    const before = storage();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask-keep');
    expect($('todays-sample-ask')).toBeNull();
    expect($('todays-test')).toBeNull();
    expect($('where')).toBeNull(); // still on Home
    expect($('home-todays-sample')).not.toBeNull();
    expect(storage()).toBe(before);
    expect(readLocalDraftSummary()).toMatchObject({ title: 'HK Trip', photoCount: 45 });
  });

  it('Escape or a tap outside keeps it too', async () => {
    await mount();
    const before = storage();
    await tap('home-todays-sample-make');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('todays-sample-ask')).toBeNull();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask');
    expect($('todays-sample-ask')).toBeNull();
    expect(storage()).toBe(before);
  });

  it('"Make the sample album": Today\'s test, then the same new album', async () => {
    await mount();
    await tap('home-todays-sample-make');
    await tap('todays-sample-ask-make');
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')).toBeNull();
    await finishTest();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
    expect(sessionStorage.getItem('megy-make-sample-album')).toBe('1');
  });
});

describe('asksBeforeNewAlbum — when a tap asks first', () => {
  const draft = (over: Partial<LocalDraftSummary> = {}): LocalDraftSummary =>
    ({ title: 'HK Trip', photoCount: 45, accountId: null, editedAt: 1, hasContent: true, isSample: false, ...over });
  it('only for a guest\'s own album', () => {
    expect(asksBeforeNewAlbum(draft(), false)).toBe(true);
    expect(asksBeforeNewAlbum(draft({ hasContent: false, photoCount: 0 }), false)).toBe(true); // just a name
    expect(asksBeforeNewAlbum(draft(), true)).toBe(false);
    expect(asksBeforeNewAlbum(draft({ isSample: true }), false)).toBe(false);
    expect(asksBeforeNewAlbum(null, false)).toBe(false);
  });
});

describe('readLocalDraftSummary — isSample', () => {
  const read = (d: Record<string, unknown>) => { seedDraft(d); return readLocalDraftSummary()!.isSample; };
  it('every photo a sample, made or not', () => {
    expect(read({ title: 'Sample Album · Oct 28', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: YESTERDAY }] })).toBe(true);
    expect(read({ title: 'Oct 29', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: YESTERDAY }] })).toBe(true); // named by Today's test
    expect(read({ title: 'Sample Album', uploadedPhotos: samples })).toBe(true);
  });
  it('any photo of their own, and it is theirs', () => {
    expect(read({ title: 'Sample Album', uploadedPhotos: [...samples, own[0]] })).toBe(false);
    expect(read({ title: 'HK Trip', uploadedPhotos: own })).toBe(false);
  });
  it("no photos: the sample album's name (its photos didn't come in) is a sample; any other name is theirs", () => {
    expect(read({ title: 'Sample Album · Oct 29', uploadedPhotos: [] })).toBe(true);
    expect(read({ title: 'HK Trip', uploadedPhotos: [] })).toBe(false);
  });
});

/* START CREATING with the start-up prompts off (testingPhase skipsResumePrompts). */
describe('Start Creating in the app while testing: a new album straight away', () => {
  const startCreating = async () => {
    const card = $('home-albums-card')!;
    const button = [...card.querySelectorAll<HTMLElement>('button, a')].find((b) => /Start Creating/i.test(b.textContent ?? ''))!;
    expect(button).toBeTruthy();
    await tapEl(button);
  };

  it('a sample album in progress (any day), or none: no "You have an album in progress", a new album opens', async () => {
    for (const seed of [() => seedDraft({ title: 'Oct 28', uploadedPhotos: samples, albumPages: [{ slotFills: [0], madeAt: YESTERDAY }] }), () => {}]) {
      localStorage.clear(); sessionStorage.clear();
      seed();
      await mount();
      await startCreating();
      expect($('start-new-prompt')).toBeNull();
      expect($('todays-sample-ask')).toBeNull();
      expect($('where')!.textContent).toBe('/builder');
      expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
      // A new album of their own: no sample album is asked for.
      expect(sessionStorage.getItem('megy-make-sample-album')).toBeNull();
    }
  });

  it('signed in with their own album: no question, a new album (the builder saves theirs to the account first)', async () => {
    h.user = { id: 'u1' };
    seedDraft({ title: 'HK Trip', accountId: 'u1', uploadedPhotos: own });
    await mount();
    await startCreating();
    expect($('start-new-prompt')).toBeNull();
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
  });

  it('signed out with their own album: still asked first (#227\'s box); "Open my album" keeps it, Escape changes nothing', async () => {
    seedDraft({ title: 'HK Trip', uploadedPhotos: own });
    await mount();
    const before = storage();
    await startCreating();
    expect($('start-new-prompt')).toBeNull();
    expect(text($('todays-sample-ask')!.querySelector('h2'))).toBe('You have an album in progress on this phone.');
    expect(text($('todays-sample-ask')!.querySelector('p'))).toBe('A new album replaces it. Sign in first to keep yours.');
    expect(text($('todays-sample-ask-make'))).toBe('Start a new album');
    expect($('todays-sample-ask-make')!.className).toContain('bg-peach');
    expect(text($('todays-sample-ask-keep'))).toBe('Open my album');
    expect($('where')).toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect($('todays-sample-ask')).toBeNull();
    expect($('where')).toBeNull();
    expect(storage()).toBe(before);
    // "Open my album": the builder, on their album (no new album asked for).
    await startCreating();
    await tap('todays-sample-ask-keep');
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBeNull();
    expect(readLocalDraftSummary()).toMatchObject({ title: 'HK Trip', photoCount: 45 });
  });

  it('signed out with their own album: "Start a new album" starts one', async () => {
    seedDraft({ title: 'HK Trip', uploadedPhotos: own });
    await mount();
    await startCreating();
    await tap('todays-sample-ask-make');
    expect($('where')!.textContent).toBe('/builder');
    expect(sessionStorage.getItem('megy-fresh-start')).toBe('1');
  });

  it('the website, or TESTING_PHASE off: "You have an album in progress", as always', async () => {
    for (const [native, testing] of [[false, true], [true, false]]) {
      h.native = native; h.testing = testing;
      for (const user of [null, { id: 'u1' }]) {
        h.user = user;
        localStorage.clear(); sessionStorage.clear();
        seedDraft({ title: 'HK Trip', accountId: user?.id ?? null, uploadedPhotos: own });
        await mount();
        await startCreating();
        expect($('start-new-prompt')).not.toBeNull();
        expect($('todays-sample-ask')).toBeNull();
        expect($('where')).toBeNull();
      }
    }
  });
});

/* THE NEWEST APP ON HOME (lib/autoUpdate): back to the front on Home → check
   /version.json (appVersion's ensureLatestApp, no note) and reload when the
   live build is another one. The builder never does (assistant/sampleAlbum.spec). */
describe('back to the front on Home: the newest app', () => {
  const comeBack = async () => {
    h.vis = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    h.vis = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  };

  it('the Android app while testing: it checks each time the app comes back to the front, with no note', async () => {
    await mount();
    expect(h.update).not.toHaveBeenCalled();
    await comeBack();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith(null);
    await comeBack();
    expect(h.update).toHaveBeenCalledTimes(2);
  });

  it('going to the back is not coming back', async () => {
    await mount();
    h.vis = 'hidden';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('never while Today\'s test is open (what they typed stays)', async () => {
    await mount();
    await tap('home-todays-sample-make');
    await opened();
    await typeDate('Oct 29');
    await comeBack();
    expect(h.update).not.toHaveBeenCalled();
    expect(($('todays-test-name') as HTMLInputElement).value).toBe('Oct 29');
    await tap('todays-test-close');
    await comeBack();
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it('the website, or TESTING_PHASE off: never', async () => {
    for (const [native, testing] of [[false, true], [true, false]]) {
      h.native = native; h.testing = testing;
      await mount();
      await comeBack();
    }
    expect(h.update).not.toHaveBeenCalled();
  });
});
