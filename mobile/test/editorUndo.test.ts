/* ══════════════════════════════════════════════════════════════════════════
   EDITING A MADE ALBUM IN THE APP: THE TAP, THE SELECTION, UNDO (2.0, Phase 4).

   On the real shared builder (the website's useBuilderState) on the app's
   platform, with an album made through the app's own steps (albumFlow), the
   editor's own pieces do what a customer's taps do:
     • a tap at the middle of each photo, on every page, picks that photo;
     • the selection is kept in the builder (selectedElementId,
       selectedSlotIndex, selectedPhotoId), tagged with its page, and read
       back against the page as it is now;
     • a part's "Remove photo" (through the registry) takes the photo out
       with the builder's clearSlot; Undo puts it back, on the page it was
       taken from, even after the page was turned; Redo takes it out again; a
       new change ends the Redo; the history is the website's 20 steps;
     • "Make my album" is a step in that history: the editor's Undo stops at
       the album it was opened on (undoBar.ts), so a tap can't un-make it,
       and that start holds over a trip to the Preview and back;
     • the cover is not in the history (the website's Snapshot has no
       coverFront): a cover photo adds no step, and an Undo after a cover
       colour changes neither the cover nor a page (the website's empty step);
     • with the cover step's scope left on, a page edit would land on the
       cover: the screen's guard (editThePages) puts it back on the pages.
   The registry holds only this file's own "Remove photo" here (the part
   folders are taken out), so what the parts add never changes these tests.
   ══════════════════════════════════════════════════════════════════════════ */
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { AppPlatform } from '../src/builder/appPlatform';
import { hitTest } from '../src/editor/hitTest';
import { editThePages } from '../src/editor/scope';
import { coverChanged, lastEditorVisit, MOST_STEPS, nothingChanged, rememberVisit, startOnOpen, undoShown } from '../src/editor/undoBar';
import { addPickedPhotos } from '../src/editor/photos/intake';
import { addPhotos as addToDraft, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';
import type { PhotoHeader } from '../src/builder/appPhotos';
import type { AlbumPage } from '@web/pages/builder/types';
import { isolateRegistry, registerEditorPart, selectedActionsFor } from '../src/editor/registry';
import '../src/editor/parts';
import { act, builder, centre, ctxOn, fills, firstPhoto, madeAlbum, settle, tapOn, useEditorBench } from './editorHarness';

useEditorBench();

let restore: (() => void) | null = null;
beforeEach(() => {
  restore = isolateRegistry();
  registerEditorPart({
    id: 'test-remove',
    selectedActions: [{ id: 'remove', label: 'Remove photo', kinds: ['photo'], onPress: (t, ctx) => ctx.builder.clearSlot(t.index) }],
  });
});
afterEach(() => { restore?.(); restore = null; });

/** The selected photo's "Remove photo" (a part's button, through the registry). */
async function removeSelected(platform: AppPlatform) {
  const ctx = ctxOn(platform);
  expect(ctx.selected?.kind).toBe('photo');
  const remove = selectedActionsFor(ctx.selected!, ctx).find((a) => a.label === 'Remove photo')!;
  expect(remove).toBeDefined();
  await act(async () => { remove.onPress(ctx.selected!, ctx); });
}

const sc = SCENARIOS[0]; // 40 photos, 8x8

describe('tapping the pages of a made album', () => {
  it('the middle of every photo on every page picks that photo, and the selection is the builder\'s, tagged with its page', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    let photos = 0;
    for (let i = 0; i < builder().albumPages.length; i++) {
      await act(async () => { builder().goToPage(i); });
      const ctx = ctxOn(platform);
      for (const t of ctx.targets.filter((x) => x.kind === 'photo')) {
        const p = centre(t);
        const hit = hitTest(ctx.targets, p.x, p.y);
        expect(hit?.key).toBe(t.key);
        expect(hit?.photoIndex).toBe(builder().albumPages[i].slotFills?.[t.index]);
        photos++;
      }
    }
    expect(photos).toBe(sc.photos.length); // every photo in the album

    await act(async () => { builder().goToPage(2); });
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    expect(builder().selectedElementId).toBe(`2|${t.key}`);
    expect(builder().selectedSlotIndex).toBe(t.index);
    expect(builder().selectedPhotoId).toBe(builder().uploadedPhotos[t.photoIndex!].id);
    expect(ctxOn(platform).selected?.key).toBe(t.key);
    // Another page: nothing selected there; back: still selected.
    await act(async () => { builder().goToPage(3); });
    expect(ctxOn(platform).selected).toBeNull();
    await act(async () => { builder().goToPage(2); });
    expect(ctxOn(platform).selected?.key).toBe(t.key);
    // A tap on the page itself (nothing there) is "select nothing".
    await act(async () => { ctxOn(platform).select(null); });
    expect(builder().selectedElementId).toBeNull();
    expect(builder().selectedSlotIndex).toBeNull();
  });
});

