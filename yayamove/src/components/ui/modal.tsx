import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  /** hide the default close (X) button in the header */
  hideClose?: boolean;
}

/**
 * Accessible dialog used across the app. Centralises Escape-to-close, focus
 * trapping + focus restore, and correct ARIA — previously each modal hand-rolled
 * the overlay and shared the same a11y gaps (audit QA-H4 / quality-#1).
 */
export function Modal({ open, onClose, title, children, className, hideClose }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // focus trap
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    // lock background scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // move focus into the dialog
    requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input, textarea, button:not([disabled])',
      );
      (target ?? panelRef.current)?.focus();
    });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-950/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-soft outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || !hideClose) && (
          <div className="mb-2 flex items-center justify-between gap-3">
            {typeof title === "string" ? <h2 className="text-lg font-bold">{title}</h2> : title}
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="ring-focus rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
