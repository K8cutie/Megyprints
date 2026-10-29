/* ══════════════════════════════════════════════════════════════════════════
   "Make today's sample album": the first thing on Home, in the Android app
   while TESTING_PHASE is on (lib/samplePhotos).

   Tester, 2026-10-29: "maybe a little less text in the steps [too many
   things to read hah]". The owner: he meant a faster way to the sample
   album, and too many testers only screenshotted Home (#227).

   Owner, the same day: testers screenshot the home page or just flip pages;
   the daily test should prove real use. So the button opens Today's test
   (home/TodaysTest, lib/dailyTest): type today's date as the album's name,
   do today's task (choose the cover, or tap today's colour), then "Make my
   album" makes a new album (startFreshAlbum) that the builder makes as it
   opens (requestSampleAlbum), opening on its last page, "You're done". The
   line under the button says what to do.

   No album in progress is lost without asking:
     • a sample album in progress, any day: nothing of theirs, so today's is
       made;
     • signed in: the builder saves the album in progress to the account as
       it puts it away (useBuilderState reset()), so it stays in Your
       Projects;
     • signed out, their own album on this phone: asked first (KeepAlbumAsk).
       A new album deletes it from the phone, and there is no account to
       keep it.
   The website never shows any of it.
   ══════════════════════════════════════════════════════════════════════════ */

import { lazy, Suspense, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { isNativeShell } from '../../lib/nativeShell';
import { showSamplePhotos } from '../../lib/samplePhotos';
import { readLocalDraftSummary } from '../../lib/localDraft';
import KeepAlbumAsk, { asksBeforeNewAlbum } from './KeepAlbumAsk';

// Its own chunk: the website never downloads it.
const loadTodaysTest = () => import('./TodaysTest');
const TodaysTest = lazy(loadTodaysTest);

export default function TodaysSampleAlbum({ signedIn, onMake }: {
  signedIn: boolean;
  /** Today's sample album: a new album, made as the builder opens. Called
   *  once Today's test is done (it keeps the tester's name and task). */
  onMake: () => void;
}) {
  const [show] = useState(() => showSamplePhotos(isNativeShell()));
  const [asking, setAsking] = useState(false);
  const [testing, setTesting] = useState(false);
  // Ready before the tap, so Today's test opens at once.
  useEffect(() => { if (show) void loadTodaysTest(); }, [show]);
  if (!show) return null;
  // The phone's album is read at the tap, not on load: Home can sit open
  // while another tab changes it.
  const tap = () => {
    if (asksBeforeNewAlbum(readLocalDraftSummary(), signedIn)) setAsking(true);
    else setTesting(true);
  };
  return (
    <section data-testid="home-todays-sample"
      className="mx-auto mb-3 max-w-[480px] rounded-[22px] bg-white p-4 pb-3 text-center font-body shadow-[0_16px_40px_rgba(0,0,0,0.2)] md:mb-6">
      <button type="button" onClick={tap} data-testid="home-todays-sample-make"
        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-peach text-[16px] font-bold text-white shadow-[0_6px_16px_rgba(184,92,56,0.3)] hover:bg-blush-pink active:scale-[0.98] transition-[transform,background-color]">
        <Sparkles size={18} /> Make today&apos;s sample album
      </button>
      <p data-testid="home-todays-sample-how" className="mt-2 text-[13px] leading-snug text-medium">
        Testers: type today&apos;s date, do today&apos;s task, then screenshot &quot;You&apos;re done&quot;.
      </p>
      {asking && (
        <KeepAlbumAsk text="A sample album starts a new one. Sign in first to keep yours." makeLabel="Make the sample album"
          onMake={() => { setAsking(false); setTesting(true); }}
          onKeep={() => setAsking(false)} />
      )}
      {testing && (
        <Suspense fallback={<div className="fixed inset-0 z-[140] bg-paper" aria-busy="true" />}>
          <TodaysTest onMake={() => { setTesting(false); onMake(); }} onClose={() => setTesting(false)} />
        </Suspense>
      )}
    </section>
  );
}
