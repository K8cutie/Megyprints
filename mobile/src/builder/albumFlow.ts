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
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import type { AlbumSizeConfig, AlbumSizePreset, UploadedPhoto } from '@web/pages/builder/types';
import { ALBUM_SIZES } from '@web/pages/builder/types';
import { getTemplatesForAlbum } from '@web/pages/builder/pageTemplates';
import { densityRangeLabel } from '@web/pages/builder/densities';
import { photosGoingIn, photosShortBy } from '@web/pages/builder/albumMinimum';
import { isAlbumNameReady } from '@web/lib/albumName';
import { isAlbumThemeReady, readAlbumThemeFrom, writeAlbumThemeTo } from '@web/lib/albumThemeRules';
import { medianSharpness, photoQuality } from '@web/lib/photoCheck';
import type { KeyValueStore } from '@web/shared/platform';
import type { DraftPhoto } from '../lib/photoDraft';
import { toPickedPhoto, type InspectPhotos } from './appPhotos';

/* ── Words (the website's own; see test/albumWords.test.ts) ───────────── */

/** wizard.ts MAKE_ALBUM: the cover step's way on. */
export const MAKE_ALBUM = 'Make my album →';
/** wizard.ts TO_COVER: the photos step's way on once 40 are in. */
export const TO_COVER = 'Next: pick your cover →';
/** wizard.ts COVER_TO_PAGES / COVER_TO_PHOTOS: the cover step's other ways on. */
export const COVER_TO_PAGES = 'Continue to my pages →';
export const COVER_TO_PHOTOS = 'Next: add your photos →';
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

/** The sizes a customer may pick: the website's list (types.ts ALBUM_SIZES),
 *  the ones with page layouts (albumSizeOptions sizeHasLayouts) and not
 *  switched off by the owner (store settings' disabled_sizes, read with the
 *  app's own client; none known = every size, as the website fails open). */
export function offerableSizes(disabled: readonly string[] = []): AlbumSizeConfig[] {
  return ALBUM_SIZES.filter((s) => getTemplatesForAlbum(s.preset).length > 0 && !disabled.includes(s.preset));
}

/** The wizard's size choice line: '8×8" Square: 1-4 photos per page'. */
export function sizePhotosPerPage(preset: AlbumSizePreset): string {
  return `${densityRangeLabel(preset)} photos per page`;
}

/* ── Photos: the Phase 2 photos go into the builder ────────────────────── */

export interface PhotoSync {
  added: number;
  removed: number;
}

/** Puts the photos picked on the Photos step into the builder, and takes out
 *  the ones taken out there. A photo is known by its address on the phone
 *  (the builder shows it from there: previewUrl). The builder itself skips a
 *  photo it has (same name and size) and puts a missing one back in its
 *  place (photoRelink). A photo whose file size the phone's index didn't say
 *  gets it from the phone first (`inspect`, one call for all of them), so two
 *  different photos with one name are never taken for one. */
export async function syncPhotos(
  builder: Pick<BuilderActions, 'uploadedPhotos' | 'addPhotos' | 'removePhoto'>,
  draft: readonly DraftPhoto[],
  inspect?: InspectPhotos,
): Promise<PhotoSync> {
  const going = draft.filter((p) => !p.leftOut);
  const want = new Set(going.map((p) => p.uri));
  const have = new Set(builder.uploadedPhotos.map((p) => p.previewUrl));
  const names = new Set(going.map((p) => `${p.name}|${p.size ?? 0}`));
  let removed = 0;
  for (const p of builder.uploadedPhotos) {
    // Missing on this phone ('' address) but picked again: addPhotos puts it back.
    if (want.has(p.previewUrl) || (!p.previewUrl && names.has(`${p.name}|${p.size}`))) continue;
    builder.removePhoto(p.id);
    removed++;
  }
  const freshDraft = going.filter((p) => !have.has(p.uri));
  const unsized = freshDraft.filter((p) => !p.size).map((p) => p.uri);
  const headers = unsized.length && inspect ? await inspect(unsized).catch(() => null) : null;
  const bytes = new Map((headers ?? []).map((h) => [h.uri, h.size]));
  const fresh = freshDraft.map((p) => toPickedPhoto(p, bytes.get(p.uri)));
  const added = fresh.length ? builder.addPhotos(fresh).added : 0;
  return { added, removed };
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

/** A real album exists (wizard albumIsBuilt): 40+ pages with photos. */
export function albumMade(pages: BuilderActions['albumPages']): boolean {
  return pages.length >= 40 && pages.some((p) => (p.slotFills?.some((f) => f != null) ?? false) || p.photos.length > 0);
}

/** Where the cover step's filled button goes (wizard.ts coverStepNext): an
 *  album already made goes back to its pages, never made again (that would
 *  wipe edits); short of 40 photos, to the photos; else it makes the album. */
export function coverStepNext(made: boolean, short: number): { label: string; go: 'pages' | 'photos' | 'make' } {
  if (made) return { label: COVER_TO_PAGES, go: 'pages' };
  if (short > 0) return { label: COVER_TO_PHOTOS, go: 'photos' };
  return { label: MAKE_ALBUM, go: 'make' };
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

/** There is an album in progress to continue. */
export function albumInProgress(builder: Pick<BuilderActions, 'albumTitle' | 'albumPages' | 'uploadedPhotos'>, draftPhotos: number): boolean {
  return albumMade(builder.albumPages) || builder.uploadedPhotos.length > 0 || draftPhotos > 0 || builder.albumTitle.trim() !== '';
}
