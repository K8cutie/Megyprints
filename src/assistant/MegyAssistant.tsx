/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Centerpiece Control Panel
   The primary interface for the album builder. Replaces the sidebar.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBuilderContext } from '../pages/builder/BuilderContext';
import { parseIntent } from './intentParser';
import { WIZARD_STORAGE_KEY, WIZARD_ORDER, phaseForStep, forwardJumpTarget, isStepOneReady, isPrimaryAction, bootWizard, readSavedWizard } from './wizard';
import { analyzePhotos, recommendSizeForRatio, ratioLabel } from '../pages/builder/photoAnalyzer';
import RichBackgroundDesigner from '../pages/builder/BackgroundDesigner';
import { DENSITY_BY_SIZE, DENSITY_LABELS, MIN_ALBUM_PAGES, perPageNote } from '../pages/builder/densities';
import { MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy, tooFewToMakeMessage } from '../pages/builder/albumMinimum';
import { memoryShortfall, MIN_MEMORY_PAGES } from '../pages/builder/generateAlbum';
import { offerableAlbumSizes } from '../pages/builder/albumSizeOptions';
import { SIZE_LABELS } from '../lib/pricing';
import type { AssistantMessage, AssistantIntent } from './types';
import { rebuildQuestion } from './rebuildQuestion';
import type { TemplateType, TextElement, CanvasPhoto, PhotoFilters, AlbumBackground } from '../pages/builder/types';
import { getThemeBackgroundVariants } from '../pages/builder/types';
import { suggestThemeFromPhotos } from '../pages/builder/themeDetector';
import AlbumThemeStep from './AlbumThemeStep';
import PhotoCheckCard from './PhotoCheckCard';
import { useSettleGuard } from '../lib/settleGuard';
import { splitBold } from './boldText';
import { readAlbumTheme, writeAlbumTheme, isAlbumThemeReady } from '../lib/albumTheme';
import { fetchThemeQuotes } from '../lib/quotes';
import {
  Images, LayoutGrid, Palette, Type, ChevronUp, ChevronDown,
  PanelLeft, Box, Shuffle, Plus, Minus, ArrowLeft, ArrowRight, Upload,
  RefreshCw, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  RotateCcw, Redo, Sparkles, Trash2, Sun, Moon, Contrast, Droplets,
  Frame, Search, Send, Home, ChevronLeft, ChevronRight,
} from 'lucide-react';

const WELCOME: AssistantMessage = {
  id: 'w', role: 'assistant',
  content: "Hi! I'm **Megy** — your album designer. 🎨\n\nEverything you need is right here. Pick a section or just tell me what you want!",
  timestamp: new Date(),
};

/* Photos-per-page options valid for each album size (annexed A2). */

