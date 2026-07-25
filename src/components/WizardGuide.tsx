import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronRight, ChevronLeft, Upload, ImagePlus,
  LayoutGrid, Sparkles, Palette, Move, BoxSelect,
  Type, Eye, ShoppingBag, RotateCcw, Lightbulb,
  CheckCircle2, Monitor, Frame
} from 'lucide-react';

/* ══════════════════════════════════════════════════════════════════════════
   WizardGuide — Comprehensive interactive guide through album creation
   ══════════════════════════════════════════════════════════════════════════ */

const WIZARD_KEY = 'megy-wizard-state';
const WIZARD_DISMISSED_KEY = 'megy-wizard-dismissed';

export type WizardPhase = 'setup' | 'upload' | 'design' | 'preview' | 'complete';

interface WizardStep {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  tips?: string[];
  icon: React.ReactNode;
  iconBg: string;
  phase: WizardPhase;
  showIfPhotos?: boolean;
  showIfGenerated?: boolean;
}

/* ── All wizard steps in order ── */
const WIZARD_STEPS: WizardStep[] = [
  /* ══════ SETUP PHASE ══════ */
  {
    id: 'welcome',
    title: 'Welcome to Megy Prints!',
    subtitle: 'Let\'s create your album together',
    body: 'This guide will walk you through every step of creating a beautiful photo album. You can dismiss this anytime and it will return when you need help.',
    icon: <Sparkles size={22} />,
    iconBg: 'bg-[#F4C2A1]',
    phase: 'setup',
  },
  {
    id: 'choose-size',
    title: 'Choose Your Album Size',
    subtitle: 'Step 1 of 3 — Setup',
    body: 'Pick the size for your printed album. Larger sizes are great for weddings and events. Smaller sizes are perfect for gifts and travel memories.',
    tips: ['8x8" — Perfect for travel and gift albums', '10x10" — Great for family memories', '12x12" — Ideal for weddings and special events'],
    icon: <Frame size={22} />,
    iconBg: 'bg-[#E8A598]',
    phase: 'setup',
  },
  {
    id: 'choose-template',
    title: 'Pick a Template Theme',
    subtitle: 'Step 2 of 3 — Setup',
    body: 'Select a design theme that matches your photos. Each template has different layouts, fonts, and color palettes. You can always change this later for individual pages.',
    tips: ['Classic — Clean, timeless layouts', 'Elegant — Romantic, full-bleed photos', 'Minimalist — Let your photos shine', 'Kids — Playful, colorful designs'],
    icon: <LayoutGrid size={22} />,
    iconBg: 'bg-[#B8A9D9]',
    phase: 'setup',
  },
  {
    id: 'review-pricing',
    title: 'Review Your Price',
    subtitle: 'Step 3 of 3 — Setup',
    body: 'Your price is calculated based on size, material, and page count. The minimum is 40 pages. More photos = more pages = slightly higher cost. You can always see the price breakdown.',
    icon: <ShoppingBag size={22} />,
    iconBg: 'bg-[#9BCFB8]',
    phase: 'setup',
  },

  /* ══════ UPLOAD PHASE ══════ */
  {
    id: 'upload-photos',
    title: 'Upload Your Photos',
    subtitle: 'Step 1 — Photos',
    body: 'Upload 20 or more of your favorite JPG or PNG photos — there\'s no limit, and you can add more at any time. Drag and drop them onto the area, or click to browse your files. If your phone limits how many you can pick at once, just upload again — repeats are skipped automatically.',
    tips: ['Drag & drop multiple files at once', 'Click a photo to remove or replace it', 'Photos are stored in the cloud when logged in'],
    icon: <Upload size={22} />,
    iconBg: 'bg-[#E8A598]',
    phase: 'upload',
  },
  {
    id: 'photo-count',
    title: 'How Many Photos Per Page?',
    subtitle: 'Step 2 — Layout Density',
    body: 'This controls how many photos appear on each page. Fewer photos per page = larger photos and a more premium feel. More photos per page = more compact and affordable.',
    icon: <ImagePlus size={22} />,
    iconBg: 'bg-[#8FBFE0]',
    phase: 'upload',
    showIfPhotos: true,
  },

  /* ══════ DESIGN PHASE ══════ */
  {
    id: 'generate-layouts',
    title: 'Generate Your Album',
    subtitle: 'Step 1 — Auto Layout',
    body: 'Click "Generate All" to automatically arrange your photos into beautiful pages. Our smart system picks the best template for each page and distributes your photos evenly. You can regenerate any page later!',
    tips: ['Generate All — Fills every page at once', 'Generate — Just the current page', 'Regenerate — Shuffles to a new random layout'],
    icon: <Sparkles size={22} />,
    iconBg: 'bg-[#B8A9D9]',
    phase: 'design',
    showIfPhotos: true,
  },
  {
    id: 'understand-canvas',
    title: 'Navigating the Canvas',
    subtitle: 'Step 2 — Canvas Controls',
    body: 'Use these tools to move around your album. The canvas is where you design each page. Scroll with your mouse wheel to navigate between pages. Hold Ctrl/Cmd while scrolling to zoom in and out.',
    tips: ['Mouse wheel → Next/Previous page', 'Ctrl+Scroll → Zoom in/out', 'Click a photo to select it', 'Drag selected photos to reposition'],
    icon: <Monitor size={22} />,
    iconBg: 'bg-[#F4C2A1]',
    phase: 'design',
    showIfGenerated: true,
  },
  {
    id: 'photo-panning',
    title: 'Photo Not Showing Right?',
    subtitle: 'IMPORTANT — How to Pan Photos',
    body: 'When a photo is cropped inside its frame, you can pan it to show the best part. Here is the 4-step process:',
    icon: <Move size={22} />,
    iconBg: 'bg-[#EF4444]',
    phase: 'design',
    showIfGenerated: true,
  },
  {
    id: 'add-text',
    title: 'Add Text to Pages',
    subtitle: 'Step 4 — Text Elements',
    body: 'Click "Add Text" in the left panel to place a text box on the page. Double-click the text to edit it inline. Use the panel on the left to change font, size, color, alignment, and more.',
    tips: ['Double-click text → Edit inline', 'Select text → Change font, size, color', 'Drag text → Reposition on page', 'Delete key → Remove selected text'],
    icon: <Type size={22} />,
    iconBg: 'bg-[#8FBFE0]',
    phase: 'design',
    showIfGenerated: true,
  },
  {
    id: 'add-background',
    title: 'Change the Background',
    subtitle: 'Step 5 — Backgrounds',
    body: 'Click the "Background" tab in the left panel to choose a background. Pick from solid colors, CSS gradients, or upload your own custom background image. The background applies to the current page — use "Apply to All" to set it everywhere.',
    tips: ['Solid color — Clean, simple', 'Gradient — Subtle depth and style', 'Custom image — Upload your own', 'Apply to All — Set for every page'],
    icon: <Palette size={22} />,
    iconBg: 'bg-[#9BCFB8]',
    phase: 'design',
    showIfGenerated: true,
  },
  {
    id: 'pages-panel',
    title: 'Navigate Between Pages',
    subtitle: 'Step 6 — Page Navigation',
    body: 'Click the "Pages" tab in the left panel to see thumbnails of all your pages. Click any thumbnail to jump to that page. You can also duplicate or delete pages from this view. Use the mouse wheel on the canvas area to scroll through pages quickly.',
    icon: <LayoutGrid size={22} />,
    iconBg: 'bg-[#E8A598]',
    phase: 'design',
    showIfGenerated: true,
  },
  {
    id: 'undo-redo',
    title: 'Shuffle & Regenerate',
    subtitle: 'Step 7 — Layout Options',
    body: 'Not happy with a page layout? Click "Shuffle Layout" to try a different template for the current page. Or use "Regenerate" to completely redo the layout. "Clear All Slots" removes all photos from the current page so you can start over.',
    tips: ['Shuffle Layout — New template, same photos', 'Regenerate — Complete redo with random layout', 'Clear All — Remove all photos from page', 'Auto Fill — Fill empty slots with unused photos'],
    icon: <RotateCcw size={22} />,
    iconBg: 'bg-[#B8A9D9]',
    phase: 'design',
    showIfGenerated: true,
  },

  /* ══════ PREVIEW PHASE ══════ */
  {
    id: 'preview-spreads',
    title: 'Preview Your Album',
    subtitle: 'Spread View',
    body: 'The preview shows your album as printed spreads — pairs of facing pages. Use the arrows to navigate. This is exactly how your album will look when printed! Review every spread carefully before ordering.',
    icon: <Eye size={22} />,
    iconBg: 'bg-[#F4C2A1]',
    phase: 'preview',
  },
  {
    id: 'order-album',
    title: 'Place Your Order',
    subtitle: 'Final Step',
    body: 'Ready to print? Review your material, size, and price. Fill in your shipping details and submit your order. Your album will be professionally printed and delivered to your door!',
    tips: ['Review material options — Premium, Standard, etc.', 'Check shipping address carefully', 'Save your project before ordering'],
    icon: <ShoppingBag size={22} />,
    iconBg: 'bg-[#9BCFB8]',
    phase: 'complete',
  },
];

