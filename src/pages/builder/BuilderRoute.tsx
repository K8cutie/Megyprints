import BuilderErrorBoundary from './BuilderErrorBoundary';
import { BuilderProvider } from './BuilderContext';
import Builder from '../Builder';

/**
 * The whole builder route in ONE lazy chunk. Keeping BuilderProvider +
 * BuilderErrorBoundary here (instead of importing them into App.tsx) is what
 * lets the entire builder subtree — including face-api.js / tfjs (pulled via
 * useBuilderState) and the MegyAssistant — code-split OUT of the entry bundle.
 * If App.tsx statically imports BuilderProvider, that transitive chain lands
 * back in the initial chunk and Home/checkout pay for it.
 */
export default function BuilderRoute() {
  return (
    <BuilderErrorBoundary onReset={() => window.location.reload()}>
      <BuilderProvider>
        <Builder />
      </BuilderProvider>
    </BuilderErrorBoundary>
  );
}
