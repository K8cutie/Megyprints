/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant Wizard — Step-by-step album creation flow
   Guides first-time users from open → finished album
   ══════════════════════════════════════════════════════════════════════════ */

import { readAlbumTheme, isAlbumThemeReady } from '../lib/albumTheme';
import { cleanAlbumName, isAlbumNameReady } from '../lib/albumName';
import { FRESH_START_KEY } from '../lib/albumSession';
import type { BuilderActions } from '../pages/builder/useBuilderState';
import type { AlbumSizePreset } from '../pages/builder/types';
import { densityRangeLabel } from '../pages/builder/densities';
import { MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy, photoWord, addMoreLabel } from '../pages/builder/albumMinimum';
import { isSizeOfferable } from '../pages/builder/albumSizeOptions';
import { Capacitor } from '@capacitor/core';

/* The size step's photos-per-page guidance is DERIVED from DENSITY_BY_SIZE
   (the single source of truth in densities.ts), so it can never disagree with
   the density step. Only the display name + order live here. */
const SIZE_CHOICES: { label: string; preset: string }[] = [
  { label: '6×6" Square', preset: '6x6' },
  { label: '8×8" Square', preset: '8x8' },
  { label: '9×9" Square', preset: '9x9' },
  { label: '6×4" Landscape', preset: '6x4' },
  { label: '8×6" Landscape', preset: '8x6' },
  { label: '6×8" Portrait', preset: '6x8' },
  { label: '11.5×8" Landscape', preset: '11.5x8' },
  { label: '8.5×11" Portrait', preset: '8.5x11' },
];

export type WizardStep =
  | 'welcome'
  | 'pick_theme'
  | 'pick_size'
  | 'design_cover'
  | 'upload_photos'
  | 'review_pages'
  | 'add_text'
  | 'finalize';

export interface WizardState {
  step: WizardStep;
  completed: WizardStep[];
  skipped: WizardStep[];
  isFirstTime: boolean;
}

/* Option A — the wizard is the single source of truth for the journey.
   'pick_size' is the FIRST real step: the big center size cards are simply
   the visual for it (they dispatch change_size through Megy). The builder
   phase (setup/edit/preview) is DERIVED from the step via phaseForStep(). */
export const WIZARD_ORDER: WizardStep[] = [
  'welcome',
  'pick_theme',   // unskippable — the album's name + the occasion (seeds the AI quotes)
  'pick_size',
  'design_cover',
  'upload_photos',
  'review_pages',
  'add_text',
  'finalize',
];

/** Option A: the center screen (builder phase) follows the wizard step.
    One source of truth — the step — so the center and panel can't disagree. */
export function phaseForStep(step: WizardStep): 'setup' | 'edit' | 'cover' | 'preview' {
  if (step === 'welcome' || step === 'pick_theme' || step === 'pick_size') return 'setup';
  if (step === 'design_cover') return 'cover';
  if (step === 'finalize') return 'preview';
  return 'edit';
}

export const STEP_META: Record<WizardStep, { title: string; description: string; emoji: string }> = {
  welcome: { title: 'Welcome', description: 'Meet Megy and learn the basics', emoji: '👋' },
  pick_theme: { title: 'Name & occasion', description: 'The album’s name, and what it is about — seeds the quotes', emoji: '💌' },
  pick_size: { title: 'Album Size', description: 'Choose your album dimensions', emoji: '📐' },
  design_cover: { title: 'Cover', description: 'Design the front·spine·back cover', emoji: '📔' },
  upload_photos: { title: 'Photos', description: 'Upload, then generate', emoji: '📸' },
  review_pages: { title: 'Review', description: 'Fine-tune each page', emoji: '🔍' },
  add_text: { title: 'Text', description: 'Add captions and quotes', emoji: '✍️' },
  finalize: { title: 'Finalize', description: 'Preview and order', emoji: '📦' },
};

/**
 * Where an external forward jump (the size page's "Start Creating", the cover
 * editor's Continue) actually lands. The first step (name + occasion) is
 * unskippable, so a forward jump that would end past it while it is unanswered
 * lands on it. Backward moves are returned unchanged.
 */
export function forwardJumpTarget(from: WizardStep, to: WizardStep, stepOneReady: boolean): WizardStep {
  const f = WIZARD_ORDER.indexOf(from), t = WIZARD_ORDER.indexOf(to), g = WIZARD_ORDER.indexOf('pick_theme');
  // Wherever the engine THINKS it is, a forward move that ends past the
  // first step while it is unanswered goes to the first step.
  if (t > f && t > g && !stepOneReady) return 'pick_theme';
  return to;
}

