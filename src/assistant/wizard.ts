/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant Wizard — Step-by-step album creation flow
   Guides first-time users from open → finished album

   The engine is a tiny external store (subscribe / getState / immutable
   snapshots) so React reads wizard state through useSyncExternalStore —
   never through a ref during render. The message, progress and detected
   step are PURE functions of (state, builder), computed at render time.
   Every state change is persisted, so a reload resumes the journey at the
   exact step the user left (living memory).
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderActions } from '../pages/builder/useBuilderState';
import type { AlbumSizePreset } from '../pages/builder/types';
import { densityRangeLabel } from '../pages/builder/densities';
import { isSizeOfferable } from '../pages/builder/albumSizeOptions';

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
  | 'pick_size'
  | 'design_cover'
  | 'pick_background'
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
  'pick_size',
  'design_cover',
  'pick_background',
  'upload_photos',
  'review_pages',
  'add_text',
  'finalize',
];

/** Option A: the center screen (builder phase) follows the wizard step.
    One source of truth — the step — so the center and panel can't disagree. */
export function phaseForStep(step: WizardStep): 'setup' | 'edit' | 'cover' | 'preview' {
  if (step === 'welcome' || step === 'pick_size') return 'setup';
  if (step === 'design_cover') return 'cover';
  if (step === 'finalize') return 'preview';
  return 'edit';
}

export const STEP_META: Record<WizardStep, { title: string; description: string; emoji: string }> = {
  welcome: { title: 'Welcome', description: 'Meet Megy and learn the basics', emoji: '👋' },
  pick_size: { title: 'Album Size', description: 'Choose your album dimensions', emoji: '📐' },
  design_cover: { title: 'Cover', description: 'Design the front·spine·back cover', emoji: '📔' },
  pick_background: { title: 'Style', description: 'Background, border & frame', emoji: '🎨' },
  upload_photos: { title: 'Photos', description: 'Upload, then generate', emoji: '📸' },
  review_pages: { title: 'Review', description: 'Fine-tune each page', emoji: '🔍' },
  add_text: { title: 'Text', description: 'Add captions and quotes', emoji: '✍️' },
  finalize: { title: 'Finalize', description: 'Preview and order', emoji: '📦' },
};

/* ── Local storage key ── */
export const WIZARD_STORAGE_KEY = 'megy_wizard_state';

/** A REAL (non-empty) generated album exists. Gating on filled content, not
    just page count, covers both an in-session generate and a reloaded album
    whose completed[] flags were lost — while preventing a freshly reset album
    (exactly 40 EMPTY pages) from counting as generated. */
