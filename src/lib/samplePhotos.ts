/* ══════════════════════════════════════════════════════════════════════════
   SAMPLE PHOTOS — testing phase only (owner, 2026-10-28: "some testers arent
   a picture bunch so they have less than 40 pics and is incapable"). An album
   is 40 pages and needs 40 photos (albumMinimum). A tester with 15 photos was
   stuck on "Add 25 more photos": no album, so no "For Testing purposes"
   stamp to show they got through. In the Android app, while TESTING_PHASE is
   on, the photo step also offers "Add 25 sample photos": Megy's own photos
   (public/sample-photos, free Unsplash photos, list in docs/sample-photos.md)
   make up the 40. The 40-photo rule itself does not change.

   The samples go in through the same door as the tester's own photos
   (add_photos), so the photo check, face detection and the time order all
   run on them. Each carries a "taken" time on one day out (park → beach → a
   birthday → grandparents → dinner → friends), so they sit in that order.

   78 of them (owner, 2026-10-28: "increase the sample photo pool so the
   youre done shows something different every day. its a 14 day test"):
   64 everyday photos and 14 "end of the day" ones. Each day's sample album
   takes 39 everyday photos picked for that day and that day's end-of-day
   photo, which goes on the last page, under "You're done with today's
   test!". Over any 14 days in a row, no two days look the same.
   ══════════════════════════════════════════════════════════════════════════ */

import { TESTING_PHASE, MONTHS } from './testingPhase';
import { createLimiter } from './limit';

/** How many sample photos there are: the everyday ones, then the 14 end-of-day ones. */
export const SAMPLE_PHOTO_COUNT = 78;

/** Everyday photos: megy-sample-01 … 64. */
export const SAMPLE_EVERYDAY_COUNT = 64;

/** Days in the test: one end-of-day photo for each. */
export const SAMPLE_TEST_DAYS = 14;

/** "megy-sample-07.jpg": the file in public/sample-photos and the photo's
 *  name in the album (the same name twice is skipped as already added). */
export const samplePhotoName = (n: number): string => `megy-sample-${String(n).padStart(2, '0')}.jpg`;

/** Every sample, in the order of the day. */
export const SAMPLE_PHOTO_NAMES: readonly string[] =
  Array.from({ length: SAMPLE_PHOTO_COUNT }, (_, i) => samplePhotoName(i + 1));

/** The everyday photos (01 … 64). */
export const SAMPLE_EVERYDAY_NAMES: readonly string[] = SAMPLE_PHOTO_NAMES.slice(0, SAMPLE_EVERYDAY_COUNT);

/** The end-of-day photos (65 … 78): "taken" after every everyday one. */
export const SAMPLE_END_OF_DAY_NAMES: readonly string[] = SAMPLE_PHOTO_NAMES.slice(SAMPLE_EVERYDAY_COUNT);

/** The offer shows only in the Android app, and only while the switch is on. */
export function showSamplePhotos(inApp: boolean, switchOn: boolean = TESTING_PHASE): boolean {
  return switchOn && inApp;
}

/** The samples that make up `short` photos: ones not in the album yet,
 *  spread evenly over the day, so even a few mix the scenes and both shapes.
 *  Fewer when fewer are left; none when nothing is short. */
export function pickSamplePhotos(short: number, inAlbum: Iterable<string>): string[] {
  const have = new Set(inAlbum);
  // Everyday photos only: the end-of-day ones belong to the sample album's last page.
  const left = SAMPLE_EVERYDAY_NAMES.filter((name) => !have.has(name));
  const want = Math.min(Math.max(0, Math.floor(short)), left.length);
  return Array.from({ length: want }, (_, i) => left[Math.floor((i * left.length) / want)]);
}

/* Step 1's "Make a sample album" (owner, 2026-10-28: "Generate a sample album
   feature is added on step 1 using those sample photos"): one tap and a
   tester has a whole album, stamped, without a photo of their own. */

