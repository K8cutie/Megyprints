/* ══════════════════════════════════════════════════════════════════════════
   pickedFiles — what a customer picked in the PHOTO picker. Only photos go
   on pages; a video or another file used to vanish without a word ("Nothing
   happens. No toast, no error" — 1-star testers, 2026-10-04, the
   Rule-Breaker), and two of the upload buttons didn't filter at all. Now
   addPhotos keeps the photos and says what it left out, and where a video
   does go: a video memory.
   ══════════════════════════════════════════════════════════════════════════ */

export type PickedKind = 'photo' | 'video' | 'other';

// When the picker gives no type (some phones), go by the name — only formats
// a browser can show.
const PHOTO_NAME = /\.(jpe?g|png|webp)$/i;
const VIDEO_NAME = /\.(mp4|mov|m4v|webm|3gp|mkv|avi)$/i;

export function kindOfPick(f: { type: string; name: string }): PickedKind {
  if (f.type.startsWith('image/')) return 'photo';
  if (f.type.startsWith('video/')) return 'video';
  if (!f.type && PHOTO_NAME.test(f.name)) return 'photo';
  if (!f.type && VIDEO_NAME.test(f.name)) return 'video';
  return 'other';
}

/** What was left out, for the upload confirmation ('' when nothing was).
 *  `photosAdded` says whether anything went in, which changes the wording. */
export function leftOutNote(videos: number, others: number, photosAdded: boolean): string {
  const parts: string[] = [];
  if (videos > 0) {
    parts.push(photosAdded
      ? `${videos} video${videos > 1 ? 's' : ''} left out: add ${videos > 1 ? 'those' : 'it'} with “Add a video memory” on a photo page`
      : `Videos can't go on a page. Open a photo page and tap “Add a video memory”: it plays when someone scans the printed QR`);
  }
  if (others > 0) parts.push(`${others} file${others > 1 ? 's' : ''} left out: not a photo (JPG or PNG)`);
  return parts.join(' · ');
}
