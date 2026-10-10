/* ══════════════════════════════════════════════════════════════════════════
   CoverThumb — the front cover, small, at checkout: what you're paying for
   (1-star testers, 2026-10-04: "I paid without ever seeing the finished front
   of the book"). The same page renderer as the preview, in cover mode.
   Order.tsx loads this lazily: it brings the page renderer, which the checkout
   bundle otherwise doesn't need.
   ══════════════════════════════════════════════════════════════════════════ */

import { PageView } from './BuilderPreview';
import { getCanvasDimensions } from './layouts';
import type { AlbumPage, AlbumSizePreset, UploadedPhoto } from './types';

export default function CoverThumb({ page, photos, albumSize, width = 88 }: {
  page: AlbumPage;
  photos: UploadedPhoto[];
  albumSize: AlbumSizePreset;
  width?: number;
}) {
  const c = getCanvasDimensions(albumSize);
  const height = Math.round((width * c.height) / Math.max(1, c.width));
  return (
    <div className="shrink-0 relative overflow-hidden bg-white shadow-md" style={{ width, height, borderRadius: '1px 3px 3px 1px' }} data-testid="order-cover">
      <PageView page={page} photos={photos} singleW={width} H={height} pageIndex={0} coverMode />
    </div>
  );
}
