/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant Wizard — Step-by-step album creation flow
   Guides first-time users from open → finished album
   ══════════════════════════════════════════════════════════════════════════ */

import type { BuilderActions } from '../pages/builder/useBuilderState';
import { densityRangeLabel } from '../pages/builder/densities';

/* The size step's photos-per-page guidance is DERIVED from DENSITY_BY_SIZE
   (the single source of truth in densities.ts), so it can never disagree with
   the density step. Only the display name + order live here. */
const SIZE_CHOICES: { label: string; preset: string }[] = [
  { label: '6×6" Square', preset: '6x6' },
  { label: '8×8" Square', preset: '8x8' },
  { label: '9×9" Square', preset: '9x9' },
  { label: '6×4" Landscape', preset: '6x4' },
  { label: '11.5×8" Landscape', preset: '11.5x8' },
  { label: '8.5×11" Portrait', preset: '8.5x11' },
];

export type WizardStep =
  | 'welcome'
  | 'pick_size'
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
  'pick_background',
  'upload_photos',
  'review_pages',
  'add_text',
  'finalize',
];

/** Option A: the center screen (builder phase) follows the wizard step.
    One source of truth — the step — so the center and panel can't disagree. */
export function phaseForStep(step: WizardStep): 'setup' | 'edit' | 'preview' {
  if (step === 'welcome' || step === 'pick_size') return 'setup';
  if (step === 'finalize') return 'preview';
  return 'edit';
}

export const STEP_META: Record<WizardStep, { title: string; description: string; emoji: string }> = {
  welcome: { title: 'Welcome', description: 'Meet Megy and learn the basics', emoji: '👋' },
  pick_size: { title: 'Album Size', description: 'Choose your album dimensions', emoji: '📐' },
  pick_background: { title: 'Background', description: 'Pick a color or texture', emoji: '🎨' },
  upload_photos: { title: 'Photos', description: 'Upload, then generate', emoji: '📸' },
  review_pages: { title: 'Review', description: 'Fine-tune each page', emoji: '🔍' },
  add_text: { title: 'Text', description: 'Add captions and quotes', emoji: '✍️' },
  finalize: { title: 'Finalize', description: 'Preview and order', emoji: '📦' },
};

export class WizardEngine {
  state: WizardState;
  builder: BuilderActions;

  constructor(builder: BuilderActions, isFirstTime: boolean = true) {
    this.builder = builder;
    this.state = {
      step: isFirstTime ? 'welcome' : 'pick_size',
      completed: [],
      skipped: [],
      isFirstTime,
    };
  }

  /** Restart Wizard — wipe the journey back to the very first step (welcome).
      Marks first-time so detectStep() holds at welcome instead of jumping to
      pick_size on the next reconcile. */
  restart() {
    this.state.step = 'welcome';
    this.state.completed = [];
    this.state.skipped = [];
    this.state.isFirstTime = true;
  }