/* ── Helper types ── */
interface WizardState {
  currentStepIndex: number;
  dismissed: boolean;
  completedSteps: string[];
}

function loadWizardState(): WizardState {
  try {
    const raw = localStorage.getItem(WIZARD_KEY);
    if (raw) return JSON.parse(raw) as WizardState;
  } catch { /* ignore */ }
  return { currentStepIndex: 0, dismissed: false, completedSteps: [] };
}

function saveWizardState(state: WizardState): void {
  try {
    localStorage.setItem(WIZARD_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function isGloballyDismissed(): boolean {
  try {
    return localStorage.getItem(WIZARD_DISMISSED_KEY) === 'true';
  } catch { return false; }
}

function markGloballyDismissed(): void {
  try { localStorage.setItem(WIZARD_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
}

/* ══════════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════════ */

interface WizardGuideProps {
  phase: WizardPhase;
  photoCount: number;
  hasGeneratedContent: boolean;
  onAction?: (actionId: string) => void;
  onComplete?: () => void;
}

export function WizardGuide({
  phase,
  photoCount,
  hasGeneratedContent,
  onAction,
  onComplete,
}: WizardGuideProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [showTips, setShowTips] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  /* Track which phases we've already auto-shown for */
  const shownForPhaseRef = useRef<Set<string>>(new Set());
  const prevPhaseRef = useRef<WizardPhase>(phase);

  // Initialize from saved state on first mount
  useEffect(() => {
    if (isGloballyDismissed()) {
      setDismissed(true);
      return;
    }
    const saved = loadWizardState();
    setStepIndex(saved.currentStepIndex);
    setDismissed(saved.dismissed);
    setCompletedSteps(saved.completedSteps);
  }, []);

  // Auto-show wizard when phase changes (but only once per phase)
  useEffect(() => {
    if (dismissed || isGloballyDismissed()) return;
    if (phase === prevPhaseRef.current && shownForPhaseRef.current.has(phase)) return;

    prevPhaseRef.current = phase;

    // Don't auto-show if we've already shown this phase
    if (shownForPhaseRef.current.has(phase)) return;

    // Check if there are relevant steps for this phase
    const hasRelevantSteps = WIZARD_STEPS.some((s) => {
      if (s.phase !== phase) return false;
      if (s.showIfPhotos && photoCount === 0) return false;
      if (s.showIfGenerated && !hasGeneratedContent) return false;
      return true;
    });

    if (hasRelevantSteps) {
      shownForPhaseRef.current.add(phase);
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [phase, photoCount, hasGeneratedContent, dismissed]);

  // Filter steps for current conditions
  const relevantSteps = WIZARD_STEPS.filter((s) => {
    if (s.phase !== phase) return false;
    if (s.showIfPhotos && photoCount === 0) return false;
    if (s.showIfGenerated && !hasGeneratedContent) return false;
    return true;
  });

  const currentStep = relevantSteps[stepIndex] ?? null;
  const isLastStep = stepIndex >= relevantSteps.length - 1;
  const canGoBack = stepIndex > 0;

  // Persist state changes
  useEffect(() => {
    saveWizardState({ currentStepIndex: stepIndex, dismissed, completedSteps });
  }, [stepIndex, dismissed, completedSteps]);

  const handleNext = useCallback(() => {
    if (!currentStep) return;
    setCompletedSteps((prev) =>
      prev.includes(currentStep.id) ? prev : [...prev, currentStep.id]
    );
    if (isLastStep) {
      setIsVisible(false);
      onComplete?.();
    } else {
      setStepIndex((prev) => prev + 1);
      setShowTips(false);
    }
  }, [currentStep, isLastStep, onComplete]);

  const handleBack = useCallback(() => {
    if (canGoBack) {
      setStepIndex((prev) => prev - 1);
      setShowTips(false);
    }
  }, [canGoBack]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setDismissed(true);
  }, []);

  const handleShow = useCallback(() => {
    setIsVisible(true);
    setDismissed(false);
  }, []);

  const handleGlobalDismiss = useCallback(() => {
    setIsVisible(false);
    setDismissed(true);
    markGloballyDismissed();
  }, []);

  const handleAction = useCallback(
    (actionId: string) => {
      if (actionId === 'trigger-upload') {
        setIsPickerOpen(true);
        setTimeout(() => setIsPickerOpen(false), 3000);
      }
      onAction?.(actionId);
    },
    [onAction]
  );

  const handleBackdropClick = useCallback(() => {
    if (isPickerOpen) return; // Don't dismiss while file picker is open
    handleDismiss();
  }, [isPickerOpen, handleDismiss]);

  const hasSteps = relevantSteps.length > 0;

  // Reset step index when phase changes and steps don't match
  useEffect(() => {
    if (stepIndex >= relevantSteps.length) {
      setStepIndex(0);
    }
  }, [relevantSteps.length, stepIndex]);

  return (
    <>
      {/* Floating help button */}
      {!isVisible && !isGloballyDismissed() && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 2, type: 'spring', damping: 20 }}
          onClick={handleShow}
          className="fixed bottom-6 right-6 z-50 pl-3 pr-4 py-2.5 rounded-full bg-[#F4C2A1] text-white shadow-lg hover:brightness-110 transition-all flex items-center gap-2"
          title="Show Guide"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
          <Lightbulb size={18} />
          <span className="text-sm font-semibold">Guide</span>
        </motion.button>
      )}

      {/* Main wizard modal */}
      <AnimatePresence>
        {isVisible && hasSteps && currentStep && (
          <>
            {/* Backdrop — blocks dismissal while file picker is open */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/25 backdrop-blur-[2px]"
              onClick={handleBackdropClick}
            />

            {/* Modal — stops click propagation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[100] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg mx-4"
            >
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
                {/* Top accent bar */}
                <div className={`h-1.5 ${currentStep.iconBg}`} />

                {/* Header */}
                <div className="p-6 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${currentStep.iconBg} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                        {currentStep.icon}
                      </div>
                      <div>
                        <p className="text-[0.7rem] font-medium text-[#8B7E7A] uppercase tracking-wider">
                          {currentStep.subtitle}
                        </p>
                        <h3 className="font-display text-lg font-bold text-[#2D2D2D]">
                          {currentStep.title}
                        </h3>
                      </div>
                    </div>
                    <button
                      onClick={handleDismiss}
                      className="p-1.5 rounded-lg text-[#8B7E7A] hover:text-[#4A423F] hover:bg-[#F5EDE8] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 pb-2">
                  <p className="text-[#4A423F] text-sm leading-relaxed">
                    {currentStep.body}
                  </p>

                  {/* Tips toggle */}
                  {currentStep.tips && currentStep.tips.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => setShowTips((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[#E8A598] hover:text-[#D8958D] transition-colors"
                      >
                        <Lightbulb size={12} />
                        {showTips ? 'Hide tips' : 'Show tips'}
                      </button>
                      <AnimatePresence>
                        {showTips && (
                          <motion.ul
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-2 space-y-1.5 overflow-hidden"
                          >
                            {currentStep.tips.map((tip, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-2 text-xs text-[#6B6B6B]"
                              >
                                <CheckCircle2 size={12} className="text-[#9BCFB8] shrink-0 mt-0.5" />
                                <span>{tip}</span>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Step-specific action buttons */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {currentStep.id === 'upload-photos' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('trigger-upload'); }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#F4C2A1] text-white text-sm font-medium rounded-lg hover:brightness-105 transition-all"
                        >
                          <Upload size={14} />
                          Browse Files
                        </button>
                      </>
                    )}
                    {currentStep.id === 'photo-count' && (
                      <div className="flex flex-col gap-2 mt-3 w-full">
                        {[
                          { label: '1–2 photos', value: 'photos-per-page-1', desc: 'Premium, magazine-style' },
                          { label: '3–4 photos', value: 'photos-per-page-3', desc: 'Balanced, most popular' },
                          { label: '5+ photos', value: 'photos-per-page-5', desc: 'Compact, event coverage' },
                          { label: 'Random', value: 'photos-per-page-random', desc: 'Mix it up!' },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#E8D5D0] hover:border-[#F4C2A1] hover:bg-[#FDE8E4]/30 cursor-pointer transition-all"
                          >
                            <input
                              type="radio"
                              name="photos-per-page"
                              className="accent-[#F4C2A1] w-4 h-4 shrink-0"
                              onChange={(e) => { e.stopPropagation(); handleAction(opt.value); }}
                            />
                            <div>
                              <div className="text-sm font-semibold text-[#2D2D2D]">{opt.label}</div>
                              <div className="text-xs text-[#8B7E7A]">{opt.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {currentStep.id === 'generate-layouts' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('generate-all'); }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#B8A9D9] text-white text-sm font-medium rounded-lg hover:brightness-105 transition-all"
                        >
                          <Sparkles size={14} />
                          Generate All
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('generate-page'); }}
                          className="flex items-center gap-2 px-4 py-2 border border-[#B8A9D9] text-[#B8A9D9] text-sm font-medium rounded-lg hover:bg-[#B8A9D9]/5 transition-all"
                        >
                          <Sparkles size={14} />
                          Generate This Page
                        </button>
                      </>
                    )}
                    {currentStep.id === 'add-background' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('open-background-tab'); }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#9BCFB8] text-white text-sm font-medium rounded-lg hover:brightness-105 transition-all"
                        >
                          <Palette size={14} />
                          Open Background Tab
                        </button>
                      </>
                    )}
                    {currentStep.id === 'add-text' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('add-text-element'); }}
                          className="flex items-center gap-2 px-4 py-2 bg-[#8FBFE0] text-white text-sm font-medium rounded-lg hover:brightness-105 transition-all"
                        >
                          <Type size={14} />
                          Add Text
                        </button>
                      </>
                    )}
                    {currentStep.id === 'photo-panning' && (
                      <div className="flex flex-col gap-3 mt-3 w-full">
                        {/* Visual 4-step walkthrough */}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { step: '1', text: 'Click photo to select', color: 'bg-[#F4C2A1]' },
                            { step: '2', text: 'Click "Containers" button', color: 'bg-[#3B82F6]' },
                            { step: '3', text: 'Drag photo inside frame', color: 'bg-[#9BCFB8]' },
                            { step: '4', text: 'Click outside → Done!', color: 'bg-[#B8A9D9]' },
                          ].map((s) => (
                            <div key={s.step} className={`${s.color}/10 border ${s.color.replace('bg-', 'border-')}/30 rounded-lg p-2.5 flex items-start gap-2`}>
                              <span className={`${s.color} text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5`}>{s.step}</span>
                              <span className="text-xs text-[#4A423F] font-medium leading-tight">{s.text}</span>
                            </div>
                          ))}
                        </div>
                        {/* Action buttons */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAction('container-mode-on'); }}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#3B82F6] text-white text-sm font-semibold rounded-lg hover:brightness-105 transition-all"
                        >
                          <BoxSelect size={14} />
                          Turn On Container Mode
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
                          className="text-xs text-[#8B7E7A] hover:text-[#4A423F] transition-colors text-center"
                        >
                          Done, let me try it
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: progress + navigation */}
                <div className="p-6 pt-4 border-t border-[#F5EDE8]">
                  {/* Progress bar */}
                  <div className="flex items-center gap-1.5 mb-4">
                    {relevantSteps.map((s, i) => (
                      <div
                        key={s.id}
                        className={[
                          'h-1 rounded-full transition-all duration-300 flex-1',
                          i === stepIndex
                            ? `${currentStep.iconBg} opacity-100`
                            : i < stepIndex
                              ? 'bg-[#E8D5D0] opacity-70'
                              : 'bg-[#F5EDE8]',
                        ].join(' ')}
                      />
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleGlobalDismiss}
                      className="text-xs text-[#8B7E7A] hover:text-[#4A423F] transition-colors"
                    >
                      Don&apos;t show again
                    </button>

                    <div className="flex items-center gap-2">
                      {canGoBack && (
                        <button
                          onClick={handleBack}
                          className="flex items-center gap-1 px-3 py-2 text-sm text-[#6B6B6B] hover:bg-[#F5EDE8] rounded-lg transition-colors"
                        >
                          <ChevronLeft size={14} />
                          Back
                        </button>
                      )}
                      <button
                        onClick={handleNext}
                        className="flex items-center gap-1 px-5 py-2 bg-[#F4C2A1] text-white text-sm font-semibold rounded-lg hover:brightness-105 transition-all"
                      >
                        {isLastStep ? 'Finish' : 'Next'}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default WizardGuide;
