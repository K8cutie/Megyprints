/* ══════════════════════════════════════════════════════════════════════════
   AlbumConflictBar — the same album changed on two devices: which to keep is
   ASKED here, never picked silently. It used to be last-save-wins: a phone
   reloading its older copy saved it over the laptop's newer page 4 without a
   word (1-star testers round 2, TD-3). Also says so, once, when the newer
   version from the other device was opened because nothing changed here.
   ══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import type { BuilderContextValue } from './BuilderContext';
import { conflictMessage, DELETED_ELSEWHERE_MESSAGE } from '../../lib/albumSyncRecord';

export default function AlbumConflictBar({ actions }: { actions: BuilderContextValue }) {
  const { cloudConflict, cloudGone, cloudNotice, dismissCloudNotice } = actions;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!cloudNotice) return;
    const t = window.setTimeout(dismissCloudNotice, 9000);
    return () => window.clearTimeout(t);
  }, [cloudNotice, dismissCloudNotice]);
  const run = async (fn: () => unknown) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  // Deleted on the laptop while open on the phone: it used to come back
  // silently with the phone's next save (Kraken, 2026-10-05). Asked now.
  if (cloudGone) {
    return (
      <div role="alert" data-testid="album-deleted-bar"
        className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#FFF1EA] border-b border-[#EBC3AE] text-xs text-[#7A3A1E]">
        <span className="flex-1 min-w-[14rem]">{DELETED_ELSEWHERE_MESSAGE}</span>
        <button type="button" disabled={busy} data-testid="deleted-keep-new"
          onClick={() => run(actions.saveAsNewAlbum)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-[#B85C38] text-white font-semibold hover:bg-[#A04E2E] disabled:opacity-60">
          Keep it as a new album
        </button>
        <button type="button" disabled={busy} data-testid="deleted-let-go"
          onClick={() => run(actions.letDeletedAlbumGo)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#E2B49C] font-semibold hover:bg-[#FFE6DA] disabled:opacity-60">
          Let it go
        </button>
      </div>
    );
  }
  if (cloudConflict) {
    return (
      <div role="alert" data-testid="album-conflict-bar"
        className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#FFF1EA] border-b border-[#EBC3AE] text-xs text-[#7A3A1E]">
        <span className="flex-1 min-w-[14rem]">{conflictMessage(cloudConflict.updatedAt)}</span>
        <button type="button" disabled={busy} data-testid="conflict-open-other"
          onClick={() => run(actions.openNewerVersion)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-[#B85C38] text-white font-semibold hover:bg-[#A04E2E] disabled:opacity-60">
          Open the other device&rsquo;s version
        </button>
        <button type="button" disabled={busy} data-testid="conflict-keep-this"
          onClick={() => run(actions.keepThisVersion)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#E2B49C] font-semibold hover:bg-[#FFE6DA] disabled:opacity-60">
          Keep this device&rsquo;s version
        </button>
      </div>
    );
  }
  if (cloudNotice) {
    return (
      <div role="status" data-testid="album-sync-notice"
        className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#EEF6EE] border-b border-[#C7DFC7] text-xs text-[#2F5A33]">
        <span className="flex-1 min-w-[14rem]">{cloudNotice}</span>
        <button type="button" onClick={dismissCloudNotice}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-white border border-[#C7DFC7] font-semibold hover:bg-[#E3F0E3]">
          OK
        </button>
      </div>
    );
  }
  return null;
}