  /* ── Step detection ──
     Only auto-detect forward when the BUILDER PHASE changes (user clicked
     "Start Creating" in the center screen). During setup, the wizard should
     stay at whatever step the user is actively on. */
  detectStep(): WizardStep {
    const { builder } = this;

    // Album finalized → finalize
    if (builder.phase === 'preview') return 'finalize';

    // If a REAL (non-empty) album exists → review. Gating on filled content,
    // not just page count, covers both an in-session generate and a reloaded
    // album whose completed[] flags were lost — while preventing a freshly
    // reset album (exactly 40 EMPTY pages) from dumping the user onto Review.
    const hasFilledPages = builder.albumPages.some(
      (p) => (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0,
    );
    if (builder.albumPages.length >= 40 && hasFilledPages) {
      return 'review_pages';
    }

    // After picking a background (or uploading) → the combined upload + generate step
    if (this.state.completed.includes('pick_background')) {
      return 'upload_photos';
    }

    // If user explicitly picked size → pick background
    if (this.state.completed.includes('pick_size')) {
      return 'pick_background';
    }

    // Default: start at the size step (its visual is the center size cards)
    return this.state.isFirstTime && !this.state.completed.includes('welcome') ? 'welcome' : 'pick_size';
  }

  /* ── Advance to next step ── */
  advance() {
    const currentIdx = WIZARD_ORDER.indexOf(this.state.step);
    if (currentIdx < WIZARD_ORDER.length - 1) {
      this.state.completed.push(this.state.step);
      this.state.step = WIZARD_ORDER[currentIdx + 1];
    }
  }

  /* ── Skip current step ── */
  skip() {
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
      case 'pick_size': return false; // Must click a size in wizard
      case 'pick_background': return false; // Must click a background
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

      case 'pick_size':
        return {
          title: "Step 1: Pick Your Album Size 📐",
          body: `What size fits your photos best? Bigger albums comfortably hold more photos per page — smaller ones look their best with just one or two, so they never turn into a wall of thumbnails. Right now it's **${builder.albumSize}**.`,
          /* Derived from DENSITY_BY_SIZE so the size step and the density step
             can never disagree (see densities.ts). */
          actions: SIZE_CHOICES.map((s) => `${s.label} — ${densityRangeLabel(s.preset)} photos per page`),
          tips: ["Fewer photos per page on a small album keeps each one crisp, not crowded", "You can change the size anytime"],
        };

      case 'pick_background':
        return {
          title: "Step 2: Pick a Theme 🎨",
          body: `Pick a theme for your **${builder.albumSize}** album. Each theme styles the whole album for you — background, photo frames, and decorative touches — so it reads as the right occasion. You can fine-tune anything later.`,
          /* The theme grid is rendered directly on the center stage; selecting a
             theme dispatches apply_theme. No text actions needed here. */
          actions: [],
          tips: ["A theme sets the whole look — background, frames, and corner art", "Pick the closest occasion; you can still tweak colors after"],
        };

      case 'upload_photos':
        const photoCount = builder.uploadedPhotos.length;
        return {
          title: photoCount > 0 ? `Step 3: Photos Uploaded (${photoCount}) 📸` : "Step 3: Upload Your Photos 📸",
          body: photoCount > 0
            ? `Great! You have **${photoCount}** photo${photoCount > 1 ? 's' : ''} ready. Upload more or let's generate your album!`
            : "Upload your photos and I'll auto-arrange them into beautiful layouts. You can upload as many as you want — I'll pick the best ones for each page.",
          actions: photoCount > 0 ? ["Upload More Photos", "Generate Album →"] : ["Upload Photos"],
          tips: ["📱 Upload straight from your phone for the best quality — and I'll auto-sort your photos into pages by the moment they were taken", "I'll match photo ratios to frame shapes automatically"],
        };

      case 'review_pages': {
        const pages = builder.albumPages;
        const usedIdx = pages
          .map((p, i) => ({ i, used: (p.slotFills?.some((f: any) => f != null) ?? false) || p.photos.length > 0 || p.textElements.length > 0 }))
          .filter((x) => x.used)
          .map((x) => x.i);
        const lastUsed = usedIdx.length ? usedIdx[usedIdx.length - 1] : pages.length - 1;
        const usedCount = usedIdx.length || pages.length;
        const cur = builder.currentPageIndex;
        const filled = (builder.currentPage?.slotFills?.filter((f: any) => f !== null)?.length) ?? 0;
        const total = (builder.currentPage?.slotFills?.length) ?? 0;

        // Reached the last page with content → proactive "let's order" nudge.
        if (cur >= lastUsed) {
          return {
            title: "All Pages Reviewed 🎉",
            body: `You've been through all **${usedCount}** pages — this album looks wonderful. Let's take a look at the finished album! (Or keep tweaking — your call.)`,
            actions: ["Shuffle This Page", "Preview the album →", "Review from the start"],
            tips: ["You can keep editing any page before ordering", "Your photos stay on your device until you order"],
          };
        }
        return {
          title: "Step 4: Review Each Page 🔍",
          body: `Your album's ready! Let's look through it before you order — you're on **page ${Math.min(cur, lastUsed) + 1} of ${usedCount}** (${filled}/${total} photos here). Reshuffle this page if you'd like, then use the ‹ › arrows to move through your album.`,
          actions: ["Shuffle This Page"],
          tips: ["Go page by page — each can have its own layout", "Use the ‹ › arrows to move between pages", "When every page looks right, you'll order from the last page"],
        };
      }

      case 'add_text':
        return {
          title: "Step 5: Add Text & Captions ✍️",
          body: "Personalize your album with captions, dates, quotes, or titles. Click any page to add text elements, then style them with fonts, colors, and effects.",
          actions: ["Add Text to This Page", "Add Date Stamp", "Skip to Finalize →"],
          tips: ["Script fonts look great for quotes", "Bold + large size = perfect titles"],
        };

      case 'finalize':
        return {
          title: "Step 6: Preview & Order 📦",
          body: "Your album looks amazing! Preview the full album, make any final tweaks, then place your order. I'll save everything to the cloud so you can come back anytime.",
          actions: ["Preview Full Album", "Save to Cloud", "Place Order →"],
          tips: ["Albums are saved automatically", "You can reorder or reprint anytime"],
        };
    }
  }

  /* ── Serialize for storage ── */
  serialize(): string {
    return JSON.stringify(this.state);
  }

  /* ── Deserialize from storage ── */
  static deserialize(data: string, builder: BuilderActions): WizardEngine {
    const parsed = JSON.parse(data);
    const engine = new WizardEngine(builder, false);
    engine.state = { ...engine.state, ...parsed };
    return engine;
  }
}

/* ── Local storage key ── */
export const WIZARD_STORAGE_KEY = 'megy_wizard_state';
