import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, PenTool, Eye, ChevronRight } from 'lucide-react';
import { useBuilderContext, type BuilderContextValue } from './builder/BuilderContext';
import BuilderSetup from './builder/BuilderSetup';
import BuilderEdit from './builder/BuilderEdit';
import BuilderPreview from './builder/BuilderPreview';
import CoverStep from './builder/CoverStep';
import MobileReview from './builder/MobileReview';
import LayoutPicker from './builder/LayoutPicker';
import BuilderBackGuard from './builder/BuilderBackGuard';
import BuilderErrorBoundary from './builder/BuilderErrorBoundary';
import MegyAssistant from '../assistant/MegyAssistant';
import SoftAuthGate from '../components/SoftAuthGate';
import { useIsMobile } from '../hooks/use-mobile';
import { useNavigate, useSearchParams } from 'react-router-dom';

const phases = [
  { id: 'setup' as const, label: 'Setup', icon: Settings },
  { id: 'edit' as const, label: 'Design', icon: PenTool },
  { id: 'preview' as const, label: 'Preview', icon: Eye },
];

const SetupPhase = memo(function SetupPhase({ actions }: { actions: BuilderContextValue }) {
  return (
    <BuilderSetup
      selectedSize={actions.albumSize}
      onSizeChange={(size) => { void actions.dispatch({ type: 'change_size', payload: { size }, rawMessage: `change size to ${size}` }); }}
      /* Option A: "Start Creating" advances Megy's wizard past the size step to
         the cover step; the center screen (phase) follows the wizard. */
      onNext={() => { actions.setWizardStep('design_cover'); actions.setPhase('cover'); }}
    />
  );
});

/* Template phase removed — users customize backgrounds in the editor instead */

const EditPhase = memo(function EditPhase({
  actions,
  onRegenerate,
  onGenerate,
  onGenerateAll,
  containerModeRef,
  onAction,
}: {
  actions: BuilderContextValue;
  onRegenerate: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
  containerModeRef: React.MutableRefObject<((enable: boolean) => void) | undefined>;
  onAction: (action: string, payload?: Record<string, unknown>) => void;
}) {
  return (
    <BuilderEdit
      actions={actions}
      onRegenerate={onRegenerate}
      onGenerate={onGenerate}
      onGenerateAll={onGenerateAll}
      containerModeRef={containerModeRef}
      onAction={onAction}
    />
  );
});

const PreviewPhase = memo(function PreviewPhase({ actions, onOrder }: { actions: BuilderContextValue; onOrder: () => void }) {
  return (
    <BuilderPreview
      pages={actions.albumPages}
      currentIndex={actions.currentPageIndex}
      photos={actions.uploadedPhotos}
      albumSize={actions.albumSize}
      onGoToPage={actions.goToPage}
      onBack={() => actions.setPhase('edit')}
      onOrder={onOrder}
      getPageSnapshot={actions.getPageSnapshot}
    />
  );
});

