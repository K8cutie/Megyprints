/** "Click to add:" + its options, sized to FIT the empty box: the title was
 *  15% of the box on one unwrapped line, so on a phone's four-square layout
 *  it ran past both edges ("C" and ":" clipped — 1-star testers, 2026-10-04).
 *  0.72em per character is a safe bold upper bound (as the dealt labels use).
 *  null = it can't fit readably: show the "+" bubble instead. */
export const CHOOSER_TITLE = 'Click to add:';
export function chooserListSizes(width: number, height: number, options: string[]): { titleFs: number; listFs: number } | null {
  const fs = Math.max(12, Math.min(28, Math.min(width, height) * 0.15));
  const innerW = width - 16;  // padding 6 + dashed border 2, each side
  const innerH = height - 16;
  const longest = Math.max(...options.map((o) => o.length + 3)); // "•  Photo"
  const titleFs = Math.min(fs * 1.15, innerW / (CHOOSER_TITLE.length * 0.72));
  const listFs = Math.min(fs, innerW / (longest * 0.72));
  const needH = titleFs * 1.2 + 6 + options.length * listFs * 1.5;
  return titleFs >= 9 && listFs >= 9 && needH <= innerH ? { titleFs, listFs } : null;
}
