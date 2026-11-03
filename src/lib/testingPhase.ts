/* ══════════════════════════════════════════════════════════════════════════
   testingPhase — "For Testing purposes" and the time the album was made, on
   the album pages in the Android app while it is only on Google Play's test
   track (owner, 2026-10-28: "after album generates the image will have a time
   stamp 'For Testing purposes' then a date and time"; "some testers would
   just screenshot and not take an effort"). Any screenshot of a tester's
   album shows when Megy made it.

   - The time is when the album was MADE (Generate / Make my album), saved on
     its pages (AlbumPage.madeAt), so a reload or another phone shows the same
     time. Making the album again gives a new time.
   - SCREEN ONLY: the page views draw it over the page (TesterPageStamp). It is
     not in the album: not in print files, sheets, the cover file or a share,
     not editable, not undoable.
   - ONE switch: set TESTING_PHASE to false before applying for production.
     The website never shows it, only the Android app, where everyone is a
     tester today. No name or email on it: testers post screenshots in public
     Facebook comments.

   The same switch turns on the sample photos (lib/samplePhotos): a tester
   with fewer than 40 photos fills the album with Megy's samples.
   ══════════════════════════════════════════════════════════════════════════ */

/** The Android app is on Google Play's test track: the tester stamp and the
 *  sample photos. Turn off before the app goes to production. */
export const TESTING_PHASE = true;

/** The owner's words, as he wrote them. */
export const TESTER_STAMP_LABEL = 'For Testing purposes';

/** The stamp shows only in the Android app, and only while the switch is on. */
export function showTesterStamp(inApp: boolean, switchOn: boolean = TESTING_PHASE): boolean {
  return switchOn && inApp;
}

/** When Megy made this album: the newest page's time (a page added later has
 *  none of its own, and pages kept from an earlier make keep theirs). Null
 *  for an album made before the stamp existed, or not made yet. */
export function albumMadeAt(pages: readonly unknown[]): number | null {
  let latest: number | null = null;
  for (const p of pages) {
    const t = (p as { madeAt?: unknown } | null | undefined)?.madeAt;
    if (typeof t === 'number' && Number.isFinite(t) && t > 0 && (latest == null || t > latest)) latest = t;
  }
  return latest;
}

/** Short month names, the same on every phone. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 28, 2026, 2:14 PM", in the phone's own time. Built by hand:
 *  toLocaleString puts a narrow no-break space before PM on newer engines,
 *  and the stamp must read the same on every phone. */
export function stampTime(at: Date): string {
  const h = at.getHours();
  const hour = h % 12 === 0 ? 12 : h % 12;
  const minute = String(at.getMinutes()).padStart(2, '0');
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}, ${hour}:${minute} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The stamp's two lines: the label, then when the album was made. */
export function testerStampLines(madeAt: number): [string, string] {
  return [TESTER_STAMP_LABEL, stampTime(new Date(madeAt))];
}