/** Step 1 is answered: the album has a name AND an occasion. The one gate the
 *  engine, Megy's panel and the size-page backstop all share. */
export function isStepOneReady(albumTitle: string | null | undefined, theme: string = readAlbumTheme()): boolean {
  return isAlbumNameReady(albumTitle) && isAlbumThemeReady(theme);
}

/** A step action drawn as the big filled button: the one that moves the
 *  customer on. "Upload Photos" has no → but it is the only way on from an
 *  empty upload step, and a pale cream button there read as a dead end. */
/** The upload step's way on while short of the 40-photo minimum ("Add 26 more photos"). */
const ADD_MORE = /^Add \d+ more photos?$/;
/** Step 4 with a made album: the way on, and the choice to start the pages over. */
export const KEEP_PAGES = 'Keep my pages →';
export const REMAKE_ALBUM = 'Make the album again';

export function isPrimaryAction(action: string): boolean {
  return action.includes('→') || action.includes('Now') || action === 'Upload Photos' || ADD_MORE.test(action);
}

export class WizardEngine {
  state: WizardState;
  builder: BuilderActions;
  /** Whether the album was built the last time reconcileOnChange() looked. */
  private albumWasBuilt: boolean;

  constructor(builder: BuilderActions, isFirstTime: boolean = true) {
    this.builder = builder;
    this.state = {
      step: isFirstTime ? 'welcome' : 'pick_size',
      completed: [],
      skipped: [],
      isFirstTime,
    };
    this.albumWasBuilt = this.hasBuiltAlbum();
  }

  /** Restart Wizard — wipe the journey back to the very first step (welcome).
      Marks first-time so detectStep() holds at welcome instead of jumping to
      pick_size. */
  restart() {
    this.state.step = 'welcome';
    this.state.completed = [];
    this.state.skipped = [];
    this.state.isFirstTime = true;
  }

  /* ── Step detection ──
     Where the journey stands from the album AND the completed/skipped flags.
     It places a restored journey whose saved step can't be used. It never
     moves a live journey: that is reconcileForward(), which follows only the
     album and the screen. */
  detectStep(): WizardStep {
    const { builder } = this;

    // Album finalized → finalize
    if (builder.phase === 'preview') return 'finalize';

    // A REAL album exists → review.
    if (this.hasBuiltAlbum()) return 'review_pages';

    // Cover done (or skipped) → the combined upload + generate step.
    // (The Style step — background / border / frame — was removed 2026-09-14:
    // pages are plain white, and Studio holds the per-page tools.)
    if (this.state.completed.includes('design_cover') || this.state.skipped.includes('design_cover')) {
      return 'upload_photos';
    }

    // Picked size but haven't passed the cover step yet → design the cover
    if (this.state.completed.includes('pick_size')) {
      return 'design_cover';
    }

    // Default: welcome on a first visit; then the NAME + OCCASION step until it
    // is answered (unskippable); then the size step (its visual is the center cards).
    if (this.state.isFirstTime && !this.state.completed.includes('welcome')) return 'welcome';
    return this.stepOneReady() ? 'pick_size' : 'pick_theme';
  }

  private stepOneReady(): boolean {
    return isStepOneReady(this.builder.albumTitle);
  }

