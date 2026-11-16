/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PHOTO CHECK ON THE PICKED PHOTOS (the Photos step), since 2.1.2.

   The website checks a photo as it is uploaded, on its upload step, and
   shows there what Megy would leave out (PhotoCheckCard: "Suggest, one
   tap", owner 2026-10-04). In the app the picked photos wait on the Photos
   step (the draft, photoDraft) and go into the album builder on "Next", so
   this is where the app checks them and asks.

   The rules are the website's own, the same functions (src/lib/photoCheck):
   which photo is next (nextCheckJob: blur and fingerprint for every photo,
   then closed eyes for the photos in a set of repeats, which picks the shot
   Megy keeps), when the check can speak (checkIsReady), and what it suggests
   (suggestLeaveOut). The pixels come from the phone's checker
   (phonePhotoCheck), the one the album builder uses too: a photo checked
   here is not decoded again there.

   What is found is saved with the picked photos (DraftPhoto.check), so a
   photo is checked once, even after the app is closed and opened again. The
   answers are written a few at a time (FLUSH_MS), not one write per photo.

   A photo the phone can't check (it can't be opened) is left alone: it does
   not hold the check up, and it is never suggested out.

   Two photos are checked side by side (CHECKS_AT_ONCE, what the checker
   decodes at once): a photo's decoding is on Android's threads, so the
   second one costs the screen little and the check ends sooner.
   ══════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoChecker, StoredPhoto } from '@web/shared/platform';
import { checkIsReady, checkProgress, nextCheckJob, suggestLeaveOut, type CheckablePhoto, type LeaveOutSuggestion, type PhotoCheck } from '@web/lib/photoCheck';
import { PHONE_CHECK_AT_ONCE } from './phonePhotoCheck';
import type { DraftPhoto } from './photoDraft';

/** Photos checked side by side: as many as the checker decodes at once. */
export const CHECKS_AT_ONCE = PHONE_CHECK_AT_ONCE;

/** The answers found are saved this often while the check runs. */
export const FLUSH_MS = 400;

/** A picked photo as the shared rules read it (its key is its id). */
export const toCheckable = (p: DraftPhoto): CheckablePhoto => ({
  id: p.key, width: p.width, height: p.height, capturedAt: p.capturedAt, check: p.check, kept: p.kept, leftOut: p.leftOut,
});

/** A picked photo as the checker reads it: by its address on the phone. */
const storedOf = (p: DraftPhoto): StoredPhoto => ({
  id: p.key, name: p.name, type: p.mimeType ?? 'image/jpeg', size: p.size ?? 0, width: p.width, height: p.height, url: p.uri,
});

export interface DraftCheckRun {
  /** The picked photos now, with the answers found so far. */
  photos(): readonly DraftPhoto[];
  /** An answer for one photo (its blur answer, or that with its faces). */
  found(key: string, check: PhotoCheck): void;
  /** The screen is gone: stop after the photo being checked. */
  stopped(): boolean;
  /** What already ran, or failed, this visit (nothing loops). */
  tried: Set<string>;
  /** Lets the screen draw between photos. */
  breathe?: () => Promise<void>;
}

/** Checks the picked photos, one at a time, until none is left to check.
 *  The same two passes as the website's builder (useBuilderState), with the
 *  face pass only for the photos in a set of repeats: the album builder
 *  looks for the other faces once the photos are in the album. */
export async function runDraftCheck(checker: PhotoChecker, run: DraftCheckRun): Promise<void> {
  const breathe = run.breathe ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  for (;;) {
    if (run.stopped()) return;
    const photos = run.photos();
    const job = nextCheckJob(photos.map(toCheckable), run.tried, false);
    if (!job) return;
    run.tried.add(`${job.stage}:${job.id}`);
    const photo = photos.find((p) => p.key === job.id);
    const stored = photo ? storedOf(photo) : null;
    if (!photo || !stored || !checker.readable(stored)) continue;
    try {
      const res = await checker.check(stored, photo.width, photo.height, { faces: job.stage === 'faces' });
      if (job.stage === 'basic') run.found(photo.key, { ...res, faces: null, facesTried: false });
      else if (photo.check) run.found(photo.key, { ...photo.check, faces: res.faces, eyesClosed: res.eyesClosed, facesTried: true });
    } catch {
      // A photo that can't be read is just not checked.
    }
    await breathe();
  }
}

