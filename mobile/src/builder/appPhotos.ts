/* ══════════════════════════════════════════════════════════════════════════
   THE PHONE'S PHOTOS, AS THE ALBUM BUILDER TAKES THEM (shared/platform.ts
   PickedPhoto, PhotoStore, PhotoIntake).

   Photos are NEVER copied into the app (docs/mobile-port-plan.md, Phase 2).
   A photo picked on the Photos step is a pointer to where it already is on
   the phone (its content:// address), with the facts Phase 2 read when it
   was picked: its size as shown, when it was taken. The builder gets it as
   an AppPickedPhoto: name, size and type (what the builder reads), plus that
   address and those facts (what only the app's pieces read).

     • The PHOTO STORE keeps, per builder photo id, that address and facts in
       a small index in the device store. "Keeping" a photo is writing down
       where it is, nothing more. Reading it back checks the phone still has
       it (inspectPhotos: the file's header, no pixels), so a photo deleted
       from the phone while the app was closed shows as missing, as a photo
       missing on another device does on the website (photoPresence), and
       picking it again puts it back in its place (photoRelink).
     • The INTAKE answers from the picked photo's own facts. Android opens
       HEIC photos itself (ImageDecoder), so nothing is converted: an iPhone
       photo goes in by its address like any other. Every address is checked
       again when an album opens (urlNeedsReload: always), because a photo
       can be deleted between visits; the check is one header read per photo,
       asked of the phone in one call.
     • COLOURS: the phone's Skia draws a photo's numbers as they are, so a
       photo saved in Display P3 or Adobe RGB must be turned into sRGB before
       a print page is drawn (the on-phone renderer run, PR #219). The store
       writes down, as each photo comes in, its colour space and whether it
       needs that (needsSrgb). Pages on screen are drawn from small sRGB
       copies (pagePhotos.ts), so they are right already; the print step
       (Phase 5) converts the photos that need it, one at a time.
   ══════════════════════════════════════════════════════════════════════════ */
import type { KeptPhoto, KeyValueStore, PhotoIntake, PhotoSize, PhotoStore, PickedPhoto, StoredPhoto } from '@web/shared/platform';
import type { DraftPhoto } from '../lib/photoDraft';

/** A photo from the Photos step, as the builder takes it. */
export interface AppPickedPhoto extends PickedPhoto {
  /** Where it is on the phone (content://…). */
  readonly uri: string;
  /** As shown (EXIF rotation applied). 0 = not known. */
  readonly width: number;
  readonly height: number;
  /** When it was taken (ms), or null. */
  readonly capturedAt: number | null;
}

export function isAppPickedPhoto(p: unknown): p is AppPickedPhoto {
  return !!p && typeof p === 'object' && typeof (p as { uri?: unknown }).uri === 'string' && (p as { uri: string }).uri !== '';
}

const TYPE_BY_NAME: [RegExp, string][] = [
  [/\.jpe?g$/i, 'image/jpeg'], [/\.png$/i, 'image/png'], [/\.webp$/i, 'image/webp'],
  [/\.hei[cf]$/i, 'image/heic'], [/\.gif$/i, 'image/gif'],
];

/** A Phase 2 photo as the builder takes it. The grid only shows photos, so a
 *  photo whose type the phone didn't say is still a photo (by its name, else
 *  a JPEG, the camera's own kind): the builder leaves "not a photo" out.
 *  `bytes`: the file's size when the phone's index didn't give one (the
 *  builder knows a photo by its name AND size: two different photos with the
 *  same name, as chat apps make, must not look like one picked twice). */
export function toPickedPhoto(p: DraftPhoto, bytes?: number): AppPickedPhoto {
  const type = p.mimeType || TYPE_BY_NAME.find(([re]) => re.test(p.name))?.[1] || 'image/jpeg';
  return {
    name: p.name || p.uri.split('/').pop() || 'photo.jpg',
    size: p.size || bytes || 0,
    type,
    uri: p.uri,
    width: p.width,
    height: p.height,
    capturedAt: p.capturedAt,
  };
}

/** What the phone says about a photo, from its header (modules/photo-files). */
export interface PhotoHeader {
  uri: string;
  readable: boolean;
  /** The file's size in bytes (0 = unknown). */
  size: number;
  width: number;
  height: number;
  colorSpace: string | null;
  needsSrgb: boolean;
}

/** The phone's half of the photo pieces (modules/photo-files in the app; a
 *  made-up phone in jest). Null = the build can't ask (then a photo is taken
 *  as it was picked, and assumed still there). */
export type InspectPhotos = (uris: string[]) => Promise<PhotoHeader[] | null>;

/** One photo the store keeps: where it is, and what it is. */
export interface StoreRecord extends KeptPhoto {
  uri: string;
  colorSpace?: string | null;
  needsSrgb?: boolean;
}

export const PHOTO_INDEX_KEY = 'megy-2.0-photo-index-v1';

