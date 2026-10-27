import { useState } from 'react';
import { isNativeShell } from '../lib/nativeShell';
import { showSamplePhotos } from '../lib/samplePhotos';
import type { SampleAlbumStage } from './useSampleAlbum';

/* Step 1 in the Android app while testing (lib/samplePhotos): "Make a sample
   album" makes a whole album from Megy's sample photos in one tap
   (useSampleAlbum). Under the step's own Next, which stays the way to make
   an album from your own photos. Gone on the website and when TESTING_PHASE
   is off. */
export default function SampleAlbumOffer({ stage, onMake }: { stage: SampleAlbumStage; onMake: () => void }) {
  const [show] = useState(() => showSamplePhotos(isNativeShell()));
  if (!show) return null;
  const busy = stage === 'adding' || stage === 'making';
  return (
    <div className="mt-3 p-3 rounded-xl bg-blush border border-peach/30" data-testid="sample-album">
      <p className="text-sm text-cocoa leading-relaxed">
        <b>Just testing the app?</b> Megy makes a whole album from 40 sample photos. You can still make one from your own photos after.
      </p>
      <button type="button" onClick={onMake} aria-busy={busy} data-testid="sample-album-make"
        className="mt-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-peach text-peach hover:bg-peach/10 transition-colors">
        {busy ? 'Making your sample album…' : 'Make a sample album'}
      </button>
      {stage === 'failed' && (
        <p role="alert" className="mt-2 text-xs text-red-600" data-testid="sample-album-failed">
          Couldn't make the sample album. Check your internet, then tap again.
        </p>
      )}
    </div>
  );
}
