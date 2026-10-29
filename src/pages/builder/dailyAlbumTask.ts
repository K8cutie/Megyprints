/* ══════════════════════════════════════════════════════════════════════════
   Today's task IN THE ALBUM (lib/dailyTest ALBUM_TASKS): where it is, and
   when it is done, read from the album itself.

   Each one is a tool the phone's pages screen (MobileReview) already has,
   opened for the tester on the right page:
     • layout   — "Change layout" (the layout picker), on a page with photos;
     • caption  — a caption box's editor, on the first page with an empty box;
     • look     — a photo's Filter sheet (Studio's looks), on a photo;
     • swap     — "Add a photo" on a photo: a photo from another page swaps
                  places with it (one photo, one place: slotSwap);
     • openBook — Preview's "See it as an open book".
   The owner's list had "Add a page"; the phone's pages screen has no such
   button, so the photo's filter stands in for it.

   Done is a change in the album, on any page (not only the one opened): a
   new layout, new words, a new filter, photos in other places. The open book
   is the one that is not in the album: Preview says so (markAlbumTaskDone).

   The coach mark (2026-10-29, the daily lesson): it points at the tool that
   opened, each one marked data-coach="…" (lib/lessonTips ALBUM_TIPS):
   the layout picker, the text box, the Filter sheet, the photo picker, and
   Preview's open-book button. Once that tool is closed, at the strip's
   button that opens it again.
   ══════════════════════════════════════════════════════════════════════════ */

import type { AlbumTaskId } from '../../lib/dailyTest';
import type { PageSnap } from '../../lib/dailyTestRun';
import { ALBUM_TIPS, coachSelector, coachText } from '../../lib/lessonTips';
import type { CoachStep } from '../../components/lesson/CoachMark';
import { getTemplateById } from './pageTemplates';
import type { AlbumPage } from './types';

type Page = Pick<AlbumPage, 'templateId' | 'slotFills' | 'slotLooks' | 'textElements' | 'slotTexts' | 'studio'>;

const filledSlots = (p: Page): number[] =>
  (p.slotFills ?? []).flatMap((f, i) => (f != null ? [i] : []));
const wordsOn = (p: Page): number =>
  (p.textElements ?? []).filter((t) => t.text?.trim()).length + (p.slotTexts ?? []).filter((t) => t?.text?.trim()).length;
const looksOn = (p: Page): number => (p.slotLooks ?? []).filter(Boolean).length;
const photosOn = (p: Page): string => (p.slotFills ?? []).map((f) => (f == null ? '_' : String(f))).join(',');

/** The album as it was made. */
export function snapPages(pages: readonly Page[]): PageSnap[] {
  return pages.map((p) => ({ t: p.templateId ?? '', f: photosOn(p), l: looksOn(p), w: wordsOn(p) }));
}

/** An empty caption box on a page, or null. */
function emptyBox(p: Page): number | null {
  const boxes = p.templateId ? getTemplateById(p.templateId)?.textSlots?.length ?? 0 : 0;
  for (let i = 0; i < boxes; i++) {
    if (!(p.textElements ?? []).some((t) => t.boxIndex === i && t.text?.trim())) return i;
  }
  return null;
}

/** The pages the task may open on: not page 1 (where the album opens), not
 *  the last ("You're done"), from `from` on, then the ones before it. */
function pagesFrom(pages: readonly Page[], from: number): number[] {
  const inner = pages.map((_, i) => i).filter((i) => i > 0 && i < pages.length - 1);
  const start = Math.min(from, Math.max(1, pages.length - 2));
  return [...inner.filter((i) => i >= start), ...inner.filter((i) => i < start)];
}

/** Where today's task opens. A caption task in an album with no box to type
 *  in becomes the layout task (said so on the line). */
export function albumTaskTarget(task: AlbumTaskId, pages: readonly Page[]): { task: AlbumTaskId; page: number; slot: number | null } {
  // Preview opens on page 2, past the cover, where the open-book button is.
  if (task === 'openBook') return { task, page: Math.min(1, pages.length - 1), slot: null };
  if (task === 'caption') {
    for (const i of pagesFrom(pages, 1)) {
      const box = emptyBox(pages[i]);
      if (box != null) return { task, page: i, slot: box };
    }
    return albumTaskTarget('layout', pages);
  }
  const from = task === 'layout' ? 4 : task === 'look' ? 2 : 3;
  for (const i of pagesFrom(pages, from)) {
    const p = pages[i];
    if (p.studio) continue;
    const slots = filledSlots(p);
    if (slots.length) return { task, page: i, slot: task === 'layout' ? null : slots[0] };
  }
  return { task, page: Math.min(1, pages.length - 1), slot: task === 'layout' ? null : 0 };
}

/** Is today's task done? What was done ("new layout on page 5"), or null. */
export function detectAlbumTask(task: AlbumTaskId, start: readonly PageSnap[], pages: readonly Page[], targetPage?: number): string | null {
  const changed = (test: (p: Page, s: PageSnap) => boolean): number | null => {
    const hits = pages.flatMap((p, i) => (start[i] && test(p, start[i]) ? [i] : []));
    if (!hits.length) return null;
    return targetPage != null && hits.includes(targetPage) ? targetPage : hits[0];
  };
  let at: number | null;
  switch (task) {
    case 'layout':
      at = changed((p, s) => (p.templateId ?? '') !== s.t);
      return at == null ? null : `new layout on page ${at + 1}`;
    case 'caption':
      at = changed((p, s) => wordsOn(p) > s.w);
      return at == null ? null : `words on page ${at + 1}`;
    case 'look':
      at = changed((p, s) => looksOn(p) > s.l);
      return at == null ? null : `filter on page ${at + 1}`;
    case 'swap':
      // Photos in other places, on a page that kept its layout.
      at = changed((p, s) => (p.templateId ?? '') === s.t && photosOn(p) !== s.f);
      return at == null ? null : `swapped a photo on page ${at + 1}`;
    case 'openBook':
      return null;
  }
}

/** The label when the album task is the open book (Preview says it). */
export const OPEN_BOOK_DONE = 'open book view';

/** How long the open book must stay on screen to count (Preview's first draw
 *  shows it for an instant on an upright phone). */
export const OPEN_BOOK_SEEN_MS = 1500;

/** The strip's button that opens the task's tool again (DailyTestBar). */
export const REOPEN_CONTROL = 'lesson-show';

/** Where the coach mark points for today's task in the album: the tool that
 *  opened for it, and once that is closed, the strip's button (`reopen`, its
 *  words; none: nothing to point at then). */
export function coachStepsFor(task: AlbumTaskId, reopen: string | null): CoachStep[] {
  const tip = ALBUM_TIPS[task];
  const steps: CoachStep[] = [{ target: coachSelector(tip.control), text: coachText(tip) }];
  if (reopen) steps.push({ target: coachSelector(REOPEN_CONTROL), text: `Tap **${reopen}** to try it.` });
  return steps;
}
