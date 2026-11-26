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
import { addMoreLabel, MIN_ALBUM_PHOTOS, photosGoingIn, photosOverBy, photosShortBy, photoWord } from '@web/pages/builder/albumMinimum';
import { isMiniSize, miniPagesForPhotos, miniPagesOf, miniPhotoRange, miniSuggestion, MINI_NAME, MINI_PAGES, MINI_SIZE } from '@web/lib/megyMini';
import type { PhotoCheck } from '@web/lib/photoCheck';
import { formatCount } from './photoDays';
import { readPlace, type PhotoPlace } from './photoPlace';
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
  /** Where it was taken (EXIF GPS), when the photo has a place (photoPlace.ts).
   *  Kept on the phone only. */
  location?: PhotoPlace;
  mimeType?: string;
  /** Bytes, when known. */
  size?: number;
  /** Left out of the album (Megy's photo check, as on the website). Stays in
   *  the list, so it can be put back; it does not count toward the 40. */
  leftOut?: boolean;
  /** What Megy's photo check found (lib/draftPhotoCheck, the website's own
   *  UploadedPhoto.check): saved, so a photo is checked once. */
  check?: PhotoCheck;
  /** "Keep it": Megy does not suggest leaving this photo out again. */
  kept?: boolean;
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
  // A photo left out can be picked again: that puts it back (addPhotos).
  const keys = new Set(photos.filter((p) => !p.leftOut).map((p) => p.key));
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

/** Adds photos, skipping any already in the album, and keeps time order.
 *  A photo that was left out and is picked again goes back in, kept (Megy
 *  does not suggest it out again). */
export function addPhotos(draft: AlbumDraft, incoming: readonly DraftPhoto[], now = Date.now()): AddResult {
  const have = new Set(draft.photos.map((p) => p.key));
  const out = new Set(draft.photos.filter((p) => p.leftOut).map((p) => p.key));
  const fresh: DraftPhoto[] = [];
  const back = new Set<string>();
  let alreadyIn = 0;
  for (const p of incoming) {
    if (out.has(p.key)) { back.add(p.key); continue; }
    if (have.has(p.key)) { alreadyIn++; continue; }
    have.add(p.key);
    fresh.push(p);
  }
  if (fresh.length === 0 && back.size === 0) return { draft, added: 0, alreadyIn };
  const photos = back.size ? draft.photos.map((p) => (back.has(p.key) ? putBack(p) : p)) : draft.photos;
  return {
    draft: { version: DRAFT_VERSION, photos: inTimeOrder([...photos, ...fresh]), updatedAt: now },
    added: fresh.length + back.size,
    alreadyIn,
  };
}

/** A left-out photo back in the album, kept. */
function putBack(p: DraftPhoto): DraftPhoto {
  const { leftOut: _out, ...rest } = p;
  return { ...rest, kept: true };
}

/* ── Megy's photo check on the picked photos (lib/draftPhotoCheck) ──────── */

/** What the check found for these photos. The picked photos are the same,
 *  so the draft's time does not move (the Photos step's note about what the
 *  album took still holds). */
export function setChecks(draft: AlbumDraft, found: ReadonlyMap<string, PhotoCheck>): AlbumDraft {
  if (found.size === 0 || !draft.photos.some((p) => found.has(p.key))) return draft;
  return { ...draft, photos: draft.photos.map((p) => (found.has(p.key) ? { ...p, check: found.get(p.key) } : p)) };
}

/** Megy's suggestion, accepted: these photos are left out of the album.
 *  They stay in the list, so they can be brought back. */
export function leaveOutPhotos(draft: AlbumDraft, keys: readonly string[], now = Date.now()): AlbumDraft {
  const out = new Set(keys);
  if (!draft.photos.some((p) => out.has(p.key) && !p.leftOut)) return draft;
  return { version: DRAFT_VERSION, photos: draft.photos.map((p) => (out.has(p.key) && !p.leftOut ? { ...p, leftOut: true } : p)), updatedAt: now };
}

/** "Keep it": these photos stay in (or go back in) and are not suggested
 *  out again. The draft's time moves only when a photo goes back in. */
