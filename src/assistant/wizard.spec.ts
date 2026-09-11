import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WizardEngine, WIZARD_ORDER, STEP_META, phaseForStep } from './wizard';
import { ALBUM_THEME_KEY, isAlbumThemeReady, cleanAlbumTheme } from '../lib/albumTheme';
import type { BuilderActions as BuilderActions } from '../pages/builder/useBuilderState';

/* ══════════════════════════════════════════════════════════════════════════
   WIZARD — the occasion step (pick_theme) is first and UNSKIPPABLE. The
   album theme seeds the AI quote pool, and on desktop the old dropdown was
   hidden under the guided wizard entirely. These lock: order, numbering,
   the gate, and that skip() cannot get past it.
   ══════════════════════════════════════════════════════════════════════════ */

const g = globalThis as unknown as { localStorage?: unknown };
let store: Record<string, string>;
beforeEach(() => {
  store = {};
  g.localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
});
afterEach(() => { delete g.localStorage; });

/** The engine only reads a few builder fields for these paths. */
const builderStub = (over: Partial<BuilderActions> = {}) => ({
  phase: 'setup',
  albumPages: [],
  uploadedPhotos: [],
  albumSize: '8x8',
  currentPageIndex: 0,
  currentPage: null,
  ...over,
} as unknown as BuilderActions);

describe('step order and numbering', () => {
  it('the occasion step sits right after welcome, before size', () => {
    expect(WIZARD_ORDER.slice(0, 3)).toEqual(['welcome', 'pick_theme', 'pick_size']);
    expect(STEP_META.pick_theme.title).toBe('Occasion');
    expect(phaseForStep('pick_theme')).toBe('setup');
  });
  it('every numbered step title matches the progress label (Step N of 8)', () => {
    // Three filled pages, cursor on the first: review_pages shows its numbered
    // title rather than the "All Pages Reviewed" nudge it gives on the last page.
    const page = { slotFills: [0], photos: [], textElements: [] };
    const w = new WizardEngine(builderStub({ albumPages: [page, page, page], currentPage: page } as unknown as Partial<BuilderActions>), false);
    for (const step of WIZARD_ORDER) {
      w.state.step = step;
      const { current, total, label } = w.getProgress();
      const title = w.getMessage().title;
      if (step === 'welcome') { expect(label).toBe("Let's begin"); continue; }
      expect(total).toBe(8);
      expect(label).toBe(`Step ${current} of 8`);
      expect(title.startsWith(`Step ${current}:`), `${step}: "${title}" vs "${label}"`).toBe(true);
    }
  });
});

describe('pick_theme is unskippable', () => {
  it('is incomplete until an occasion is stored, then complete', () => {
    const w = new WizardEngine(builderStub(), false);
    expect(w.isStepComplete('pick_theme')).toBe(false);
    store[ALBUM_THEME_KEY] = 'Wedding';
    expect(w.isStepComplete('pick_theme')).toBe(true);
  });
  it('skip() on the occasion step does nothing; on other steps it still advances', () => {
    const w = new WizardEngine(builderStub(), false);
    w.state.step = 'pick_theme';
    w.skip();
    expect(w.state.step).toBe('pick_theme');
    expect(w.state.skipped).toEqual([]);
    w.state.step = 'design_cover';
    w.skip();
    expect(w.state.step).toBe('pick_background');
    expect(w.state.skipped).toEqual(['design_cover']);
  });
  it('a returning visitor with no occasion lands on the occasion step; with one, on size', () => {
    const w = new WizardEngine(builderStub(), false);
    expect(w.detectStep()).toBe('pick_theme');
    store[ALBUM_THEME_KEY] = 'Baptism';
    expect(w.detectStep()).toBe('pick_size');
  });
  it('a first-time visitor still starts at welcome, then reaches the occasion step by advancing', () => {
    const w = new WizardEngine(builderStub(), true);
    expect(w.detectStep()).toBe('welcome');
    w.advance();
    expect(w.state.step).toBe('pick_theme');
  });
  it('the message reflects the stored occasion', () => {
    const w = new WizardEngine(builderStub(), false);
    w.state.step = 'pick_theme';
    expect(w.getMessage().body).toMatch(/can't be skipped/);
    store[ALBUM_THEME_KEY] = 'Beach trip';
    expect(w.getMessage().body).toContain('**Beach trip**');
  });
});

describe('the gate the Next button uses', () => {
  it('accepts two characters or more after cleaning, rejects blanks and one letter', () => {
    expect(isAlbumThemeReady('Wedding')).toBe(true);
    expect(isAlbumThemeReady('  Me ')).toBe(true);
    expect(isAlbumThemeReady('x')).toBe(false);
    expect(isAlbumThemeReady('   ')).toBe(false);
    expect(isAlbumThemeReady('')).toBe(false);
  });
  it('cleaning collapses whitespace and caps the length', () => {
    expect(cleanAlbumTheme('  Lola\'s   80th  ')).toBe("Lola's 80th");
    expect(cleanAlbumTheme('a'.repeat(100))).toHaveLength(40);
  });
});
