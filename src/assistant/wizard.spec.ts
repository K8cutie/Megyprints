import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WizardEngine, WIZARD_ORDER, STEP_META, phaseForStep, forwardJumpTarget, isStepOneReady, bootWizard, readSavedWizard, WIZARD_STORAGE_KEY, type WizardStep } from './wizard';
import { isAlbumNameReady, albumNameToSave, cleanAlbumName, UNNAMED_ALBUM } from '../lib/albumName';
import { ALBUM_THEME_KEY, isAlbumThemeReady, cleanAlbumTheme } from '../lib/albumTheme';
import { FRESH_START_KEY } from '../lib/albumSession';
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

describe('a reload restores the saved journey (2026-10-02)', () => {
  /* Nothing read the saved state back (deserialize had no caller), and only
     the ✕ ever wrote it. A returning engine restarted at pick_size with
     nothing completed, so a customer with photos in re-walked size → cover →
     upload after every reload. The panel now saves the journey on every step
     change and boots from it (bootWizard). */
  const empty = { slotFills: [], photos: [], textElements: [] };
  const filled = { slotFills: [0], photos: [], textElements: [] };
  const unbuilt = Array.from({ length: 40 }, () => empty);
  const built = Array.from({ length: 40 }, () => filled);
  const photos = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const saved = (state: { step: string; completed?: string[]; skipped?: string[]; isFirstTime?: boolean }) =>
    JSON.stringify({ completed: [], skipped: [], isFirstTime: false, ...state });
  /** The state from the report: the cover is done, the customer is on the upload step. */
  const UPLOAD = saved({ step: 'upload_photos', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover'] });
  /** Photos in, album not generated yet — the builder opens on 'setup'. */
  const notGenerated = (over: Partial<BuilderActions> = {}) =>
    builderStub({ phase: 'setup', albumPages: unbuilt, uploadedPhotos: photos, ...over } as unknown as Partial<BuilderActions>);
  const generated = () =>
    builderStub({ phase: 'edit', albumPages: built, uploadedPhotos: photos } as unknown as Partial<BuilderActions>);
  beforeEach(() => { store[ALBUM_THEME_KEY] = 'Wedding'; });

  it('the reported case: photos in, not generated — the reload lands on the upload card, not the size step', () => {
    const { engine } = bootWizard(notGenerated(), UPLOAD);
    expect(engine.state.step).toBe('upload_photos');
    expect(phaseForStep(engine.state.step)).toBe('edit');
    expect(engine.state.completed).toEqual(['welcome', 'pick_theme', 'pick_size', 'design_cover']);
    expect(engine.getMessage().title).toBe('Step 4: Photos Uploaded (3) 📸');
  });

  it('skipped comes back too — a skipped cover still leads to the upload step', () => {
    const { engine } = bootWizard(notGenerated(), saved({ step: 'upload_photos', completed: ['welcome', 'pick_theme', 'pick_size'], skipped: ['design_cover'] }));
    expect(engine.state.step).toBe('upload_photos');
    expect(engine.state.skipped).toEqual(['design_cover']);
    expect(engine.detectStep()).toBe('upload_photos'); // the flags agree, so a later reconcile holds the step
  });

  it('a reload on the cover step opens the cover', () => {
    const { engine } = bootWizard(notGenerated({ uploadedPhotos: [] }), saved({ step: 'design_cover', completed: ['welcome', 'pick_theme', 'pick_size'] }));
    expect(engine.state.step).toBe('design_cover');
    expect(phaseForStep(engine.state.step)).toBe('cover');
  });

  it('step 1 still guards a restore: no occasion, or no name, lands on it — and nothing after it counts as done', () => {
    delete store[ALBUM_THEME_KEY];
    const noTheme = bootWizard(notGenerated(), UPLOAD).engine;
    expect(noTheme.state.step).toBe('pick_theme');
    expect(noTheme.state.completed).toEqual(['welcome']);
    expect(phaseForStep(noTheme.state.step)).toBe('setup');

    store[ALBUM_THEME_KEY] = 'Wedding';
    const noName = bootWizard(notGenerated({ albumTitle: '' }), UPLOAD).engine;
    expect(noName.state.step).toBe('pick_theme');
    expect(noName.state.completed).toEqual(['welcome']);
    // Answering it walks on to the size step; the old flags don't fling the
    // customer past size and cover.
    noName.builder = notGenerated({ albumTitle: 'Ana & Ben' });
    noName.advance();
    expect(noName.state.step).toBe('pick_size');
    expect(noName.reconcileForward()).toBe(false);
  });

  it('stale flags cannot carry a reconcile past an unanswered step 1', () => {
    // Saved ON step 1 (the customer went back to it) with later steps done.
    delete store[ALBUM_THEME_KEY];
    const { engine } = bootWizard(notGenerated(), saved({ step: 'pick_theme', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover'] }));
    expect(engine.state.step).toBe('pick_theme');
    expect(engine.state.completed).toEqual(['welcome']);
  });

  it('review, text and finalize need a BUILT album — without one the journey resumes at upload', () => {
    for (const step of ['review_pages', 'add_text', 'finalize']) {
      const { engine } = bootWizard(notGenerated(), saved({ step, completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover', 'upload_photos'] }));
      expect(engine.state.step, step).toBe('upload_photos');
    }
  });

  it('keeps #39: a generated album boots onto its own step from ANY save — never through setup', () => {
    for (const answered of [true, false]) {
      if (answered) store[ALBUM_THEME_KEY] = 'Wedding'; else delete store[ALBUM_THEME_KEY];
      for (const step of WIZARD_ORDER) {
        const { engine } = bootWizard(generated(), saved({ step, completed: WIZARD_ORDER.slice(0, WIZARD_ORDER.indexOf(step)) }));
        // Text and finalize are ahead of Review and come back as they were;
        // everything earlier is carried forward to Review. Unanswered step 1
        // does not pull a built album back to setup (the quotes are dealt).
        const expected: WizardStep = answered && (step === 'add_text' || step === 'finalize') ? step : 'review_pages';
        const label = `${step}, step 1 ${answered ? 'answered' : 'unanswered'}`;
        expect(engine.state.step, label).toBe(expected);
        expect(phaseForStep(engine.state.step), label).not.toBe('setup');
      }
    }
  });

  it('anything unreadable falls back safely — a retired step, junk fields, not JSON at all', () => {
    // The Style step (pick_background) was retired 2026-09-14. A save from
    // before then still carries its completed steps forward.
    const retired = bootWizard(notGenerated(), saved({ step: 'pick_background', completed: ['welcome', 'pick_theme', 'pick_size', 'design_cover', 'pick_background'] })).engine;
    expect(retired.state.step).toBe('upload_photos');
    expect(retired.state.completed).not.toContain('pick_background');

    const junk = bootWizard(notGenerated(), JSON.stringify({ step: 42, completed: 'all', skipped: null })).engine;
    expect(junk.state.step).toBe('pick_size'); // a returning customer's start
    expect(junk.state.completed).toEqual([]);
    expect(junk.state.skipped).toEqual([]);

    for (const raw of ['{not json', 'null', '[]', '"upload_photos"']) {
      expect(bootWizard(notGenerated(), raw).engine.state.step, raw).toBe('pick_size');
    }
  });

  it('no save is a first visit; a dismissed card stays dismissed; an old key (only ✕ wrote one) counts as dismissed', () => {
    const first = bootWizard(notGenerated(), null);
    expect(first.engine.state.step).toBe('welcome');
    expect(first.dismissed).toBe(false);

    const onCover = new WizardEngine(notGenerated(), false);
    onCover.state.step = 'design_cover';
    expect(bootWizard(notGenerated(), onCover.serialize(false)).dismissed).toBe(false);
    expect(bootWizard(notGenerated(), onCover.serialize(true)).dismissed).toBe(true);
    expect(bootWizard(notGenerated(), saved({ step: 'design_cover' })).dismissed).toBe(true);
  });

  it('what serialize saves, boot restores — step, completed and skipped', () => {
    const before = new WizardEngine(notGenerated(), true);
    before.advance(); // welcome → pick_theme
    before.advance(); // → pick_size
    before.advance(); // → design_cover
    before.skip();    // cover skipped → upload_photos
    expect(before.state.step).toBe('upload_photos');
    const after = bootWizard(notGenerated(), before.serialize()).engine;
    expect(after.state).toEqual(before.state);
  });

  it('a fresh start (Home → Create New Album) never brings the old journey back', () => {
    store[WIZARD_STORAGE_KEY] = UPLOAD;
    expect(readSavedWizard()).toBe(UPLOAD);
    const s = globalThis as unknown as { sessionStorage?: unknown };
    s.sessionStorage = { getItem: (k: string) => (k === FRESH_START_KEY ? '1' : null) };
    try {
      expect(readSavedWizard()).toBeNull();
      expect(bootWizard(notGenerated(), readSavedWizard()).engine.state.step).toBe('welcome');
    } finally {
      delete s.sessionStorage;
    }
  });

  it('storage that throws (private mode) is a first visit, not a crash', () => {
    g.localStorage = { getItem: () => { throw new Error('denied'); } };
    expect(readSavedWizard()).toBeNull();
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
