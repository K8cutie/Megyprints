/* ══════════════════════════════════════════════════════════════════════════
   THE PICKED PHOTOS ARE THE ALBUM'S, not the phone's.

   The photos picked on the Photos step (the draft, draftStore) are what its
   Next puts in the album (albumFlow.syncPhotos), taking out any album photo
   not among them. They used to stay on the phone whatever album it held
   (beta round 3):
     • another account signing in gets a fresh album (useBuilderState), but
       the last person's picks stayed, and "Continue my album" put them in
       the new account's album;
     • an album opened from My albums listed the album before it's photos as
       its own, with "Make the album again" ready to remake it from them.
   So when the phone's album becomes another one, the picked photos become
   that album's photos on this phone: none for a fresh album.
   ══════════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { photoKey, type DraftPhoto } from './photoDraft';

const GALLERY_ITEM = /^content:\/\/media\/external(?:_primary)?\/images\/media\/\d+$/;

/** The album's photos as picked photos: each by its address on this phone,
 *  or the address it had here when it is missing now (shown as missing, as
 *  a deleted photo is); a photo never on this phone is not listed (picking
 *  it again puts it back in its place, photoRelink). */
export function draftFromAlbum(photos: readonly UploadedPhoto[], keptAt: (id: string) => string | undefined): DraftPhoto[] {
  const out: DraftPhoto[] = [];
  photos.forEach((p, i) => {
    const uri = p.previewUrl || keptAt(p.id);
    if (!uri) return;
    const source = GALLERY_ITEM.test(uri) ? 'gallery' : 'files';
    out.push({
      key: photoKey(source, uri), source, uri, name: p.name,
      width: p.width, height: p.height, capturedAt: p.capturedAt ?? null, modifiedAt: null, addedAt: i,
      mimeType: p.type, size: p.size,
      ...(p.leftOut ? { leftOut: true } : {}),
    });
  });
  return out;
}

/** When the album on the phone becomes another one (opened, or a fresh
 *  one), its photos become the picked photos. Not while it is still opening
 *  (loadAlbum: its photos come in last), and not from a render whose album
 *  was already replaced under it: another account signing in gets a new id
 *  while the last person's photos are still shown, then a fresh album. */
export function useDraftFollowsAlbum(
  getAlbumId: () => string | undefined,
  opening: boolean,
  photos: readonly UploadedPhoto[],
  replace: (photos: DraftPhoto[]) => void,
  keptAt: (id: string) => string | undefined,
): void {
  const albumId = getAlbumId();
  const last = useRef(albumId);
  useEffect(() => {
    if (opening || albumId === last.current || getAlbumId() !== albumId) return;
    last.current = albumId;
    replace(draftFromAlbum(photos, keptAt));
    // Only when the album changes: its photos changing is the Photos step's own work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, opening]);
}
