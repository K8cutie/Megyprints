import { createContext, useContext, useRef, useCallback } from 'react';
import { useBuilderState } from './useBuilderState';
import { ActionEngine } from '../../assistant/actionEngine';
import type { AssistantIntent, ExecutedAction } from '../../assistant/types';

type BuilderState = ReturnType<typeof useBuilderState>;

/* ── Megy is the orchestrator ──
   Every UI mutates album state by dispatching an intent here; Megy's
   ActionEngine performs the actual change. UIs (the setup cards, the
   wizard, the chat) are "faces that ask Megy" — they should NOT call the
   raw store setters directly. `dispatch` is the single chokepoint that
   keeps Megy the sole hand on the controls. */
export type BuilderContextValue = BuilderState & {
  dispatch: (intent: AssistantIntent) => Promise<ExecutedAction>;
};

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: React.ReactNode }) {
  const state = useBuilderState();

  // Live ref to the latest state so the (stable) engine always mutates current state.
  const stateRef = useRef(state);
  stateRef.current = state;

  // One ActionEngine instance for the whole app = one brain.
  const engineRef = useRef<ActionEngine | null>(null);
  if (!engineRef.current) engineRef.current = new ActionEngine(state);

  const dispatch = useCallback((intent: AssistantIntent) => {
    engineRef.current!.builder = stateRef.current;
    return engineRef.current!.execute(intent);
  }, []);

  const value: BuilderContextValue = { ...state, dispatch };
  return (
    <BuilderContext.Provider value={value}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilderContext(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx) {
    throw new Error('useBuilderContext must be used inside <BuilderProvider>');
  }
  return ctx;
}
