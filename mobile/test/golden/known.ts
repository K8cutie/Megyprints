/* ══════════════════════════════════════════════════════════════════════════
   KNOWN PLATFORM DIFFERENCES: a golden picture whose only failure is a
   measured difference of the platform the website pictures are made on,
   never of the app's drawing. The picture must fail exactly so (and nothing
   else): if it ever passes, or fails another way, the test fails and the
   entry must be looked at again. Used by the Node check
   (goldenCovers.test.ts) and the phone check (goldenPhone.check.ts).

   cover-64-soft-plain: the front title, Playfair Display Bold at 72 px,
   sits 0.52 px lower in the app than in the website picture (bar 0.5).
   Its line is print's own to 0.01 px and its glyphs land on the very same
   pixel rows (both round the baseline to a whole pixel: checked at six
   baseline fractions); what differs is the letters' weight inside those
   rows: Windows Chromium draws them with DirectWrite, the app with
   FreeType. Measured on that line in Playfair Display Bold at 13 sizes
   from 48 to 134 px, the app's ink centre sits -0.44 to +0.53 px from
   DirectWrite's, 72 px the largest. Customers' print files are mostly made
   in Chrome on Android, which draws letters with FreeType too. The entry
   allows 0.50 to 0.53 px (measured 0.52 in Node CanvasKit), no more.
   ══════════════════════════════════════════════════════════════════════════ */
export const KNOWN_PLATFORM_DIFFERENCES: Record<string, RegExp> = {
  'cover-64-soft-plain': /^text 3: sits -?0\.0\d, 0\.5[0-3] px off \(bar 0\.5\)$/,
};
