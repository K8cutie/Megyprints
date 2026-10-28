/* ══════════════════════════════════════════════════════════════════════════
   THE ALBUM BEING MADE, kept on the phone (a file, see draftStore, draftFile).

   Photos are NOT copied into the app. Each one is kept as a pointer to where
   it already is on the phone (its content:// address), with its size and the
   time it was taken, the same facts the website keeps for a photo
   (UploadedPhoto: width, height, capturedAt). They stay in the order they
   were taken, oldest first, as on the album's pages.

   The 40-photo minimum is the website's own rule (shared
   src/pages/builder/albumMinimum.ts), words included, so the app and the
   website can never disagree about it.
   ══════════════════════════════════════════════════════════════════════════ */
import { addMoreLabel, MIN_ALBUM_PHOTOS, photosGoingIn, photosShortBy, photoWord } from '@web/pages/builder/albumMinimum';
import { formatCount } from './photoDays';
import { orderTime } from './photoTime';

export type PhotoSource = 'gallery' | 'files';

export interface DraftPhoto {
  /** One per photo, however it was picked (see photoKey). */
  key: string;
  source: PhotoSource;
  /** Where the photo is on the phone (content://…). Never a copy. */
  uri: string;
  /** The file's name, to find the photo again on another phone (photoRelink). */
  name: string;
  /** As the photo is shown (turned photos already swapped). 0 = not known. */
  width: number;
  height: number;
  /** When it was taken (EXIF DateTimeOriginal), ms. Null = the photo has no time. */
  capturedAt: number | null;
  /** When the file last changed, ms: the order when there is no taken time. */
  modifiedAt: number | null;
  /** When it was added to the album, ms: keeps undated photos in pick order. */
  addedAt: number;
  mimeType?: string;
  /** Bytes, when known. */
  size?: number;
  /** Left out of the album (Megy's photo check, as on the website). Stays in
   *  the list, so it can be put back; it does not count toward the 40. */
  leftOut?: boolean;
}

export interface AlbumDraft {
  version: 1;
  photos: DraftPhoto[];
  updatedAt: number;
}

export const DRAFT_VERSION = 1 as const;
export const emptyDraft = (): AlbumDraft => ({ version: DRAFT_VERSION, photos: [], updatedAt: 0 });

/* The same photo can come in several ways: from the grid (its MediaStore
   address, content://media/external/images/media/123, or on Android 10
   content://media/external_primary/images/media/123), or from Files when
   Files shows the phone's Images (content://com.android.providers.media.
   documents/document/image%3A123) or its Downloads (content://com.android.
   providers.downloads.documents/document/msf%3A123). All of them carry
   Android's number for the photo, so all get the key 'media:123' and the
   photo goes in once. Other Files addresses (browsing the phone's storage,
   Drive…) are keyed by their own address. */
const MEDIA_ITEM = /^content:\/\/media\/external(?:_primary)?\/images\/media\/(\d+)$/;
const MEDIA_DOCUMENT = /^content:\/\/com\.android\.providers\.media\.documents\/document\/image(?:%3A|:)(\d+)$/i;
const DOWNLOADS_DOCUMENT = /^content:\/\/com\.android\.providers\.downloads\.documents\/document\/msf(?:%3A|:)(\d+)$/i;

/** Android's number for a photo (its MediaStore id), from any of those addresses. */
export function mediaStoreId(uri: string): string | null {
  const m = MEDIA_ITEM.exec(uri) ?? MEDIA_DOCUMENT.exec(uri) ?? DOWNLOADS_DOCUMENT.exec(uri);
  return m ? m[1] : null;
}

/** One key per photo, however it was picked. */
export function photoKey(source: PhotoSource, uri: string): string {
  const id = mediaStoreId(uri);
  return id ? `media:${id}` : `${source}:${uri}`;
}

/** The grid photos (by their ids) that are in the album already, to mark
 *  them "In album". Compared by key (Android's photo number), never by the
 *  whole address: Android 10 gives the grid ".../external_primary/..." ids,
 *  and a photo may have come in through Files. */
export function idsInAlbum(gridIds: readonly string[], photos: readonly DraftPhoto[]): Set<string> {
  const out = new Set<string>();
  if (photos.length === 0) return out;
  const keys = new Set(photos.map((p) => p.key));
  for (const id of gridIds) if (keys.has(photoKey('gallery', id))) out.add(id);
  return out;
}

/** Oldest first, as on the album's pages. Photos with no time at all go
 *  last, in the order they were added (as the website does). */
export function inTimeOrder(photos: readonly DraftPhoto[]): DraftPhoto[] {
  return photos
    .map((p, i) => ({ p, i, t: orderTime(p) }))
    .sort((a, b) => {
      if (a.t == null && b.t == null) return a.p.addedAt - b.p.addedAt || a.i - b.i;
      if (a.t == null) return 1;
      if (b.t == null) return -1;
      return a.t - b.t || a.p.addedAt - b.p.addedAt || a.p.name.localeCompare(b.p.name) || a.i - b.i;
    })
    .map(({ p }) => p);
}

export interface AddResult {
  draft: AlbumDraft;
  /** Photos that went in. */
  added: number;
  /** Photos that were in the album already (picked twice). */
  alreadyIn: number;
}