export function keepPhotos(draft: AlbumDraft, keys: readonly string[], now = Date.now()): AlbumDraft {
  const keep = new Set(keys);
  if (!draft.photos.some((p) => keep.has(p.key) && (!p.kept || p.leftOut))) return draft;
  const back = draft.photos.some((p) => keep.has(p.key) && p.leftOut);
  return {
    version: DRAFT_VERSION,
    photos: draft.photos.map((p) => (keep.has(p.key) && (!p.kept || p.leftOut) ? putBack(p) : p)),
    updatedAt: back ? now : draft.updatedAt,
  };
}

/** Every left-out photo back in the album, kept. */
export function bringBackPhotos(draft: AlbumDraft, now = Date.now()): AlbumDraft {
  return keepPhotos(draft, draft.photos.filter((p) => p.leftOut).map((p) => p.key), now);
}

/** Takes photos out of the album (the photos stay on the phone). */
export function removePhotos(draft: AlbumDraft, keys: readonly string[], now = Date.now()): AlbumDraft {
  const out = new Set(keys);
  const photos = draft.photos.filter((p) => !out.has(p.key));
  return photos.length === draft.photos.length ? draft : { version: DRAFT_VERSION, photos, updatedAt: now };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A saved photo check, checked; null if it is not one (it is done again). */
function readCheck(raw: unknown): PhotoCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const sharp = num(c.sharp);
  if (c.v !== 1 || sharp == null || typeof c.hash !== 'string' || !/^[0-9a-f]{16}$/.test(c.hash)) return null;
  return { v: 1, sharp, hash: c.hash, faces: num(c.faces), eyesClosed: c.eyesClosed === true, ...(c.facesTried === true ? { facesTried: true } : {}) };
}

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
  const location = readPlace(r.location);
  if (location) photo.location = location;
  if (typeof r.mimeType === 'string') photo.mimeType = r.mimeType;
  const size = num(r.size);
  if (size != null) photo.size = size;
  if (r.leftOut === true) photo.leftOut = true;
  const check = readCheck(r.check);
  if (check) photo.check = check;
  if (r.kept === true) photo.kept = true;
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
  /** What the filled button does. 'size': back to the size step (a Megy Mini
   *  with more photos than it holds: make an album instead). */
  main: 'pick' | 'next' | 'size';
  /** A second, plain button (only once there are enough). */
  secondLabel: string | null;
  /** The sentence above the buttons. */
  message: string;
  /** An album short of its 40 photos while Megy Mini is on sale: offer the
   *  Mini instead (MINI_INSTEAD, a plain button; owner, 2026-11-16). */
  suggestMini?: boolean;
}

export const PICK_PHOTOS = 'Pick photos';
export const NEXT = 'Next';
export const ADD_MORE_PHOTOS = 'Add more photos';

export const MAKE_ALBUM_INSTEAD = 'Make an album instead';
/** A 16-page Megy Mini with more photos than it holds, while the 24-page
 *  one is on sale and holds them: the size step, to pick 24 pages. */
export const PICK_24_PAGES = 'Pick 24 pages';

/** The words and the way on, from the website's 40-photo rule (16 to 40 for
 *  a Megy Mini: pass the album's size). */
export function photoStep(photos: readonly DraftPhoto[], size?: string | null, opts?: PhotoStepOptions): PhotoStep {
  return photoStepFor(photosGoingIn(photos), size, opts);
}

export interface PhotoStepOptions {
  /** Megy Mini is on sale (the price list has "mini"): an album short of 40
   *  photos is offered the Mini. */
  miniOnSale?: boolean;
  /** The Mini's pages (16 or 24, builder.miniPages). */
  miniPages?: number;
  /** The Mini page counts on sale (lib/megyMini miniPagesOnSale). */
  miniPagesOnSale?: readonly number[];
}

/** The Megy Mini's photos step (lib/megyMini): 16 to 40 photos for its 16
 *  pages, 24 to 60 for 24. */
