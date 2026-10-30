import { useEffect, useState } from 'react';
import { isNativeShell } from '../lib/nativeShell';
import { showSamplePhotos } from '../lib/samplePhotos';
import { loadTodaysTest } from '../pages/home/loadTodaysTest';
import type { SampleAlbumStage } from './useSampleAlbum';

/* Step 1 in the Android app while testing (lib/samplePhotos): "Make a sample
   album" makes a whole album from Megy's sample photos (useSampleAlbum). The
   first thing on the card, its button filled (owner, 2026-10-28, of it under
   the name and occasions: "couldn't be more NOT OBVIOUS"); "or make your own
   album" leads down to the step itself, whose Next stays the way to use your
   own photos. Gone on the website and when TESTING_PHASE is off.

   The button opens Today's test first (lib/dailyTest), the same screen as
   Home's "Make today's sample album" (owner, 2026-10-29: Step 1 still
   skipped the test). After a failure it makes the album again with the test
   already done.

   The owner, 2026-10-29: "Can we call it User tutorial instead of sample
   album": the words say User tutorial (the code keeps its sample-album
   names). */
export default function SampleAlbumOffer({ stage, onMake }: { stage: SampleAlbumStage; onMake: () => void }) {
  const [show] = useState(() => showSamplePhotos(isNativeShell()));
  // Ready before the tap, so Today's test opens at once.
  useEffect(() => { if (show) void loadTodaysTest(); }, [show]);
  if (!show) return null;
  const busy = stage === 'adding' || stage === 'making';
  return (
    <div className="mb-5" data-testid="sample-album-top">
      <div className="p-3 rounded-xl bg-blush border border-peach/30" data-testid="sample-album">
        <p className="text-sm text-cocoa leading-relaxed">
          <b>Just testing the app?</b> The User tutorial makes a whole album from 40 sample photos and teaches you the app. You can still make one from your own photos after.
        </p>
        <button type="button" onClick={onMake} aria-busy={busy} data-testid="sample-album-make"
          className="mt-2 w-full px-4 py-3 rounded-xl text-base font-semibold bg-peach text-white hover:bg-blush-pink shadow-md active:scale-[0.98] transition-all">
          {busy ? 'Starting the User tutorial…' : 'Start the User tutorial'}
        </button>
        {stage === 'failed' && (
          <p role="alert" className="mt-2 text-xs text-red-600" data-testid="sample-album-failed">
            Couldn't start the User tutorial. Check your internet, then tap again.
          </p>
        )}
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs text-taupe" data-testid="sample-album-or">
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        or make your own album
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
    </div>
  );
}