/** Today, as a number that goes up by one at the phone's midnight. */
export function sampleDayNumber(now: Date): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/** A small seeded shuffle: the same day always picks the same photos. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The day's end-of-day photo, for its last page: a different one each day for 14 days. */
export function sampleEndOfDayPhoto(day: number): string {
  return SAMPLE_END_OF_DAY_NAMES[((day % SAMPLE_TEST_DAYS) + SAMPLE_TEST_DAYS) % SAMPLE_TEST_DAYS];
}

/** The day's sample album: 39 everyday photos picked for the day (in the
 *  day's order), then its end-of-day photo. 40 photos, a whole album. */
export function sampleAlbumPhotos(day: number, count = 40): string[] {
  const rand = seeded(day * 2654435761);
  const pool = [...SAMPLE_EVERYDAY_NAMES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const everyday = pool.slice(0, Math.min(count - 1, pool.length)).sort();
  return [...everyday, sampleEndOfDayPhoto(day)];
}

/** The sample album's name when the tester hasn't typed one. It shows in the
 *  album's header, so a screenshot says it is the sample album. */
export const SAMPLE_ALBUM_NAME = 'Sample Album';

/** The name with the day it was made, "Sample Album · Oct 29": a tester makes
 *  one each day of the test, and "Welcome back" lists the last three. */
export function sampleAlbumName(now: Date): string {
  return `${SAMPLE_ALBUM_NAME} · ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

/* "Welcome back" on the next day (owner, 2026-10-28: "The resume will confuse
   testers"). Its big button resumed yesterday's sample album, with
   yesterday's date and end-of-day photo. When the chosen album is a sample
   album made on an earlier day, the button is "Make today's sample album": a
   new album, made the way Step 1's "Make a sample album" makes it. The
   builder picks the request up when it opens (useSampleAlbum). */

const SAMPLE_REQUEST_KEY = 'megy-make-sample-album';

/** Ask the builder to make today's sample album as it opens. */
export function requestSampleAlbum(): void {
  try { sessionStorage.setItem(SAMPLE_REQUEST_KEY, '1'); } catch { /* private mode */ }
}

/** The builder: was today's sample album asked for? Answers once. */
export function takeSampleAlbumRequest(): boolean {
  try {
    if (sessionStorage.getItem(SAMPLE_REQUEST_KEY) !== '1') return false;
    sessionStorage.removeItem(SAMPLE_REQUEST_KEY);
    return true;
  } catch {
    return false;
  }
}

/** When a sample album was made (ms), from its photos' names and when it was
 *  made or first saved; null for any other album, or when that isn't known. */
export function sampleAlbumMadeAt(photoNames: readonly string[] | undefined, made: number | null | undefined): number | null {
  if (!photoNames || !isSampleAlbum(photoNames.map((name) => ({ name })))) return null;
  return made != null && Number.isFinite(made) && made > 0 ? made : null;
}

/** A sample album made on an earlier day than `now`: "Welcome back" offers today's. */
export function sampleAlbumIsFromAnEarlierDay(sampleMadeAt: number | null | undefined, now: Date): boolean {
  return sampleMadeAt != null && sampleDayNumber(new Date(sampleMadeAt)) < sampleDayNumber(now);
}

/** The sample album's occasion when none is picked: the samples are a family day. */
export const SAMPLE_ALBUM_OCCASION = 'Family';

/** The sample album's cover: the family standing together in the garden. */
export const SAMPLE_COVER_NAME = samplePhotoName(3);

/** The photo for the sample album's cover: the chosen sample when it is in
 *  the album, else the first sample, else the first photo. */
export function sampleCoverPhoto<P extends { name: string; leftOut?: boolean }>(photos: readonly P[]): P | undefined {
  const live = photos.filter((p) => !p.leftOut);
  return live.find((p) => p.name === SAMPLE_COVER_NAME)
    ?? live.find((p) => SAMPLE_PHOTO_NAMES.includes(p.name))
    ?? live[0];
}

/* The sample album tells the tester what to do (owner, 2026-10-28: "page 1
   says welcome to the megyprints app test go scroll until you reach the last
   page of the album and select preview then the last page of the album shows
   your done with todays test take a screenshot and send it as proof").
   Cards drawn over page 1 (in the pages) and the last page (in Preview),
   screen only like the stamp. The buttons are named as they read. */

/** Every photo in the album is a sample: Step 1's sample album, or an empty
 *  album filled with "Add 40 sample photos". */
export function isSampleAlbum(photos: readonly { name: string }[]): boolean {
  return photos.length > 0 && photos.every((p) => SAMPLE_PHOTO_NAMES.includes(p.name));
}

/** "You're done": the line that names both of today's tasks, with a small
 *  picture of the answer when it is a colour or a photo. */
export interface DoneProof {
  /** "Today: title font Dancing Script · new layout on page 5". */
  text: string;
  /** A colour swatch (today's colour or title colour). */
  hex?: string;
  /** The cover photo they chose. */
  photo?: string;
}

/** A card over a page: a bold first line, then what to do (**bold** words). */
export interface SampleAlbumNote {
  title: string;
  body: string;
  /** "You're done" only: both of today's tasks (lib/dailyTest doneLine). */
  proof?: DoneProof | null;
}

/** Page 1, where the sample album opens. */
export const SAMPLE_WELCOME_NOTE: SampleAlbumNote = {
  title: 'Welcome to the Megy Prints app test!',
  body: 'Tap **Next page** until you reach the last page, then tap **Done — Preview my album**.',
};

/** Page 1 once the album has been previewed: Today's test (lib/dailyTest)
 *  opens it on "You're done", so the steps above no longer apply. Every
 *  page but the last then shows "Back to preview" (PageTurnBar). */
export const SAMPLE_WELCOME_BACK_NOTE: SampleAlbumNote = {
  title: 'Welcome to the Megy Prints app test!',
  body: "Tap **Back to preview** to see **You're done** again.",
};

/** Page 1's card: how to reach "You're done", or (seen already) the way back. */
export function sampleWelcomeNote(previewSeen: boolean): SampleAlbumNote {
  return previewSeen ? SAMPLE_WELCOME_BACK_NOTE : SAMPLE_WELCOME_NOTE;
}

/** The last page, in Preview, once today's test is done (lib/dailyTestRun).
 *  With the stamp's date and time beside it, and the line that names both of
 *  today's tasks (doneNote), the screenshot is the proof. */
export const SAMPLE_DONE_NOTE: SampleAlbumNote = {
  title: "You're done with today's test!",
  body: 'Take a screenshot and send it as proof.',
};

/** "You're done", with the line that names both of today's tasks. */
export function doneNote(proof: DoneProof | null | undefined): SampleAlbumNote {
  return proof ? { ...SAMPLE_DONE_NOTE, proof } : SAMPLE_DONE_NOTE;
}

/** The last page of a sample album that wasn't made through Today's test
 *  (from sample photos added on the photo step, say): no "You're done". */
export const SAMPLE_NOT_DONE_NOTE: SampleAlbumNote = {
  title: "Today's test isn't done yet",
  body: "Go to Home and tap **Make today's sample album**.",
};

/** The cards show, and Preview opens on the last page, in a sample album in
 *  the Android app while the testing switch is on. */
export function showSampleAlbumNotes(inApp: boolean, photos: readonly { name: string }[], switchOn: boolean = TESTING_PHASE): boolean {
  return showSamplePhotos(inApp, switchOn) && isSampleAlbum(photos);
}

/** The button: "Add 25 sample photos". */
export function addSamplesLabel(count: number): string {
  return `Add ${count} sample photo${count === 1 ? '' : 's'}`;
}

/** The picked samples from the site, as photos to add. Three downloads at a
 *  time (about 300 KB each); one that fails fails the batch, so nothing is
 *  half added. */
export async function fetchSamplePhotos(
  names: readonly string[],
  base: string = import.meta.env.BASE_URL,
  fetchFn: typeof fetch = fetch,
): Promise<File[]> {
  const limit = createLimiter(3);
  return Promise.all(names.map((name) => limit(async () => {
    const res = await fetchFn(`${base}sample-photos/${name}`);
    if (!res.ok) throw new Error(`Sample photo ${name}: ${res.status}`);
    return new File([await res.blob()], name, { type: 'image/jpeg' });
  })));
}