/* Typewriter effect — gives Megy a "talking" personality (annexed A4). */
function TypeText({ text, speed = 22 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    setShown('');
    let i = 0;
    const t = setInterval(() => {
      if (i < text.length) { setShown(text.slice(0, i + 1)); i++; } else clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return <>{shown}</>;
}

/* Megy's messages mark key words with **bold** — show them bold, not as
   asterisks. Plain text nodes and <strong>, so nothing is parsed as HTML. */
function BoldText({ text }: { text: string }) {
  return <>{splitBold(text).map((run, i) => (run.bold ? <strong key={i}>{run.text}</strong> : run.text))}</>;
}

/* ── Constants matching PropertiesPanel ── */

const FONT_FAMILIES = [
  { name: 'DM Sans', value: '"DM Sans", sans-serif', preview: 'Aa' },
  { name: 'Inter', value: '"Inter", sans-serif', preview: 'Aa' },
  { name: 'Montserrat', value: '"Montserrat", sans-serif', preview: 'Aa' },
  { name: 'Poppins', value: '"Poppins", sans-serif', preview: 'Aa' },
  { name: 'Open Sans', value: '"Open Sans", sans-serif', preview: 'Aa' },
  { name: 'Lato', value: '"Lato", sans-serif', preview: 'Aa' },
  { name: 'Nunito', value: '"Nunito", sans-serif', preview: 'Aa' },
  { name: 'Raleway', value: '"Raleway", sans-serif', preview: 'Aa' },
  { name: 'Work Sans', value: '"Work Sans", sans-serif', preview: 'Aa' },
  { name: 'Source Sans 3', value: '"Source Sans 3", sans-serif', preview: 'Aa' },
  { name: 'Outfit', value: '"Outfit", sans-serif', preview: 'Aa' },
  { name: 'Playfair Display', value: '"Playfair Display", serif', preview: 'Aa' },
  { name: 'Lora', value: '"Lora", serif', preview: 'Aa' },
  { name: 'Merriweather', value: '"Merriweather", serif', preview: 'Aa' },
  { name: 'Libre Baskerville', value: '"Libre Baskerville", serif', preview: 'Aa' },
  { name: 'Crimson Text', value: '"Crimson Text", serif', preview: 'Aa' },
  { name: 'Cormorant Garamond', value: '"Cormorant Garamond", serif', preview: 'Aa' },
  { name: 'Georgia', value: 'Georgia, serif', preview: 'Aa' },
  { name: 'Times New Roman', value: '"Times New Roman", serif', preview: 'Aa' },
  { name: 'Dancing Script', value: '"Dancing Script", cursive', preview: 'Aa' },
  { name: 'Great Vibes', value: '"Great Vibes", cursive', preview: 'Aa' },
  { name: 'Pacifico', value: '"Pacifico", cursive', preview: 'Aa' },
  { name: 'Caveat', value: '"Caveat", cursive', preview: 'Aa' },
  { name: 'Satisfy', value: '"Satisfy", cursive', preview: 'Aa' },
  { name: 'Amatic SC', value: '"Amatic SC", cursive', preview: 'Aa' },
  { name: 'Bebas Neue', value: '"Bebas Neue", sans-serif', preview: 'Aa' },
  { name: 'Abril Fatface', value: '"Abril Fatface", serif', preview: 'Aa' },
  { name: 'Righteous', value: '"Righteous", sans-serif', preview: 'Aa' },
  { name: 'Fredoka', value: '"Fredoka", sans-serif', preview: 'Aa' },
  { name: 'Courier New', value: '"Courier New", monospace', preview: 'Aa' },
  { name: 'JetBrains Mono', value: '"JetBrains Mono", monospace', preview: 'Aa' },
];

const FONT_SIZE_PRESETS = [12, 16, 20, 24, 32, 48, 64, 96, 120];

const COLOR_PRESETS = [
  '#2D2D2D', '#FFFFFF', '#F4C2A1', '#E8A598', '#B8A9D9',
  '#9BCFB8', '#8FBFE0', '#E8958C', '#D4B896', '#9B9B9B',
  '#C4A882', '#6B6B6B', '#FF6B6B', '#4ECDC4', '#45B7D1',
];

const THEMES: { id: TemplateType; label: string; color: string }[] = [
  { id: 'wedding', label: 'Wedding', color: '#F4C2A1' },
  { id: 'baby', label: 'Baby', color: '#B8D4E3' },
  { id: 'birthday', label: 'Birthday', color: '#F9E076' },
  { id: 'family', label: 'Family', color: '#C8B8D4' },
  { id: 'graduation', label: 'Graduation', color: '#A8C4A2' },
  { id: 'travel', label: 'Travel', color: '#7DB9DE' },
  { id: 'minimalist', label: 'Minimal', color: '#E8E8E8' },
  { id: 'kids', label: 'Kids', color: '#FFB7B2' },
  { id: 'vintage', label: 'Vintage', color: '#D4B896' },
  { id: 'classic', label: 'Classic', color: '#C9A96E' },
  { id: 'baptism', label: 'Baptism', color: '#B9A66B' },
];

/* ── Tab definition ── */
type TabId = 'design' | 'layout' | 'photos' | 'view';

// The tools tabs (Design / Layout / Photos / View) and their panels are hidden —
// the wizard now drives everything (layout picker, page nav, regenerate, etc.).
// Flip to true to bring the manual tool panels back.
const SHOW_TOOL_TABS = false;
const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'design', label: 'Design', icon: <Palette className="w-4 h-4" /> },
  { id: 'layout', label: 'Layout', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'photos', label: 'Photos', icon: <Images className="w-4 h-4" /> },
  { id: 'view', label: 'View', icon: <Search className="w-4 h-4" /> },
];

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

export default function MegyAssistant({ collapsed: collapsedProp, onToggleCollapsed, mobilePulldown, onPlaceOrder }: {
  collapsed?: boolean; onToggleCollapsed?: (v: boolean) => void; mobilePulldown?: boolean;
  /** Step 7's "Place Order →": the builder orders through the preview's own Order. */
  onPlaceOrder?: () => void;
} = {}) {
  const [activeTab, setActiveTab] = useState<TabId>('design');
  const [chatOpen, setChatOpen] = useState(false);
  // Collapse is controlled by the parent (so the layout can reserve panel width);
  // falls back to local state if rendered standalone.
  const [collapsedLocal, setCollapsedLocal] = useState(false);
  const collapsed = collapsedProp ?? collapsedLocal;
  const setCollapsed = (v: boolean) => { if (onToggleCollapsed) onToggleCollapsed(v); else setCollapsedLocal(v); };
  // Mobile only: the side panel becomes a bottom drawer that collapses to a peek
  // (so the canvas is visible) and expands to act. Ignored at md+ (right rail).
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builder = useBuilderContext();

  /* ── Wizard state ──
     Booted from the journey saved on the last visit (saved on every step
     change, below), so a reload lands on the step the customer was on — the
     upload card stays the upload card instead of falling back to the size
     picker. Built ONCE and reconciled BEFORE the first render reads its step:
     an engine that reached review only after mount flipped the center
     edit → setup → edit in one tick, and AnimatePresence mode="wait"
     stranded the size picker on screen with the finished album behind it. */
  const [{ engine, dismissed }] = useState(() => bootWizard(builder, readSavedWizard()));
  const wizardRef = useRef(engine);
  // Keep the wizard's builder in sync DURING render (not in an effect) so
  // getMessage() always reads the current page/state — otherwise the review
  // message lags a render behind page navigation.
  wizardRef.current.builder = builder;
  // A dismissed (✕) guided card stays closed across a reload — except during
  // setup, where it IS the screen.
  const [showWizard, setShowWizard] = useState(!dismissed || builder.phase === 'setup');

  /* ── Auto-sync wizard when builder PHASE changes ──
     Only sync when user explicitly transitions phases (setup→edit→preview).
     During setup, the wizard stays at whatever step the user is on. */
  const [wizardStep, setWizardStep] = useState(engine.state.step);

  /* ── Album occasion (pick_theme, unskippable) ──
     Written to the same local key the quote engine reads. Next is gated on
     it; advancing warms the themed quote pool so the first generation deals
     real lines instead of waiting on the proxy. */
  const [albumTheme, setAlbumThemeState] = useState(readAlbumTheme);
  const setAlbumTheme = (v: string) => { setAlbumThemeState(v); writeAlbumTheme(v); };
  const themeReady = isAlbumThemeReady(albumTheme);
  // Step 1 also asks the album's NAME (its title in Your Projects) — the same
  // unskippable gate covers both.
  const stepOneReady = isStepOneReady(builder.albumTitle, albumTheme);
  // Taps on Next before step 1 is answered. Next never eats a tap there (a
  // greyed one left an eager tester stuck, 2026-10-04): each tap points at
  // what is missing instead.
  const [stepOneNudge, setStepOneNudge] = useState(0);
  const goNext = () => {
    if (wizardStep === 'pick_theme') {
      if (!stepOneReady) { setStepOneNudge((n) => n + 1); return; }
      setStepOneNudge(0);
      void fetchThemeQuotes(albumTheme.trim());
    }
    wizardRef.current.advance();
    setWizardStep(wizardRef.current.state.step);
  };

  /* ── Option A: the wizard is the single source of truth for the journey.
     Mirror its step into the SHARED store AND derive the center screen (phase)
     from it — so the center and this panel can never disagree. ── */
  useEffect(() => {
    builder.setWizardStep(wizardStep);
    const targetPhase = phaseForStep(wizardStep);
    if (builder.phase !== targetPhase) builder.setPhase(targetPhase);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardStep]);

  /* External writes to the shared step (e.g. the center "Start Creating"
     button) flow back into the wizard engine + panel. Forward jumps mark the
     skipped-over steps complete so detectStep stays consistent.
     Only a CHANGE of the store's step is a write. Its first value is the
     store's default ('welcome'), and reading that as a backward jump dragged
     a restored engine back to welcome on mount. */
  const storeStepRef = useRef(builder.wizardStep);
  useEffect(() => {
    if (storeStepRef.current === builder.wizardStep) return;
    storeStepRef.current = builder.wizardStep;
    const eng = wizardRef.current;
    if (builder.wizardStep !== eng.state.step) {
      // The first step (name + occasion) cannot be jumped over: a forward
      // jump past it while it is unanswered lands on it, and the guided card
      // comes back so the customer actually sees it (a dismissed wizard would
      // otherwise hide it).
      const target = forwardJumpTarget(eng.state.step, builder.wizardStep, isStepOneReady(builder.albumTitle, readAlbumTheme()));
      if (target !== builder.wizardStep) {
        eng.state.step = target;
        setShowWizard(true);
        setWizardStep(target);
        builder.setWizardStep(target);
        builder.setPhase(phaseForStep(target));
        return;
      }
      const from = WIZARD_ORDER.indexOf(eng.state.step);
      const to = WIZARD_ORDER.indexOf(builder.wizardStep);
      if (to > from) {
        for (let i = from; i < to; i++) {
          if (!eng.state.completed.includes(WIZARD_ORDER[i])) eng.state.completed.push(WIZARD_ORDER[i]);
        }
      }
      eng.state.step = builder.wizardStep;
      setWizardStep(builder.wizardStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.wizardStep]);
  /* ── Option A: reconcile the wizard to reality (FORWARD only).
     Runs whenever the phase OR the album's built state changes: an album just
     built moves on to Review, the preview opened from the pages moves on to
     Finalize. A phase the step itself asked for (← Previous, Next, the cover
     editor's ← Back) changes nothing — reading it as news bounced ← Previous
     on the upload step straight back off the cover. A reload is reconciled in
     bootWizard, before the first render. ── */
  const albumBuilt = engine.hasBuiltAlbum();
  const showPrevious = engine.showsPrevious();
  const showNext = engine.showsNext();
  useEffect(() => {
    if (wizardRef.current.reconcileOnChange()) setWizardStep(wizardRef.current.state.step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.phase, albumBuilt]);

  /* Save the journey on every step change and on the ✕, so a reload restores
     it. Declared after the effects above, so it saves what they settled on. */
  useEffect(() => {
    try { localStorage.setItem(WIZARD_STORAGE_KEY, wizardRef.current.serialize(!showWizard)); } catch { /* storage blocked: this visit only */ }
  }, [wizardStep, showWizard]);

  // Force re-render when wizard step changes via key
  const wizardKey = `wizard-${wizardStep}`;

  const page = builder.currentPage;
  const totalPhotos = builder.uploadedPhotos.length;
  // The photos that go in: the ones the customer left out (Megy's photo check) don't.
  const livePhotos = builder.uploadedPhotos.filter((p) => !p.leftOut);

  /* ── Megy's photo read: analyze ratios → recommend best album size (annexed A1) ── */
  const photoAnalysis = totalPhotos > 0 ? analyzePhotos(builder.uploadedPhotos) : null;
  const recommendedSize = photoAnalysis ? recommendSizeForRatio(photoAnalysis.dominantRatio) : null;
  /* Estimated page count for the proposal card (annexed A3). Floored at 40. */
  const estPages = totalPhotos > 0 ? Math.max(40, Math.ceil(totalPhotos / (builder.photosPerPage ?? 3))) : 40;
  const filledSlots = page?.slotFills?.filter((f: number | null) => f !== null).length ?? 0;
  const totalSlots = page?.slotFills?.length ?? 0;
  const pageNum = builder.currentPageIndex + 1;
  const totalPages = builder.albumPages.length;

  /* Selection states from builder context */
  const selectedTextId = builder.selectedTextId;
  const selectedPhotoId = builder.selectedPhotoId;

  const selectedText = selectedTextId ? page?.textElements?.find((t: TextElement) => t.id === selectedTextId) ?? null : null;
  const selectedPhoto = selectedPhotoId ? page?.photos?.find((p: CanvasPhoto) => p.id === selectedPhotoId) ?? null : null;

  /* ── Toast ── */
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string, ms = 2000) => { setToast(msg); setTimeout(() => setToast(null), ms); };

  const cardTooSoon = useSettleGuard(wizardKey);

  /* ── Chat ── */
  const rebuildAskedRef = useRef<AssistantIntent | null>(null);
  const builderRef = useRef(builder);
  useEffect(() => { builderRef.current = builder; });
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AssistantMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() };
    setMessages((p) => [...p, userMsg]);
    setInput('');
    setIsThinking(true);
    const parsed = parseIntent(text);
    // A typed command that rebuilds a made album (generate, or a new size)
    // replaces the customer's layouts and edits: ask first (rebuildQuestion);
    // a yes, or asking the same again, does it. (The wizard's own buttons are
    // explicit choices and aren't asked.)
    const pending = rebuildAskedRef.current;
    rebuildAskedRef.current = null;
    const yes = /^(yes|yep|yeah|ok|okay|sure|confirm|do it|go ahead)\b/i.test(text.trim());
    let intent = parsed.intent;
    if (pending && yes) intent = pending;
    else if (!(pending && pending.type === intent.type)) {
      const ask = rebuildQuestion(intent, builderRef.current);
      if (ask) {
        rebuildAskedRef.current = intent;
        setIsThinking(false);
        setMessages((p) => [...p, { id: `a-${Date.now()}`, role: 'assistant', content: ask, intent, timestamp: new Date() }]);
        return;
      }
    }
    const result = await builder.dispatch(intent);
    const asst: AssistantMessage = { id: `a-${Date.now()}`, role: 'assistant', content: result.message, intent: parsed.intent, timestamp: new Date() };
    setIsThinking(false);
    setMessages((p) => [...p, asst]);
  }, []);
  const handleSubmit = (e?: React.FormEvent) => { e?.preventDefault(); sendMessage(input); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } };

  /* ── Wizard action handler ── */
  const handleWizardAction = useCallback((action: string) => {
    const step = wizardRef.current.state.step;
    switch (step) {
      case 'welcome':
        if (action.includes('Start')) {
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
        } else if (action.includes('Skip')) {
          setShowWizard(false); // saved by the effect above
        }
        break;
      case 'pick_size':
        const sizes: Record<string, string> = {
          '6×6': '6x6', '8×8': '8x8', '9×9': '9x9',
          '6×4': '6x4', '8×6': '8x6', '6×8': '6x8', '11.5×8': '11.5x8', '8.5×11': '8.5x11',
        };
        const size = Object.keys(sizes).find(k => action.includes(k));
        if (size) {
          void builder.dispatch({ type: 'change_size', payload: { size: sizes[size] }, rawMessage: `change size to ${sizes[size]}` });
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
          showToast(`Size set: ${size}`);
        }
        break;
      case 'upload_photos':
        if (action.includes('Generate')) {
          // The 40-photo gate (albumMinimum): the card only offers Generate at
          // 40+, but a photo left out a moment ago must not slip through.
          const have = photosGoingIn(builder.uploadedPhotos);
          if (photosShortBy(have) > 0) { showToast(tooFewToMakeMessage(have)); break; }
          // The upload step doubles as Generate — build the album, then jump to Review.
          void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' }).then((r) => showToast(r.success ? 'Album generated!' : r.message));
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
        } else if (action.includes('Upload') || action.startsWith('Add ')) {
          // "Upload Photos" / "Upload More Photos" / "Add 26 more photos"
          fileInputRef.current?.click();
        }
        break;
      case 'review_pages': {
        if (/layout/i.test(action)) {
          builder.setLayoutPickerOpen(true);
        } else if (action.includes('Quote')) {
          const q = builder.addThemedQuote?.();
          showToast(q ? `Added: "${q}"` : 'This page is full — no room for a quote here.');
        } else if (/preview/i.test(action)) {
          void builder.dispatch({ type: 'preview_album', rawMessage: 'preview album' });
        } else if (/start/i.test(action)) {
          builder.goToPage(0);
        } else if (action.includes('Next')) {
          // Stop at the last page with content, not the 40-page minimum, so the
          // review walks the real album and lands on the "let's order" nudge.
          const pages = builder.albumPages;
          let lastUsed = pages.length - 1;
          for (let i = pages.length - 1; i >= 0; i--) {
            const p = pages[i];
            if ((p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0 || p.textElements.length > 0) { lastUsed = i; break; }
          }
          builder.goToPage(Math.min(builder.currentPageIndex + 1, lastUsed));
        }
        break;
      }
      case 'add_text':
        if (action.includes('Text')) {
          void builder.dispatch({ type: 'add_text', rawMessage: 'add text' });
        } else if (action.includes('Skip') || action.includes('Finalize')) {
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
        }
        break;
      case 'finalize':
        if (action.includes('Preview')) {
          void builder.dispatch({ type: 'preview_album', rawMessage: 'preview album' });
        } else if (action.includes('Edit pages')) {
          // Back to Step 6 — the store write flows into the engine (backward
          // jumps are honoured) and the centre follows the step.
          builder.setWizardStep('review_pages');
          builder.setPhase('edit');
        } else if (action.includes('Save')) {
          builder.manualSave?.();
        } else if (action.includes('Order')) {
          // "Place Order →" is the filled button, the way on, so it must
          // order: through the preview's own Order (the 40-photo check, then
          // the print job checkout reads), never straight to /order. On the
          // phone Megy folds up so the answer underneath (saving, or why not
          // yet) shows.
          setMobileExpanded(false);
          onPlaceOrder?.();
        }
        break;
    }
  }, [builder, showToast, onPlaceOrder]);
  const doRestartWizard = () => {
    // Signed in, the album is saved to the account and keeps its photos (see
    // reset); signed out, it really is gone.
    if (!window.confirm(builder.user
      ? 'Start a new album from the beginning? This one stays saved in Your Projects.'
      : 'Restart from the beginning? Your current album and photos will be cleared.')) return;
    builder.reset();                              // wipe album + photos
    wizardRef.current.restart();                  // engine → welcome, clear flags
    setStepOneNudge(0);                           // a new album starts unflagged
    setShowWizard(true);                          // re-show the guided centerpiece
    setWizardStep(wizardRef.current.state.step);  // syncs store + phase via effects
    try { localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    showToast('Wizard restarted — back to the beginning');
  };
  const doGenerate = () => { void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' }).then((r) => showToast(r.success ? 'Album generated!' : r.message)); };
  const doShuffle = () => { void builder.dispatch({ type: 'shuffle_layout', rawMessage: 'shuffle layout' }); showToast('Layout shuffled'); };
  const doRegen = () => { void builder.dispatch({ type: 'regenerate_page', rawMessage: 'regenerate page' }); showToast('Page regenerated'); };
  const doAutoFill = () => { void builder.dispatch({ type: 'auto_fill', rawMessage: 'auto fill' }); showToast('Photos auto-filled'); };
  const doClear = () => { void builder.dispatch({ type: 'clear_slots', rawMessage: 'clear slots' }); showToast('Slots cleared'); };
  const doUndo = () => builder.canUndo && builder.undo();
  const doRedo = () => builder.canRedo && builder.redo();
  const doAddPage = () => { void builder.dispatch({ type: 'add_page', rawMessage: 'add page' }); showToast('Page added'); };
  const doDelPage = () => {
    void builder.dispatch({ type: 'delete_page', rawMessage: 'delete page' }).then((r) => showToast(r.message));
  };
  const doNext = () => builder.goToPage(Math.min(builder.currentPageIndex + 1, builder.albumPages.length - 1));
  const doPrev = () => builder.goToPage(Math.max(builder.currentPageIndex - 1, 0));
  const doSetTheme = (t: TemplateType) => { void builder.dispatch({ type: 'apply_theme', payload: { theme: t }, rawMessage: `apply ${t} theme` }); showToast(`Theme: ${t}`); };
  // Analyze photo CONTENT on-device (MobileNet) and suggest the closest theme.
  const [suggesting, setSuggesting] = useState(false);
  /* Step-2 customization: which manual picker (Background/Border/Frame) is open.
     Only one panel is shown at a time; clicking the active button closes it. */
  // Step-2 is now the customization studio — open Background by default so the
  // step isn't empty now that the occasion presets are gone.
  const doSuggestTheme = async () => {
    if (!builder.uploadedPhotos.length || suggesting) return;
    setSuggesting(true);
    showToast('Looking at your photos…');
    try {
      const s = await suggestThemeFromPhotos(builder.uploadedPhotos);
      if (s) {
        void builder.dispatch({ type: 'apply_theme', payload: { theme: s.theme }, rawMessage: `apply ${s.theme} theme` });
        showToast(`These look like ${s.theme}${s.evidence.length ? ` (${s.evidence.join(', ')})` : ''} — applied it!`);
      } else {
        showToast("Couldn't tell from the photos — pick a theme you like.");
      }
    } catch {
      showToast('Photo analysis is unavailable right now.');
    } finally {
      setSuggesting(false);
    }
  };
  const doSetBg = (bg: AlbumBackground) => { void builder.dispatch({ type: 'set_background', payload: { background: bg }, rawMessage: 'set background' }); };

  /* ── Page nav ── */
  const [pageInput, setPageInput] = useState('');
  const goToPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) { builder.goToPage(n - 1); setPageInput(''); }
  };

  /* ── File upload ── */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    const picked = Array.from(files);
    // Clear the input FIRST so re-picking the same batch still fires onChange
    // (a phone picker caps a selection, so re-picking is a normal move here).
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (picked.length === 0) return;
    // Report what was actually added, not what was selected — duplicates are
    // skipped, and a video or another file is left out with a word (pickedFiles).
    const res = await builder.dispatch({ type: 'add_photos', payload: { files: picked }, rawMessage: 'add photos' });
    showToast(res.message, res.message.includes('left out') || res.message.startsWith('Videos') ? 6000 : 2000);
  };

  /* ── Collapsible sections ── */
  const [expanded, setExpanded] = useState<string>('background');
  const toggle = (id: string) => setExpanded(expanded === id ? '' : id);

  /* ── Option A / centerpiece: during the guided pre-album steps, Megy's card
     IS the screen. Once an album exists (review onward) we fall back to the
     canvas + side panel. This removes any competing center control. ── */
  const centerStage = showWizard && ['welcome', 'pick_theme', 'pick_size', 'upload_photos'].includes(wizardStep);

  if (centerStage) {
    const msg = wizardRef.current.getMessage();
    const prog = wizardRef.current.getProgress();
    return (
      <div className="fixed inset-0 z-[95] bg-warm-white flex flex-col items-center [justify-content:safe_center] p-6 overflow-auto">
        {/* Hidden file input so the Upload step works on the center stage too */}
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />
        {/* Megy's answer on the center stage too: the toast lived only in the
            side panel, so at Step 4 every upload answer — "40 photos added",
            a video left out — went unseen ("Nothing happens", 1-star testers). */}
        {toast && (
          <div role="status" data-testid="megy-toast"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[96] w-[calc(100%-2rem)] max-w-md px-4 py-2.5 bg-dark text-white text-[13px] rounded-xl shadow-lg text-center">
            {toast}
          </div>
        )}

        {/* Home — the center stage covers the top bar, so give an explicit exit */}
        <Link
          to="/"
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl shadow-sm border border-line text-xs font-medium text-medium hover:text-peach hover:border-peach/30 transition-all"
          title="Back to homepage"
        >
          <Home size={14} /> Home
        </Link>

        <img src="/megy-character.png" alt="Megy" className="w-20 h-20 object-contain mb-4 drop-shadow-lg" draggable={false} />

        <div className="w-full max-w-lg">
          <div className="flex items-center mb-1">
            <span className="text-[11px] font-medium text-taupe">{prog.label}</span>
          </div>
          <div className="w-full h-1.5 bg-peach/20 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-peach rounded-full transition-all" style={{ width: `${prog.percent}%` }} />
          </div>

          {/* A double tap is one tap: right after the card changes, a tap is the
              tail of the one that changed it (settleGuard). */}
          <div className="p-6 bg-white rounded-2xl border border-peach/20 shadow-xl" key={wizardKey}
            onClickCapture={(e) => { if (cardTooSoon()) { e.stopPropagation(); e.preventDefault(); } }}>
            <h3 className="font-display text-xl font-semibold text-dark mb-2"><TypeText text={msg.title} /></h3>
            {wizardRef.current.state.step === 'pick_theme' ? (
              <AlbumThemeStep value={albumTheme} onChange={setAlbumTheme} onContinue={goNext}
                name={builder.albumTitle} onNameChange={builder.setAlbumTitle} nudge={stepOneNudge} />
            ) : (wizardRef.current.state.step === 'upload_photos' && builder.uploadedPhotos.length > 0) ? (
              <div className="mb-4">
                {/* Eye-catching photo count — the photos that go in (left-out ones don't). */}
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="font-display text-5xl font-bold text-blush-pink leading-none" data-testid="photos-ready">{livePhotos.length}</span>
                  <span className="text-base text-ink-mid">photos ready 🎉</span>
                </div>
                {/* Megy's free photo check: blurry + repeat shots, suggested out (one tap). */}
                <PhotoCheckCard photos={builder.uploadedPhotos} check={builder.photoCheck}
                  onLeaveOut={builder.leaveOutPhotos} onKeep={builder.keepPhotos} onBringBack={builder.bringBackPhotos} />
                <p className="text-sm text-ink-mid leading-relaxed mb-2">Your album setup:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-blush text-blush-pink text-sm font-semibold">{builder.albumSize} album</span>
                  <span className="px-3 py-1.5 rounded-full bg-blush text-blush-pink text-sm font-semibold capitalize">{builder.selectedTemplate} theme</span>
                </div>
                {/* Photos per page — the choice that decides how dense pages deal.
                    Its only other home is the tool-tabs panel, which is switched
                    off (SHOW_TOOL_TABS=false), so without this row a customer had
                    NO way to reach the 3/4-photo layouts: AUTO spreads a small
                    upload to 1/page and never deals them. The estimate below
                    reads the same choice, so it updates live. */}
                <div className="mt-3">
                  <p className="text-sm text-ink-mid leading-relaxed mb-2">Photos per page:</p>
                  <div className="flex flex-wrap gap-2">
                    {(DENSITY_BY_SIZE[builder.albumSize] ?? [1, 2, 3, 4]).map((n) => (
                      <button
                        key={n}
                        onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: n }, rawMessage: `${n} photos per page` }); }}
                        className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${builder.photosPerPage === n ? 'bg-peach text-white border-peach' : 'bg-white text-ink-mid border-line hover:border-peach/60'}`}
                      >
                        {n} · {DENSITY_LABELS[n]}
                      </button>
                    ))}
                    <button
                      onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: undefined }, rawMessage: 'surprise photos per page' }); }}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${builder.photosPerPage === undefined ? 'bg-peach text-white border-peach' : 'bg-white text-ink-mid border-line hover:border-peach/60'}`}
                    >
                      ✨ Surprise
                    </button>
                  </div>
                </div>
                {(() => {
                  // THE 40-PHOTO GATE (albumMinimum): under 40 there is no
                  // Generate — the card's button is "Add N more photos". At 40+
                  // every page fills, whatever photos-per-page is picked.
                  const short = photosShortBy(livePhotos.length);
                  const note = perPageNote(livePhotos.length, builder.photosPerPage);
                  return short === 0 ? (
                    <>
                      <p className="text-xs text-success mt-3" data-testid="photo-minimum-met">✓ Enough for a full {MIN_ALBUM_PAGES}-page album.</p>
                      {note && <p className="text-xs text-[#8A5A12] mt-1 leading-relaxed" data-testid="per-page-note">{note}</p>}
                    </>
                  ) : (
                    <div className="mt-3 p-3 rounded-xl bg-[#FFF6E5] border border-[#F0D9A8]" data-testid="photo-minimum">
                      <p className="text-sm text-[#8A5A12] leading-relaxed">
                        Albums need at least <b>{MIN_ALBUM_PHOTOS} photos</b>, one for every page. Add <b>{short} more</b> to make your album.
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-[#F0D9A8] overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-[#C98A2B] transition-all" style={{ width: `${Math.round((livePhotos.length / MIN_ALBUM_PHOTOS) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] text-[#8A5A12] tabular-nums">{livePhotos.length} of {MIN_ALBUM_PHOTOS}</p>
                    </div>
                  );
                })()}
                {(() => {
                  // VIDEO MEMORIES go on full-page photos that fit the page
                  // (owner, 2026-10-02). Photos all the wrong shape for this
                  // size can't make them without a crop, so say so HERE — while
                  // adding photos or switching size is still one tap — instead
                  // of cropping to make up the number.
                  const short = memoryShortfall(livePhotos, builder.albumSize, offerableAlbumSizes().map((s) => s.preset));
                  if (!short) return null;
                  const sizeLabel = SIZE_LABELS[builder.albumSize] ?? builder.albumSize;
                  const better = short.betterSize ? (SIZE_LABELS[short.betterSize] ?? short.betterSize) : null;
                  const nudgeBtn = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E8C98A] text-[#8A5A12] hover:bg-[#FFF0D1] transition-colors';
                  return (
                    <div className="mt-3 p-3 rounded-xl bg-[#FFF6E5] border border-[#F0D9A8]" data-testid="memory-nudge">
                      <p className="text-xs text-[#8A5A12] leading-relaxed">
                        Your {sizeLabel} album puts its {MIN_MEMORY_PAGES} video memories on full-page {short.shape} photos, and you have <b>{short.have}</b>.
                        {' '}Add <b>{short.missing}</b> more {short.shape} photo{short.missing === 1 ? '' : 's'}{better ? <> — or switch to <b>{better}</b>, which fits your photos</> : null}.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className={nudgeBtn} data-testid="memory-nudge-add">
                          Add {short.shape} photos
                        </button>
                        {short.betterSize && (
                          <button type="button" className={nudgeBtn} data-testid="memory-nudge-switch"
                            onClick={() => { void builder.dispatch({ type: 'change_size', payload: { size: short.betterSize }, rawMessage: `change size to ${short.betterSize}` }); showToast(`Size set: ${better}`); }}>
                            Switch to {better}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-sm text-ink-mid leading-relaxed mb-4"><BoldText text={msg.body} /></p>
            )}
            {(
              <div className="flex flex-col gap-2.5">
                {msg.actions.map((action) => {
                  const isPrimary = isPrimaryAction(action);
                  return (
                    <button
                      key={action}
                      onClick={() => handleWizardAction(action)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-all ${
                        isPrimary
                          ? 'py-3.5 text-base bg-peach text-white hover:bg-blush-pink shadow-md hover:shadow-lg active:scale-[0.98]'
                          : 'py-2.5 text-sm bg-cream text-dark hover:bg-peach/20 border border-peach/15'
                      }`}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
            )}
            {/* One way on per screen (WizardEngine.showsNext): no Next where
                the card's own button is the way on — "Let's Get Started →",
                the sizes, "Generate Album →" (an unguarded Next with zero
                photos skipped into an empty review). Once an album is built
                (the customer came back from Review), Next returns to it
                without rebuilding the pages. Welcome has no ← Previous. */}
            {(showPrevious || showNext) && (
            <div className="flex items-center justify-between mt-5 pt-3 border-t border-line-soft">
              {showPrevious && (
                <button
                  onClick={() => { wizardRef.current.back(); setWizardStep(wizardRef.current.state.step); }}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-taupe hover:bg-cream transition-all"
                >
                  ← Previous
                </button>
              )}
              {showNext && (
                <button
                  onClick={goNext}
                  title={wizardStep === 'pick_theme' && !stepOneReady ? (themeReady ? 'Name your album first' : 'Pick the occasion first') : undefined}
                  className="ml-auto flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-medium bg-peach text-white hover:bg-blush-pink transition-all"
                >
                  Next →
                </button>
              )}
            </div>
            )}
            {msg.tips.length > 0 && (
              <div className="mt-3 pt-3 border-t border-line-soft space-y-1">
                {msg.tips.map((tip) => (
                  <p key={tip} className="text-[11px] text-light flex items-center gap-1.5"><span className="text-peach">💡</span> {tip}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile (post-wizard): Megy collapses to a small character icon in the
          upper-right; tap it to pull Megy DOWN from the top. */}
      {mobilePulldown && !mobileExpanded && (
        <button
          type="button"
          onClick={() => setMobileExpanded(true)}
          className="lg:hidden fixed top-1.5 right-3 z-[95] w-10 h-10 rounded-full bg-peach shadow-lg flex items-center justify-center overflow-hidden active:scale-95 transition-transform"
          aria-label="Open Megy"
        >
          <img src="/megy-character.png" alt="Megy" className="w-7 h-7 object-contain" draggable={false} />
        </button>
      )}

    <div className={`fixed z-[90] bg-white shadow-xl flex flex-col overflow-hidden transition-[height] duration-300
      ${mobilePulldown
        ? `left-0 right-0 top-0 w-full rounded-b-2xl border-b border-peach/20 ${mobileExpanded ? 'h-[82vh]' : 'h-0'}`
        : `left-0 right-0 bottom-0 w-full rounded-t-2xl border-t border-peach/20 ${mobileExpanded ? 'h-[82vh]' : 'h-[66px]'}`}
      lg:left-0 lg:right-auto lg:top-0 lg:bottom-0 lg:h-full ${collapsed ? 'lg:w-[60px]' : 'lg:w-[340px]'} lg:rounded-none lg:border-t-0 lg:border-r lg:transition-[width] lg:duration-300`}>

      {/* Collapsed rail — desktop only, when minimized: Megy icon + expand */}
      <div className={`hidden ${collapsed ? 'lg:flex' : ''} lg:flex-col lg:items-center lg:gap-3 lg:pt-4`}>
        <img src="/megy-character.png" alt="Megy" className="w-8 h-8 object-contain" draggable={false} />
        <button onClick={() => setCollapsed(false)} title="Expand Megy" aria-label="Expand Megy"
          className="p-1.5 text-light hover:text-blush-pink hover:bg-blush rounded-lg transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Full panel content — hidden on desktop when collapsed */}
      <div className={`flex flex-col flex-1 min-h-0 ${collapsed ? 'lg:hidden' : ''}`}>

      {/* Mobile grab-handle — tap to expand/collapse the drawer (hidden at md+) */}
      <button
        type="button"
        onClick={() => setMobileExpanded((v) => !v)}
        className={`lg:hidden shrink-0 w-full flex items-center justify-center ${mobilePulldown ? 'order-last pb-3 pt-1' : 'pt-2 pb-1'}`}
        aria-label={mobileExpanded ? 'Collapse Megy' : 'Expand Megy'}
      >
        <span className="w-10 h-1.5 rounded-full bg-line" />
      </button>

      {/* ═══ HEADER ═══ */}
      <div className="bg-peach px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center overflow-hidden">
            <img src="/megy-character.png" alt="Megy" className="w-7 h-7 object-contain" draggable={false} />
          </div>
          <div>
            <span className="font-semibold text-white text-sm">Megy Assistant</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-300 rounded-full animate-pulse" />
              <span className="text-[10px] text-white/80">Ready</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCollapsed(true)} className="hidden lg:inline-flex p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Minimize panel" aria-label="Minimize panel">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setChatOpen(!chatOpen)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Quick chat">
            <Send className="w-4 h-4" />
          </button>
          {/* Legacy sidebar button hidden — Megy is the sole orchestrator (Ctrl+Shift+S still works) */}
          {false && (
          <button onClick={() => alert('Use Ctrl+Shift+S to open the legacy sidebar')} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Legacy sidebar (Ctrl+Shift+S)">
            <PanelLeft className="w-4 h-4" />
          </button>
          )}
        </div>
      </div>

      {/* ═══ RESTART — just under the title bar ═══ */}
      <div className="px-4 py-2 bg-cream border-b border-peach/10 shrink-0">
        <button onClick={doRestartWizard} className="w-full flex items-center justify-center gap-2 py-2 text-light hover:text-blush-pink hover:bg-blush/50 rounded-lg text-xs font-medium transition-all">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restart Wizard — start over</span>
        </button>
        {/* The steps come back after ✕. Closing them used to take Change
            layout, the cover editor and the Preview / Order shortcuts away for
            good — a reload didn't bring them back (1-star testers, 2026-10-04). */}
        {!showWizard && (
          <button onClick={() => setShowWizard(true)} data-testid="megy-show-steps"
            className="mt-1 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-peach/30 bg-white text-blush-pink hover:bg-blush text-xs font-semibold transition-all">
            Show the steps again ({wizardRef.current.getProgress().label})
          </button>
        )}
      </div>

      {/* ═══ WIZARD PROGRESS BAR ═══ */}
      {showWizard && (
        <div className="px-4 py-2 bg-cream border-b border-peach/10 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-taupe">
              {wizardRef.current.getProgress().label}
            </span>
            <button
              onClick={() => setShowWizard(false)}
              aria-label="Hide the steps" title="Hide the steps (bring them back from the button above)"
              className="text-[10px] text-light hover:text-dark"
            >
              ✕
            </button>
          </div>
          <div className="w-full h-1.5 bg-peach/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-peach rounded-full transition-all"
              style={{ width: `${wizardRef.current.getProgress().percent}%` }}
            />
          </div>

          {/* Wizard Message Card */}
          <div className="mt-2 p-3 bg-white rounded-xl border border-peach/20" key={wizardKey}>
            <h3 className="text-sm font-semibold text-dark mb-1">
              <TypeText text={wizardRef.current.getMessage().title} />
            </h3>
            <p className="text-[11px] text-ink-mid leading-relaxed mb-2">
              <BoldText text={wizardRef.current.getMessage().body} />
            </p>
            <div className="flex flex-wrap gap-2">
              {wizardRef.current.getMessage().actions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleWizardAction(action)}
                  className={`flex-1 min-w-[130px] px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${
                    isPrimaryAction(action)
                      ? 'bg-peach text-white hover:bg-blush-pink'
                      : 'bg-cream text-dark hover:bg-peach/20 border border-peach/15'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
            {/* Navigation: Previous / Next — the same one-way-on rule as the
                center card (WizardEngine.showsNext / showsPrevious): none on
                the cover (it has its own bar), no Next on Review (Next page
                under the page) or on Preview & Order (the last step). Never a
                greyed button: Next shows only where a tap moves on. */}
            {(showPrevious || showNext) && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-line-soft">
              {showPrevious && (
                <button
                  onClick={() => { wizardRef.current.back(); setWizardStep(wizardRef.current.state.step); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-taupe hover:bg-cream transition-all"
                >
                  ← Previous
                </button>
              )}
              {showNext && (
                <button
                  onClick={goNext}
                  className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-peach text-white hover:bg-blush-pink transition-all"
                >
                  Next →
                </button>
              )}
            </div>
            )}
            {wizardRef.current.getMessage().tips.length > 0 && (
              <div className="mt-2 pt-2 border-t border-line-soft space-y-0.5">
                {wizardRef.current.getMessage().tips.map((tip) => (
                  <p key={tip} className="text-[10px] text-light flex items-center gap-1">
                    <span className="text-peach">💡</span> {tip}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* ═══ TABS ═══ */}
      {SHOW_TOOL_TABS && (
      <div className="flex border-b border-peach/10 shrink-0">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${activeTab === tab.id ? 'text-peach bg-cream border-b-2 border-peach' : 'text-light hover:text-dark hover:bg-cream/50'}`}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      )}

      {/* ═══ TAB CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Hidden file input — always in DOM so wizard can trigger it */}
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />

        {/* ── DESIGN TAB (Rich) ── */}
        {SHOW_TOOL_TABS && activeTab === 'design' && (
          <div className="p-4 space-y-3">

            {/* Background Section */}
            <Section id="background" title="Background" icon={<Palette className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
              <RichBackgroundDesigner background={page?.background} photos={builder.uploadedPhotos} onChange={(bg) => { if (bg) doSetBg(bg); }} />
            </Section>

            {/* Themes Section */}
            <Section id="themes" title="Themes" icon={<Sparkles className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
              {builder.uploadedPhotos.length > 0 && (
                <button
                  onClick={doSuggestTheme}
                  disabled={suggesting}
                  className="w-full mb-2.5 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-peach to-blush-pink text-white hover:opacity-90 disabled:opacity-60 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {suggesting ? 'Analyzing your photos…' : 'Suggest a theme from my photos'}
                </button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map((t) => (
                  <button key={t.id} onClick={() => doSetTheme(t.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all border ${builder.selectedTemplate === t.id ? 'border-peach bg-cream text-dark' : 'border-transparent hover:border-peach/30 hover:bg-cream/50 text-ink-mid'}`}>
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="capitalize">{t.label}</span>
                  </button>
                ))}
              </div>
              {(() => {
                const variants = getThemeBackgroundVariants(builder.selectedTemplate);
                if (variants.length < 2) return null;
                const current = page?.background?.type === 'image' ? (page.background as { image?: string }).image : undefined;
                return (
                  <div className="mt-3">
                    <p className="text-[10px] font-medium text-light mb-1.5">Background style</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {variants.map((src, i) => (
                        <button
                          key={src}
                          onClick={() => void builder.dispatch({ type: 'set_background', payload: { background: { type: 'image', image: src }, applyAll: true }, rawMessage: `background style ${i + 1}` })}
                          className={`rounded-lg overflow-hidden border-2 transition-all ${current === src ? 'border-peach ring-2 ring-peach/30' : 'border-line-soft hover:border-peach/50'}`}
                        >
                          <img src={src} alt="" draggable={false} className="w-full h-12 object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Section>

            {/* Text Section — only show when page exists */}
            {page && (
              <Section id="text" title="Text" icon={<Type className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
                {selectedText ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-medium">Editing: "{selectedText.text.slice(0, 20)}..."</span>
                      <button onClick={() => builder.setSelectedTextId(null)} className="text-[10px] text-light hover:text-dark">Done</button>
                    </div>
                    <TextEditor text={selectedText} onUpdate={(id, u) => void builder.dispatch({ type: 'update_text', payload: { id, updates: u }, rawMessage: 'update text' })} onDelete={(id) => { void builder.dispatch({ type: 'delete_text', payload: { id }, rawMessage: 'delete text' }); builder.setSelectedTextId(null); }} />
                  </div>
                ) : (
                  <TextElementsList page={page} builder={builder} />
                )}
              </Section>
            )}

            {/* Photo Filters — Show when photo selected and page exists */}
            {selectedPhoto && page && (
              <Section id="filters" title="Photo Filters" icon={<Sun className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
                <PhotoFilterEditor photo={selectedPhoto} onUpdate={(id, f) => builder.updatePhotoFilters(id, f)} />
              </Section>
            )}

          </div>
        )}

        {/* ── LAYOUT TAB ── */}
        {SHOW_TOOL_TABS && activeTab === 'layout' && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Navigation</h3>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={doPrev} className="p-2 rounded-lg bg-cream hover:bg-peach/20 text-dark transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                <div className="flex-1 text-center">
                  <span className="text-sm font-semibold text-dark">Page {pageNum}</span>
                  <span className="text-[10px] text-taupe"> of {totalPages}</span>
                </div>
                <button onClick={doNext} className="p-2 rounded-lg bg-cream hover:bg-peach/20 text-dark transition-colors"><ArrowRight className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goToPageInput()} placeholder="Go to page..." className="flex-1 px-3 py-1.5 rounded-lg bg-cream text-sm text-dark placeholder:text-light outline-none focus:ring-2 focus:ring-peach/40 text-[12px]" />
                <button onClick={goToPageInput} className="px-3 py-1.5 bg-peach text-white rounded-lg text-[12px] font-medium hover:bg-blush-pink transition-colors">Go</button>
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Layout</h3>
              <div className="grid grid-cols-2 gap-2">
                <ActionCard icon={<Shuffle className="w-4 h-4" />} label="Shuffle" onClick={doShuffle} />
                <ActionCard icon={<RefreshCw className="w-4 h-4" />} label="Regenerate" onClick={doRegen} />
                <ActionCard icon={<Plus className="w-4 h-4" />} label="Add Page" onClick={doAddPage} />
                <ActionCard icon={<Minus className="w-4 h-4" />} label="Delete Page" onClick={doDelPage} danger />
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">History</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={doUndo} disabled={!builder.canUndo} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cream text-dark hover:bg-peach/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"><RotateCcw className="w-4 h-4" /><span>Undo</span></button>
                <button onClick={doRedo} disabled={!builder.canRedo} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cream text-dark hover:bg-peach/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"><Redo className="w-4 h-4" /><span>Redo</span></button>
              </div>
            </div>

            <div className="p-3 bg-cream rounded-xl">
              <div className="flex items-center justify-between text-[11px]"><span className="text-taupe">Slots filled</span><span className="font-semibold text-dark">{filledSlots} / {totalSlots}</span></div>
              <div className="w-full h-1.5 bg-peach/20 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-peach rounded-full transition-all" style={{ width: `${totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ── PHOTOS TAB ── */}
        {SHOW_TOOL_TABS && activeTab === 'photos' && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Upload</h3>
              <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-peach/40 rounded-xl text-[#8B7355] hover:border-peach hover:bg-cream transition-all text-sm">
                <Upload className="w-4 h-4" /><span>Drop photos or click to upload</span>
              </button>
              {totalPhotos > 0 && <p className="text-[10px] text-taupe mt-1.5 text-center">{totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} uploaded</p>}
            </div>

            {photoAnalysis && (
              <div className="p-3 rounded-xl bg-cream border border-peach/30">
                <p className="text-[11px] text-[#8B7355] leading-relaxed">
                  📸 I looked at your <b>{photoAnalysis.total}</b> photo{photoAnalysis.total !== 1 ? 's' : ''} — they're mostly <b>{ratioLabel(photoAnalysis.dominantRatio)}</b>.
                </p>
                {recommendedSize && recommendedSize !== builder.albumSize ? (
                  <button
                    onClick={() => { void builder.dispatch({ type: 'change_size', payload: { size: recommendedSize }, rawMessage: `change size to ${recommendedSize}` }); showToast(`Switched to ${recommendedSize}`); }}
                    className="mt-2 w-full text-[11px] font-medium py-1.5 rounded-lg bg-peach text-white hover:brightness-105 transition-all"
                  >
                    Best fit: switch to {recommendedSize} →
                  </button>
                ) : recommendedSize ? (
                  <p className="mt-1.5 text-[10px] text-[#7A9B7A] font-medium">✓ Your {builder.albumSize} album is a great fit for these.</p>
                ) : null}
              </div>
            )}

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Photos per page</h3>
              <div className="grid grid-cols-3 gap-2">
                {(DENSITY_BY_SIZE[builder.albumSize] ?? [1, 2, 3, 4]).map((n) => (
                  <button
                    key={n}
                    onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: n }, rawMessage: `${n} photos per page` }); showToast(`${n} per page`); }}
                    className={`flex flex-col items-center py-2 rounded-lg border text-center transition-all ${builder.photosPerPage === n ? 'border-peach bg-cream' : 'border-line hover:border-peach/40'}`}
                  >
                    <span className="text-sm font-bold text-dark">{n}</span>
                    <span className="text-[8px] text-light leading-tight">{DENSITY_LABELS[n]}</span>
                  </button>
                ))}
                <button
                  onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: undefined }, rawMessage: 'surprise photos per page' }); showToast('Surprise mix!'); }}
                  className={`flex flex-col items-center py-2 rounded-lg border text-center transition-all ${builder.photosPerPage === undefined ? 'border-peach bg-cream' : 'border-line hover:border-peach/40'}`}
                >
                  <span className="text-sm">✨</span>
                  <span className="text-[8px] text-light leading-tight">Surprise</span>
                </button>
              </div>
              <p className="text-[9px] text-taupe mt-1.5">✨ Surprise mixes different layouts across your pages.</p>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Containers</h3>
              <div className="grid grid-cols-2 gap-2">
                <ActionCard icon={<Box className="w-4 h-4" />} label="Auto-Fill" onClick={doAutoFill} />
                <ActionCard icon={<Trash2 className="w-4 h-4" />} label="Clear Slots" onClick={doClear} danger />
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Your album plan</h3>
              <div className="p-3 rounded-xl bg-gradient-to-br from-cream to-blush border border-peach/30 space-y-1">
                <div className="flex justify-between text-[11px]"><span className="text-light">Size</span><span className="font-medium text-dark">{builder.albumSize}</span></div>
                {photoAnalysis && <div className="flex justify-between text-[11px]"><span className="text-light">Photos</span><span className="font-medium text-dark">{photoAnalysis.total} · {ratioLabel(photoAnalysis.dominantRatio)}</span></div>}
                <div className="flex justify-between text-[11px]"><span className="text-light">Per page</span><span className="font-medium text-dark">{builder.photosPerPage ?? 'Surprise mix'}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-light">Pages</span><span className="font-medium text-dark">~{estPages}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-light">Theme</span><span className="font-medium text-dark capitalize">{builder.selectedTemplate}</span></div>
              </div>
              <button
                onClick={doGenerate}
                className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-peach to-blush-pink text-white font-semibold text-sm hover:brightness-105 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Make My Album (~{estPages} pages)
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW TAB ── */}
        {SHOW_TOOL_TABS && activeTab === 'view' && (
          <div className="p-4 space-y-4">
            <div className="p-3 bg-cream rounded-xl space-y-2">
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide">Album Info</h3>
              <div className="flex justify-between text-[11px]"><span className="text-taupe">Album Size</span><span className="font-medium text-dark">{builder.albumSize}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-taupe">Total Pages</span><span className="font-medium text-dark">{totalPages}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-taupe">Photos Uploaded</span><span className="font-medium text-dark">{totalPhotos}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-taupe">Current Theme</span><span className="font-medium text-dark capitalize">{builder.selectedTemplate}</span></div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-dark uppercase tracking-wide mb-2">Shortcuts</h3>
              <div className="space-y-1 text-[11px] text-ink-mid">
                <div className="flex justify-between py-1 px-2 bg-cream rounded-lg"><span>Ctrl+Shift+S</span><span className="text-taupe">Toggle sidebar</span></div>
                <div className="flex justify-between py-1 px-2 bg-cream rounded-lg"><span>Ctrl+Z</span><span className="text-taupe">Undo</span></div>
                <div className="flex justify-between py-1 px-2 bg-cream rounded-lg"><span>Ctrl+Y</span><span className="text-taupe">Redo</span></div>
                <div className="flex justify-between py-1 px-2 bg-cream rounded-lg"><span>Ctrl+Scroll</span><span className="text-taupe">Zoom</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MINI CHAT (collapsible bottom drawer) ═══ */}
      {chatOpen && (
        <div className="border-t border-peach/10 bg-cream shrink-0 max-h-[300px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-medium text-medium">Ask Megy</span>
            <button onClick={() => setChatOpen(false)} className="text-light hover:text-dark"><ChevronDown className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2 min-h-[80px] max-h-[180px]">
            {/* overflow-wrap:anywhere — a long unbroken word ("OMGGGG…") ran past
                the bubble and was cut off at the panel edge (1-star testers). */}
            {messages.slice(-4).map((msg) => (
              <div key={msg.id} data-testid="chat-bubble" className={`text-[11px] leading-relaxed whitespace-pre-line [overflow-wrap:anywhere] px-2 py-1 rounded-lg ${msg.role === 'user' ? 'bg-dark text-white ml-4' : 'bg-white text-dark mr-4'}`}>{msg.role === 'assistant' ? <BoldText text={msg.content} /> : msg.content}</div>
            ))}
            {isThinking && <div className="flex gap-1 px-2"><span className="w-1.5 h-1.5 bg-peach rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-peach rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-peach rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>}
          </div>
          <form onSubmit={handleSubmit} className="px-3 py-2 flex gap-2">
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask Megy..." className="flex-1 px-3 py-1.5 rounded-lg bg-white text-xs text-dark placeholder:text-light outline-none focus:ring-2 focus:ring-peach/40 text-[12px]" disabled={isThinking} />
            <button type="submit" disabled={!input.trim() || isThinking} className="w-8 h-8 bg-peach rounded-lg flex items-center justify-center text-white hover:bg-blush-pink transition-colors disabled:opacity-40 shrink-0"><Send className="w-3 h-3" /></button>
          </form>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div role="status" data-testid="megy-toast" className="absolute bottom-4 left-4 right-4 px-4 py-2.5 bg-dark text-white text-[12px] rounded-xl shadow-lg text-center">{toast}</div>
      )}
      </div>{/* end full panel content */}
    </div>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ══════════════════════════════════════════════════════════════════════════ */

function Section({ id, title, icon, children, expanded, toggle }: {
  id: string; title: string; icon: React.ReactNode; children: React.ReactNode;
  expanded: string; toggle: (id: string) => void;
}) {
  const isOpen = expanded === id;
  return (
    <div className="border border-line-soft rounded-xl overflow-hidden">
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-cream hover:bg-peach/10 transition-colors">
        <span className="flex items-center gap-2 text-xs font-semibold text-dark">{icon} {title}</span>
        <ChevronUp size={14} className={`text-light transition-transform ${isOpen ? '' : 'rotate-180'}`} />
      </button>
      {isOpen && <div className="px-3 py-3 border-t border-line-soft">{children}</div>}
    </div>
  );
}

function ActionCard({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all hover:shadow-sm active:scale-[0.98] ${danger ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-cream text-dark hover:bg-peach/20'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function ToggleBtn({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button onClick={onClick} title={title} className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all border"
      style={{ backgroundColor: active ? '#B85C38' : '#fff', color: active ? '#fff' : '#6B6B6B', borderColor: active ? '#B85C38' : '#E8E8E8' }}>
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   BACKGROUND DESIGNER — Rich background controls
   ══════════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════════
   TEXT ELEMENTS LIST — Show all text elements + add button
   ══════════════════════════════════════════════════════════════════════════ */

function TextElementsList({ page, builder }: { page: any; builder: any }) {
  const texts = page?.textElements ?? [];

  if (texts.length === 0) {
    return (
      <button onClick={() => void builder.dispatch({ type: 'add_text', rawMessage: 'add text' })} className="w-full flex items-center justify-center gap-2 py-3 bg-cream hover:bg-peach/20 rounded-xl text-sm font-medium text-dark transition-all">
        <Type className="w-4 h-4" /><span>Add Text Element</span>
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {texts.map((t: TextElement) => (
        <button key={t.id} onClick={() => builder.setSelectedTextId(t.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${builder.selectedTextId === t.id ? 'bg-blush border border-peach' : 'bg-cream hover:bg-peach/20'}`}>
          <span className="text-xs font-medium text-dark truncate flex-1">{t.text || 'Untitled'}</span>
          <span className="text-[10px] text-light">{t.fontSize}px</span>
        </button>
      ))}
      <button onClick={() => void builder.dispatch({ type: 'add_text', rawMessage: 'add text' })} className="w-full flex items-center justify-center gap-2 py-2 text-[11px] text-[#8B7355] hover:text-peach transition-colors">
        <Plus className="w-3.5 h-3.5" /> Add Another
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   FULL TEXT EDITOR — All formatting features
   ══════════════════════════════════════════════════════════════════════════ */

function TextEditor({ text, onUpdate, onDelete }: {
  text: TextElement; onUpdate: (id: string, updates: Partial<TextElement>) => void; onDelete: (id: string) => void;
}) {
  const [subTab, setSubTab] = useState<'content' | 'style' | 'layout'>('content');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (subTab === 'content' && textareaRef.current) { textareaRef.current.focus(); textareaRef.current.select(); } }, [subTab]);
  const update = useCallback((u: Partial<TextElement>) => onUpdate(text.id, u), [text.id, onUpdate]);

  return (
    <div className="w-full">
      {/* Live Preview */}
      <div className="mb-3 p-3 bg-warm-white rounded-lg border border-line-soft">
        <p className="text-center break-words" style={{ fontFamily: text.fontFamily, fontSize: Math.min(text.fontSize * 0.4, 28), color: text.color, fontWeight: text.bold ? 'bold' : 'normal', fontStyle: text.italic ? 'italic' : 'normal', textDecoration: text.underline ? 'underline' : 'none', textAlign: text.alignment, opacity: text.opacity / 100 }}>
          {text.text || 'Your text here'}
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 bg-line-soft rounded-lg p-0.5 mb-3">
        {[{ id: 'content' as const, label: 'Content', icon: <Type size={12} /> }, { id: 'style' as const, label: 'Style', icon: <Palette size={12} /> }, { id: 'layout' as const, label: 'Layout', icon: <Frame size={12} /> }].map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center justify-center gap-1"
            style={{ backgroundColor: subTab === t.id ? '#fff' : 'transparent', color: subTab === t.id ? '#2D2D2D' : '#9B9B9B', boxShadow: subTab === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {subTab === 'content' && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Text</label>
            <textarea ref={textareaRef} value={text.text} onChange={(e) => update({ text: e.target.value })} className="w-full text-xs border border-line rounded-lg px-3 py-2 resize-none h-20 focus:outline-none focus:border-peach focus:ring-1 focus:ring-peach/30 transition-all" placeholder="Enter text..." />
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Alignment</label>
            <div className="flex gap-1">
              <ToggleBtn active={text.alignment === 'left'} onClick={() => update({ alignment: 'left' })} title="Left"><AlignLeft size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.alignment === 'center'} onClick={() => update({ alignment: 'center' })} title="Center"><AlignCenter size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.alignment === 'right'} onClick={() => update({ alignment: 'right' })} title="Right"><AlignRight size={14} className="mx-auto" /></ToggleBtn>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Format</label>
            <div className="flex gap-1">
              <ToggleBtn active={text.bold} onClick={() => update({ bold: !text.bold })} title="Bold"><Bold size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.italic} onClick={() => update({ italic: !text.italic })} title="Italic"><Italic size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.underline} onClick={() => update({ underline: !text.underline })} title="Underline"><Underline size={14} className="mx-auto" /></ToggleBtn>
            </div>
          </div>
          <button onClick={() => onDelete(text.id)} className="w-full py-2 flex items-center justify-center gap-1 text-[11px] text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={12} /> Delete Text</button>
        </div>
      )}

      {/* ── Style ── */}
      {subTab === 'style' && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Font</label>
            <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {FONT_FAMILIES.map((f) => (
                <button key={f.value} onClick={() => update({ fontFamily: f.value })} className="py-1.5 px-1 rounded-md text-[10px] transition-all border text-center"
                  style={{ fontFamily: f.value, backgroundColor: text.fontFamily === f.value ? '#F6E7DF' : '#fff', borderColor: text.fontFamily === f.value ? '#B85C38' : '#E8E8E8', color: text.fontFamily === f.value ? '#9A4A2C' : '#6B6B6B' }}>
                  <span className="text-base block leading-tight">{f.preview}</span>
                  <span className="text-[8px] opacity-70 block truncate">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Size: {text.fontSize}px</label>
            <input type="range" min={8} max={200} value={text.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-full h-1 accent-peach mb-2" />
            <div className="flex flex-wrap gap-1">
              {FONT_SIZE_PRESETS.map((s) => (
                <button key={s} onClick={() => update({ fontSize: s })} className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{ backgroundColor: text.fontSize === s ? '#B85C38' : '#F0F0F0', color: text.fontSize === s ? '#fff' : '#6B6B6B' }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Color</label>
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={text.color} onChange={(e) => update({ color: e.target.value })} className="w-10 h-8 rounded-md border border-line cursor-pointer" />
              <input type="text" value={text.color} onChange={(e) => update({ color: e.target.value })} className="flex-1 text-xs border border-line rounded-md px-2 py-1" />
            </div>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button key={c} onClick={() => update({ color: c })} className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: text.color === c ? '#B85C38' : '#E8E8E8', transform: text.color === c ? 'scale(1.15)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Opacity: {text.opacity}%</label>
            <input type="range" min={0} max={100} value={text.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full h-1 accent-peach" />
          </div>
        </div>
      )}

      {/* ── Layout ── */}
      {subTab === 'layout' && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 block">Position</label>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-light">X</label><input type="number" value={Math.round(text.x)} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full text-xs border border-line rounded-md px-2 py-1" /></div>
              <div><label className="text-[10px] text-light">Y</label><input type="number" value={Math.round(text.y)} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full text-xs border border-line rounded-md px-2 py-1" /></div>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-medium mb-1 flex items-center gap-1"><RotateCcw size={12} /> Rotation: {text.rotation}°</label>
            <input type="range" min={-180} max={180} value={text.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} className="w-full h-1 accent-peach" />
            <div className="flex gap-1 mt-1">
              {[0, 45, 90, -45, -90, 180].map((deg) => (
                <button key={deg} onClick={() => update({ rotation: deg })} className="flex-1 py-0.5 rounded text-[9px] font-medium transition-all"
                  style={{ backgroundColor: text.rotation === deg ? '#B85C38' : '#F0F0F0', color: text.rotation === deg ? '#fff' : '#6B6B6B' }}>{deg}°</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PHOTO FILTER EDITOR — Brightness, contrast, saturation, blur
   ══════════════════════════════════════════════════════════════════════════ */

function PhotoFilterEditor({ photo, onUpdate }: {
  photo: CanvasPhoto; onUpdate: (id: string, filters: Partial<PhotoFilters>) => void;
}) {
  const filters = photo.filters ?? {};
  const update = (f: Partial<PhotoFilters>) => onUpdate(photo.id, { ...filters, ...f });

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-medium text-medium mb-1 flex items-center gap-1"><Sun size={12} /> Brightness: {filters.brightness ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.brightness ?? 100} onChange={(e) => update({ brightness: Number(e.target.value) })} className="w-full h-1 accent-peach" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-medium mb-1 flex items-center gap-1"><Contrast size={12} /> Contrast: {filters.contrast ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.contrast ?? 100} onChange={(e) => update({ contrast: Number(e.target.value) })} className="w-full h-1 accent-peach" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-medium mb-1 flex items-center gap-1"><Droplets size={12} /> Saturate: {filters.saturate ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.saturate ?? 100} onChange={(e) => update({ saturate: Number(e.target.value) })} className="w-full h-1 accent-peach" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-medium mb-1 flex items-center gap-1"><Moon size={12} /> Blur: {Math.round((filters.blur ?? 0) * 10) / 10}px</label>
        <input type="range" min={0} max={10} step={0.1} value={filters.blur ?? 0} onChange={(e) => update({ blur: Number(e.target.value) })} className="w-full h-1 accent-peach" />
      </div>
      <div className="flex gap-1">
        <button onClick={() => onUpdate(photo.id, {})} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-cream hover:bg-peach/20 transition-colors">Reset Filters</button>
        <button onClick={() => onUpdate(photo.id, { brightness: 100, contrast: 100, saturate: 100, blur: 0, sepia: 0, grayscale: 0, hueRotate: 0 })} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-cream hover:bg-peach/20 transition-colors">Clear All</button>
      </div>
    </div>
  );
}
