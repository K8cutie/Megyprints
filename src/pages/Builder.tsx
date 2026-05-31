import { useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, PenTool, Eye, ChevronRight, RotateCcw } from 'lucide-react';
import { useBuilderContext, type BuilderContextValue } from './builder/BuilderContext';
import BuilderSetup from './builder/BuilderSetup';
import BuilderEdit from './builder/BuilderEdit';
import BuilderPreview from './builder/BuilderPreview';
import BuilderErrorBoundary from './builder/BuilderErrorBoundary';
import { useNavigate } from 'react-router-dom';

const phases = [
  { id: 'setup' as const, label: 'Setup', icon: Settings },
  { id: 'edit' as const, label: 'Design', icon: PenTool },
  { id: 'preview' as const, label: 'Preview', icon: Eye },
];

const SetupPhase = memo(function SetupPhase({ actions }: { actions: BuilderContextValue }) {
  return (
    <BuilderSetup
      selectedSize={actions.albumSize}
      onSizeChange={actions.setAlbumSize}
      onNext={() => actions.setPhase('edit')}
    />
  );
});

/* Template phase removed — users customize backgrounds in the editor instead */

const EditPhase = memo(function EditPhase({
  actions,
  onRegenerate,
  onGenerate,
  onGenerateAll,
}: {
  actions: BuilderContextValue;
  onRegenerate: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
}) {
  return (
    <BuilderEdit
      actions={actions}
      onRegenerate={onRegenerate}
      onGenerate={onGenerate}
      onGenerateAll={onGenerateAll}
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
  const [errorKey, setErrorKey] = useState(0);

  const handleGenerate = useCallback(() => {
    // Generate layout for the CURRENT page (random template + photos)
    actions.regeneratePage();
  }, [actions]);

  const handleRegenerate = useCallback(() => {
    actions.regeneratePage();
  }, [actions]);

  const handleGenerateAll = useCallback(() => {
    actions.generateAlbum();
  }, [actions]);

  const handleReset = useCallback(() => {
    actions.reset();
    setErrorKey((k) => k + 1);
  }, [actions]);

  const handleOrder = useCallback(() => {
    navigate('/order');
  }, [navigate]);

  const phaseIndex = phases.findIndex((p) => p.id === actions.phase);

  const content = (
    <BuilderErrorBoundary key={errorKey} onReset={handleReset}>
      <div className="fixed inset-0 z-[60] bg-white flex flex-col">
        {/* Step Indicator */}
        <div className="h-12 bg-white border-b border-[#E8E8E8] flex items-center px-4 gap-1 shrink-0">
          <div className="flex items-center gap-1 mr-4">
            <span className="font-display text-base italic text-[#2D2D2D]">Megy</span>
            <span className="font-body text-base text-[#2D2D2D]">Prints</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#F4C2A1] ml-0.5" />
          </div>

          {phases.map((phase, i) => {
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

          {/* Restart — wipes everything and starts fresh */}
          {actions.albumPages.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Start a new album? All current pages and edits will be lost.')) {
                  actions.reset();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#9B9B9B] hover:bg-[#FDE8E4] hover:text-[#E8A598] transition-all"
              title="New Album"
            >
              <RotateCcw size={13} /> New
            </button>
          )}
        </div>

        {/* Phase Content */}
        <div className="flex-1 overflow-auto min-h-0">
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
                <EditPhase
                  actions={actions}
                  onRegenerate={handleRegenerate}
                  onGenerate={handleGenerate}
                  onGenerateAll={handleGenerateAll}
                />
              </motion.div>
            )}

            {actions.phase === 'preview' && (
              <motion.div key="preview" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="h-full">
                <PreviewPhase actions={actions} onOrder={handleOrder} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </BuilderErrorBoundary>
  );

  return createPortal(content, document.body);
}