/** Adds photos, skipping any already in the album, and keeps time order. */
export function addPhotos(draft: AlbumDraft, incoming: readonly DraftPhoto[], now = Date.now()): AddResult {
  const have = new Set(draft.photos.map((p) => p.key));
  const fresh: DraftPhoto[] = [];
  let alreadyIn = 0;
  for (const p of incoming) {
    if (have.has(p.key)) { alreadyIn++; continue; }
    have.add(p.key);
    fresh.push(p);
  }
  if (fresh.length === 0) return { draft, added: 0, alreadyIn };
  return {
    draft: { version: DRAFT_VERSION, photos: inTimeOrder([...draft.photos, ...fresh]), updatedAt: now },
    added: fresh.length,
    alreadyIn,
  };
}

/** Takes photos out of the album (the photos stay on the phone). */
export function removePhotos(draft: AlbumDraft, keys: readonly string[], now = Date.now()): AlbumDraft {
  const out = new Set(keys);
  const photos = draft.photos.filter((p) => !out.has(p.key));
  return photos.length === draft.photos.length ? draft : { version: DRAFT_VERSION, photos, updatedAt: now };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** One saved photo, checked; null if it is not usable. */
function readPhoto(raw: unknown): DraftPhoto | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.source !== 'gallery' && r.source !== 'files') return null;
  if (typeof r.uri !== 'string' || !r.uri) return null;
  const photo: DraftPhoto = {
    key: photoKey(r.source, r.uri),
    source: r.source,
    uri: r.uri,
    name: typeof r.name === 'string' ? r.name : '',
    width: Math.max(0, num(r.width) ?? 0),
    height: Math.max(0, num(r.height) ?? 0),
    capturedAt: num(r.capturedAt),
    modifiedAt: num(r.modifiedAt),
    addedAt: num(r.addedAt) ?? 0,
  };
  if (typeof r.mimeType === 'string') photo.mimeType = r.mimeType;
  const size = num(r.size);
  if (size != null) photo.size = size;
  if (r.leftOut === true) photo.leftOut = true;
  return photo;
}

/** The saved draft, checked; null when the text is not a saved album at
 *  all (broken, or from another version). Unreadable photos are dropped one
 *  by one. */
export function readDraft(text: string): AlbumDraft | null {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== DRAFT_VERSION) return null;
  const list = (raw as { photos?: unknown }).photos;
  const photos: DraftPhoto[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    const p = readPhoto(item);
    if (p && !seen.has(p.key)) { seen.add(p.key); photos.push(p); }
  }
  return { version: DRAFT_VERSION, photos: inTimeOrder(photos), updatedAt: num((raw as { updatedAt?: unknown }).updatedAt) ?? 0 };
}

/** The saved draft, checked. Anything unreadable gives an empty album
 *  rather than a crash (draftStore tells "nothing saved" and "could not be
 *  read" apart with readDraft). */
export function parseDraft(text: string | null | undefined): AlbumDraft {
  return (text ? readDraft(text) : null) ?? emptyDraft();
}

/** What is saved. The key is left out: it is rebuilt from source + uri. */
export function serializeDraft(draft: AlbumDraft): string {
  return JSON.stringify({
    version: draft.version,
    updatedAt: draft.updatedAt,
    photos: draft.photos.map(({ key: _key, ...rest }) => rest),
  });
}

/* ── The "Your photos" step: what it says and where its button goes ─────── */

export interface PhotoStep {
  /** Photos going into the album. */
  count: number;
  /** How many more the album needs (0 = enough). */
  short: number;
  /** At or over the minimum: "Next" goes on. Under it, there is no way on. */
  canGoOn: boolean;
  /** The one filled button. */
  mainLabel: string;
  /** What the filled button does. */
  main: 'pick' | 'next';
  /** A second, plain button (only once there are enough). */
  secondLabel: string | null;
  /** The sentence above the buttons. */
  message: string;
}

export const PICK_PHOTOS = 'Pick photos';
export const NEXT = 'Next';
export const ADD_MORE_PHOTOS = 'Add more photos';

/** The words and the way on, from the website's 40-photo rule. */
export function photoStep(photos: readonly DraftPhoto[]): PhotoStep {
  return photoStepFor(photosGoingIn(photos));
}

/** The same, for `count` photos going in (the album builder's count, which
 *  can be lower than the photos picked: the same photo picked twice goes in
 *  once, and one the phone can't open doesn't go in). */
export function photoStepFor(count: number): PhotoStep {
  const short = photosShortBy(count);
  if (count === 0) {
    return {
      count, short, canGoOn: false, main: 'pick', mainLabel: PICK_PHOTOS, secondLabel: null,
      message: `Pick the photos for your album. Albums need at least ${MIN_ALBUM_PHOTOS} photos, one for every page. You can add as many more as you like.`,
    };
  }
  if (short > 0) {
    return {
      count, short, canGoOn: false, main: 'pick', mainLabel: addMoreLabel(short), secondLabel: null,
      message: `You have ${formatCount(count)} ${photoWord(count)}. Albums need at least ${MIN_ALBUM_PHOTOS}, one for every page: add ${short} more to make your album.`,
    };
  }
  return {
    count, short, canGoOn: true, main: 'next', mainLabel: NEXT, secondLabel: ADD_MORE_PHOTOS,
    // The website's words for this step (wizard.ts upload_photos), without
    // "Great!": a 250-photo album is longer than 40 pages, so no page count.
    message: `You have ${formatCount(count)} photos ready. Add more, or go on to pick your cover.`,
  };
}

/** The picker's line under the count: how far the picked photos get the album. */
export function pickerProgress(inAlbum: number, picked: number): string {
  const short = photosShortBy(inAlbum + picked);
  if (short === 0) return 'Enough photos for an album.';
  return `Albums need at least ${MIN_ALBUM_PHOTOS} photos. Pick ${short} more.`;
}
