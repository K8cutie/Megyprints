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
   ══════════════════════════════════════════════════════════════════════════ */

import { TESTING_PHASE } from './testingPhase';
import { createLimiter } from './limit';

/** How many sample photos there are: enough for a whole album and then some. */
export const SAMPLE_PHOTO_COUNT = 48;

/** "megy-sample-07.jpg": the file in public/sample-photos and the photo's
 *  name in the album (the same name twice is skipped as already added). */
export const samplePhotoName = (n: number): string => `megy-sample-${String(n).padStart(2, '0')}.jpg`;

/** Every sample, in the order of the day. */
export const SAMPLE_PHOTO_NAMES: readonly string[] =
  Array.from({ length: SAMPLE_PHOTO_COUNT }, (_, i) => samplePhotoName(i + 1));

/** The offer shows only in the Android app, and only while the switch is on. */
export function showSamplePhotos(inApp: boolean, switchOn: boolean = TESTING_PHASE): boolean {
  return switchOn && inApp;
}

/** The samples that make up `short` photos: ones not in the album yet,
 *  spread evenly over the day, so even a few mix the scenes and both shapes.
 *  Fewer when fewer are left; none when nothing is short. */
export function pickSamplePhotos(short: number, inAlbum: Iterable<string>): string[] {
  const have = new Set(inAlbum);
  const left = SAMPLE_PHOTO_NAMES.filter((name) => !have.has(name));
  const want = Math.min(Math.max(0, Math.floor(short)), left.length);
  return Array.from({ length: want }, (_, i) => left[Math.floor((i * left.length) / want)]);
}

/* Step 1's "Make a sample album" (owner, 2026-10-28: "Generate a sample album
   feature is added on step 1 using those sample photos"): one tap and a
   tester has a whole album, stamped, without a photo of their own. */

/** The sample album's name when the tester hasn't typed one. It shows in the
 *  album's header, so a screenshot says it is the sample album. */
export const SAMPLE_ALBUM_NAME = 'Sample Album';

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

/** A card over a page: a bold first line, then what to do (**bold** words). */
export interface SampleAlbumNote { title: string; body: string }

/** Page 1, where the sample album opens. */
export const SAMPLE_WELCOME_NOTE: SampleAlbumNote = {
  title: 'Welcome to the Megy Prints app test!',
  body: 'Tap **Next page** until you reach the last page, then tap **Done — Preview my album**.',
};

/** The last page, in Preview. With the stamp's date and time beside it, the screenshot is the proof. */
export const SAMPLE_DONE_NOTE: SampleAlbumNote = {
  title: "You're done with today's test!",
  body: 'Take a screenshot and send it as proof.',
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
