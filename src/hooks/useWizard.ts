import { useMemo } from 'react';
import type { WizardPhase } from '../components/WizardGuide';

/* ══════════════════════════════════════════════════════════════════════════
   useWizard — Determines wizard step based on current builder state
   ══════════════════════════════════════════════════════════════════════════ */

interface WizardConditions {
  phase: WizardPhase;
  photoCount: number;
  pageCount: number;
  hasGeneratedContent: boolean;
  currentStepIndex: number;
  completedSteps: string[];
}

/**
 * Analyzes builder state and returns the recommended wizard step index.
 * This is used to auto-advance the wizard when the user completes actions.
 */
export function getRecommendedStep(conditions: WizardConditions): number {
  const { phase, photoCount, hasGeneratedContent, currentStepIndex } = conditions;

  // Get steps for this phase
  const phaseSteps = getStepsForPhase(phase);
  if (phaseSteps.length === 0) return 0;

  // Auto-advance logic: if user has done the thing, move past the step
  let recommended = currentStepIndex;

  // Setup phase auto-advance
  if (phase === 'setup') {
    // Steps 0-3: welcome, size, template, pricing
    // Auto-advance naturally as user progresses through setup UI
    return Math.min(recommended, phaseSteps.length - 1);
  }

  // Upload phase: if photos exist, skip upload step
  if (phase === 'upload') {
    if (photoCount > 0 && recommended === 0) {
      return 1; // Skip to photos-per-page
    }
  }

  // Design phase: auto-advance based on content
  if (phase === 'design') {
    const designSteps = phaseSteps;

    // Step 0: generate-layouts — if already generated, skip
    if (hasGeneratedContent && designSteps[recommended]?.id === 'generate-layouts') {
      recommended = 1; // Move to canvas navigation
    }

    // Step 1: understand-canvas — auto advance after viewing once
    // Step 2: slot-panning — stays until dismissed
    // Step 3: container-mode — stays until dismissed
    // Step 4: add-text — stays until dismissed
    // etc.
  }

  return Math.min(recommended, phaseSteps.length - 1);
}

/**
 * Determines if the wizard should be visible for the current phase.
 */
export function shouldShowWizard(phase: WizardPhase): boolean {
  return ['setup', 'upload', 'design', 'preview'].includes(phase);
}

/** Map phase to step IDs */
function getStepsForPhase(phase: WizardPhase): { id: string }[] {
  // These must match the WIZARD_STEPS array in WizardGuide.tsx
  const stepsByPhase: Record<string, string[]> = {
    setup: ['welcome', 'choose-size', 'choose-template', 'review-pricing'],
    upload: ['upload-photos', 'photo-count'],
    design: ['generate-layouts', 'understand-canvas', 'slot-panning', 'container-mode', 'add-text', 'add-background', 'pages-panel', 'undo-redo'],
    preview: ['preview-spreads'],
    complete: ['order-album'],
  };
  return (stepsByPhase[phase] ?? []).map((id) => ({ id }));
}

/**
 * Hook version that recalculates when conditions change.
 */
export function useWizard(conditions: WizardConditions): {
  recommendedStep: number;
  shouldShow: boolean;
  totalStepsInPhase: number;
} {
  return useMemo(() => ({
    recommendedStep: getRecommendedStep(conditions),
    shouldShow: shouldShowWizard(conditions.phase),
    totalStepsInPhase: getStepsForPhase(conditions.phase).length,
  }), [conditions.phase, conditions.photoCount, conditions.hasGeneratedContent, conditions.currentStepIndex]);
}

export default useWizard;
