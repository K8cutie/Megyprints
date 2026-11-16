/* The album's photos for the cover, in an order that stays put while the
   person looks at them (albumFlow.steadyCoverRow): best first once Megy's
   photo check has looked at every photo, the album's order until then.

   The order is taken once per visit. `visit` is a number the screen changes
   each time it comes on top (the cover step stays mounted under the Preview:
   coming back to it, the photos take their order again, with what the check
   has found since). A screen that is made new each time it opens (Design
   your cover) passes nothing. */
import { useMemo, useRef } from 'react';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { steadyCoverRow, type CoverRow } from './albumFlow';

export function useCoverPhotos(uploadedPhotos: readonly UploadedPhoto[], visit = 0): { photos: UploadedPhoto[]; best: boolean } {
  const shown = useRef<{ visit: number; row: CoverRow } | null>(null);
  return useMemo(() => {
    const prev = shown.current?.visit === visit ? shown.current.row : null;
    const next = steadyCoverRow(prev, uploadedPhotos);
    shown.current = { visit, row: { ids: next.ids, best: next.best } };
    return { photos: next.photos, best: next.best };
  }, [uploadedPhotos, visit]);
}
