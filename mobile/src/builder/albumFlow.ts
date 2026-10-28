/* ══════════════════════════════════════════════════════════════════════════
   MAKING AN ALBUM IN THE APP: the steps, on the website's album builder.

   Name (and the occasion) → Size → Photos → Cover → "Make my album" →
   Preview, the website's order (assistant/wizard.ts WIZARD_ORDER: photos
   before the cover, the album made on the cover step). Each step is a call
   on the shared builder (useBuilderState); nothing here lays out a page or
   decides a rule. The screens call these, and so does the parity test
   (test/albumParity.test.ts), so what the test proves is what a tap does.

   Words a customer reads are the website's own for the same step (its
   files are .tsx with the website's icons, so they can't be shared as
   they are); test/albumWords.test.ts fails if one stops matching the
   website's source.
   ══════════════════════════════════════════════════════════════════════════ */
import type { BuilderActions, GenerateResult } from '@web/pages/builder/useBuilderState';
import type { AlbumPage, AlbumSizeConfig, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { offerableSizesAmong } from '@web/pages/builder/sizeOffer';
import { densityRangeLabel } from '@web/pages/builder/densities';
import { photosGoingIn, photosShortBy, tooFewToMakeMessage } from '@web/pages/builder/albumMinimum';
import { albumIsBuilt, COVER_TO_PAGES, COVER_TO_PHOTOS, coverStepNext as wizardCoverStepNext, KEEP_PAGES, MAKE_ALBUM, REMAKE_ALBUM, TO_COVER } from '@web/assistant/wizardSteps';
import { albumIsMade, confirmedIntent, placedMemories, rebuildQuestion, remakeLosesMessage } from '@web/assistant/rebuildQuestion';
import { isAlbumNameReady } from '@web/lib/albumName';
import { isAlbumThemeReady, readAlbumThemeFrom, writeAlbumThemeTo } from '@web/lib/albumThemeRules';
import { medianSharpness, photoQuality } from '@web/lib/photoCheck';
import type { KeyValueStore } from '@web/shared/platform';
import type { DraftPhoto } from '../lib/photoDraft';
import { toPickedPhoto, type InspectPhotos } from './appPhotos';

/* ── Words (the website's own; see test/albumWords.test.ts) ───────────── */

/** The ways on, the website's own (assistant/wizardSteps, shared): the
 *  photos step's (TO_COVER; with a made album KEEP_PAGES or REMAKE_ALBUM)
 *  and the cover step's (MAKE_ALBUM, COVER_TO_PAGES, COVER_TO_PHOTOS). */
export { COVER_TO_PAGES, COVER_TO_PHOTOS, KEEP_PAGES, MAKE_ALBUM, REMAKE_ALBUM, TO_COVER };
/** CoverEditor.tsx COVER_PHOTOS_SHOWN: the best few first, "Show all" for the rest. */
export const COVER_PHOTOS_SHOWN = 10;
/** GeneratingOverlay.tsx GENERATING_COPY, by the builder's `generating` phase. */
export const GENERATING_COPY = {
  measuring: 'Looking at your photos…',
  laying_out: 'Arranging them across the pages…',
  quotes: 'Choosing lines for your theme…',
  finishing: 'Almost there…',
} as const;
/** BuilderSetup.tsx SizeCard: one line under each size. */
export const SIZE_LINE: Partial<Record<AlbumSizePreset, string>> = {
  '6x6': 'Perfect for small gifts & keepsakes',
  '8x8': 'Great for travel & everyday memories',
  '6x4': 'Compact landscape for panoramas',
  '8x6': 'Roomy landscape for scenery & prints',
  '6x8': 'Tall portrait for people & keepsakes',
  '11.5x8': 'Wide format for events & weddings',
  '8.5x11': 'Classic portrait for portraits & families',
};

/* ── Name and occasion (wizard step 1, AlbumThemeStep) ─────────────────── */

export function occasionOf(store: KeyValueStore): string {
  return readAlbumThemeFrom(store);
}

/** Step 1 is answered: a name and an occasion (wizard isStepOneReady). */
export function stepOneReady(builder: Pick<BuilderActions, 'albumTitle'>, occasion: string): boolean {
  return isAlbumNameReady(builder.albumTitle) && isAlbumThemeReady(occasion);
}

/** Keeps the album's name (it becomes the cover title, as on the website)
 *  and its occasion, where the builder reads it (its device store). */
export function nameAlbum(builder: Pick<BuilderActions, 'setAlbumTitle'>, store: KeyValueStore, name: string, occasion: string, announce?: (o: string) => void): void {
  builder.setAlbumTitle(name);
  writeAlbumThemeTo(store, occasion, announce);
}

/* ── Size ──────────────────────────────────────────────────────────────── */

/** The sizes a customer may pick: the website's rule (sizeOffer, shared:
 *  the sizes with page layouts, less the ones the owner switched off, read
 *  with the app's own client; none known = every size, as the website fails
 *  open). */
export function offerableSizes(disabled: readonly string[] = []): AlbumSizeConfig[] {
  return offerableSizesAmong(disabled);
}

/** A size tap's answer on an album that already has pages (the website's
 *  change_size, actionEngine.ts): every page is laid out again for the new
 *  shape, asked first. It used to set the size alone and leave the old
 *  layout squashed onto it (1-star testers, 2026-10-04). Before any page
 *  holds a photo a tap just sets the size. */
export type SizeTap =
  | { kind: 'set' }
  | { kind: 'same' }
  | { kind: 'tooFew'; message: string }
  | { kind: 'ask'; question: string };

type SizeBuilder = Pick<BuilderActions, 'albumPages' | 'albumSize' | 'uploadedPhotos' | 'photosPerPage'>;

/** The website asks in chat and ends with 'Say "yes" to go ahead, or keep
 *  editing.'; the app asks with two buttons, so that part is left off. */
const CHAT_YES = / Say "yes" to go ahead, or keep editing\.$/;

export function sizeTap(builder: SizeBuilder, size: AlbumSizePreset): SizeTap {
  if (size === builder.albumSize) return { kind: 'same' };
  if (!albumIsMade(builder.albumPages)) return { kind: 'set' };
  const have = photosGoingIn(builder.uploadedPhotos);
  if (photosShortBy(have) > 0) return { kind: 'tooFew', message: tooFewToMakeMessage(have) };
  const q = rebuildQuestion({ type: 'change_size', payload: { size }, rawMessage: '' }, builder);
  return { kind: 'ask', question: (q ?? '').replace(CHAT_YES, '') };
}

/** "Yes" to sizeTap's question: the website's made-album resize (generateAlbum
 *  with the new size, the memories the question named as coming off agreed
 *  to, confirmedIntent). Resolves what the website says after it. */
export async function resizeMadeAlbum(
  builder: SizeBuilder & Pick<BuilderActions, 'generateAlbum' | 'currentPageIndex'>,
  size: AlbumSizePreset,
): Promise<{ done: boolean; message: string }> {
  const intent = confirmedIntent({ type: 'change_size', payload: { size }, rawMessage: '' }, builder);
  const lost = Array.isArray(intent.payload?.confirmedLost) ? (intent.payload.confirmedLost as string[]) : [];
  // actionEngine pagesBackground: the background of the page on screen.
  const bg = builder.albumPages[builder.currentPageIndex ?? 0]?.background;
  const r: GenerateResult = await builder.generateAlbum(bg, { size, ...(lost.length ? { confirmedLost: lost } : {}) });
  const label = size.replace('x', '×');
  if (!r.made) return { done: false, message: `The size was not changed: your album stays ${builder.albumSize.replace('x', '×')}.` };
  return { done: true, message: `Album size changed to ${label}. Every page is laid out again for the new shape.` };
}

/** The wizard's size choice line: '8×8" Square: 1-4 photos per page'. */
export function sizePhotosPerPage(preset: AlbumSizePreset): string {
  return `${densityRangeLabel(preset)} photos per page`;
}

/* ── Photos: the Phase 2 photos go into the builder ────────────────────── */

export interface PhotoSync {
  /** New photos into the builder. */
  added: number;
  /** Photos the album was missing on this phone, picked again: back in their places (photoRelink). */
  restored: number;
  /** The same photo picked twice (same name and size, another address): in once. */
  skipped: number;
  /** Picked, but the phone can't open them: not put in. */
  unreadable: number;
  /** Taken out of the builder (only while no page holds a photo). */
  removed: number;
  /** Taken out on an album with pages: left out (they stay on their pages
   *  until the album is made again, the website's photo-check way). */
  leftOut: number;
  /** Photos going into the album after this (the builder's count, photosGoingIn). */
  goingIn: number;
}

/** Any page (or the cover) holds a photo. Pages point at photos by their
 *  place in the builder's list (slotFills), so from here on a photo is never
 *  taken OUT of that list: every later photo would move up a place, every
 *  page would show the wrong photos, and the saved album would read as
 *  broken on the next start (isStateCorrupted). The website never calls
 *  removePhoto either: its photos step leaves a photo out. */
export function pagesHoldPhotos(pages: readonly AlbumPage[], cover?: AlbumPage | null): boolean {
  const holds = (p: AlbumPage) => (p.photos?.length ?? 0) > 0
    || [...(p.slotFills ?? []), ...(p.textSlotFills ?? [])].some((f) => f != null);
  return pages.some(holds) || (!!cover && holds(cover));
}

type SyncBuilder = Pick<BuilderActions, 'uploadedPhotos' | 'albumPages' | 'coverFront' | 'addPhotos' | 'removePhoto' | 'leaveOutPhotos' | 'keepPhotos'>;

/** Puts the photos picked on the Photos step into the builder, and takes out
 *  the ones taken out there.
 *    • A photo is known by its address on the phone (the builder shows it
 *      from there: previewUrl). The ones the builder doesn't show yet are
 *      asked of the phone first, in one call: the file's size (the builder
 *      knows a photo by name AND size, so two photos with one name, as chat
 *      apps make, are never taken for one) and whether it opens at all (one
 *      that doesn't is not put in, and is counted).
 *    • A photo the album is MISSING on this phone (deleted while the app was
 *      closed: no previewUrl) stays: picked again under any address, the
 *      builder puts it back in its own place (addPhotos → photoRelink); still
 *      listed under its old address, it stays missing and the Preview says so.
 *    • Taken out: before any page holds a photo it leaves the builder; after,
 *      it is left out (pagesHoldPhotos says why). Put back, it comes back.
 *  `addressOf`: the address the photo store keeps for a builder photo id. */
export async function syncPhotos(
  builder: SyncBuilder,
  draft: readonly DraftPhoto[],
  inspect?: InspectPhotos,
  { addressOf }: { addressOf?: (id: string) => string | undefined } = {},
): Promise<PhotoSync> {
  const going = draft.filter((p) => !p.leftOut);
  const picked = new Set(going.map((p) => p.uri));
  const photos = builder.uploadedPhotos;
  const shown = new Set(photos.map((p) => p.previewUrl).filter(Boolean));

  // The picked photos the builder doesn't show yet, asked of the phone in one call.
  const fresh = going.filter((p) => !shown.has(p.uri));
  const headers = fresh.length && inspect ? await inspect(fresh.map((p) => p.uri)).catch(() => null) : null;
  const headerOf = new Map((headers ?? []).map((h) => [h.uri, h]));
  // No answer (a build without the phone's half): taken as it was picked.
  const opens = (p: DraftPhoto) => headers === null || headerOf.get(p.uri)?.readable === true;
  const bytesOf = (p: DraftPhoto) => p.size || headerOf.get(p.uri)?.size || 0;
  const freshOpen = fresh.filter(opens);
  const pickedAgain = new Set(freshOpen.map((p) => `${p.name}|${bytesOf(p)}`));
  const keptAt = (p: UploadedPhoto) => addressOf?.(p.id) ?? '';

  // Still in the album: shown from a picked address, kept under a picked
  // address (missing on this phone), or picked again under another one.
  const stillPicked = (p: UploadedPhoto) => (!!p.previewUrl && picked.has(p.previewUrl))
    || picked.has(keptAt(p))
    || pickedAgain.has(`${p.name}|${p.size}`);
  const out = photos.filter((p) => !stillPicked(p));
  const back = photos.filter((p) => p.leftOut && stillPicked(p)).map((p) => p.id);
  const holds = pagesHoldPhotos(builder.albumPages, builder.coverFront);
  let removed = 0;
  let leftOut = 0;
  if (holds) {
    const ids = out.filter((p) => !p.leftOut).map((p) => p.id);
    if (ids.length) builder.leaveOutPhotos(ids);
    leftOut = ids.length;
  } else {
    for (const p of out) builder.removePhoto(p.id);
    removed = out.length;
  }
  if (back.length) builder.keepPhotos(back);

  const add = freshOpen.map((p) => toPickedPhoto(p, bytesOf(p), headerOf.get(p.uri)));
  const r = add.length ? builder.addPhotos(add) : { added: 0, skipped: 0, restored: 0 };
  // A missing photo still listed under its own (dead) address is the album's
  // missing photo, said on the Preview, not a newly picked one.
  const missingAt = new Set(photos.filter((p) => !p.previewUrl).map(keptAt).filter(Boolean));
  const unreadable = fresh.filter((p) => !opens(p) && !missingAt.has(p.uri)).length;
  const gone = new Set(out.map((p) => p.id));
  const backIds = new Set(back);
  const goingIn = photos.filter((p) => !gone.has(p.id) && (!p.leftOut || backIds.has(p.id))).length + r.added;
  return { added: r.added, restored: r.restored ?? 0, skipped: r.skipped ?? 0, unreadable, removed, leftOut, goingIn };
}

/** What the Photos step says when picked photos did not all go in ('' when they did). */
export function syncNote(r: Pick<PhotoSync, 'skipped' | 'unreadable'>): string {
  const parts: string[] = [];
  if (r.skipped > 0) {
    parts.push(r.skipped === 1
      ? '1 photo is already in your album (the same photo picked twice), so it goes in once.'
      : `${r.skipped} photos are already in your album (the same photo picked twice), so each goes in once.`);
  }
  if (r.unreadable > 0) {
    parts.push(r.unreadable === 1
      ? '1 photo could not be opened on this phone, so it is not in the album.'
      : `${r.unreadable} photos could not be opened on this phone, so they are not in the album.`);
  }
  return parts.join(' ');
}

/** The photos step's way on (wizard: hard gate at 40, never a dead button). */
export function photosShort(builder: Pick<BuilderActions, 'uploadedPhotos'>): number {
  return photosShortBy(photosGoingIn(builder.uploadedPhotos));
}

/* ── Cover ─────────────────────────────────────────────────────────────── */

/** CoverEditor: the album's photos for the cover, best ones first (Megy's
 *  photo check; without it, in album order), left-out ones not offered. */
export function coverPhotos(photos: readonly UploadedPhoto[]): UploadedPhoto[] {
  const live = photos.filter((p) => !p.leftOut);
  const median = medianSharpness(live);
  return [...live].sort((a, b) => photoQuality(b, median) - photoQuality(a, median));
}

/** The photo on the cover now (its id), if it is one of the album's. */
export function coverPhotoId(builder: Pick<BuilderActions, 'coverFront'>): string | null {
  const bg = builder.coverFront.background as { type?: string; photoId?: string } | undefined;
  return bg?.type === 'image' && bg.photoId ? bg.photoId : null;
}

/** The cover title (box 0 of the cover page): the album's name until the
 *  customer writes their own. */
export function coverTitle(builder: Pick<BuilderActions, 'coverFront'>): string {
  return builder.coverFront.textElements?.find((t) => t.boxIndex === 0)?.text ?? '';
}

/** A tap on one of the album's photos in the cover step. */
export function chooseCover(builder: Pick<BuilderActions, 'setCoverToPhoto'>, photoId: string): void {
  builder.setCoverToPhoto(photoId);
}

/** The cover title typed in the cover step (CoverEditor updateTitle: box 0
 *  of the cover page). Only while the cover scope is on: the cover screen
 *  holds it for as long as it is open, as the website's cover editor does
 *  (useCoverScope), since the builder reads the scope as of its last render. */
export function setCoverTitleText(builder: Pick<BuilderActions, 'editScope' | 'setBoxText'>, text: string): boolean {
  if (builder.editScope !== 'coverFront') return false;
  builder.setBoxText(0, { text });
  return true;
}

/* ── Make my album ─────────────────────────────────────────────────────── */

/** A real album exists: the website's albumIsBuilt (40+ pages with photos). */
export function albumMade(pages: BuilderActions['albumPages']): boolean {
  return albumIsBuilt(pages);
}

/** Where the cover step's filled button goes: the website's coverStepNext
 *  (an album already made goes back to its pages, never made again: that
 *  would wipe edits; short of 40 photos, to the photos; else it makes the
 *  album), from the photos going in. */
export function coverStepNext(made: boolean, photosIn: number): { label: string; go: 'pages' | 'photos' | 'make' } {
  return wizardCoverStepNext(made, photosIn);
}

/** The Photos step once the album is made (the website's upload step for a
 *  made album, wizard.ts, its words without the bold marks), and what the
 *  app adds: taking photos out or adding them does not change the pages by
 *  itself (they are left out, or wait, until the album is made again). */
export const MADE_ALBUM_PHOTOS_MESSAGE = 'Your album is made. Keep my pages to carry on with it, or make the album again to lay out every page from your photos from scratch.';
export const MADE_ALBUM_PHOTOS_NOTE = 'Photos you take out or add here change your pages only when you make the album again.';

/** What "Make the album again" replaces, asked first (the website's RemakeAlbumAsk). */
export function remakeQuestion(pages: BuilderActions['albumPages']): string {
  return remakeLosesMessage(placedMemories(pages));
}

/** The photos going into the album (left-out ones don't count). */
export function photosIn(builder: Pick<BuilderActions, 'uploadedPhotos'>): number {
  return photosGoingIn(builder.uploadedPhotos);
}

/** "Make my album": the builder lays out every page (generateAlbum). */
export async function makeAlbum(builder: Pick<BuilderActions, 'generateAlbum'>): Promise<boolean> {
  const r = await builder.generateAlbum();
  return r.made;
}

/* ── Where the album stands (to open it again at the same step) ────────── */

/** The step the customer last reached, kept with the album on the phone. */
export const APP_STEP_KEY = 'megy-2.0-album-step';
export type AlbumStep = 'name' | 'size' | 'photos' | 'cover';
const ROUTE: Record<AlbumStep | 'preview', string> = {
  name: '/album-name', size: '/album-size', photos: '/photos', cover: '/album-cover', preview: '/preview',
};

export function saveStep(store: KeyValueStore, step: AlbumStep): void {
  try { store.setItem(APP_STEP_KEY, step); } catch { /* full: the album still opens, at its name */ }
}

/** Where "Continue my album" goes: the preview once the album is made; the
 *  name until it is answered (it can't be skipped, as on the website); else
 *  the step last reached. */
export function resumeRoute(builder: Pick<BuilderActions, 'albumTitle' | 'albumPages'>, store: KeyValueStore): string {
  if (albumMade(builder.albumPages)) return ROUTE.preview;
  if (!stepOneReady(builder, occasionOf(store))) return ROUTE.name;
  let step: string | null = null;
  try { step = store.getItem(APP_STEP_KEY); } catch { step = null; }
  return step === 'photos' || step === 'cover' || step === 'size' ? ROUTE[step] : ROUTE.size;
}

/** What "Start a new album" does to the album in progress, the website's
 *  words (StartNewAlbumPrompt.tsx), for a phone: signed out it is DELETED
 *  (there is no account to keep it); signed in it stays in the account, but
 *  one with no photos yet isn't kept. */
export function startNewNote(signedIn: boolean, hasPhotos: boolean): string {
  if (!signedIn) return 'Starting a new one deletes this album from this phone. Sign in first to keep it.';
  return hasPhotos ? 'This one stays in My albums.' : "This one has no photos yet, so it won't be kept.";
}

/** There is an album in progress to continue. */
export function albumInProgress(builder: Pick<BuilderActions, 'albumTitle' | 'albumPages' | 'uploadedPhotos'>, draftPhotos: number): boolean {
  return albumMade(builder.albumPages) || builder.uploadedPhotos.length > 0 || draftPhotos > 0 || builder.albumTitle.trim() !== '';
}
