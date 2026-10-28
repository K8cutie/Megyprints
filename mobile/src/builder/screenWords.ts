/* What the Cover and Preview screens say about the pictures of the pages
   (not src/render/pageWords.ts, the words drawn ON a page):
   plain words for the customer. Which fonts and decorations are not drawn
   yet is in the page plan (plan.notDrawn) for the tests and the notes, not
   on screen. */
import type { MissingPhotos } from '@web/lib/photoPresence';

/** Something on a page or the cover is drawn more simply than it prints. */
export const NOT_DRAWN_LINE = 'Some fonts and decorations look simpler here than in your printed album.';

/** A page whose picture could not be made. */
export const PAGE_NOT_SHOWN = 'This page could not be shown.';

/** Photos the album holds that this phone no longer has (deleted from the
 *  phone, or made on another device): which pages, and the way back, as the
 *  website's MissingPhotosBar says it (photoPresence.missingPhotosMessage),
 *  for a phone. '' when none. */
export function missingOnPhoneMessage(m: MissingPhotos): string {
  if (m.count === 0) return '';
  const list = (n: number[]) => (n.length === 1 ? `${n[0]}` : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
  const where = [
    m.pages.length ? (m.pages.length > 6 ? `${m.pages.length} pages` : `page${m.pages.length > 1 ? 's' : ''} ${list(m.pages)}`) : '',
    m.cover ? 'the cover' : '',
  ].filter(Boolean).join(' and ');
  const many = m.count > 1;
  return `${m.count} photo${many ? 's' : ''} on ${where} ${many ? "aren't" : "isn't"} on this phone any more, so ${many ? 'they show' : 'it shows'} as an empty space. `
    + `Pick the same ${many ? 'photos' : 'photo'} again and Megy puts ${many ? 'each one' : 'it'} back in its place.`;
}
