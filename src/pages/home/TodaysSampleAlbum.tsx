/* ══════════════════════════════════════════════════════════════════════════
   "Make today's sample album": the first thing on Home, in the Android app
   while TESTING_PHASE is on (lib/samplePhotos).

   Tester, 2026-10-29: "maybe a little less text in the steps [too many
   things to read hah]". The owner: he meant a faster way to the sample
   album. The way was Home → Start Creating → maybe "Welcome back" → Step 1 →
   "Make a sample album", and too many testers only screenshotted Home. One
   tap here makes today's sample album at once, the way "Welcome back" does
   the next day (#208): a new album (startFreshAlbum) that the builder makes
   as it opens (requestSampleAlbum). The line under it says what to send.

   No album in progress is lost without asking:
     • a sample album in progress, any day: nothing of theirs, so today's is
       made;
     • signed in: the builder saves the album in progress to the account as
       it puts it away (useBuilderState reset()), so it stays in Your
       Projects;
     • signed out, their own album on this phone: asked first. A new album
       deletes it from the phone, and there is no account to keep it.
   The website never shows any of it.
   ══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import MegyMascot from '../../components/MegyMascot';
import { useModalDialog } from '../../lib/useModalDialog';
import { isNativeShell } from '../../lib/nativeShell';
import { showSamplePhotos } from '../../lib/samplePhotos';
import { readLocalDraftSummary, albumInProgress, type LocalDraftSummary } from '../../lib/localDraft';

/** Ask before making today's sample album? Only for a guest's own album on
 *  this phone: signed in, the album in progress stays in the account. */
export function asksBeforeTodaysSample(draft: LocalDraftSummary | null, signedIn: boolean): boolean {
  return !signedIn && albumInProgress(draft) && !draft.isSample;
}

export default function TodaysSampleAlbum({ signedIn, onMake }: {
  signedIn: boolean;
  /** Today's sample album: a new album, made as the builder opens. */
  onMake: () => void;
}) {
  const [show] = useState(() => showSamplePhotos(isNativeShell()));
  const [asking, setAsking] = useState(false);
  if (!show) return null;
  // The phone's album is read at the tap, not on load: Home can sit open
  // while another tab changes it.
  const tap = () => {
    if (asksBeforeTodaysSample(readLocalDraftSummary(), signedIn)) setAsking(true);
    else onMake();
  };
  return (
    <section data-testid="home-todays-sample"
      className="mx-auto mb-3 max-w-[480px] rounded-[22px] bg-white p-4 pb-3 text-center font-body shadow-[0_16px_40px_rgba(0,0,0,0.2)] md:mb-6">
      <button type="button" onClick={tap} data-testid="home-todays-sample-make"
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-peach text-[16px] font-bold text-white shadow-[0_6px_16px_rgba(184,92,56,0.3)] hover:bg-blush-pink active:scale-[0.98] transition-[transform,background-color]">
        <Sparkles size={18} /> Make today&apos;s sample album
      </button>
      <p data-testid="home-todays-sample-how" className="mt-2 text-[13px] leading-snug text-medium">
        Testers: tap it, turn to the last page, and screenshot &quot;You&apos;re done&quot;.
      </p>
      {asking && (
        <KeepAlbumAsk
          onMake={() => { setAsking(false); onMake(); }}
          onKeep={() => setAsking(false)} />
      )}
    </section>
  );
}

/** Signed out, their own album on this phone: the sample album would replace
 *  it. Over the whole page (a portal: Home's hero is its own layer, under the
 *  header). "Keep my album" changes nothing. */
function KeepAlbumAsk({ onMake, onKeep }: { onMake: () => void; onKeep: () => void }) {
  // Keyboard (KB-2): focus on the way on, Tab kept inside, Escape keeps the album.
  const panelRef = useModalDialog<HTMLDivElement>(true, onKeep);
  return createPortal(
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/40 px-4" onClick={onKeep} data-testid="todays-sample-ask">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="todays-sample-ask-title" aria-describedby="todays-sample-ask-text"
        tabIndex={-1} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <MegyMascot size={64} alt="" className="mx-auto object-contain mb-2" />
        <h2 id="todays-sample-ask-title" className="font-display text-xl font-semibold text-dark">
          You have an album in progress on this phone.
        </h2>
        <p id="todays-sample-ask-text" className="text-sm text-medium mt-2 mb-5">
          A sample album starts a new one. Sign in first to keep yours.
        </p>
        <div className="space-y-2">
          <button type="button" onClick={onMake} data-testid="todays-sample-ask-make" data-autofocus
            className="w-full py-3 rounded-xl bg-peach text-white text-sm font-semibold hover:brightness-105 transition-all">
            Make the sample album
          </button>
          <button type="button" onClick={onKeep} data-testid="todays-sample-ask-keep"
            className="w-full py-3 rounded-xl border border-peach text-blush-pink text-sm font-semibold hover:bg-blush transition-colors">
            Keep my album
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
