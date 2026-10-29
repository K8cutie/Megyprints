/** The shared code check's answers on a computer (Node). Kept equal to what
 *  runSharedChecks() gives there by test/sharedCheck.test.ts; the phone's
 *  answers are compared with these on the "Shared code check" screen.
 *  Made 2026-10-28 from the website code on feat/port-phase-0a. */
export const SHARED_CHECK_EXPECTED: Record<string, string> = {
  'min-photos': '40',
  'short-by': '15',
  'add-more': 'Add 15 more photos',
  'too-few': "Albums need at least 40 photos, one for every page. You have 25: add 15 more and I'll make your album.",
  sizes: '6×4, 8×6, 6×8, 6×6, 8×8, 11.5×8, 8.5×11',
  sheets: '13',
  price: '365',
  breakdown: '3 lines, total 505',
  templates: '622',
  'templates-by-size': '8x8: 28, 6x6: 22, 8x6: 38, 6x8: 38, 6x4: 11',
  quotes: '818',
  album: '40 pages, 19 full-page photos, 60 photos placed',
  'album-code': '0510106c',
};
