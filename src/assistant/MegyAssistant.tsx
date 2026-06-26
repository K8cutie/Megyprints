/* ══════════════════════════════════════════════════════════════════════════
   Megy Assistant — Centerpiece Control Panel
   The primary interface for the album builder. Replaces the sidebar.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useBuilderContext } from '../pages/builder/BuilderContext';
import { parseIntent } from './intentParser';
import { WizardEngine, WIZARD_STORAGE_KEY, WIZARD_ORDER, phaseForStep } from './wizard';
import { analyzePhotos, recommendSizeForRatio, ratioLabel } from '../pages/builder/photoAnalyzer';
import RichBackgroundDesigner from '../pages/builder/BackgroundDesigner';
import { DENSITY_BY_SIZE, DENSITY_LABELS } from '../pages/builder/densities';
import type { AssistantMessage } from './types';
import type { TemplateType, TextElement, CanvasPhoto, PhotoFilters, AlbumBackground } from '../pages/builder/types';
import { getThemeBackgroundVariants } from '../pages/builder/types';
import { suggestThemeFromPhotos } from '../pages/builder/themeDetector';
import {
  Wand2, Images, LayoutGrid, Palette, Type, ChevronUp, ChevronDown,
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

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'design', label: 'Design', icon: <Palette className="w-4 h-4" /> },
  { id: 'layout', label: 'Layout', icon: <LayoutGrid className="w-4 h-4" /> },
  { id: 'photos', label: 'Photos', icon: <Images className="w-4 h-4" /> },
  { id: 'view', label: 'View', icon: <Search className="w-4 h-4" /> },
];

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════ */