/** Asks the phone about many photos in one call: every ask made in the same
 *  moment goes out together. */
function batched(inspect: InspectPhotos) {
  let waiting: { uri: string; resolve: (h: PhotoHeader | null | undefined) => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    timer = null;
    const batch = waiting;
    waiting = [];
    let headers: PhotoHeader[] | null = null;
    try { headers = await inspect([...new Set(batch.map((b) => b.uri))]); } catch { headers = null; }
    for (const b of batch) b.resolve(headers ? headers.find((h) => h.uri === b.uri) ?? null : undefined);
  };
  /** The header; null = the phone doesn't have it; undefined = couldn't ask. */
  return (uri: string) => new Promise<PhotoHeader | null | undefined>((resolve) => {
    waiting.push({ uri, resolve });
    if (!timer) timer = setTimeout(() => { void flush(); }, 0);
  });
}

export interface AppPhotoStore extends PhotoStore {
  /** Every photo the store keeps (tests; the print step reads needsSrgb). */
  records(): StoreRecord[];
  /** Writes the index now (the app going to the background). */
  flush(): void;
}

/** The app's photo store: see the top of this file. One per app (the
 *  builder's usePhotoStore returns this same object on every render). */
export function createPhotoStore(store: KeyValueStore, inspect: InspectPhotos, { saveDelayMs = 250 } = {}): AppPhotoStore {
  const index = new Map<string, StoreRecord>();
  try {
    const saved = JSON.parse(store.getItem(PHOTO_INDEX_KEY) ?? '[]') as StoreRecord[];
    if (Array.isArray(saved)) for (const r of saved) if (r && typeof r.id === 'string' && typeof r.uri === 'string') index.set(r.id, r);
  } catch { /* an unreadable index: photos are found again by their address when picked */ }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    try { store.setItem(PHOTO_INDEX_KEY, JSON.stringify([...index.values()])); } catch { /* full: kept in memory */ }
  };
  const later = () => { if (!timer) timer = setTimeout(save, saveDelayMs); };
  const ask = batched(inspect);

  return {
    async store(photo, id) {
      if (!isAppPickedPhoto(photo)) return null;
      const key = id ?? `phone-${index.size}-${Date.now().toString(36)}`;
      const header = await ask(photo.uri);
      if (header === null) return null; // the phone can't open it
      const known = photo.width > 0 && photo.height > 0;
      const record: StoreRecord = {
        id: key, uri: photo.uri, name: photo.name, type: photo.type, size: photo.size,
        width: known ? photo.width : header?.width ?? 0,
        height: known ? photo.height : header?.height ?? 0,
        ...(header ? { colorSpace: header.colorSpace, needsSrgb: header.needsSrgb } : {}),
      };
      index.set(key, record);
      later();
      const { uri: _uri, colorSpace: _cs, needsSrgb: _n, ...kept } = record;
      return kept;
    },
    async get(id) {
      const r = index.get(id);
      if (!r) return null;
      const header = await ask(r.uri);
      if (header === null || header?.readable === false) return null; // gone from the phone
      const { uri, colorSpace: _cs, needsSrgb: _n, ...kept } = r;
      const out: StoredPhoto = { ...kept, url: uri };
      return out;
    },
    async deletePhoto(id) {
      if (index.delete(id)) later();
    },
    async deleteMany(ids) {
      let changed = false;
      for (const id of ids) changed = index.delete(id) || changed;
      if (changed) later();
    },
    records: () => [...index.values()],
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      save();
    },
  };
}

/** The app's photo intake: see the top of this file. */
export function createPhotoIntake(inspect: InspectPhotos): PhotoIntake {
  const ask = batched(inspect);
  const sizeOf = async (uri: string): Promise<PhotoSize | null> => {
    const h = await ask(uri);
    if (h === undefined) return null;
    return h && h.readable && h.width > 0 && h.height > 0 ? { width: h.width, height: h.height } : null;
  };
  return {
    // Android opens HEIC itself: nothing to convert, nothing to wait for.
    looksHeic: () => false,
    toAlbumPhoto: async (p) => p,
    getImageDimensions: async (p) => {
      if (isAppPickedPhoto(p) && p.width > 0 && p.height > 0) return { width: p.width, height: p.height };
      return (isAppPickedPhoto(p) ? await sizeOf(p.uri) : null) ?? { width: 0, height: 0 };
    },
    // Read when it was picked (Phase 2: EXIF where the phone's index lacks it).
    captureTime: async (p) => (isAppPickedPhoto(p) ? p.capturedAt ?? null : null),
    previewUrlOf: (p) => (isAppPickedPhoto(p) ? p.uri : ''),
    // Every address is checked again when an album opens: a photo can be
    // deleted from the phone between visits (see the top of this file).
    urlNeedsReload: () => true,
    releasePreviewUrl: () => {},
    pictureSize: (url) => sizeOf(url),
    convertingPreview: '',
  };
}