describe('undo and redo: the website\'s history, through the editor', () => {
  it('"Make my album" is a step in the website\'s history, but the editor\'s Undo stops at the album it opened on', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    // The website saves a step when the album is made (generateAlbum).
    expect(builder().canUndo).toBe(true);
    const start = startOnOpen(builder().albumPages, null); // what the editor holds when it opens
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false); // no Undo yet
    await act(async () => { builder().goToPage(3); });
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(true);
    await act(async () => { builder().undo(); });
    // Back to the very pages the editor opened on: Undo goes; one more would un-make the album.
    expect(builder().albumPages).toBe(start);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false);
    expect(builder().canUndo).toBe(true);
    expect(builder().canRedo).toBe(true);
    await act(async () => { builder().redo(); });
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(true);
  });

  it('to the Preview and back: Undo still walks back over what was done, and still stops where the editor started', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    rememberVisit(null);
    // First visit: open, take a photo out on page 3, leave for the Preview.
    let start = startOnOpen(builder().albumPages, lastEditorVisit());
    const opened = builder().albumPages;
    expect(start).toBe(opened);
    await act(async () => { builder().goToPage(3); });
    const before = fills(builder(), 3);
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    rememberVisit({ start, leftOn: builder().albumPages });

    // Back again, nothing changed in between: the same start, so Undo shows.
    start = startOnOpen(builder().albumPages, lastEditorVisit());
    expect(start).toBe(opened);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(true);
    await act(async () => { builder().undo(); });
    expect(fills(builder(), 3)).toEqual(before);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false);
    expect(builder().canUndo).toBe(true); // "Make my album" is still under it

    // Pages changed while the editor was away (here: a Redo; on a phone, another
    // album opened or the album made again): it starts afresh there.
    rememberVisit({ start, leftOn: builder().albumPages });
    await act(async () => { builder().redo(); });
    start = startOnOpen(builder().albumPages, lastEditorVisit());
    expect(start).toBe(builder().albumPages);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false);
    rememberVisit(null);
  });

  it('Remove photo, turn the page, Undo: the photo is back on its own page; Redo takes it out again; a new change ends the Redo', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    await act(async () => { builder().goToPage(4); });
    const before = fills(builder(), 4);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    await removeSelected(platform);
    expect(fills(builder(), 4)[t.index]).toBeNull();
    expect(builder().canUndo).toBe(true);
    expect(builder().canRedo).toBe(false);
    // The frame stays selected, empty now (its key is the frame's).
    expect(ctxOn(platform).selected?.kind).toBe('emptySlot');

    await act(async () => { builder().goToPage(12); });
    await act(async () => { builder().undo(); });
    expect(builder().currentPageIndex).toBe(4); // Undo opens the page the change was made on
    expect(fills(builder(), 4)).toEqual(before);
    expect(ctxOn(platform).selected?.kind).toBe('photo');
    expect(builder().canRedo).toBe(true);

    await act(async () => { builder().redo(); });
    expect(fills(builder(), 4)[t.index]).toBeNull();
    expect(builder().canRedo).toBe(false);

    await act(async () => { builder().undo(); });
    expect(fills(builder(), 4)).toEqual(before);
    expect(builder().canRedo).toBe(true);
    // A new change: Redo is gone (the website's pushSnapshot clears it).
    await act(async () => { builder().goToPage(6); });
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    expect(builder().canRedo).toBe(false);
    expect(builder().canUndo).toBe(true);
  });

  it('keeps the website\'s 20 steps: 21 photos taken out, 20 come back', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    const start = builder().albumPages.map((_p, i) => fills(builder(), i));
    let removed = 0;
    for (let i = 0; i < builder().albumPages.length && removed < 21; i++) {
      await act(async () => { builder().goToPage(i); });
      const t = ctxOn(platform).targets.find((x) => x.kind === 'photo');
      if (!t) continue;
      await tapOn(platform, t);
      await removeSelected(platform);
      removed++;
    }
    expect(removed).toBe(21);
    let undone = 0;
    // (The 21 steps pushed "Make my album" and the first removal out of the 20.)
    while (builder().canUndo) { await act(async () => { builder().undo(); }); undone++; }
    expect(undone).toBe(20);
    const now = builder().albumPages.map((_p, i) => fills(builder(), i));
    const changed = now.map((f, i) => (JSON.stringify(f) === JSON.stringify(start[i]) ? null : i)).filter((i) => i != null);
    expect(changed).toHaveLength(1); // the first removal is older than the history
    expect(builder().albumPages.length).toBe(start.length); // and the album is still made
  });

  it('the cover is not in the history: a cover photo adds no step; an Undo after a cover colour changes neither the cover nor a page', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    await act(async () => { builder().goToPage(2); });
    const before = fills(builder(), 2);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    await removeSelected(platform);
    const afterRemove = JSON.stringify(builder().albumPages);

    // A cover photo (the cover step's tap): no step. (A step would end the Redo.)
    await act(async () => { builder().undo(); });
    expect(builder().canRedo).toBe(true);
    const coverPhoto = (builder().coverFront.background as { photoId?: string }).photoId;
    const other = builder().uploadedPhotos.find((p) => p.id !== coverPhoto)!;
    await act(async () => { builder().setCoverToPhoto(other.id); });
    expect((builder().coverFront.background as { photoId?: string }).photoId).toBe(other.id);
    expect(builder().canRedo).toBe(true);
    await act(async () => { builder().redo(); });
    expect(JSON.stringify(builder().albumPages)).toBe(afterRemove);

    // A cover colour under the cover scope (the cover editor): the website
    // saves a step of the PAGES (no change on them), so that Undo changes
    // nothing a customer sees, and the cover keeps its colour; the next Undo
    // is the page's.
    await act(async () => { builder().setEditScope('coverFront'); });
    await act(async () => { builder().setPageColor('#1F75FE'); });
    await act(async () => { builder().setEditScope('interior'); });
    const coverAfter = JSON.stringify(builder().coverFront);
    expect(builder().coverFront.background?.type).toBe('solid');
    await act(async () => { builder().undo(); });
    expect(JSON.stringify(builder().coverFront)).toBe(coverAfter);
    expect(JSON.stringify(builder().albumPages)).toBe(afterRemove);
    await act(async () => { builder().undo(); });
    expect(fills(builder(), 2)).toEqual(before);
    expect(JSON.stringify(builder().coverFront)).toBe(coverAfter);
  });

  it('with the cover step\'s scope still on, a page edit would land on the cover: the screen\'s guard puts it on the page', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { builder().goToPage(1); });
    const before = fills(builder(), 1);
    // The cover step left its scope on (it sits under the Preview in the stack).
    await act(async () => { builder().setEditScope('coverFront'); });
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    await removeSelected(platform);
    expect(fills(builder(), 1)).toEqual(before); // went to the cover, not the page
    // What the Edit pages screen does whenever it is on top:
    await act(async () => { editThePages(builder()); });
    expect(builder().editScope).toBe('interior');
    await tapOn(platform, t);
    await removeSelected(platform);
    expect(fills(builder(), 1)[t.index]).toBeNull();
  });
});