export default function MegyAssistant({ collapsed: collapsedProp, onToggleCollapsed, mobilePulldown }: { collapsed?: boolean; onToggleCollapsed?: (v: boolean) => void; mobilePulldown?: boolean } = {}) {
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

  /* ── Wizard state ── */
  const isFirstTime = !localStorage.getItem(WIZARD_STORAGE_KEY);
  const wizardRef = useRef(new WizardEngine(builder, isFirstTime));
  // Keep the wizard's builder in sync DURING render (not in an effect) so
  // getMessage() always reads the current page/state — otherwise the review
  // message lags a render behind page navigation.
  wizardRef.current.builder = builder;
  const [showWizard, setShowWizard] = useState(isFirstTime || builder.phase === 'setup');

  /* ── Auto-sync wizard when builder PHASE changes ──
     Only sync when user explicitly transitions phases (setup→edit→preview).
     During setup, the wizard stays at whatever step the user is on. */
  const [wizardStep, setWizardStep] = useState(wizardRef.current.state.step);
  const prevPhaseRef = useRef(builder.phase);

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
     skipped-over steps complete so detectStep stays consistent. */
  useEffect(() => {
    const eng = wizardRef.current;
    if (builder.wizardStep !== eng.state.step) {
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
     Runs on mount and whenever the phase OR the generated-album state changes,
     so a returning user with a finished album lands on "Review" instead of the
     size step. Never yanks the user backward mid-setup. ── */
  useEffect(() => {
    prevPhaseRef.current = builder.phase;
    const detected = wizardRef.current.detectStep();
    const current = wizardRef.current.state.step;
    if (detected !== current) {
      const currentIdx = WIZARD_ORDER.indexOf(current);
      const detectedIdx = WIZARD_ORDER.indexOf(detected);
      if (detectedIdx > currentIdx) {
        for (let i = currentIdx; i < detectedIdx; i++) {
          if (!wizardRef.current.state.completed.includes(WIZARD_ORDER[i])) {
            wizardRef.current.state.completed.push(WIZARD_ORDER[i]);
          }
        }
        wizardRef.current.state.step = detected;
        setWizardStep(detected);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder.phase, builder.albumPages.length]);

  // Force re-render when wizard step changes via key
  const wizardKey = `wizard-${wizardStep}`;

  const page = builder.currentPage;
  const totalPhotos = builder.uploadedPhotos.length;

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
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  /* ── Chat ── */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: AssistantMessage = { id: `u-${Date.now()}`, role: 'user', content: text, timestamp: new Date() };
    setMessages((p) => [...p, userMsg]);
    setInput('');
    setIsThinking(true);
    const parsed = parseIntent(text);
    const result = await builder.dispatch(parsed.intent);
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
          setShowWizard(false);
          localStorage.setItem(WIZARD_STORAGE_KEY, wizardRef.current.serialize());
        }
        break;
      case 'pick_size':
        const sizes: Record<string, string> = {
          '6×6': '6x6', '8×8': '8x8', '9×9': '9x9',
          '6×4': '6x4', '11.5×8': '11.5x8', '8.5×11': '8.5x11',
        };
        const size = Object.keys(sizes).find(k => action.includes(k));
        if (size) {
          void builder.dispatch({ type: 'change_size', payload: { size: sizes[size] }, rawMessage: `change size to ${sizes[size]}` });
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
          showToast(`Size set: ${size}`);
        }
        break;
      case 'pick_background':
        const bgColors: Record<string, string> = {
          'Warm White': '#FFFBF7', 'Soft Blush': '#FDE8E4', 'Light Lavender': '#E8E0F0',
          'Ocean Blue': '#E0E8F0', 'Cream Gold': '#F5E8D0', 'Clean White': '#FFFFFF',
        };
        const bgName = Object.keys(bgColors).find(k => action.includes(k));
        if (bgName) {
          void builder.dispatch({ type: 'set_background', payload: { background: { type: 'solid', solid: bgColors[bgName] }, applyAll: true }, rawMessage: `set background ${bgName}` });
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
          showToast(`Background: ${bgName}`);
        }
        break;
      case 'upload_photos':
        if (action.includes('Generate')) {
          // The upload step doubles as Generate — build the album, then jump to Review.
          void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' });
          wizardRef.current.advance();
          setWizardStep(wizardRef.current.state.step);
          showToast('Album generated!');
        } else if (action.includes('Upload')) {
          fileInputRef.current?.click();
        }
        break;
      case 'review_pages': {
        if (action.includes('Shuffle')) {
          void builder.dispatch({ type: 'shuffle_layout', rawMessage: 'shuffle layout' });
          showToast('This page shuffled');
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
        } else if (action.includes('Save')) {
          builder.manualSave?.();
        }
        break;
    }
  }, [builder, showToast]);
  const doRestartWizard = () => {
    if (!window.confirm('Restart from the beginning? Your current album and photos will be cleared.')) return;
    builder.reset();                              // wipe album + photos
    wizardRef.current.restart();                  // engine → welcome, clear flags
    setShowWizard(true);                          // re-show the guided centerpiece
    setWizardStep(wizardRef.current.state.step);  // syncs store + phase via effects
    try { localStorage.removeItem(WIZARD_STORAGE_KEY); } catch { /* ignore */ }
    showToast('Wizard restarted — back to the beginning');
  };
  const doSurprise = () => {
    void builder.dispatch({ type: 'surprise_me', rawMessage: 'Surprise me' });
    showToast('Fresh layouts across your album!');
  };
  const doGenerate = () => { void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' }); showToast('Album generated!'); };
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
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files) return;
    const photoFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (photoFiles.length === 0) return;
    void builder.dispatch({ type: 'add_photos', payload: { files: photoFiles }, rawMessage: 'add photos' });
    showToast(`${photoFiles.length} photo${photoFiles.length > 1 ? 's' : ''} uploaded`);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /* ── Collapsible sections ── */
  const [expanded, setExpanded] = useState<string>('background');
  const toggle = (id: string) => setExpanded(expanded === id ? '' : id);

  /* ── Option A / centerpiece: during the guided pre-album steps, Megy's card
     IS the screen. Once an album exists (review onward) we fall back to the
     canvas + side panel. This removes any competing center control. ── */
  const centerStage = showWizard && ['welcome', 'pick_size', 'pick_background', 'upload_photos'].includes(wizardStep);

  if (centerStage) {
    const msg = wizardRef.current.getMessage();
    const prog = wizardRef.current.getProgress();
    return (
      <div className="fixed inset-0 z-[95] bg-[#FFFBF7] flex flex-col items-center justify-center p-6 overflow-auto">
        {/* Hidden file input so the Upload step works on the center stage too */}
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />

        {/* Home — the center stage covers the top bar, so give an explicit exit */}
        <Link
          to="/"
          className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-2 bg-white rounded-xl shadow-sm border border-[#E8E8E8] text-xs font-medium text-[#6B6B6B] hover:text-[#F4C2A1] hover:border-[#F4C2A1]/30 transition-all"
          title="Back to homepage"
        >
          <Home size={14} /> Home
        </Link>

        <img src="/megy-character.png" alt="Megy" className="w-20 h-20 object-contain mb-4 drop-shadow-lg" draggable={false} />

        <div className="w-full max-w-lg">
          <div className="flex items-center mb-1">
            <span className="text-[11px] font-medium text-[#8B7E7A]">{prog.label}</span>
          </div>
          <div className="w-full h-1.5 bg-[#F4C2A1]/20 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-[#F4C2A1] rounded-full transition-all" style={{ width: `${prog.percent}%` }} />
          </div>

          <div className="p-6 bg-white rounded-2xl border border-[#F4C2A1]/20 shadow-xl" key={wizardKey}>
            <h3 className="font-display text-xl font-semibold text-[#2D2D2D] mb-2"><TypeText text={msg.title} /></h3>
            {(wizardRef.current.state.step === 'upload_photos' && builder.uploadedPhotos.length > 0) ? (
              <div className="mb-4">
                <p className="text-sm text-[#5A5A5A] leading-relaxed mb-3">Here&apos;s your album setup — ready when you are:</p>
                <ul className="space-y-1.5">
                  <li className="flex items-center gap-2 text-sm text-[#2D2D2D]"><span className="text-[#F4C2A1] font-bold">•</span><span><strong>{builder.uploadedPhotos.length}</strong> photos</span></li>
                  <li className="flex items-center gap-2 text-sm text-[#2D2D2D]"><span className="text-[#F4C2A1] font-bold">•</span><span><strong>{builder.albumSize}</strong> album</span></li>
                  <li className="flex items-center gap-2 text-sm text-[#2D2D2D]"><span className="text-[#F4C2A1] font-bold">•</span><span className="capitalize"><strong>{builder.selectedTemplate}</strong> theme</span></li>
                </ul>
                <p className="text-xs text-[#8B7E7A] mt-3">I&apos;ll create 40+ pages with auto-matched layouts.</p>
              </div>
            ) : (
              <p className="text-sm text-[#5A5A5A] leading-relaxed mb-4">{msg.body}</p>
            )}
            {wizardRef.current.state.step === 'pick_background' ? (
              /* Theme picker on the center stage. Each occasion theme sets the
                 whole look (background + frames + corner art) via apply_theme;
                 the chosen theme is baked into the album when it generates. */
              <div className="grid grid-cols-2 gap-2.5">
                {THEMES.map((t) => {
                  const selected = builder.selectedTemplate === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        void builder.dispatch({ type: 'apply_theme', payload: { theme: t.id }, rawMessage: `apply ${t.id} theme` });
                        showToast(`${t.label} theme selected`);
                      }}
                      className={`flex flex-col items-stretch rounded-xl overflow-hidden border-2 transition-all ${selected ? 'border-[#F4C2A1] ring-2 ring-[#F4C2A1]/30' : 'border-[#F0F0F0] hover:border-[#F4C2A1]/50'}`}
                    >
                      <div className="h-16 w-full" style={{ backgroundColor: t.color }}>
                        <img
                          src={`/themes/bg/${t.id}.svg`}
                          alt=""
                          draggable={false}
                          className="h-16 w-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <span className="py-1.5 text-xs font-medium text-[#2D2D2D]">{t.label}{selected ? ' ✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {msg.actions.map((action) => {
                  const isPrimary = action.includes('→') || action.includes('Now');
                  return (
                    <button
                      key={action}
                      onClick={() => handleWizardAction(action)}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold transition-all ${
                        isPrimary
                          ? 'py-3.5 text-base bg-[#F4C2A1] text-white hover:bg-[#E8A598] shadow-md hover:shadow-lg active:scale-[0.98]'
                          : 'py-2.5 text-sm bg-[#FFF8F0] text-[#2D2D2D] hover:bg-[#F4C2A1]/20 border border-[#F4C2A1]/15'
                      }`}
                    >
                      {action}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#F0F0F0]">
              <button
                onClick={() => { wizardRef.current.back(); setWizardStep(wizardRef.current.state.step); }}
                disabled={wizardRef.current.state.step === 'welcome'}
                className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-[#8B7E7A] hover:bg-[#FFF8F0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ← Previous
              </button>
              <button
                onClick={() => { wizardRef.current.advance(); setWizardStep(wizardRef.current.state.step); }}
                disabled={wizardRef.current.state.step === 'finalize'}
                className="flex items-center gap-1 px-5 py-2 rounded-lg text-sm font-medium bg-[#F4C2A1] text-white hover:bg-[#E8A598] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
            {msg.tips.length > 0 && (
              <div className="mt-3 pt-3 border-t border-[#F0F0F0] space-y-1">
                {msg.tips.map((tip) => (
                  <p key={tip} className="text-[11px] text-[#9B9B9B] flex items-center gap-1.5"><span className="text-[#F4C2A1]">💡</span> {tip}</p>
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
          className="md:hidden fixed top-1.5 right-3 z-[95] w-10 h-10 rounded-full bg-[#F4C2A1] shadow-lg flex items-center justify-center overflow-hidden active:scale-95 transition-transform"
          aria-label="Open Megy"
        >
          <img src="/megy-character.png" alt="Megy" className="w-7 h-7 object-contain" draggable={false} />
        </button>
      )}

    <div className={`fixed z-[90] bg-white shadow-xl flex flex-col overflow-hidden transition-[height] duration-300
      ${mobilePulldown
        ? `left-0 right-0 top-0 w-full rounded-b-2xl border-b border-[#F4C2A1]/20 ${mobileExpanded ? 'h-[82vh]' : 'h-0'}`
        : `left-0 right-0 bottom-0 w-full rounded-t-2xl border-t border-[#F4C2A1]/20 ${mobileExpanded ? 'h-[82vh]' : 'h-[66px]'}`}
      md:left-0 md:right-auto md:top-0 md:bottom-0 md:h-full ${collapsed ? 'md:w-[60px]' : 'md:w-[340px]'} md:rounded-none md:border-t-0 md:border-r md:transition-[width] md:duration-300`}>

      {/* Collapsed rail — desktop only, when minimized: Megy icon + expand */}
      <div className={`hidden ${collapsed ? 'md:flex' : ''} md:flex-col md:items-center md:gap-3 md:pt-4`}>
        <img src="/megy-character.png" alt="Megy" className="w-8 h-8 object-contain" draggable={false} />
        <button onClick={() => setCollapsed(false)} title="Expand Megy" aria-label="Expand Megy"
          className="p-1.5 text-[#9B9B9B] hover:text-[#E8A598] hover:bg-[#FDE8E4] rounded-lg transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Full panel content — hidden on desktop when collapsed */}
      <div className={`flex flex-col flex-1 min-h-0 ${collapsed ? 'md:hidden' : ''}`}>

      {/* Mobile grab-handle — tap to expand/collapse the drawer (hidden at md+) */}
      <button
        type="button"
        onClick={() => setMobileExpanded((v) => !v)}
        className={`md:hidden shrink-0 w-full flex items-center justify-center ${mobilePulldown ? 'order-last pb-3 pt-1' : 'pt-2 pb-1'}`}
        aria-label={mobileExpanded ? 'Collapse Megy' : 'Expand Megy'}
      >
        <span className="w-10 h-1.5 rounded-full bg-[#E8D8C8]" />
      </button>

      {/* ═══ HEADER ═══ */}
      <div className="bg-[#F4C2A1] px-4 py-3 flex items-center justify-between shrink-0">
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
          <button onClick={() => setCollapsed(true)} className="hidden md:inline-flex p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Minimize panel" aria-label="Minimize panel">
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

      {/* ═══ WIZARD PROGRESS BAR ═══ */}
      {showWizard && (
        <div className="px-4 py-2 bg-[#FFF8F0] border-b border-[#F4C2A1]/10 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-[#8B7E7A]">
              {wizardRef.current.getProgress().label}
            </span>
            <button
              onClick={() => { setShowWizard(false); localStorage.setItem(WIZARD_STORAGE_KEY, wizardRef.current.serialize()); }}
              className="text-[10px] text-[#9B9B9B] hover:text-[#2D2D2D]"
            >
              ✕
            </button>
          </div>
          <div className="w-full h-1.5 bg-[#F4C2A1]/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#F4C2A1] rounded-full transition-all"
              style={{ width: `${wizardRef.current.getProgress().percent}%` }}
            />
          </div>

          {/* Wizard Message Card */}
          <div className="mt-2 p-3 bg-white rounded-xl border border-[#F4C2A1]/20" key={wizardKey}>
            <h3 className="text-sm font-semibold text-[#2D2D2D] mb-1">
              <TypeText text={wizardRef.current.getMessage().title} />
            </h3>
            <p className="text-[11px] text-[#5A5A5A] leading-relaxed mb-2">
              {wizardRef.current.getMessage().body}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {wizardRef.current.getMessage().actions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleWizardAction(action)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                    action.includes('→') || action.includes('Now')
                      ? 'bg-[#F4C2A1] text-white hover:bg-[#E8A598]'
                      : 'bg-[#FFF8F0] text-[#2D2D2D] hover:bg-[#F4C2A1]/20 border border-[#F4C2A1]/15'
                  }`}
                >
                  {action}
                </button>
              ))}
            </div>
            {/* Navigation: Previous / Next */}
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F0F0F0]">
              <button
                onClick={() => { wizardRef.current.back(); setWizardStep(wizardRef.current.state.step); }}
                disabled={wizardRef.current.state.step === 'welcome'}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium text-[#8B7E7A] hover:bg-[#FFF8F0] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ← Previous
              </button>
              <button
                onClick={() => { wizardRef.current.advance(); setWizardStep(wizardRef.current.state.step); }}
                disabled={wizardRef.current.state.step === 'finalize'}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#F4C2A1] text-white hover:bg-[#E8A598] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
            {wizardRef.current.getMessage().tips.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#F0F0F0] space-y-0.5">
                {wizardRef.current.getMessage().tips.map((tip) => (
                  <p key={tip} className="text-[10px] text-[#9B9B9B] flex items-center gap-1">
                    <span className="text-[#F4C2A1]">💡</span> {tip}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SURPRISE ME ═══ */}
      <div className="px-4 py-3 bg-[#FFF8F0] border-b border-[#F4C2A1]/10 shrink-0">
        <button onClick={doSurprise} className="w-full flex items-center justify-center gap-2.5 py-3 bg-[#F4C2A1] hover:bg-[#E8A598] text-white rounded-xl font-semibold text-sm transition-all hover:shadow-md active:scale-[0.98]">
          <Wand2 className="w-5 h-5" />
          <span>Surprise Me — New Layouts</span>
        </button>
        <p className="text-[10px] text-[#8B7E7A] text-center mt-1.5">Reshuffles every page into fresh layouts — same theme. Click again for another arrangement!</p>
        <button onClick={doRestartWizard} className="w-full mt-2 flex items-center justify-center gap-2 py-2 text-[#9B9B9B] hover:text-[#E8A598] hover:bg-[#FDE8E4]/50 rounded-lg text-xs font-medium transition-all">
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restart Wizard — start over</span>
        </button>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex border-b border-[#F4C2A1]/10 shrink-0">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${activeTab === tab.id ? 'text-[#F4C2A1] bg-[#FFF8F0] border-b-2 border-[#F4C2A1]' : 'text-[#9B9B9B] hover:text-[#2D2D2D] hover:bg-[#FFF8F0]/50'}`}>
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Hidden file input — always in DOM so wizard can trigger it */}
        <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileUpload} className="hidden" />

        {/* ── DESIGN TAB (Rich) ── */}
        {activeTab === 'design' && (
          <div className="p-4 space-y-3">

            {/* Background Section */}
            <Section id="background" title="Background" icon={<Palette className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
              <RichBackgroundDesigner background={page?.background} onChange={(bg) => { if (bg) doSetBg(bg); }} />
            </Section>

            {/* Themes Section */}
            <Section id="themes" title="Themes" icon={<Sparkles className="w-4 h-4" />} expanded={expanded} toggle={toggle}>
              {builder.uploadedPhotos.length > 0 && (
                <button
                  onClick={doSuggestTheme}
                  disabled={suggesting}
                  className="w-full mb-2.5 flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-[#F4C2A1] to-[#E8A598] text-white hover:opacity-90 disabled:opacity-60 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {suggesting ? 'Analyzing your photos…' : 'Suggest a theme from my photos'}
                </button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {THEMES.map((t) => (
                  <button key={t.id} onClick={() => doSetTheme(t.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium transition-all border ${builder.selectedTemplate === t.id ? 'border-[#F4C2A1] bg-[#FFF8F0] text-[#2D2D2D]' : 'border-transparent hover:border-[#F4C2A1]/30 hover:bg-[#FFF8F0]/50 text-[#5A5A5A]'}`}>
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
                    <p className="text-[10px] font-medium text-[#9B9B9B] mb-1.5">Background style</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {variants.map((src, i) => (
                        <button
                          key={src}
                          onClick={() => void builder.dispatch({ type: 'set_background', payload: { background: { type: 'image', image: src }, applyAll: true }, rawMessage: `background style ${i + 1}` })}
                          className={`rounded-lg overflow-hidden border-2 transition-all ${current === src ? 'border-[#F4C2A1] ring-2 ring-[#F4C2A1]/30' : 'border-[#F0F0F0] hover:border-[#F4C2A1]/50'}`}
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
                      <span className="text-[11px] font-medium text-[#6B6B6B]">Editing: "{selectedText.text.slice(0, 20)}..."</span>
                      <button onClick={() => builder.setSelectedTextId(null)} className="text-[10px] text-[#9B9B9B] hover:text-[#2D2D2D]">Done</button>
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
        {activeTab === 'layout' && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Navigation</h3>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={doPrev} className="p-2 rounded-lg bg-[#FFF8F0] hover:bg-[#F4C2A1]/20 text-[#2D2D2D] transition-colors"><ArrowLeft className="w-4 h-4" /></button>
                <div className="flex-1 text-center">
                  <span className="text-sm font-semibold text-[#2D2D2D]">Page {pageNum}</span>
                  <span className="text-[10px] text-[#8B7E7A]"> of {totalPages}</span>
                </div>
                <button onClick={doNext} className="p-2 rounded-lg bg-[#FFF8F0] hover:bg-[#F4C2A1]/20 text-[#2D2D2D] transition-colors"><ArrowRight className="w-4 h-4" /></button>
              </div>
              <div className="flex gap-2">
                <input type="number" min={1} max={totalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goToPageInput()} placeholder="Go to page..." className="flex-1 px-3 py-1.5 rounded-lg bg-[#FFF8F0] text-sm text-[#2D2D2D] placeholder:text-[#9B9B9B] outline-none focus:ring-2 focus:ring-[#F4C2A1]/40 text-[12px]" />
                <button onClick={goToPageInput} className="px-3 py-1.5 bg-[#F4C2A1] text-white rounded-lg text-[12px] font-medium hover:bg-[#E8A598] transition-colors">Go</button>
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Layout</h3>
              <div className="grid grid-cols-2 gap-2">
                <ActionCard icon={<Shuffle className="w-4 h-4" />} label="Shuffle" onClick={doShuffle} />
                <ActionCard icon={<RefreshCw className="w-4 h-4" />} label="Regenerate" onClick={doRegen} />
                <ActionCard icon={<Plus className="w-4 h-4" />} label="Add Page" onClick={doAddPage} />
                <ActionCard icon={<Minus className="w-4 h-4" />} label="Delete Page" onClick={doDelPage} danger />
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">History</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={doUndo} disabled={!builder.canUndo} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FFF8F0] text-[#2D2D2D] hover:bg-[#F4C2A1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"><RotateCcw className="w-4 h-4" /><span>Undo</span></button>
                <button onClick={doRedo} disabled={!builder.canRedo} className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FFF8F0] text-[#2D2D2D] hover:bg-[#F4C2A1]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm"><Redo className="w-4 h-4" /><span>Redo</span></button>
              </div>
            </div>

            <div className="p-3 bg-[#FFF8F0] rounded-xl">
              <div className="flex items-center justify-between text-[11px]"><span className="text-[#8B7E7A]">Slots filled</span><span className="font-semibold text-[#2D2D2D]">{filledSlots} / {totalSlots}</span></div>
              <div className="w-full h-1.5 bg-[#F4C2A1]/20 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-[#F4C2A1] rounded-full transition-all" style={{ width: `${totalSlots > 0 ? (filledSlots / totalSlots) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* ── PHOTOS TAB ── */}
        {activeTab === 'photos' && (
          <div className="p-4 space-y-4">
            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Upload</h3>
              <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-[#F4C2A1]/40 rounded-xl text-[#8B7355] hover:border-[#F4C2A1] hover:bg-[#FFF8F0] transition-all text-sm">
                <Upload className="w-4 h-4" /><span>Drop photos or click to upload</span>
              </button>
              {totalPhotos > 0 && <p className="text-[10px] text-[#8B7E7A] mt-1.5 text-center">{totalPhotos} photo{totalPhotos !== 1 ? 's' : ''} uploaded</p>}
            </div>

            {photoAnalysis && (
              <div className="p-3 rounded-xl bg-[#FFF8F0] border border-[#F4C2A1]/30">
                <p className="text-[11px] text-[#8B7355] leading-relaxed">
                  📸 I looked at your <b>{photoAnalysis.total}</b> photo{photoAnalysis.total !== 1 ? 's' : ''} — they're mostly <b>{ratioLabel(photoAnalysis.dominantRatio)}</b>.
                </p>
                {recommendedSize && recommendedSize !== builder.albumSize ? (
                  <button
                    onClick={() => { void builder.dispatch({ type: 'change_size', payload: { size: recommendedSize }, rawMessage: `change size to ${recommendedSize}` }); showToast(`Switched to ${recommendedSize}`); }}
                    className="mt-2 w-full text-[11px] font-medium py-1.5 rounded-lg bg-[#F4C2A1] text-white hover:brightness-105 transition-all"
                  >
                    Best fit: switch to {recommendedSize} →
                  </button>
                ) : recommendedSize ? (
                  <p className="mt-1.5 text-[10px] text-[#7A9B7A] font-medium">✓ Your {builder.albumSize} album is a great fit for these.</p>
                ) : null}
              </div>
            )}

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Photos per page</h3>
              <div className="grid grid-cols-3 gap-2">
                {(DENSITY_BY_SIZE[builder.albumSize] ?? [1, 2, 3, 4]).map((n) => (
                  <button
                    key={n}
                    onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: n }, rawMessage: `${n} photos per page` }); showToast(`${n} per page`); }}
                    className={`flex flex-col items-center py-2 rounded-lg border text-center transition-all ${builder.photosPerPage === n ? 'border-[#F4C2A1] bg-[#FFF8F0]' : 'border-[#E8E8E8] hover:border-[#F4C2A1]/40'}`}
                  >
                    <span className="text-sm font-bold text-[#2D2D2D]">{n}</span>
                    <span className="text-[8px] text-[#9B9B9B] leading-tight">{DENSITY_LABELS[n]}</span>
                  </button>
                ))}
                <button
                  onClick={() => { void builder.dispatch({ type: 'set_photos_per_page', payload: { count: undefined }, rawMessage: 'surprise photos per page' }); showToast('Surprise mix!'); }}
                  className={`flex flex-col items-center py-2 rounded-lg border text-center transition-all ${builder.photosPerPage === undefined ? 'border-[#F4C2A1] bg-[#FFF8F0]' : 'border-[#E8E8E8] hover:border-[#F4C2A1]/40'}`}
                >
                  <span className="text-sm">✨</span>
                  <span className="text-[8px] text-[#9B9B9B] leading-tight">Surprise</span>
                </button>
              </div>
              <p className="text-[9px] text-[#8B7E7A] mt-1.5">✨ Surprise mixes different layouts across your pages.</p>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Containers</h3>
              <div className="grid grid-cols-2 gap-2">
                <ActionCard icon={<Box className="w-4 h-4" />} label="Auto-Fill" onClick={doAutoFill} />
                <ActionCard icon={<Trash2 className="w-4 h-4" />} label="Clear Slots" onClick={doClear} danger />
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Your album plan</h3>
              <div className="p-3 rounded-xl bg-gradient-to-br from-[#FFF8F0] to-[#FDE8E4] border border-[#F4C2A1]/30 space-y-1">
                <div className="flex justify-between text-[11px]"><span className="text-[#9B9B9B]">Size</span><span className="font-medium text-[#2D2D2D]">{builder.albumSize}</span></div>
                {photoAnalysis && <div className="flex justify-between text-[11px]"><span className="text-[#9B9B9B]">Photos</span><span className="font-medium text-[#2D2D2D]">{photoAnalysis.total} · {ratioLabel(photoAnalysis.dominantRatio)}</span></div>}
                <div className="flex justify-between text-[11px]"><span className="text-[#9B9B9B]">Per page</span><span className="font-medium text-[#2D2D2D]">{builder.photosPerPage ?? 'Surprise mix'}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[#9B9B9B]">Pages</span><span className="font-medium text-[#2D2D2D]">~{estPages}</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[#9B9B9B]">Theme</span><span className="font-medium text-[#2D2D2D] capitalize">{builder.selectedTemplate}</span></div>
              </div>
              <button
                onClick={doGenerate}
                className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-[#F4C2A1] to-[#E8A598] text-white font-semibold text-sm hover:brightness-105 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Make My Album (~{estPages} pages)
              </button>
            </div>
          </div>
        )}

        {/* ── VIEW TAB ── */}
        {activeTab === 'view' && (
          <div className="p-4 space-y-4">
            <div className="p-3 bg-[#FFF8F0] rounded-xl space-y-2">
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide">Album Info</h3>
              <div className="flex justify-between text-[11px]"><span className="text-[#8B7E7A]">Album Size</span><span className="font-medium text-[#2D2D2D]">{builder.albumSize}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-[#8B7E7A]">Total Pages</span><span className="font-medium text-[#2D2D2D]">{totalPages}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-[#8B7E7A]">Photos Uploaded</span><span className="font-medium text-[#2D2D2D]">{totalPhotos}</span></div>
              <div className="flex justify-between text-[11px]"><span className="text-[#8B7E7A]">Current Theme</span><span className="font-medium text-[#2D2D2D] capitalize">{builder.selectedTemplate}</span></div>
            </div>

            <div>
              <h3 className="text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wide mb-2">Shortcuts</h3>
              <div className="space-y-1 text-[11px] text-[#5A5A5A]">
                <div className="flex justify-between py-1 px-2 bg-[#FFF8F0] rounded-lg"><span>Ctrl+Shift+S</span><span className="text-[#8B7E7A]">Toggle sidebar</span></div>
                <div className="flex justify-between py-1 px-2 bg-[#FFF8F0] rounded-lg"><span>Ctrl+Z</span><span className="text-[#8B7E7A]">Undo</span></div>
                <div className="flex justify-between py-1 px-2 bg-[#FFF8F0] rounded-lg"><span>Ctrl+Y</span><span className="text-[#8B7E7A]">Redo</span></div>
                <div className="flex justify-between py-1 px-2 bg-[#FFF8F0] rounded-lg"><span>Ctrl+Scroll</span><span className="text-[#8B7E7A]">Zoom</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ MINI CHAT (collapsible bottom drawer) ═══ */}
      {chatOpen && (
        <div className="border-t border-[#F4C2A1]/10 bg-[#FFF8F0] shrink-0 max-h-[300px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-medium text-[#6B6B6B]">Ask Megy</span>
            <button onClick={() => setChatOpen(false)} className="text-[#9B9B9B] hover:text-[#2D2D2D]"><ChevronDown className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-1 space-y-2 min-h-[80px] max-h-[180px]">
            {messages.slice(-4).map((msg) => (
              <div key={msg.id} className={`text-[11px] leading-relaxed px-2 py-1 rounded-lg ${msg.role === 'user' ? 'bg-[#2D2D2D] text-white ml-4' : 'bg-white text-[#2D2D2D] mr-4'}`}>{msg.content}</div>
            ))}
            {isThinking && <div className="flex gap-1 px-2"><span className="w-1.5 h-1.5 bg-[#F4C2A1] rounded-full animate-bounce" /><span className="w-1.5 h-1.5 bg-[#F4C2A1] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-[#F4C2A1] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></div>}
          </div>
          <form onSubmit={handleSubmit} className="px-3 py-2 flex gap-2">
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask Megy..." className="flex-1 px-3 py-1.5 rounded-lg bg-white text-xs text-[#2D2D2D] placeholder:text-[#9B9B9B] outline-none focus:ring-2 focus:ring-[#F4C2A1]/40 text-[12px]" disabled={isThinking} />
            <button type="submit" disabled={!input.trim() || isThinking} className="w-8 h-8 bg-[#F4C2A1] rounded-lg flex items-center justify-center text-white hover:bg-[#E8A598] transition-colors disabled:opacity-40 shrink-0"><Send className="w-3 h-3" /></button>
          </form>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div className="absolute bottom-4 left-4 right-4 px-4 py-2.5 bg-[#2D2D2D] text-white text-[12px] rounded-xl shadow-lg text-center">{toast}</div>
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
    <div className="border border-[#F0F0F0] rounded-xl overflow-hidden">
      <button onClick={() => toggle(id)} className="w-full flex items-center justify-between px-3 py-2.5 text-left bg-[#FFF8F0] hover:bg-[#F4C2A1]/10 transition-colors">
        <span className="flex items-center gap-2 text-xs font-semibold text-[#2D2D2D]">{icon} {title}</span>
        <ChevronUp size={14} className={`text-[#9B9B9B] transition-transform ${isOpen ? '' : 'rotate-180'}`} />
      </button>
      {isOpen && <div className="px-3 py-3 border-t border-[#F0F0F0]">{children}</div>}
    </div>
  );
}

function ActionCard({ icon, label, onClick, danger }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-medium transition-all hover:shadow-sm active:scale-[0.98] ${danger ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-[#FFF8F0] text-[#2D2D2D] hover:bg-[#F4C2A1]/20'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function ToggleBtn({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button onClick={onClick} title={title} className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all border"
      style={{ backgroundColor: active ? '#F4C2A1' : '#fff', color: active ? '#fff' : '#6B6B6B', borderColor: active ? '#F4C2A1' : '#E8E8E8' }}>
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
      <button onClick={() => void builder.dispatch({ type: 'add_text', rawMessage: 'add text' })} className="w-full flex items-center justify-center gap-2 py-3 bg-[#FFF8F0] hover:bg-[#F4C2A1]/20 rounded-xl text-sm font-medium text-[#2D2D2D] transition-all">
        <Type className="w-4 h-4" /><span>Add Text Element</span>
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      {texts.map((t: TextElement) => (
        <button key={t.id} onClick={() => builder.setSelectedTextId(t.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all ${builder.selectedTextId === t.id ? 'bg-[#FDE8E4] border border-[#F4C2A1]' : 'bg-[#FFF8F0] hover:bg-[#F4C2A1]/20'}`}>
          <span className="text-xs font-medium text-[#2D2D2D] truncate flex-1">{t.text || 'Untitled'}</span>
          <span className="text-[10px] text-[#9B9B9B]">{t.fontSize}px</span>
        </button>
      ))}
      <button onClick={() => void builder.dispatch({ type: 'add_text', rawMessage: 'add text' })} className="w-full flex items-center justify-center gap-2 py-2 text-[11px] text-[#8B7355] hover:text-[#F4C2A1] transition-colors">
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
      <div className="mb-3 p-3 bg-[#FFFBF7] rounded-lg border border-[#F0F0F0]">
        <p className="text-center break-words" style={{ fontFamily: text.fontFamily, fontSize: Math.min(text.fontSize * 0.4, 28), color: text.color, fontWeight: text.bold ? 'bold' : 'normal', fontStyle: text.italic ? 'italic' : 'normal', textDecoration: text.underline ? 'underline' : 'none', textAlign: text.alignment, opacity: text.opacity / 100 }}>
          {text.text || 'Your text here'}
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 bg-[#F0F0F0] rounded-lg p-0.5 mb-3">
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
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Text</label>
            <textarea ref={textareaRef} value={text.text} onChange={(e) => update({ text: e.target.value })} className="w-full text-xs border border-[#E8E8E8] rounded-lg px-3 py-2 resize-none h-20 focus:outline-none focus:border-[#F4C2A1] focus:ring-1 focus:ring-[#F4C2A1]/30 transition-all" placeholder="Enter text..." />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Alignment</label>
            <div className="flex gap-1">
              <ToggleBtn active={text.alignment === 'left'} onClick={() => update({ alignment: 'left' })} title="Left"><AlignLeft size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.alignment === 'center'} onClick={() => update({ alignment: 'center' })} title="Center"><AlignCenter size={14} className="mx-auto" /></ToggleBtn>
              <ToggleBtn active={text.alignment === 'right'} onClick={() => update({ alignment: 'right' })} title="Right"><AlignRight size={14} className="mx-auto" /></ToggleBtn>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Format</label>
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
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Font</label>
            <div className="grid grid-cols-3 gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
              {FONT_FAMILIES.map((f) => (
                <button key={f.value} onClick={() => update({ fontFamily: f.value })} className="py-1.5 px-1 rounded-md text-[10px] transition-all border text-center"
                  style={{ fontFamily: f.value, backgroundColor: text.fontFamily === f.value ? '#FDE8E4' : '#fff', borderColor: text.fontFamily === f.value ? '#F4C2A1' : '#E8E8E8', color: text.fontFamily === f.value ? '#E8A598' : '#6B6B6B' }}>
                  <span className="text-base block leading-tight">{f.preview}</span>
                  <span className="text-[8px] opacity-70 block truncate">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Size: {text.fontSize}px</label>
            <input type="range" min={8} max={200} value={text.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1] mb-2" />
            <div className="flex flex-wrap gap-1">
              {FONT_SIZE_PRESETS.map((s) => (
                <button key={s} onClick={() => update({ fontSize: s })} className="px-2 py-0.5 rounded text-[10px] font-medium transition-all"
                  style={{ backgroundColor: text.fontSize === s ? '#F4C2A1' : '#F0F0F0', color: text.fontSize === s ? '#fff' : '#6B6B6B' }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Color</label>
            <div className="flex items-center gap-2 mb-2">
              <input type="color" value={text.color} onChange={(e) => update({ color: e.target.value })} className="w-10 h-8 rounded-md border border-[#E8E8E8] cursor-pointer" />
              <input type="text" value={text.color} onChange={(e) => update({ color: e.target.value })} className="flex-1 text-xs border border-[#E8E8E8] rounded-md px-2 py-1" />
            </div>
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button key={c} onClick={() => update({ color: c })} className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ backgroundColor: c, borderColor: text.color === c ? '#F4C2A1' : '#E8E8E8', transform: text.color === c ? 'scale(1.15)' : 'scale(1)' }} />
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Opacity: {text.opacity}%</label>
            <input type="range" min={0} max={100} value={text.opacity} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
          </div>
        </div>
      )}

      {/* ── Layout ── */}
      {subTab === 'layout' && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 block">Position</label>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] text-[#9B9B9B]">X</label><input type="number" value={Math.round(text.x)} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1" /></div>
              <div><label className="text-[10px] text-[#9B9B9B]">Y</label><input type="number" value={Math.round(text.y)} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full text-xs border border-[#E8E8E8] rounded-md px-2 py-1" /></div>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1"><RotateCcw size={12} /> Rotation: {text.rotation}°</label>
            <input type="range" min={-180} max={180} value={text.rotation} onChange={(e) => update({ rotation: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
            <div className="flex gap-1 mt-1">
              {[0, 45, 90, -45, -90, 180].map((deg) => (
                <button key={deg} onClick={() => update({ rotation: deg })} className="flex-1 py-0.5 rounded text-[9px] font-medium transition-all"
                  style={{ backgroundColor: text.rotation === deg ? '#F4C2A1' : '#F0F0F0', color: text.rotation === deg ? '#fff' : '#6B6B6B' }}>{deg}°</button>
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
        <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1"><Sun size={12} /> Brightness: {filters.brightness ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.brightness ?? 100} onChange={(e) => update({ brightness: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1"><Contrast size={12} /> Contrast: {filters.contrast ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.contrast ?? 100} onChange={(e) => update({ contrast: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1"><Droplets size={12} /> Saturate: {filters.saturate ?? 100}%</label>
        <input type="range" min={0} max={200} value={filters.saturate ?? 100} onChange={(e) => update({ saturate: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
      </div>
      <div>
        <label className="text-[11px] font-medium text-[#6B6B6B] mb-1 flex items-center gap-1"><Moon size={12} /> Blur: {Math.round((filters.blur ?? 0) * 10) / 10}px</label>
        <input type="range" min={0} max={10} step={0.1} value={filters.blur ?? 0} onChange={(e) => update({ blur: Number(e.target.value) })} className="w-full h-1 accent-[#F4C2A1]" />
      </div>
      <div className="flex gap-1">
        <button onClick={() => onUpdate(photo.id, {})} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-[#FFF8F0] hover:bg-[#F4C2A1]/20 transition-colors">Reset Filters</button>
        <button onClick={() => onUpdate(photo.id, { brightness: 100, contrast: 100, saturate: 100, blur: 0, sepia: 0, grayscale: 0, hueRotate: 0 })} className="flex-1 py-1.5 rounded-lg text-[11px] font-medium bg-[#FFF8F0] hover:bg-[#F4C2A1]/20 transition-colors">Clear All</button>
      </div>
    </div>
  );
}