export interface DraftCheckView {
  /** This phone can run the check. False: the Photos step shows no card. */
  available: boolean;
  /** Every photo has its answer: the check can say what it found. */
  ready: boolean;
  /** Photos checked / photos to check. */
  progress: { done: number; total: number };
  /** What Megy suggests leaving out (photo keys). */
  suggestion: LeaveOutSuggestion;
  /** Photos left out of the album now. */
  leftOut: number;
  /** The customer kept a photo Megy asked about (it is in the album): the
   *  card then does not say "all sharp, no repeats". */
  keptAny: boolean;
}

/** What the Photos step shows about the check. `unchecked` are the photos
 *  the phone could not check: they are not waited for. */
export function draftCheckView(photos: readonly DraftPhoto[], available: boolean, unchecked: ReadonlySet<string> = new Set()): DraftCheckView {
  const able = photos.filter((p) => p.check || !unchecked.has(p.key)).map(toCheckable);
  return {
    available,
    ready: checkIsReady(able),
    progress: checkProgress(able),
    suggestion: suggestLeaveOut(able),
    leftOut: photos.filter((p) => p.leftOut).length,
    keptAny: photos.some((p) => p.kept && !p.leftOut),
  };
}

export interface DraftCheckStore {
  draft: { photos: readonly DraftPhoto[] };
  peek: () => { photos: readonly DraftPhoto[] };
  setChecks: (found: ReadonlyMap<string, PhotoCheck>) => void;
}

/** Runs the check on the picked photos while the Photos step is open (it
 *  stays open under the steps after it), and says what it found. */
export function useDraftPhotoCheck(
  checker: PhotoChecker,
  store: DraftCheckStore,
  /** A blur answer saved on an earlier visit (appPlatform.rememberCheck). */
  remember?: (url: string, width: number, height: number, check: PhotoCheck) => void,
  /** Says the check is wanted from now on (appPlatform.wantPhotoCheck): it
   *  is off until the Photos step opens. Asked before the first look at
   *  `available`, so the card is there from the first picture. */
  want?: () => void,
): DraftCheckView {
  const { draft, peek, setChecks } = store;
  useState(() => { want?.(); return null; });
  const available = checker.available();
  const tried = useRef(new Set<string>());
  const pending = useRef(new Map<string, PhotoCheck>());
  const known = useRef(new Set<string>());
  const running = useRef(false);
  const gone = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The photos the phone could not check, so the card can stop waiting.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(() => new Set());

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (pending.current.size === 0) return;
    const found = pending.current;
    pending.current = new Map();
    setChecks(found);
  }, [setChecks]);

  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      flush();
    };
  }, [flush]);

  useEffect(() => {
    if (!available) return;
    // Answers saved on an earlier visit: the checker need not decode again.
    if (remember) {
      for (const p of draft.photos) {
        if (!p.check || known.current.has(p.key)) continue;
        known.current.add(p.key);
        remember(p.uri, p.width, p.height, p.check);
      }
    }
    const now = () => peek().photos.map((p) => (pending.current.has(p.key) ? { ...p, check: pending.current.get(p.key) } : p));
    if (running.current || !nextCheckJob(now().map(toCheckable), tried.current, false)) return;
    running.current = true;
    const run: DraftCheckRun = {
      photos: now,
      tried: tried.current,
      stopped: () => gone.current,
      found: (key, check) => {
        pending.current.set(key, check);
        known.current.add(key);
        timer.current ??= setTimeout(flush, FLUSH_MS);
      },
    };
    // Side by side: each takes the next photo nobody has taken (`tried`).
    void Promise.all(Array.from({ length: CHECKS_AT_ONCE }, () => runDraftCheck(checker, run))).finally(() => {
      running.current = false;
      if (gone.current) return;
      flush();
      // What was tried and has no answer could not be checked.
      const failed = peek().photos.filter((p) => !p.check && tried.current.has(`basic:${p.key}`)).map((p) => p.key);
      setUnchecked((prev) => (failed.length === prev.size && failed.every((k) => prev.has(k)) ? prev : new Set(failed)));
    });
    // The checker and the store's functions are the same for the app's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.photos, available]);

  return useMemo(() => draftCheckView(draft.photos, available, unchecked), [draft.photos, available, unchecked]);
}
