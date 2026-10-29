import { useEffect, useState } from 'react';
import { fetchSamplePhotos, sampleAlbumPhotos, sampleDayNumber, sampleCoverPhoto, sampleAlbumName, SAMPLE_ALBUM_OCCASION, SAMPLE_END_OF_DAY_NAMES } from '../lib/samplePhotos';
import { MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy } from '../pages/builder/albumMinimum';
import { isAlbumNameReady } from '../lib/albumName';
import { isAlbumThemeReady } from '../lib/albumTheme';
import type { useBuilderContext } from '../pages/builder/BuilderContext';

type Builder = ReturnType<typeof useBuilderContext>;

/** Where the sample album is: getting the samples, then making the album. */
export type SampleAlbumStage = 'idle' | 'adding' | 'making' | 'failed';

/* Step 1's "Make a sample album" (lib/samplePhotos), the steps a tester would
   take, in one tap: the name and occasion (kept when typed), 40 sample photos
   (in through add_photos, like picked ones; a different 40 each day), a
   sample on the cover (as a tap in the cover step puts it), then the album
   is made the way the cover's "Make my album" makes it, the day's
   end-of-day photo goes on its last page, and the pages open. The photos
   land in a later render, so the second half waits for them. */
export function useSampleAlbum(builder: Builder, occasion: string, setOccasion: (v: string) => void, say: (msg: string) => void) {
  const [stage, setStage] = useState<SampleAlbumStage>('idle');
  const [photosIn, setPhotosIn] = useState(false);

  const start = async () => {
    if (stage === 'adding' || stage === 'making') return;
    if (!isAlbumNameReady(builder.albumTitle)) builder.setAlbumTitle(sampleAlbumName(new Date()));
    if (!isAlbumThemeReady(occasion)) setOccasion(SAMPLE_ALBUM_OCCASION);
    setStage('adding');
    try {
      const files = await fetchSamplePhotos(sampleAlbumPhotos(sampleDayNumber(new Date()), MIN_ALBUM_PHOTOS));
      await builder.dispatch({ type: 'add_photos', payload: { files }, rawMessage: 'add sample photos' });
      setPhotosIn(true);
    } catch {
      setStage('failed');
    }
  };

  // The render where the samples are in: cover, make, pages.
  const makeIt = () => {
    setPhotosIn(false);
    setStage('making');
    const cover = sampleCoverPhoto(builder.uploadedPhotos);
    // A white title: the album's name over a photo, readable.
    if (cover) builder.setCoverToPhoto(cover.id, { titleColor: '#FFFFFF' });
    // The day's end-of-day photo: the last page, under "You're done with today's test!".
    const endOfDay = builder.uploadedPhotos.find((p) => SAMPLE_END_OF_DAY_NAMES.includes(p.name));
    void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' }).then((r) => {
      if (!r.success) { setStage('failed'); say(r.message); return; }
      if (endOfDay) builder.putPhotoOnLastPage(endOfDay.id);
      setStage('idle');
    });
    // On to the pages, as the cover's "Make my album" goes: Megy's guide
    // marks the steps in between done.
    builder.setWizardStep('review_pages');
    builder.setPhase('edit');
  };
  const ready = photosIn && photosShortBy(photosGoingIn(builder.uploadedPhotos)) === 0;
  useEffect(() => {
    if (!ready) return;
    // Run as a callback, not in the effect's body: it updates the builder.
    void Promise.resolve().then(makeIt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return { stage, start };
}
