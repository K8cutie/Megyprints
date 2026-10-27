import { useState } from 'react';
import { isNativeShell } from '../lib/nativeShell';
import { addSamplesLabel, fetchSamplePhotos, pickSamplePhotos, showSamplePhotos } from '../lib/samplePhotos';
import { MIN_ALBUM_PHOTOS } from '../pages/builder/albumMinimum';

/* The Android app's photo step while testing (lib/samplePhotos): a tester
   without 40 photos makes up the rest with Megy's sample photos. Under the
   card's own button ("Add 25 more photos" stays the filled one: their own
   photos come first). Gone once 40 are going in, on the website, and when
   TESTING_PHASE is off. */
export default function SamplePhotosOffer({ short, photoNames, onAdd }: {
  /** Photos still needed for a 40-page album. */
  short: number;
  /** Names of the photos already in the album (left-out ones too). */
  photoNames: readonly string[];
  /** Adds the samples the way picked photos are added. */
  onAdd: (files: File[]) => Promise<void>;
}) {
  const [show] = useState(() => showSamplePhotos(isNativeShell()));
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!show) return null;
  const picks = pickSamplePhotos(short, photoNames);
  if (picks.length === 0) return null;

  const add = async () => {
    if (adding) return;
    setAdding(true);
    setFailed(false);
    try {
      await onAdd(await fetchSamplePhotos(picks));
    } catch {
      setFailed(true);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-xl bg-blush border border-peach/30" data-testid="sample-photos">
      <p className="text-sm text-cocoa leading-relaxed">
        <b>Testing the app with fewer than {MIN_ALBUM_PHOTOS} photos?</b> Fill the album with our sample photos.
      </p>
      <button type="button" onClick={add} aria-busy={adding} data-testid="sample-photos-add"
        className="mt-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-peach text-peach hover:bg-peach/10 transition-colors">
        {adding ? 'Adding sample photos…' : addSamplesLabel(picks.length)}
      </button>
      {failed && (
        <p role="alert" className="mt-2 text-xs text-red-600" data-testid="sample-photos-failed">
          Couldn't get the sample photos. Check your internet, then tap again.
        </p>
      )}
    </div>
  );
}
