import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WizardEngine, WIZARD_ORDER, STEP_META, phaseForStep, forwardJumpTarget, isStepOneReady } from './wizard';
import { isAlbumNameReady, albumNameToSave, cleanAlbumName, UNNAMED_ALBUM } from '../lib/albumName';
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

/** The engine only reads a few builder fields for these paths. The album is
 *  NAMED by default so the occasion tests below test only the occasion; the
 *  name gate has its own block. */
const builderStub = (over: Partial<BuilderActions> = {}) => ({
  albumTitle: "Maria's Debut",
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
    expect(STEP_META.pick_theme.title).toBe('Name & occasion');
    expect(phaseForStep('pick_theme')).toBe('setup');
  });
  it('every numbered step title matches the progress label (Step N of 7)', () => {
    // Three filled pages, cursor on the first: review_pages shows its numbered
    // title rather than the "All Pages Reviewed" nudge it gives on the last page.
    const page = { slotFills: [0], photos: [], textElements: [] };
    const w = new WizardEngine(builderStub({ albumPages: [page, page, page], currentPage: page } as unknown as Partial<BuilderActions>), false);
    for (const step of WIZARD_ORDER) {
      w.state.step = step;
      const { current, total, label } = w.getProgress();
      const title = w.getMessage().title;
      if (step === 'welcome') { expect(label).toBe("Let's begin"); continue; }
      expect(total).toBe(7);
      expect(label).toBe(`Step ${current} of 7`);
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
    // With no occasion stored, even skipping the cover step pulls back to the occasion.
    w.state.step = 'design_cover';
    w.skip();
    expect(w.state.step).toBe('pick_theme');
    expect(w.state.skipped).toEqual([]);
    // With one stored, skip works as before.
    store[ALBUM_THEME_KEY] = 'Wedding';
    w.state.step = 'design_cover';
    w.skip();
    expect(w.state.step).toBe('upload_photos');
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

describe('external forward jumps cannot hop over the occasion step', () => {
  it('a jump from size to cover (the size page\'s Start Creating) lands on the occasion when none is stored', () => {
    expect(forwardJumpTarget('pick_size', 'design_cover', false)).toBe('pick_theme');
    expect(forwardJumpTarget('welcome', 'upload_photos', false)).toBe('pick_theme');
  });
  it('the same jump goes through once an occasion is stored', () => {
    expect(forwardJumpTarget('pick_size', 'design_cover', true)).toBe('design_cover');
  });
  it('even a later forward move is pulled back to the occasion step while none is stored', () => {
    expect(forwardJumpTarget('design_cover', 'upload_photos', false)).toBe('pick_theme');
    expect(forwardJumpTarget('design_cover', 'upload_photos', true)).toBe('upload_photos');
  });
  it('backward moves and a move onto the occasion step itself are untouched', () => {
    expect(forwardJumpTarget('upload_photos', 'pick_size', false)).toBe('pick_size');
    expect(forwardJumpTarget('welcome', 'pick_theme', false)).toBe('pick_theme');
  });
});

describe('advance() itself enforces the occasion', () => {
  it('from a seeded size step with no occasion, advancing lands on the occasion step, not the cover', () => {
    const w = new WizardEngine(builderStub(), false);
    w.state.step = 'pick_size';
    w.advance();
    expect(w.state.step).toBe('pick_theme');
    expect(w.state.completed).toEqual([]); // nothing was marked done on the way
    store[ALBUM_THEME_KEY] = 'Graduation';
    w.state.step = 'pick_size';
    w.advance();
    expect(w.state.step).toBe('design_cover');
    expect(w.state.completed).toEqual(['pick_size']);
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

describe('step 1 also names the album (owner, 2026-09-29) — just as unskippable', () => {
  it('is incomplete without a name even with an occasion stored', () => {
    store[ALBUM_THEME_KEY] = 'Wedding';
    const w = new WizardEngine(builderStub({ albumTitle: '' }), false);
    expect(w.isStepComplete('pick_theme')).toBe(false);
    expect(w.detectStep()).toBe('pick_theme');
  });
  it('advancing from a later step with no name lands back on step 1', () => {
    store[ALBUM_THEME_KEY] = 'Wedding';
    const w = new WizardEngine(builderStub({ albumTitle: '  ' }), false);
    w.state.step = 'pick_size';
    w.advance();
    expect(w.state.step).toBe('pick_theme');
    w.state.step = 'design_cover';
    w.skip();
    expect(w.state.step).toBe('pick_theme');
    expect(w.state.skipped).toEqual([]);
  });
  it('with a name and an occasion the journey goes on to the size', () => {
    store[ALBUM_THEME_KEY] = 'Wedding';
    const w = new WizardEngine(builderStub({ albumTitle: 'Ana & Ben' }), false);
    expect(w.detectStep()).toBe('pick_size');
    w.state.step = 'pick_theme';
    w.advance();
    expect(w.state.step).toBe('pick_size');
  });
  it('the gate needs BOTH', () => {
    expect(isStepOneReady('Ana & Ben', 'Wedding')).toBe(true);
    expect(isStepOneReady('', 'Wedding')).toBe(false);
    expect(isStepOneReady('Ana & Ben', '')).toBe(false);
  });
  it('the message names the album once both are in', () => {
    store[ALBUM_THEME_KEY] = 'Wedding';
    const w = new WizardEngine(builderStub({ albumTitle: '  Ana   &  Ben ' }), false);
    w.state.step = 'pick_theme';
    expect(w.getMessage().body).toContain('**Ana & Ben**');
    const unnamed = new WizardEngine(builderStub({ albumTitle: '' }), false);
    unnamed.state.step = 'pick_theme';
    expect(unnamed.getMessage().body).toMatch(/Give your album a name/);
  });
});

describe('the album name rules', () => {
  it('two characters or more after cleaning', () => {
    expect(isAlbumNameReady('Jo')).toBe(true);
    expect(isAlbumNameReady(' J ')).toBe(false);
    expect(isAlbumNameReady(undefined)).toBe(false);
  });
  it('cleaning collapses whitespace and caps the length', () => {
    expect(cleanAlbumName("  Maria's    Debut ")).toBe("Maria's Debut");
    expect(cleanAlbumName('a'.repeat(100))).toHaveLength(60);
  });
  it('an unnamed album is saved under the old default, never blank', () => {
    expect(albumNameToSave('')).toBe(UNNAMED_ALBUM);
    expect(albumNameToSave(' Our Trip ')).toBe('Our Trip');
  });
});

describe('a returning customer reloads straight onto Review (2026-09-30)', () => {
  /* The engine used to start a returning customer at pick_size (phase setup)
     and only reach review after mount, so the center flipped edit → setup →
     edit in one tick; AnimatePresence mode="wait" then stranded the size
     picker on screen. The panel now reconciles the new engine BEFORE its first
     render reads the step. */
  const filled = { slotFills: [0], photos: [], textElements: [] };
  const album = Array.from({ length: 40 }, () => filled);

  it('a generated album: the engine lands on review, so the first phase is edit', () => {
    const w = new WizardEngine(builderStub({ phase: 'edit', albumPages: album } as unknown as Partial<BuilderActions>), false);
    expect(w.state.step).toBe('pick_size'); // what the constructor alone gives
    expect(w.reconcileForward()).toBe(true);
    expect(w.state.step).toBe('review_pages');
    expect(phaseForStep(w.state.step)).toBe('edit');
    expect(w.state.completed).toEqual(['pick_size', 'design_cover', 'upload_photos']);
  });

  it('never moves backward, and leaves a first visit on welcome', () => {
    const w = new WizardEngine(builderStub({ phase: 'edit' }), false);
    w.state.step = 'review_pages';
    expect(w.reconcileForward()).toBe(false); // an empty album is not a reason to go back
    expect(w.state.step).toBe('review_pages');
    const first = new WizardEngine(builderStub(), true);
    expect(first.reconcileForward()).toBe(false);
    expect(first.state.step).toBe('welcome');
  });
});

describe('the Style step is gone (owner, 2026-09-14)', () => {
  it('seven steps; the cover hands straight to photos', () => {
    expect(WIZARD_ORDER).toEqual(['welcome', 'pick_theme', 'pick_size', 'design_cover', 'upload_photos', 'review_pages', 'add_text', 'finalize']);
    expect(WIZARD_ORDER.length - 1).toBe(7);
    const w = new WizardEngine(builderStub(), false);
    w.state.completed = ['welcome', 'pick_theme', 'pick_size', 'design_cover'];
    store[ALBUM_THEME_KEY] = 'Wedding';
    expect(w.detectStep()).toBe('upload_photos');
    w.state.step = 'design_cover';
    w.advance();
    expect(w.state.step).toBe('upload_photos');
    expect(w.getMessage().title).toMatch(/^Step 4/);
  });
});