export default function Builder() {
  const actions = useBuilderContext();
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const [errorKey, setErrorKey] = useState(0);

  /* Refs */
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerModeRef = useRef<((enable: boolean) => void) | undefined>(undefined);

  /* ── Fresh start (Home → "Create New Album") ──
     getInitialState() already inits empty state when the `megy-fresh-start`
     flag is set, so children mount fresh with no stale flash. Here we run
     reset()'s side effects — clear IndexedDB + localStorage and set
     skipCloudLoadRef so the provider's cloud/rehydrate effects skip old data.
     This lives in a mount effect, NOT the render body: calling a
     BuilderProvider setter mid-render triggered React's "cannot update a
     component while rendering a different component" warning. Builder is a
     child of the provider, so this effect still runs BEFORE the provider's
     cloud/rehydrate effects, preserving the skip-guard timing. */
  useEffect(() => {
    if (sessionStorage.getItem('megy-fresh-start')) {
      sessionStorage.removeItem('megy-fresh-start');
      actions.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(() => {
    // Generate layout for the CURRENT page (random template + photos)
    void actions.dispatch({ type: 'regenerate_page', rawMessage: 'regenerate page' });
  }, [actions]);

  const handleRegenerate = useCallback(() => {
    void actions.dispatch({ type: 'regenerate_page', rawMessage: 'regenerate page' });
  }, [actions]);

  const handleGenerateAll = useCallback(() => {
    void actions.dispatch({ type: 'generate_album', rawMessage: 'generate album' });
  }, [actions]);

  const handleReset = useCallback(() => {
    actions.reset();
    setErrorKey((k) => k + 1);
  }, [actions]);

  const handleOrder = useCallback(() => {
    navigate('/order');
  }, [navigate]);

  /* Minimal action handler for BuilderEdit internal triggers */
  const handleAction = useCallback((actionId: string, _payload?: Record<string, unknown>) => {
    if (actionId === 'trigger-upload') {
      fileInputRef.current?.click();
    }
  }, []);

  /* Load specific album from URL ?album= param — once only */
  const hasLoadedRef = useRef<string | null>(null);
  const userId = actions.user?.id;
  const loadAlbum = actions.loadAlbum;
  useEffect(() => {
    const albumId = searchParams.get('album');
    if (!albumId || !userId) return;
    if (hasLoadedRef.current === albumId) return;
    hasLoadedRef.current = albumId;
    loadAlbum(albumId);
  }, [searchParams, userId, loadAlbum]);

  const phaseIndex = phases.findIndex((p) => p.id === actions.phase);
  // Desktop: reserve the Megy panel's width so the toolbar + canvas sit BESIDE
  // it (never underneath). Reacts to the panel collapsing to its thin rail.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  // Phase chips hidden — Megy is the sole orchestrator and drives phases through
  // the wizard (Next / Previous / step actions). Flip true to show them again.
  const SHOW_PHASE_CHIPS = false;
  // Mobile: the edit/review step becomes the swipe-and-approve MobileReview.
  const isMobile = useIsMobile();

  const content = (
    <BuilderErrorBoundary key={errorKey} onReset={handleReset}>
      <SoftAuthGate />
      {/* Stop the mobile Back button from closing the app + losing the draft. */}
      <BuilderBackGuard
        flush={actions.saveDraftNow}
        phase={actions.phase}
        onStepBack={() => actions.setPhase('edit')}
      />
      <div className={`fixed inset-0 z-[60] bg-white flex flex-col transition-[padding] duration-300 ${panelCollapsed ? 'lg:pl-[60px]' : 'lg:pl-[340px]'}`}>
        {/* Step Indicator */}
        <div className="h-12 bg-white border-b border-[#E8E8E8] flex items-center px-4 gap-1 shrink-0">
          <div className="flex items-center gap-1 mr-4">
            <span className="font-display text-base italic text-[#2D2D2D]">Megy</span>
            <span className="font-body text-base text-[#2D2D2D]">Prints</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F4C2A1] ml-0.5" />
          </div>

          {SHOW_PHASE_CHIPS && phases.map((phase, i) => {
            const isActive = i === phaseIndex;
            const isPast = i < phaseIndex;
            const Icon = phase.icon;
            return (
              <div key={phase.id} className="flex items-center">
                {i > 0 && <ChevronRight size={14} className="text-[#D4D4D4] mx-1" />}
                <button
                  onClick={() => { if (i <= phaseIndex || (phase.id === 'preview' && phaseIndex >= 1)) actions.setPhase(phase.id); }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: isActive ? '#FDE8E4' : 'transparent',
                    color: isActive ? '#E8A598' : isPast || (phase.id === 'preview' && phaseIndex >= 1) ? '#6B6B6B' : '#C4C4C4',
                  }}
                >
                  <Icon size={13} /> {phase.label}
                </button>
              </div>
            );
          })}

          <div className="flex-1" />
        </div>

        {/* Phase Content */}
        <div className="flex-1 overflow-auto min-h-0 relative">
          <AnimatePresence mode="wait">
            {actions.phase === 'setup' && (
              <motion.div key="setup" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="h-full">
                <SetupPhase actions={actions} />
              </motion.div>
            )}

            {actions.phase === 'edit' && (
              <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
                {isMobile ? (
                  <MobileReview actions={actions} onDone={() => { void actions.dispatch({ type: 'preview_album', rawMessage: 'preview album' }); }} />
                ) : (
                  <EditPhase
                    actions={actions}
                    onRegenerate={handleRegenerate}
                    onGenerate={handleGenerate}
                    onGenerateAll={handleGenerateAll}
                    containerModeRef={containerModeRef}
                    onAction={handleAction}
                  />
                )}
              </motion.div>
            )}

            {actions.phase === 'preview' && (
              <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full">
                <PreviewPhase actions={actions} onOrder={handleOrder} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cover step — rendered OUTSIDE AnimatePresence. A CoverStep motion
              child failed to complete its exit animation, deadlocking mode="wait"
              for every subsequent phase change; a plain absolute-fill conditional
              mounts/unmounts cleanly and can't stall the other transitions. */}
          {actions.phase === 'cover' && (
            <div className="absolute inset-0 bg-[#FFF8F0]">
              <CoverStep
                mode="step"
                onNext={() => { actions.setWizardStep('pick_background'); actions.setPhase('edit'); }}
                onBack={() => { actions.setWizardStep('pick_size'); actions.setPhase('setup'); }}
              />
            </div>
          )}
        </div>

        {/* ── Megy Assistant ── */}
        <MegyAssistant collapsed={panelCollapsed} onToggleCollapsed={setPanelCollapsed} mobilePulldown={isMobile && (actions.phase === 'edit' || actions.phase === 'cover' || actions.phase === 'preview')} />

        {/* "Change layout" picker — shared by mobile review + desktop panel */}
        <LayoutPicker actions={actions} />

        {/* Hidden file input for programmatic upload trigger */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ opacity: 0, position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              void actions.dispatch({ type: 'add_photos', payload: { files: e.target.files }, rawMessage: 'add photos' });
              e.target.value = '';
            }
          }}
        />
      </div>
    </BuilderErrorBoundary>
  );

  return createPortal(content, document.body);
}
