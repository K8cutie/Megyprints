import { createContext, useContext } from 'react';
import { useBuilderState } from './useBuilderState';

export type BuilderContextValue = ReturnType<typeof useBuilderState>;

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: React.ReactNode }) {
  const state = useBuilderState();
  return (
    <BuilderContext.Provider value={state}>
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
