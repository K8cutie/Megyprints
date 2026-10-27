import { describe, it, expect } from 'vitest';
import { albumMadeAt, showTesterStamp, stampTime, testerStampLines, SHOW_TESTER_STAMP, TESTER_STAMP_LABEL } from './testingPhase';

/* ══════════════════════════════════════════════════════════════════════════
   "FOR TESTING PURPOSES" AND WHEN THE ALBUM WAS MADE (owner, 2026-10-28:
   "after album generates the image will have a time stamp 'For Testing
   purposes' then a date and time"). The words and the time on the stamp, and
   who sees it. Where it is drawn (and that it never prints):
   src/pages/builder/testerPageStamp.spec.ts.
   ══════════════════════════════════════════════════════════════════════════ */

describe('the stamp says', () => {
  it("the owner's words, then the date and time the album was made", () => {
    expect(TESTER_STAMP_LABEL).toBe('For Testing purposes');
    expect(testerStampLines(new Date(2026, 9, 28, 14, 5).getTime())).toEqual(['For Testing purposes', 'Oct 28, 2026, 2:05 PM']);
  });

  it('says 12 at midnight and at noon, AM before noon', () => {
    expect(stampTime(new Date(2026, 0, 1, 0, 0))).toBe('Jan 1, 2026, 12:00 AM');
    expect(stampTime(new Date(2026, 0, 1, 12, 30))).toBe('Jan 1, 2026, 12:30 PM');
    expect(stampTime(new Date(2026, 11, 31, 11, 59))).toBe('Dec 31, 2026, 11:59 AM');
  });

  it('uses plain spaces only, so it reads the same on every phone', () => {
    expect(stampTime(new Date(2026, 9, 28, 9, 7))).not.toMatch(new RegExp('[  ]'));
  });
});

describe('when the album was made', () => {
  const at = (t?: unknown) => ({ madeAt: t });

  it('is the newest time on its pages: pages added later have none, pages kept from an earlier make keep theirs', () => {
    expect(albumMadeAt([at(100), at(300), at(), at(200)])).toBe(300);
  });

  it('is unknown for an album not made yet, or made before the stamp existed', () => {
    expect(albumMadeAt([])).toBeNull();
    expect(albumMadeAt([at(), at(), null, undefined])).toBeNull();
  });

  it('ignores anything that is not a time (a page from an account copy is not trusted)', () => {
    expect(albumMadeAt([at('2026-10-28'), at(NaN), at(Infinity), at(-5), at(0), at({})])).toBeNull();
  });
});

describe('who sees it', () => {
  it('only the Android app, and only while the switch is on', () => {
    expect(showTesterStamp(true, true)).toBe(true);
    expect(showTesterStamp(false, true)).toBe(false);
    expect(showTesterStamp(true, false)).toBe(false);
    expect(showTesterStamp(false, false)).toBe(false);
  });

  it('is switched on during the test track (one line to turn off for production)', () => {
    expect(SHOW_TESTER_STAMP).toBe(true);
  });
});
