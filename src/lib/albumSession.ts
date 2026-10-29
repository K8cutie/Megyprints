/* ══════════════════════════════════════════════════════════════════════════
   albumSession — "which album am I on this visit?" signals, shared by the Home
   page, Your Projects and the resume prompt.

   • FRESH START: the builder reads this once on mount and opens a brand-new
     album instead of the one in progress (Builder.tsx / useBuilderState).
   • RESUME ASKED: the "pick up where you left off?" prompt asks once per visit
     per account. Choosing to start a new album IS the answer, so it counts.
   ══════════════════════════════════════════════════════════════════════════ */

import { TESTING_PHASE } from './testingPhase';

export const FRESH_START_KEY = 'megy-fresh-start';
const RESUME_ASKED_KEY = 'megy-resume-asked';

/** The start-up prompts are off in the Android app while TESTING_PHASE is on
 *  (owner, 2026-10-29: "for now please disable resume from where you left off
 *  or open existing album feature on the onset"): no "Welcome back… pick up
 *  where you left off?" (ResumePrompt) and no "You have an album in progress"
 *  (StartNewAlbumPrompt). Start Creating and "Make today's sample album"
 *  start a new album straight away. Signed in, the album in progress is saved
 *  to the account first (useBuilderState reset()); signed out with their own
 *  album on the phone, Home still asks first (home/KeepAlbumAsk). The
 *  website, or the switch off: the prompts as always. */
export function skipsResumePrompts(inApp: boolean, switchOn: boolean = TESTING_PHASE): boolean {
  return switchOn && inApp;
}

/** Open the builder on a NEW album next (the caller navigates to /builder). */
export function startFreshAlbum(userId?: string | null): void {
  try { sessionStorage.setItem(FRESH_START_KEY, '1'); } catch { /* private mode */ }
  if (userId) markResumeAsked(userId);
}

export function wasResumeAsked(userId: string): boolean {
  try { return sessionStorage.getItem(RESUME_ASKED_KEY) === userId; } catch { return true; }
}

/** Was anyone asked yet this visit? Read before the session is known. */
export function wasResumeAskedThisVisit(): boolean {
  try { return !!sessionStorage.getItem(RESUME_ASKED_KEY); } catch { return true; }
}

export function markResumeAsked(userId: string): void {
  try { sessionStorage.setItem(RESUME_ASKED_KEY, userId); } catch { /* private mode */ }
}

/** Signing out ends the visit for that account: the next sign-in asks again. */
export function clearResumeAsked(): void {
  try { sessionStorage.removeItem(RESUME_ASKED_KEY); } catch { /* private mode */ }
}
