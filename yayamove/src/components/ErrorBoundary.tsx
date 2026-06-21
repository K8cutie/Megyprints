import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";
import { reportError } from "@/lib/report";

interface State {
  hasError: boolean;
  message?: string;
}

/** App-level boundary — Megyprints lesson: don't wrap only one route. A render
 *  error anywhere should show a recoverable screen, not a white page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-extrabold">Something went wrong</h1>
          <p className="mt-2 max-w-sm text-muted-foreground">
            We hit an unexpected error. Refreshing usually fixes it.
          </p>
          {this.state.message && (
            <code className="mt-3 max-w-md break-words rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {this.state.message}
            </code>
          )}
          <Button className="mt-6" variant="gradient" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
