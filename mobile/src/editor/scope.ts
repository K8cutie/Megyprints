/* The "Edit pages" screen edits the album's pages, never the cover. The
   builder sends every page edit to the cover while its cover scope is on
   (useBuilderState updateCurrentPage), and the cover step sits under the
   Preview in the app's stack, so the screen puts the scope back to the pages
   whenever it is the screen on top. */
import type { BuilderActions } from '@web/pages/builder/useBuilderState';

export function editThePages(b: Pick<BuilderActions, 'editScope' | 'setEditScope'>): void {
  if (b.editScope !== 'interior') b.setEditScope('interior');
}
