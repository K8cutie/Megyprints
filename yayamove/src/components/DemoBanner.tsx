import { useState } from "react";
import { Info, X } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";

/** Loud, dismissible notice when Supabase isn't configured (Megyprints lesson:
 *  never let a missing backend fail silently). */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (isSupabaseConfigured || dismissed) return null;

  return (
    <div className="bg-amber-500 text-amber-950">
      <div className="container flex items-center gap-2 py-2 text-xs font-semibold sm:text-sm">
        <Info className="size-4 shrink-0" />
        <span className="flex-1">
          Demo mode — Supabase isn’t connected. You’re viewing sample data; sign-up,
          login, and saving are disabled. Add your keys to <code>.env</code> to go live.
        </span>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 hover:bg-amber-600/20"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
