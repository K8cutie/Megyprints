import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fetchSamplePhotos, sampleAlbumPhotos, sampleDayNumber, sampleCoverPhoto, sampleAlbumName, SAMPLE_ALBUM_OCCASION, SAMPLE_END_OF_DAY_NAMES } from '../lib/samplePhotos';
import { coverTitleFrom, sizeFrom, type DailyTestRequest } from '../lib/dailyTest';
import { attachRun } from '../lib/dailyTestRun';
import { albumMadeAt } from '../lib/testingPhase';
import { albumTaskTarget, snapPages } from '../pages/builder/dailyAlbumTask';
import { MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy } from '../pages/builder/albumMinimum';
import { isAlbumNameReady } from '../lib/albumName';
import { isAlbumThemeReady } from '../lib/albumTheme';
import { albumIsMade } from './rebuildQuestion';
import type { useBuilderContext } from '../pages/builder/BuilderContext';

type Builder = ReturnType<typeof useBuilderContext>;

/** Where the sample album is: getting the samples, then making the album. */
export type SampleAlbumStage = 'idle' | 'adding' | 'making' | 'failed';

/* The sample album (lib/samplePhotos), the steps a tester would take, in one
   go: the name and occasion (kept when typed), 40 sample photos (in through
   add_photos, like picked ones; a different 40 each day), a sample on the
   cover (as a tap in the cover step puts it), then the album is made the way
   the cover's "Make my album" makes it, the day's end-of-day photo goes on
   its last page, and the pages open. The photos land in a later render, so
   the second half waits for them.

   From Today's test (lib/dailyTest: Home's "Make today's sample album" or
   Step 1's "Make a sample album"), `start(test)`: the album is named what
   the tester typed (today's date) and made with today's answer, where the
   steps before "Make my album" would set it: the size first (Step 2), the
   occasion (Step 1), the cover photo and the cover title's font, colour,
   side, style, size or shadow (the cover step), today's colour on every page
   once the pages are made. Then today's task in the album starts
   (lib/dailyTestRun attachRun): the pages open where it is, its tool open
   (MobileReview), or Preview for the open book. `retry()` makes it again
   after a failure with the same test, so a tester with a weak signal never
   does the test twice. */
export function useSampleAlbum(builder: Builder, occasion: string, setOccasion: (v: string) => void, say: (msg: string) => void) {
  const [stage, setStage] = useState<SampleAlbumStage>('idle');
  const [photosIn, setPhotosIn] = useState(false);
  // Today's test, while its album is being made (kept for a retry after a failure).
  const testRef = useRef<DailyTestRequest | null>(null);
  // Made from Today's test: start its task in the album once the pages are in.
  const taskRef = useRef<DailyTestRequest | null>(null);

  const start = async (test?: DailyTestRequest | null) => {
    if (stage === 'adding' || stage === 'making') return;
    testRef.current = test ?? (stage === 'failed' ? testRef.current : null);
    const t = testRef.current;
    setStage('adding');
    // The size first, as Step 2 comes before the name reaches the cover.
    const size = sizeFrom(t);
    if (size && size !== builder.albumSize) {
      await builder.dispatch({ type: 'change_size', payload: { size }, rawMessage: `change size to ${size}` });
    }
    if (t?.name) builder.setAlbumTitle(t.name);
    else if (!isAlbumNameReady(builder.albumTitle)) builder.setAlbumTitle(sampleAlbumName(new Date()));
    if (t?.before === 'occasion') setOccasion(t.answer);
    else if (!isAlbumThemeReady(occasion)) setOccasion(SAMPLE_ALBUM_OCCASION);
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
    const test = testRef.current;
    // The cover Today's test chose, else the usual sample.
    const chosen = test?.before === 'cover' ? builder.uploadedPhotos.find((p) => p.name === test.answer && !p.leftOut) : undefined;
    const cover = chosen ?? sampleCoverPhoto(builder.uploadedPhotos);
    // The title: white over a photo (readable), or today's colour, font, side, style, size or shadow.
    const title = coverTitleFrom(test);
    const putCover = () => { if (cover) builder.setCoverToPhoto(cover.id, { titleColor: title.color, title: title.style }); };
    putCover();
    // The day's end-of-day photo: the last page, under "You're done with today's test!".
    const endOfDay = builder.uploadedPhotos.find((p) => SAMPLE_END_OF_DAY_NAMES.includes(p.name));
    void builder.dispatch({ type: 'generate_album', rawMessage: 'generate album' }).then((r) => {
      if (!r.success) { setStage('failed'); say(r.message); return; }
      if (test?.before === 'colour') {
        // Today's colour on every page (words that wouldn't show switch ink);
        // the cover keeps its photo and title.
        builder.applyPageColorToAllPages(test.answer);
        putCover();
      }
      if (endOfDay) builder.putPhotoOnLastPage(endOfDay.id);
      if (test) { testRef.current = null; taskRef.current = test; }
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

  // Today's test: the album is made and its pages are on screen (the
  // end-of-day photo in place) → today's task in the album starts there.
  // Before the paint, so page 1 never flashes first.
  const made = albumIsMade(builder.albumPages);
  useLayoutEffect(() => {
    const test = taskRef.current;
    if (!test || stage !== 'idle' || !made || builder.phase !== 'edit') return;
    const madeAt = albumMadeAt(builder.albumPages);
    if (madeAt == null) return;
    taskRef.current = null;
    const target = albumTaskTarget(test.album, builder.albumPages);
    attachRun(test, madeAt, target.task, { page: target.page, slot: target.slot }, snapPages(builder.albumPages));
    builder.goToPage(target.page);
    // The open book is Preview's: open it at the start, where its button is.
    if (target.task === 'openBook') void builder.dispatch({ type: 'preview_album', payload: { stay: true }, rawMessage: 'preview album' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, made, builder.phase, builder.albumPages]);

  /** After a failure, make it again with the test kept from before. False
   *  when there is nothing to retry (no failure, or no test). */
  const retry = (): boolean => {
    if (stage !== 'failed' || !testRef.current) return false;
    void start();
    return true;
  };

  return { stage, start, retry };
}