describe('undo after the review: photos that came in, cover changes, steps that change nothing', () => {
  const header = (uri: string, i: number): PhotoHeader => ({ uri, readable: true, size: 3_000_000 + i, width: 4000, height: 3000, colorSpace: null, needsSrgb: false });
  const inspect = async (uris: string[]) => uris.map((u, i) => header(u, i));
  const newPhotos = (names: string[]): DraftPhoto[] => addToDraft(emptyDraft(), names.map((name, i) => ({
    key: `k:undo-${name}`, source: 'gallery' as const, uri: `content://media/external/images/media/${9700 + i}`, name, width: 4000, height: 3000,
    capturedAt: Date.UTC(2026, 9, 21, 9, i), modifiedAt: null, addedAt: i,
  })), 1).draft.photos;

  /** What the screen's Undo or Redo button does (EditPagesScreen step): one
   *  step, and more while a step changed nothing on the pages, never past the start. */
  async function press(dir: 'undo' | 'redo', start: readonly AlbumPage[]) {
    const b0 = builder();
    const before = { pages: b0.albumPages, pagesJson: JSON.stringify(b0.albumPages), photos: b0.uploadedPhotos };
    await act(async () => { if (dir === 'undo') builder().undo(); else builder().redo(); });
    for (let left = MOST_STEPS - 1; left > 0; left--) {
      const b = builder();
      const more = dir === 'undo' ? b.canUndo && b.albumPages !== start : b.canRedo;
      if (!more || !nothingChanged(before, { pages: b.albumPages, photos: b.uploadedPhotos })) break;
      await act(async () => { if (dir === 'undo') builder().undo(); else builder().redo(); });
    }
  }

  it('photos added from the phone mid-edit: Undo never takes them out (the start moves to where they came in)', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    let start = startOnOpen(builder().albumPages, null);
    await act(async () => { builder().goToPage(3); });
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform); // a page edit before the photos come in
    const count = builder().uploadedPhotos.length;
    let r = { line: null as string | null, cameIn: false };
    await act(async () => { r = await addPickedPhotos(builder(), newPhotos(['A.jpg', 'B.jpg', 'C.jpg']), new Set(), inspect); });
    await settle();
    expect(r).toEqual({ line: '3 photos added.', cameIn: true });
    expect(builder().uploadedPhotos.length).toBe(count + 3);
    // What the screen does then (ctx.restartUndo): Undo starts here.
    start = builder().albumPages;
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false);
    // Before the fix: one Undo here took the 3 photos out again.
    await act(async () => { builder().goToPage(5); });
    const before5 = fills(builder(), 5);
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(true);
    await press('undo', start);
    expect(fills(builder(), 5)).toEqual(before5);
    expect(builder().uploadedPhotos.length).toBe(count + 3); // still in the album
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false); // can't go past them
  });

  it('a cover change: the editor\'s Undo starts afresh, so no press lands on the cover\'s empty steps', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    rememberVisit(null);
    const start = startOnOpen(builder().albumPages, lastEditorVisit());
    await act(async () => { builder().goToPage(2); });
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    rememberVisit({ start, leftOn: builder().albumPages }); // off to the cover screen
    // Nothing changed on the cover: the same start when the editor is back.
    expect(startOnOpen(builder().albumPages, lastEditorVisit())).toBe(start);
    await act(async () => { builder().setEditScope('coverFront'); });
    await act(async () => { builder().setPageColor('#1F75FE'); });
    await act(async () => { builder().setEditScope('interior'); });
    coverChanged(); // what the cover screen says on a change
    const again = startOnOpen(builder().albumPages, lastEditorVisit());
    expect(again).toBe(builder().albumPages);
    expect(undoShown(builder().canUndo, builder().albumPages, again)).toBe(false);
    rememberVisit(null);
  });

  it('a step that changes nothing on the pages is stepped over: one press, one change', async () => {
    const platform = await madeAlbum(sc);
    await act(async () => { editThePages(builder()); });
    const start = startOnOpen(builder().albumPages, null);
    await act(async () => { builder().goToPage(3); });
    const before = fills(builder(), 3);
    await tapOn(platform, firstPhoto(platform));
    await removeSelected(platform);
    const removed = fills(builder(), 3);
    // Three empty steps (cover changes under the cover scope, the website's way).
    await act(async () => { builder().setEditScope('coverFront'); });
    for (const hex of ['#1F75FE', '#EE204D', '#1CAC78']) await act(async () => { builder().setPageColor(hex); });
    await act(async () => { builder().setEditScope('interior'); });
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(true);
    await press('undo', start); // one press: the photo is back
    expect(fills(builder(), 3)).toEqual(before);
    expect(builder().albumPages).toBe(start);
    expect(undoShown(builder().canUndo, builder().albumPages, start)).toBe(false);
    await press('redo', start); // one press: out again
    expect(fills(builder(), 3)).toEqual(removed);
    expect(nothingChanged({ pages: start, pagesJson: JSON.stringify(start), photos: builder().uploadedPhotos }, { pages: [...start], photos: builder().uploadedPhotos })).toBe(true);
  });
});