function hasGeneratedAlbum(builder: BuilderActions): boolean {
  const hasFilledPages = builder.albumPages.some(
    (p) => (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0,
  );
  return builder.albumPages.length >= 40 && hasFilledPages;
}

/* ── Step detection (pure) ──
   Only auto-detect forward when the BUILDER PHASE changes (user clicked
   "Start Creating" in the center screen). During setup, the wizard should
   stay at whatever step the user is actively on. */
export function detectStep(state: WizardState, builder: BuilderActions): WizardStep {
  // Album finalized → finalize
  if (builder.phase === 'preview') return 'finalize';

  // A real generated album exists → review.
  if (hasGeneratedAlbum(builder)) return 'review_pages';

  // After picking a background (or uploading) → the combined upload + generate step
  if (state.completed.includes('pick_background')) return 'upload_photos';

  // Picked size but haven't passed the cover step yet → design the cover
  if (state.completed.includes('pick_size') && !state.completed.includes('design_cover')) {
    return 'design_cover';
  }

  // Cover done (or skipped) → pick background
  if (state.completed.includes('pick_size')) return 'pick_background';

  // Default: start at the size step (its visual is the center size cards)
  return state.isFirstTime && !state.completed.includes('welcome') ? 'welcome' : 'pick_size';
}

/* ── Progress (pure) ── */
export function wizardProgress(state: WizardState): { current: number; total: number; percent: number; label: string } {
  // The "Step N" step titles start counting at pick_size (welcome is an
  // unnumbered intro), so welcome is index 0 and pick_size is "Step 1". Using
  // the raw index keeps the label in sync with the titles (was "6 of 8" above
  // a "Step 5" heading).
  const stepIdx = WIZARD_ORDER.indexOf(state.step); // welcome → 0
  const total = WIZARD_ORDER.length - 1; // numbered steps (welcome excluded)
  const current = stepIdx; // pick_size → 1 … review_pages → 5, matches titles
  const percent = Math.round((Math.max(current, 0) / total) * 100);
  const label = current <= 0 ? "Let's begin" : `Step ${current} of ${total}`;
  return { current, total, percent, label };
}

/* ── Contextual message for the current step (pure) ── */
export function wizardMessage(
  state: WizardState,
  builder: BuilderActions,
): { title: string; body: string; actions: string[]; tips: string[] } {
  const step = state.step;

  switch (step) {
    case 'welcome':
      return {
        title: "Welcome to MegyPrints! 🎉",
        body: "I'm **Megy**, your personal album designer. I'll guide you through creating a beautiful photo album in just a few steps. No design experience needed — just your photos and a few choices!",
        actions: ["Let's Get Started →"],
        tips: ["You can always ask me for help by clicking the chat icon", "I auto-arrange your photos into varied layouts — no design work needed"],
      };

    case 'pick_size':
      return {
        title: "Step 1: Pick Your Album Size 📐",
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
        title: "Step 2: Design Your Cover 📔",
        body: `Give your ${builder.albumSize} album a cover — the front (title, subtitle, hero photo), the spine text, and the back. It prints as one wrap around the book. The hero photo goes on after you upload your photos, but you can set the title and style now. This step is optional — skip it and design the cover later from the Preview screen.`,
        /* The cover editor renders on the center stage (phase 'cover'); its own
           Continue/Back drive the wizard, so no panel actions here. */
        actions: [],
        tips: ["The spine width is set automatically from your page count at checkout", "You can revisit the cover any time from the Preview screen"],
      };

    case 'pick_background':
      return {
        title: "Step 3: Style Your Album 🎨",
        body: `Style your ${builder.albumSize} album — set the background, the photo border, and a decorative frame. Each choice applies to the whole album, and you can fine-tune anything later.`,
        /* Background / Border / Frame controls render on the center stage; each
           dispatches set_background / set_border / set_frame. No text actions. */
        actions: [],
        tips: ["Background = behind the page · Border = the line edge · Frame = around each photo", "You can change any of it later, on any page"],
      };

    case 'upload_photos': {
      const photoCount = builder.uploadedPhotos.length;
      return {
        title: photoCount > 0 ? `Step 4: Photos Uploaded (${photoCount}) 📸` : "Step 4: Upload Your Photos 📸",
        body: photoCount > 0
          ? `Great! You have **${photoCount}** photo${photoCount > 1 ? 's' : ''} ready. Upload more or let's generate your album!`
          : "Upload your photos and I'll auto-arrange them into beautiful layouts. You can upload as many as you want — I'll pick the best ones for each page.",
        actions: photoCount > 0 ? ["Upload More Photos", "Generate Album →"] : ["Upload Photos"],
        tips: ["📱 Upload straight from your phone for the best quality — and I'll auto-sort your photos into pages by the moment they were taken", "I'll match photo ratios to frame shapes automatically"],
      };
    }

    case 'review_pages': {
      const pages = builder.albumPages;
      const usedIdx = pages
        .map((p, i) => ({ i, used: (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0 || p.textElements.length > 0 }))
        .filter((x) => x.used)
        .map((x) => x.i);
      const lastUsed = usedIdx.length ? usedIdx[usedIdx.length - 1] : pages.length - 1;
      const usedCount = usedIdx.length || pages.length;
      const cur = builder.currentPageIndex;
      const filled = builder.currentPage?.slotFills?.filter((f) => f !== null)?.length ?? 0;
      const total = builder.currentPage?.slotFills?.length ?? 0;

      // Reached the last page with content → proactive "let's order" nudge.
      if (cur >= lastUsed) {
        return {
          title: "All Pages Reviewed 🎉",
          body: `You've been through all **${usedCount}** pages — this album looks wonderful. Let's take a look at the finished album! (Or keep tweaking — your call.)`,
          actions: ["Change layout", "Preview the album →", "Review from the start"],
          tips: ["You can keep editing any page before ordering", "Your photos stay on your device until you order"],
        };
      }
      return {
        title: "Step 5: Review Each Page 🔍",
        body: `Your album's ready! Let's look through it before you order — you're on **page ${Math.min(cur, lastUsed) + 1} of ${usedCount}** (${filled}/${total} photos here). Reshuffle this page if you'd like, then use the ‹ › arrows to move through your album.`,
        actions: ["Change layout"],
        tips: ["Go page by page — each can have its own layout", "Use the ‹ › arrows to move between pages", "When every page looks right, you'll order from the last page"],
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
        actions: ["Preview Full Album", "Save to Cloud", "Place Order →"],
        tips: ["Albums are saved automatically", "You can reorder or reprint anytime"],
      };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ENGINE — a subscribable store over WizardState.
   Mutations go through commit(): immutable snapshot swap → persist → notify.
   ══════════════════════════════════════════════════════════════════════════ */

export class WizardEngine {
  private state: WizardState;
  private listeners = new Set<() => void>();

  constructor(isFirstTime: boolean = true) {
    this.state = {
      step: isFirstTime ? 'welcome' : 'pick_size',
      completed: [],
      skipped: [],
      isFirstTime,
    };
  }

  /** Build the engine for a mounting panel: honour an in-flight fresh start,
      otherwise resume the persisted journey (falling back to what the builder
      can actually support if the draft was cleared out from under it). */
  static boot(builder: BuilderActions): WizardEngine {
    try {
      if (sessionStorage.getItem('megy-fresh-start') === '1') return new WizardEngine(false);
    } catch { /* ignore */ }
    let saved: string | null = null;
    try { saved = localStorage.getItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    if (!saved) return new WizardEngine(true);
    try {
      const engine = WizardEngine.deserialize(saved);
      // A resumed post-generate step needs a real album behind it. If the
      // draft is gone (storage wiped, album cleared) drop back to the step
      // the builder state actually supports instead of a dead Review screen.
      const postGenerate: WizardStep[] = ['review_pages', 'add_text', 'finalize'];
      if (postGenerate.includes(engine.state.step) && !hasGeneratedAlbum(builder)) {
        engine.state = { ...engine.state, step: detectStep(engine.state, builder) };
      }
      return engine;
    } catch {
      return new WizardEngine(false);
    }
  }

  /* ── External-store contract (stable identities for useSyncExternalStore) ── */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getState = (): WizardState => this.state;

  /** Swap in a new immutable snapshot, persist it, notify subscribers. */
  private commit(next: WizardState) {
    this.state = next;
    this.persistNow();
    this.listeners.forEach((l) => l());
  }

  /** Write the current journey to localStorage (called on every commit; also
      exposed for explicit saves like dismissing the guide). */
  persistNow() {
    try { localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(this.state)); } catch { /* storage full — ignore */ }
  }

  /** Restart Wizard — wipe the journey back to the very first step (welcome).
      Marks first-time so detectStep() holds at welcome instead of jumping to
      pick_size on the next reconcile. */
  restart() {
    this.commit({ step: 'welcome', completed: [], skipped: [], isFirstTime: true });
  }

  /* ── Advance to next step ── */
  advance() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx < WIZARD_ORDER.length - 1) {
      this.commit({
        ...this.state,
        completed: [...this.state.completed, this.state.step],
        step: WIZARD_ORDER[currentIdx + 1],
      });
    }
  }

  /* ── Skip current step ── */
  skip() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx < WIZARD_ORDER.length - 1) {
      this.commit({
        ...this.state,
        skipped: [...this.state.skipped, this.state.step],
        completed: [...this.state.completed, this.state.step],
        step: WIZARD_ORDER[currentIdx + 1],
      });
    }
  }

  /* ── Go back to previous step ── */
  back() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx > 0) {
      this.commit({ ...this.state, step: WIZARD_ORDER[currentIdx - 1] });
    }
  }

  /** An external writer (the center "Start Creating" button, the cover
      editor's Continue/Back) moved the SHARED step — follow it. Forward jumps
      mark the skipped-over steps complete so detectStep stays consistent. */
  syncFromShared(step: WizardStep) {
    if (step === this.state.step || !WIZARD_ORDER.includes(step)) return;
    const from = WIZARD_ORDER.indexOf(this.state.step);
    const to = WIZARD_ORDER.indexOf(step);
    let completed = this.state.completed;
    if (to > from) {
      completed = [...completed];
      for (let i = from; i < to; i++) {
        if (!completed.includes(WIZARD_ORDER[i])) completed.push(WIZARD_ORDER[i]);
      }
    }
    this.commit({ ...this.state, step, completed });
  }

  /** Reconcile the wizard to reality (FORWARD only) — so a returning user
      with a finished album lands on "Review" instead of the size step. Never
      yanks the user backward mid-setup. */
  reconcileForward(builder: BuilderActions) {
    // Mirror useBuilderState's guards: while a fresh start is in flight the
    // builder still holds the OLD album — reconciling against it would drag
    // a brand-new journey forward onto stale content.
    try {
      if (sessionStorage.getItem('megy-fresh-start') === '1') return;
    } catch { /* ignore */ }
    const detected = detectStep(this.state, builder);
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    const detectedIdx = WIZARD_ORDER.indexOf(detected);
    if (detectedIdx <= currentIdx) return;
    const completed = [...this.state.completed];
    for (let i = currentIdx; i < detectedIdx; i++) {
      if (!completed.includes(WIZARD_ORDER[i])) completed.push(WIZARD_ORDER[i]);
    }
    this.commit({ ...this.state, step: detected, completed });
  }

  /* ── Serialize for storage ── */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  /* ── Deserialize from storage ── */
  static deserialize(data: string): WizardEngine {
    const parsed = JSON.parse(data) as Partial<WizardState>;
    if (!parsed || typeof parsed !== 'object' || !WIZARD_ORDER.includes(parsed.step as WizardStep)) {
      throw new Error('invalid wizard state');
    }
    const engine = new WizardEngine(false);
    engine.state = {
      ...engine.state,
      ...parsed,
      completed: (parsed.completed ?? []).filter((s) => WIZARD_ORDER.includes(s)),
      skipped: (parsed.skipped ?? []).filter((s) => WIZARD_ORDER.includes(s)),
    };
    return engine;
  }
}
