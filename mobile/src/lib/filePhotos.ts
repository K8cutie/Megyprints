/* ══════════════════════════════════════════════════════════════════════════
   "CHOOSE FROM FILES": photos picked with Android's document picker.

   Needs no photo permission, so it is the way in when photo access is
   refused, and the fallback if Google ever refuses the app's
   READ_MEDIA_IMAGES declaration (docs/mobile-port-plan.md, Phase 2 notes).
   Photos are NOT copied (copyToCacheDirectory: false): the app keeps access
   to each one where it is (modules/photo-files) and reads its size and EXIF
   time there. Only photos go in: the website's own rule (shared
   src/lib/pickedFiles.ts) decides what is a photo, and says what was left out.
   ══════════════════════════════════════════════════════════════════════════ */
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { kindOfPick, leftOutNote } from '@web/lib/pickedFiles';
import { describePickedFiles, type PickedFileInfo } from '../../modules/photo-files';
import { photoKey, type DraftPhoto } from './photoDraft';
import { parseExifDateTime } from './photoTime';

export interface FilesPick {
  photos: DraftPhoto[];
  /** Plain words about anything left out ('' when nothing was). */
  note: string;
}

/** Picked files + what the native module read → album photos and a note. */
export function filesToPhotos(assets: readonly DocumentPickerAsset[], infos: readonly PickedFileInfo[], now = Date.now()): FilesPick {
  const byUri = new Map(infos.map((i) => [i.uri, i]));
  const photos: DraftPhoto[] = [];
  let videos = 0;
  let others = 0;
  let unreadable = 0;
  for (const a of assets) {
    const kind = kindOfPick({ type: a.mimeType ?? '', name: a.name ?? '' });
    if (kind === 'video') { videos++; continue; }
    if (kind === 'other') { others++; continue; }
    const info = byUri.get(a.uri);
    if (info && !info.readable) { unreadable++; continue; }
    const photo: DraftPhoto = {
      key: photoKey('files', a.uri),
      source: 'files',
      uri: a.uri,
      name: a.name ?? '',
      width: info?.width ?? 0,
      height: info?.height ?? 0,
      capturedAt: parseExifDateTime(info?.takenAt, info?.takenOffset),
      modifiedAt: typeof a.lastModified === 'number' && a.lastModified > 0 ? a.lastModified : null,
      addedAt: now,
    };
    if (a.mimeType) photo.mimeType = a.mimeType;
    if (typeof a.size === 'number') photo.size = a.size;
    photos.push(photo);
  }
  const parts = [leftOutNote(videos, others, photos.length > 0)];
  if (unreadable > 0) parts.push(`${unreadable} photo${unreadable > 1 ? 's' : ''} could not be opened`);
  return { photos, note: parts.filter(Boolean).join(' · ') };
}

/** Opens Android's file picker for photos (many at once). Null = closed
 *  without picking. */
export async function pickFromFiles(now = Date.now()): Promise<FilesPick | null> {
  const res = await getDocumentAsync({ type: 'image/*', multiple: true, copyToCacheDirectory: false });
  if (res.canceled || !res.assets?.length) return null;
  // Only images go to the native module: it keeps access to each one.
  const images = res.assets.filter((a) => kindOfPick({ type: a.mimeType ?? '', name: a.name ?? '' }) === 'photo');
  const infos = await describePickedFiles(images.map((a) => a.uri));
  return filesToPhotos(res.assets, infos, now);
}