function miniPhotoStep(count: number, opts?: PhotoStepOptions): PhotoStep {
  const pages = miniPagesOf(opts?.miniPages);
  const { min, max } = miniPhotoRange(pages);
  const short = photosShortBy(count, MINI_SIZE, pages);
  const over = photosOverBy(count, MINI_SIZE, pages);
  const named = pages === MINI_PAGES ? MINI_NAME : `${pages}-page ${MINI_NAME}`;
  if (count === 0) {
    return {
      count, short, canGoOn: false, main: 'pick', mainLabel: PICK_PHOTOS, secondLabel: null,
      message: `Pick the photos for your ${MINI_NAME}: ${min} to ${max} photos for its ${pages} pages.`,
    };
  }
  if (short > 0) {
    return {
      count, short, canGoOn: false, main: 'pick', mainLabel: addMoreLabel(short), secondLabel: null,
      message: `You have ${formatCount(count)} ${photoWord(count)}. A ${named} needs at least ${min}, one for every page: add ${short} more.`,
    };
  }
  if (over > 0) {
    // More than 16 pages hold, and the 24-page Mini is on sale and holds them.
    const more = miniPagesForPhotos(count, (opts?.miniPagesOnSale ?? []).filter((n) => n > pages));
    if (more != null) {
      return {
        count, short, canGoOn: false, main: 'size', mainLabel: PICK_24_PAGES, secondLabel: null,
        message: `You have ${formatCount(count)} photos. A ${named} holds up to ${max}: take out ${over} (tap × on a photo), or pick ${more} pages, which hold up to ${miniPhotoRange(more).max}.`,
      };
    }
    return {
      count, short, canGoOn: false, main: 'size', mainLabel: MAKE_ALBUM_INSTEAD, secondLabel: null,
      message: `You have ${formatCount(count)} photos. A ${named} holds up to ${max}: take out ${over} (tap × on a photo), or make an album instead.`,
    };
  }
  return {
    count, short, canGoOn: true, main: 'next', mainLabel: NEXT, secondLabel: count < max ? ADD_MORE_PHOTOS : null,
    message: `You have ${formatCount(count)} photos ready for your ${MINI_NAME}. Go on to pick your cover.`,
  };
}

/** The same, for `count` photos going in (the album builder's count, which
 *  can be lower than the photos picked: the same photo picked twice goes in
 *  once, and one the phone can't open doesn't go in). */
export function photoStepFor(count: number, size?: string | null, opts?: PhotoStepOptions): PhotoStep {
  if (isMiniSize(size)) return miniPhotoStep(count, opts);
  const short = photosShortBy(count);
  if (count === 0) {
    return {
      count, short, canGoOn: false, main: 'pick', mainLabel: PICK_PHOTOS, secondLabel: null,
      message: `Pick the photos for your album. Albums need at least ${MIN_ALBUM_PHOTOS} photos, one for every page. You can add as many more as you like.`,
    };
  }
  if (short > 0) {
    const message = `You have ${formatCount(count)} ${photoWord(count)}. Albums need at least ${MIN_ALBUM_PHOTOS}, one for every page: add ${short} more to make your album.`;
    // Under 40 photos, the Megy Mini (16 pages) while it is on sale.
    return opts?.miniOnSale
      ? { count, short, canGoOn: false, main: 'pick', mainLabel: addMoreLabel(short), secondLabel: null, message: `${message} ${miniSuggestion(count, opts.miniPagesOnSale)}`, suggestMini: true }
      : { count, short, canGoOn: false, main: 'pick', mainLabel: addMoreLabel(short), secondLabel: null, message };
  }
  return {
    count, short, canGoOn: true, main: 'next', mainLabel: NEXT, secondLabel: ADD_MORE_PHOTOS,
    // The website's words for this step (wizard.ts upload_photos), without
    // "Great!": a 250-photo album is longer than 40 pages, so no page count.
    message: `You have ${formatCount(count)} photos ready. Add more, or go on to pick your cover.`,
  };
}

/** The picker's line under the count: how far the picked photos get the album. */
export function pickerProgress(inAlbum: number, picked: number, size?: string | null, miniPages?: number): string {
  if (isMiniSize(size)) {
    const total = inAlbum + picked;
    const { min, max } = miniPhotoRange(miniPages);
    const short = photosShortBy(total, MINI_SIZE, miniPages);
    const over = photosOverBy(total, MINI_SIZE, miniPages);
    if (short > 0) return `A ${MINI_NAME} needs at least ${min} photos. Pick ${short} more.`;
    if (over > 0) return `A ${MINI_NAME} holds up to ${max} photos: ${over} too many.`;
    return `Enough photos for a ${MINI_NAME}.`;
  }
  const short = photosShortBy(inAlbum + picked);
  if (short === 0) return 'Enough photos for an album.';
  return `Albums need at least ${MIN_ALBUM_PHOTOS} photos. Pick ${short} more.`;
}
