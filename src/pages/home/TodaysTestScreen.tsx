import { lazy, Suspense } from 'react';
import { loadTodaysTest } from './loadTodaysTest';

const TodaysTest = lazy(loadTodaysTest);

/** Today's test, from its own chunk: the one screen every way to a sample
 *  album goes through in the Android app while testing (lib/dailyTest). */
export default function TodaysTestScreen({ onMake, onClose }: {
  /** The test is done and kept (requestDailyTest): make the album. */
  onMake: () => void;
  onClose: () => void;
}) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[140] bg-paper" aria-busy="true" />}>
      <TodaysTest onMake={onMake} onClose={onClose} />
    </Suspense>
  );
}