  /* A REAL (non-empty) album exists. Gating on filled content, not just page
     count, covers both an in-session generate and a reloaded album whose
     completed[] flags were lost — while preventing a freshly reset album
     (exactly 40 EMPTY pages) from dumping the user onto Review. */
  hasBuiltAlbum(): boolean {
    const pages = this.builder.albumPages;
    return pages.length >= 40 && pages.some(
      (p) => (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0,
    );
  }

  /* ── Reconcile FORWARD to reality ──
     Only reality moves the journey on: the preview is open → finalize; a
     built album → review. Never the completed/skipped flags. Every forward
     move (Next, a size pick, Continue) sets the step itself, so the step only
     sits behind its own flags after the customer went BACK — and reading the
     flags there flung them forward again: ← Previous on the upload step
     flashed the cover and bounced straight back. Marks the steps in between
     complete; never moves backward. Returns whether the step moved. */
  reconcileForward(): boolean {
    const target: WizardStep | null =
      this.builder.phase === 'preview' ? 'finalize'
      : this.hasBuiltAlbum() ? 'review_pages'
      : null;
    if (!target) return false;
    const from = WIZARD_ORDER.indexOf(this.state.step);
    const to = WIZARD_ORDER.indexOf(target);
    if (to <= from) return false;
    for (let i = from; i < to; i++) {
      if (!this.state.completed.includes(WIZARD_ORDER[i])) this.state.completed.push(WIZARD_ORDER[i]);
    }
    this.state.step = target;
    return true;
  }

  /* ── The screen or the album changed ──
     The panel calls this whenever the builder's phase or the album's built
     state changes. The screen follows the step (phaseForStep), so a screen
     the CURRENT step asks for is the wizard's own move — ← Previous, Next,
     the cover editor's Continue / ← Back — and the step the customer chose
     stands, built album or not. Reality moves it on only when the screen
     changed WITHOUT the step (the preview opened from the pages, a saved
     album loaded) or an album was just built. Returns whether it moved. */
  reconcileOnChange(): boolean {
    const built = this.hasBuiltAlbum();
    const justBuilt = built && !this.albumWasBuilt;
    this.albumWasBuilt = built;
    if (!justBuilt && this.builder.phase === phaseForStep(this.state.step)) return false;
    return this.reconcileForward();
  }

  /* ── Advance to next step ── */
  advance() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx < WIZARD_ORDER.length - 1) {
      const next = WIZARD_ORDER[currentIdx + 1];
      // The first step is unskippable from EVERY direction: whatever step the
      // engine is on (a seeded state, an old draft, a dismissed card), a move
      // that would end past it while it is unanswered lands on it.
      const target = forwardJumpTarget(this.state.step, next, this.stepOneReady());
      if (target !== next) { this.state.step = target; return; }
      // Once: after ← Previous the step being left can already be complete.
      if (!this.state.completed.includes(this.state.step)) this.state.completed.push(this.state.step);
      this.state.step = next;
    }
  }

  /* ── Skip current step ── */
  skip() {
    if (this.state.step === 'pick_theme') return; // unskippable by design
    const idx = WIZARD_ORDER.indexOf(this.state.step);
    const next = WIZARD_ORDER[Math.min(idx + 1, WIZARD_ORDER.length - 1)];
    // A skip that would end past the first step while it is unanswered is not
    // a skip - it lands on the first step and records nothing.
    if (forwardJumpTarget(this.state.step, next, this.stepOneReady()) !== next) {
      this.state.step = 'pick_theme';
      return;
    }
    this.state.skipped.push(this.state.step);
    this.advance();
  }

  /* ── Go back to previous step ── */
  back() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx > 0) {
      this.state.step = WIZARD_ORDER[currentIdx - 1];
    }
  }

  /* ── The card's footer: ← Previous and Next → ──
     One way on per screen (tester, 2026-10-04): an eager tester tapped Next on
     every screen instead of what the screen asked. So Next shows only where
     it IS the way on. On Welcome "Let's Get Started →" is; on the size step
     the sizes are (Next skipped the choice and kept 8×8) until one was picked;
     on the upload step Generate is, until an album is built. Step 1's Next
     stays: it is the way on there, and the panel turns a tap before the step
     is answered into a pointer at what is missing. Welcome has nothing to go
     back to, so no ← Previous at all rather than a greyed one.
     After that: the cover editor has its own "← Back" and "Continue to
     photos →", so Megy shows neither. Review moves on by "Next page" under
     the page; Megy's Next there skipped every page to Step 6. Preview & Order
     is the last step, and a greyed Next there was the same dead tap. */
  showsPrevious(): boolean {
    return this.state.step !== 'welcome' && this.state.step !== 'design_cover';
  }

  showsNext(): boolean {
    switch (this.state.step) {
      case 'welcome': return false;
      case 'pick_size': return this.state.completed.includes('pick_size');
      case 'design_cover': return false;
      // A made album with its photos: the card's "Keep my pages →" is the way
      // on, so no second Next beside it. Made but short of photos (some left
      // out since): Next is the way back to the pages.
      case 'upload_photos': return this.hasBuiltAlbum() && photosShortBy(photosGoingIn(this.builder.uploadedPhotos)) > 0;
      case 'review_pages': return false;
      case 'finalize': return false;
      default: return true;
    }
  }

  /* ── Check if step is complete ──
     A step is complete ONLY if the user explicitly advanced through it
     via the wizard buttons. Builder defaults do NOT count. */
  isStepComplete(step: WizardStep): boolean {
    // Explicitly completed or skipped
    if (this.state.completed.includes(step)) return true;
    if (this.state.skipped.includes(step)) return true;

    const { builder } = this;
    switch (step) {
      case 'welcome': return true; // Auto-complete
      case 'pick_theme': return this.stepOneReady(); // Name + occasion — never skipped
      case 'pick_size': return false; // Must click a size in wizard
      case 'design_cover': return true; // Optional — always proceedable
      // Combined upload + generate: "complete" only once the album is generated,
      // so Next can't skip past generation.
      case 'upload_photos': return builder.albumPages.length >= 40;
      case 'review_pages': return this.state.completed.includes('review_pages');
      case 'add_text': return this.state.completed.includes('add_text');
      case 'finalize': return builder.phase === 'preview';
      default: return false;
    }
  }

  /* ── Get progress ── */
  getProgress(): { current: number; total: number; percent: number; label: string } {
    // The "Step N" step titles start counting at pick_size (welcome is an
    // unnumbered intro), so welcome is index 0 and pick_size is "Step 1". Using
    // the raw index keeps the label in sync with the titles (was "6 of 8" above
    // a "Step 5" heading).
    const stepIdx = WIZARD_ORDER.indexOf(this.state.step); // welcome → 0
    const total = WIZARD_ORDER.length - 1; // numbered steps (welcome excluded)
    const current = stepIdx; // pick_size → 1 … review_pages → 5, matches titles
    const percent = Math.round((Math.max(current, 0) / total) * 100);
    const label = current <= 0 ? "Let's begin" : `Step ${current} of ${total}`;
    return { current, total, percent, label };
  }

  /* ── Get contextual message for current step ── */
  getMessage(): { title: string; body: string; actions: string[]; tips: string[] } {
    const { builder } = this;
    const step = this.state.step;

    switch (step) {
      case 'welcome':
        return {
          title: "Welcome to MegyPrints! 🎉",
          body: "I'm **Megy**, your personal album designer. I'll guide you through creating a beautiful photo album in just a few steps. No design experience needed — just your photos and a few choices!",
          actions: ["Let's Get Started →"],
          tips: ["You can always ask me for help by clicking the chat icon", "I auto-arrange your photos into varied layouts — no design work needed"],
        };

      case 'pick_theme': {
        const t = readAlbumTheme();
        const name = cleanAlbumName(builder.albumTitle);
        return {
          title: "Step 1: Name Your Album 💌",
          body: this.stepOneReady()
            ? `**${name}** — an album about **${t}**. Megy writes the quotes on your pages to match. Change either one here any time.`
            : "Give your album a name — it's how you'll find it again in Your Projects. Then pick the occasion: Megy writes the quotes on your pages to match it, so this step can't be skipped.",
          /* Name box, occasion chips + free text render on the center stage (AlbumThemeStep). */
          actions: [],
          tips: ["When you come back, Megy asks if you want to pick up this album where you left off", "Quotes are 60 % of the little boxes Megy deals into your album — the occasion is what they're about"],
        };
      }

      case 'pick_size':
        return {
          title: "Step 2: Pick Your Album Size 📐",
          body: `What size fits your photos best? Bigger albums comfortably hold more photos per page — smaller ones look their best with just one or two, so they never turn into a wall of thumbnails. Right now it's **${builder.albumSize}**.`,
          /* Derived from DENSITY_BY_SIZE so the size step and the density step
             can never disagree (see densities.ts). Sizes the store has switched
             off — or that have no layouts to build with — are hidden. */
          actions: SIZE_CHOICES
            .filter((s) => isSizeOfferable(s.preset as AlbumSizePreset))
            .map((s) => `${s.label} — ${densityRangeLabel(s.preset)} photos per page`),
          tips: ["Fewer photos per page on a small album keeps each one crisp, not crowded", "You can change the size anytime"],
        };

      case 'design_cover':
        return {
          title: "Step 3: Design Your Cover 📔",
          body: `Give your ${builder.albumSize} album a cover — the front (title, subtitle, hero photo), the spine text, and the back. It prints as one wrap around the book. The hero photo goes on after you upload your photos, but you can set the title and style now. This step is optional — tap **Continue to photos** to skip it and design the cover later from the Preview screen.`,
          /* The cover editor renders on the center stage (phase 'cover'); its own
             Continue/Back drive the wizard, so no panel actions here. */
          actions: [],
          tips: ["The spine width is set automatically from your page count at checkout", "You can revisit the cover any time from the Preview screen"],
        };

      case 'upload_photos': {
        // The photos that go in: ones left out by Megy's photo check don't count.
        const photoCount = photosGoingIn(builder.uploadedPhotos);
        // HARD GATE (albumMinimum): no Generate until 40 photos are going in.
        // The way on is then "Add N more photos" — never a dead Generate.
        const short = photosShortBy(photoCount);
        // Already made: keeping the pages is the way on. "Generate Album →"
        // (the filled button) used to lay every page out again without a word,
        // wiping placed video memories and edits (1-star testers round 3).
        if (short === 0 && this.hasBuiltAlbum()) {
          return {
            title: `Step 4: Photos Uploaded (${photoCount}) 📸`,
            body: `Your album is made. **Keep my pages** to carry on with it, or **make the album again** to lay out every page from your photos from scratch.`,
            actions: ["Upload More Photos", KEEP_PAGES, REMAKE_ALBUM],
            tips: ["Making the album again replaces your layout changes, the text you wrote and any video memories you placed. Megy asks first"],
          };
        }
        return {
          title: photoCount > 0 ? `Step 4: Photos Uploaded (${photoCount}) 📸` : "Step 4: Upload Your Photos 📸",
          body: photoCount === 0
            ? `Upload your photos and I'll arrange them into pages. Albums need at least **${MIN_ALBUM_PHOTOS} photos**, one for every page — and you can add as many more as you like.`
            : short > 0
              ? `You have **${photoCount}** ${photoWord(photoCount)}. Albums need at least **${MIN_ALBUM_PHOTOS}**, one for every page: add **${short} more** to make your album.`
              : `Great! You have **${photoCount}** photos ready. Upload more or let's generate your album!`,
          actions: photoCount === 0 ? ["Upload Photos"] : short > 0 ? [addMoreLabel(short)] : ["Upload More Photos", "Generate Album →"],
          tips: [
            // Android app: the Files picker has no photo cap but hides "Select all" in its ⋮ menu.
            ...(Capacitor.isNativePlatform() ? ["📂 Lots of photos? In the picker tap ☰ → Images → open a folder → ⋮ → Select all"] : []),
            "📱 Upload straight from your phone for the best quality — and I'll auto-sort your photos into pages by the moment they were taken", "I'll match photo ratios to frame shapes automatically",
            // Photos never go to the cloud before an order (photoPresence) — say so up front.
            "🔒 Your photos stay on this device until you order. To finish on another device, add the same photos there and I'll put each one back in its place"],
        };
      }

      case 'review_pages': {
        const pages = builder.albumPages;
        // ONE page count everywhere: the album's pages, as the editor ("Page 3
        // of 40"), the page turn and the print count them. Counting only pages
        // with photos or text said "page 3 of 38" beside it (1-star testers,
        // 2026-10-04) and called the album reviewed two pages early.
        const pageCount = pages.length;
        const lastPage = Math.max(0, pageCount - 1);
        const cur = builder.currentPageIndex;
        const filled = (builder.currentPage?.slotFills?.filter((f: any) => f !== null)?.length) ?? 0;
        const total = (builder.currentPage?.slotFills?.length) ?? 0;

        // Reached the last page with content → proactive "let's order" nudge.
        if (cur >= lastPage) {
          return {
            title: "All Pages Reviewed 🎉",
            body: `You've been through all **${pageCount}** pages — this album looks wonderful. Let's take a look at the finished album! (Or keep tweaking — your call.)`,
            actions: ["Change layout", "Preview the album →", "Review from the start"],
            tips: ["You can keep editing any page before ordering", "Your photos stay on your device until you order"],
          };
        }
        return {
          title: "Step 5: Review Each Page 🔍",
          body: `Your album's ready! Let's look through it before you order — you're on **page ${Math.min(cur, lastPage) + 1} of ${pageCount}** (${filled}/${total} photos here). Reshuffle this page if you'd like, then tap **Next page** under the page to move through your album.`,
          actions: ["Change layout"],
          tips: ["Go page by page — each can have its own layout", "🎬 Any full-photo page can carry a video: tap Add a video memory and it plays when the printed QR is scanned — 7 are included", "When every page looks right, you'll order from the last page"],
        };
      }

      case 'add_text':
        return {
          title: "Step 6: Add Text & Captions ✍️",
          body: "Personalize your album with captions, dates, quotes, or titles. Click any page to add text elements, then style them with fonts, colors, and effects.",
          actions: ["Add Text to This Page", "Add Date Stamp", "Skip to Finalize →"],
          tips: ["Script fonts look great for quotes", "Bold + large size = perfect titles"],
        };

      case 'finalize':
        return {
          title: "Step 7: Preview & Order 📦",
          body: "Your album looks amazing! Preview the full album, make any final tweaks, then place your order. I'll save everything to the cloud so you can come back anytime.",
          actions: ["Preview Full Album", "← Edit pages", "Save to Cloud", "Place Order →"],
          tips: ["Albums are saved automatically", "You can reorder or reprint anytime"],
        };
    }
  }

  /* ── Serialize for storage ──
     The panel saves this on every step change, plus whether the guided card
     was dismissed (✕), so a reload picks the journey up where it was. */
  serialize(dismissed = false): string {
    return JSON.stringify({ ...this.state, dismissed });
  }

  /* ── Deserialize from storage ──
     The saved step, completed and skipped come back as they were. A step
     that can't be read (junk, a retired step) falls back to where the
     completed steps point — a returning customer's start when there are
     none. Two rules hold on the way in:
       • review, text and finalize are about a BUILT album. Without one the
         journey resumes where its completed steps point (upload, usually).
       • the first step is unskippable. A restore is a jump from the start of
         the journey, so while the name + occasion are unanswered it lands on
         them, and nothing after them counts as done — or the next reconcile
         would carry the customer straight past them on the old flags. */
  static deserialize(data: string, builder: BuilderActions): WizardEngine {
    const saved = parseSaved(data);
    const steps = (v: unknown): WizardStep[] => (Array.isArray(v) ? v.filter(isWizardStep) : []);
    const engine = new WizardEngine(builder, false);
    engine.state = {
      step: engine.state.step,
      completed: steps(saved.completed),
      skipped: steps(saved.skipped),
      isFirstTime: saved.isFirstTime === true,
    };
    const { state } = engine;
    state.step = isWizardStep(saved.step) ? saved.step : engine.detectStep();
    if (WIZARD_ORDER.indexOf(state.step) > WIZARD_ORDER.indexOf('upload_photos') && !engine.hasBuiltAlbum()) {
      state.step = engine.detectStep();
    }
    if (!engine.stepOneReady()) {
      state.step = forwardJumpTarget('welcome', state.step, false);
      state.completed = state.completed.filter((s) => s === 'welcome');
      state.skipped = state.skipped.filter((s) => s === 'welcome');
    }
    return engine;
  }
}

