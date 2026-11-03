/* ══════════════════════════════════════════════════════════════════════════
   "You have an album in progress on this phone." — asked before a new album,
   in the Android app while testing, only when the new album would lose
   something: signed out, with their own album (not a sample album) on this
   phone. A new album replaces it on the phone, and there is no account to
   keep it. Signed in, the album in progress is saved to the account as the
   builder puts it away (useBuilderState reset()), so nothing is asked.

   Home's "Make today's sample album" (#227) and, while the start-up prompts
   are off (testingPhase skipsResumePrompts), Start Creating. Over the whole
   page (a portal: Home's hero is its own layer, under the header).
   ══════════════════════════════════════════════════════════════════════════ */

import { createPortal } from 'react-dom';
import MegyMascot from '../../components/MegyMascot';
import { useModalDialog } from '../../lib/useModalDialog';
import { albumInProgress, type LocalDraftSummary } from '../../lib/localDraft';

/** Ask before a new album? Only for a guest's own album on this phone:
 *  signed in, the album in progress stays in the account. */
export function asksBeforeNewAlbum(draft: LocalDraftSummary | null, signedIn: boolean): boolean {
  return !signedIn && albumInProgress(draft) && !draft.isSample;
}

export default function KeepAlbumAsk({ text, makeLabel, keepLabel = 'Keep my album', onMake, onKeep, onClose }: {
  /** Under the title: what the new album does to theirs. */
  text: string;
  /** The filled button: the new album. */
  makeLabel: string;
  keepLabel?: string;
  onMake: () => void;
  onKeep: () => void;
  /** Escape or a tap outside (default: the same as keeping it). */
  onClose?: () => void;
}) {
  const close = onClose ?? onKeep;
  // Keyboard (KB-2): focus on the way on, Tab kept inside, Escape keeps the album.
  const panelRef = useModalDialog<HTMLDivElement>(true, close);
  return createPortal(
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 px-4" onClick={close} data-testid="todays-sample-ask">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="todays-sample-ask-title" aria-describedby="todays-sample-ask-text"
        tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <MegyMascot size={64} alt="" className="mx-auto object-contain mb-2" />
        <h2 id="todays-sample-ask-title" className="font-display text-xl font-semibold text-dark">
          You have an album in progress on this phone.
        </h2>
        <p id="todays-sample-ask-text" className="text-sm text-medium mt-2 mb-5">{text}</p>
        <div className="space-y-2">
          <button type="button" onClick={onMake} data-testid="todays-sample-ask-make" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            {makeLabel}
          </button>
          <button type="button" onClick={onKeep} data-testid="todays-sample-ask-keep"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors">
            {keepLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
