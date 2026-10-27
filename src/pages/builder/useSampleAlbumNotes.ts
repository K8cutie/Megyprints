import { useState } from 'react';
import { isNativeShell } from '../../lib/nativeShell';
import { showSampleAlbumNotes } from '../../lib/samplePhotos';

/** A sample album in the Android app while testing: its pages carry the
 *  welcome and done cards, and Preview opens on its last page. */
export function useSampleAlbumNotes(photos: readonly { name: string }[]): boolean {
  const [inApp] = useState(isNativeShell);
  return showSampleAlbumNotes(inApp, photos);
}