function isWizardStep(v: unknown): v is WizardStep {
  return WIZARD_ORDER.includes(v as WizardStep);
}

/** The saved object, or {} for anything that is not one. Never throws. */
function parseSaved(data: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(data);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* ── Local storage key ── */
export const WIZARD_STORAGE_KEY = 'megy_wizard_state';

/** What a previous visit saved, or null for a first visit. Also null when the
 *  customer just asked for a NEW album (Home → Create New Album): the builder
 *  resets on mount, and the old album's journey must not come back with it. */
export function readSavedWizard(): string | null {
  try {
    if (sessionStorage.getItem(FRESH_START_KEY) === '1') return null;
  } catch { /* no sessionStorage: not a fresh start */ }
  try {
    return localStorage.getItem(WIZARD_STORAGE_KEY);
  } catch {
    return null; // storage blocked: this visit starts like a first one
  }
}

/**
 * The panel's engine on mount: the saved journey when there is one, a first
 * visit's otherwise — then reconciled FORWARD to the album (a generated album
 * moves on to Review) before the first render reads its step. Also returns
 * whether the guided card was dismissed. Until every step was saved, the ✕
 * was the only thing that wrote the key, so a save without the flag counts
 * as a dismissal.
 */
export function bootWizard(builder: BuilderActions, saved: string | null): { engine: WizardEngine; dismissed: boolean } {
  const engine = saved == null ? new WizardEngine(builder, true) : WizardEngine.deserialize(saved, builder);
  engine.reconcileForward();
  if (saved == null) return { engine, dismissed: false };
  const { dismissed } = parseSaved(saved);
  return { engine, dismissed: typeof dismissed === 'boolean' ? dismissed : true };
}
