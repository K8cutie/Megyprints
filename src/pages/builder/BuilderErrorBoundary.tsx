import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportError } from '../../lib/report';

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class BuilderErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Route builder crashes through the single sink (console + VITE_ERROR_ENDPOINT
    // + Sentry captureException) so a crash mid-album is visible in production,
    // not just in the local console. The componentStack rides along as context.
    reportError(error, { boundary: 'builder', componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[70] bg-cream flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 rounded-full bg-blush flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} className="text-blush-pink" />
            </div>
            <h2 className="font-display text-2xl font-bold text-dark">Something went wrong</h2>
            <p className="text-sm text-medium mt-2">
              This can happen if old saved data is incompatible with the current version.
              Click below to reset and start fresh.
            </p>
            {this.state.error && (
              <div className="mt-3 p-3 bg-white rounded-lg text-left">
                <p className="text-xs text-blush-pink font-mono break-all">{this.state.error.message}</p>
              </div>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={() => {
                  this.props.onReset();
                  this.setState({ hasError: false });
                }}
                className="px-6 py-2.5 bg-peach text-white font-semibold rounded-xl hover:brightness-105 flex items-center gap-2 transition-all"
              >
                <RotateCcw size={16} /> Reset & Continue
              </button>
            </div>
            <p className="text-[10px] text-light mt-4">
              Your previous work will be cleared. This only affects the browser you're using now.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
