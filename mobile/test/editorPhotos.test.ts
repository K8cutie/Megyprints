/* ══════════════════════════════════════════════════════════════════════════
   PART 1 (PHOTOS, LAYOUTS, PAGES) IN THE "EDIT PAGES" SCREEN, on the real
   shared builder (the website's useBuilderState) with an album made through
   the app's steps (editorHarness). Every change is checked two ways: the
   builder is called with the arguments the website's editor calls it with
   (a recording builder), and the album comes out as the website's own rules
   make it (slotSwap placePhoto, layoutChoicesForPage, blankPagePlan, the
   page renderer's planPage), with Undo taking it back.
     • a selected photo: moved and zoomed (setSlotOffset / setSlotScale, one
       undo step each, never a step that changes nothing), Swap photo (then a
       tap on the other one, this page or another: fillSlot), Replace photo
       and "Add a photo" (fillSlot with swapNotice; setTextSlotPhoto for a
       caption box), Mask and Filter, Remove photo (and the empty frame's
       "Add to this box" → "Add Photo");
     • "Megy, fix this page"; "Change layout" (✓ Current first, the 16% rule,
       asking about leftovers); adding and deleting pages (the 40-page
       floor); the blank pages reminder;
     • photos added from the phone go in, and nothing the album has goes out;
     • what the part adds to the screen, in the website's order.
   ══════════════════════════════════════════════════════════════════════════ */
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { layoutChoicesForPage } from '@web/pages/builder/useBuilderState';
import { getTemplateById, getTemplatesForAlbum } from '@web/pages/builder/pageTemplates';
import { placePhoto, placedPhotoPages, swapNotice } from '@web/pages/builder/slotSwap';
import { blankPagePlan, deletedBlankNote, isBlankPage } from '@web/pages/builder/blankPages';
import { edgeGuardMessage } from '@web/pages/builder/maskShapes';
import { SOFT_MESSAGE } from '@web/pages/builder/slotGeometry';
import { planPage, type PhotoItem } from '../src/render/pagePlan';
import { ADD_TO_BOX_SHEET, addChoicesFor, bannersFor, isolateRegistry, overlayComponents, runTap, selectedActionsFor, sheetById, toolsFor, type EditorContext } from '../src/editor/registry';
import { editThePages } from '../src/editor/scope';
import {
  addPageAfter, applyLayout, blankPlan, canDeletePage, cancelSwap, chooseLayout, deleteBlankPages, deleteThisPage, fixStudioPage,
  layoutChoices, nextBlankPage, pendingSwap, photosHeld, photoTags, pickLook, pickMask, placePicked, storeFraming, swapOnTap,
} from '../src/editor/photos/actions';
import { FramingGesture, frameCell, softAt, storedFraming } from '../src/editor/photos/framing';
import { addPickedPhotos, beginIntake, intakeLeaving, resetIntake, takeIntake } from '../src/editor/photos/intake';
import { FramingOverlay } from '../src/editor/photos/FramingOverlay';
import * as words from '../src/editor/photos/words';
import { addPhotos as addToDraft, emptyDraft, type DraftPhoto } from '../src/lib/photoDraft';
import type { PhotoHeader } from '../src/builder/appPhotos';
import type { AppPlatform } from '../src/builder/appPlatform';
import '../src/editor/parts';
import { act, builder, ctxOn, fills, firstPhoto, madeAlbum, settle, tapOn, useEditorBench } from './editorHarness';

useEditorBench();
afterEach(() => { cancelSwap(); resetIntake(); });

type Call = [string, ...unknown[]];
/** The builder, with every call to it written down (the arguments the part used). */
function recording(b: BuilderActions, calls: Call[]): BuilderActions {
  return new Proxy(b, {
    get(o, k) {
      const v = (o as unknown as Record<string | symbol, unknown>)[k];
      return typeof v === 'function' ? (...a: unknown[]) => { calls.push([String(k), ...a]); return (v as (...x: unknown[]) => unknown)(...a); } : v;
    },
  });
}
/** The editor's context now, recording builder calls, sheets opened and lines said. */
function ctxNow(platform: AppPlatform, out: { calls?: Call[]; sheets?: { id: string; params: unknown }[]; said?: string[] } = {}): EditorContext {
  const ctx = ctxOn(platform, out.sheets ?? [], out.said ?? []);
  return out.calls ? { ...ctx, builder: recording(ctx.builder, out.calls) } : ctx;
}
const editCalls = (calls: Call[]) => calls.filter(([k]) => !k.startsWith('setSelected'));
const photosOn = (ctx: EditorContext) => ctx.targets.filter((t) => t.kind === 'photo');
/** The first page (from `from`) with at least `n` photos. */
const pageWith = (n: number, from = 0) => builder().albumPages.findIndex((p, i) => i >= from && (p.slotFills ?? []).filter((f) => f != null).length >= n);
async function openOn(platform: AppPlatform, pageIndex: number) {
  await act(async () => { editThePages(builder()); builder().goToPage(pageIndex); });
  return ctxNow(platform);
}
/** Screen px per page px: an 8x8 page (2400 print px) shown 360 px wide. */
const K = 0.15;

describe('a selected photo moves and zooms in its frame', () => {
  it('a move: one setSlotOffset in the website\'s design px, drawn by the renderer where the finger left it; Undo takes it back', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    let ctx = await openOn(platform, 3);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    // Zoomed in first, so there is room to move both ways.
    await act(async () => { builder().setSlotScale(t.index, 2); });
    ctx = ctxNow(platform);
    const before = { x: [...(ctx.page.slotOffsetsX ?? [])], y: [...(ctx.page.slotOffsetsY ?? [])] };
    const photo = builder().uploadedPhotos[t.photoIndex!];
    const cell = frameCell(ctx.page, t.index, builder().albumSize, 3)!;
    const g = new FramingGesture({ w: photo.width, h: photo.height }, cell, storedFraming(ctx.page, t.index, cell), K);
    g.touches([{ x: 100, y: 100 }]);
    g.touches([{ x: 112, y: 104 }]);
    g.touches([{ x: 115, y: 106 }]);
    const changes = g.end();
    const calls: Call[] = [];
    await act(async () => { storeFraming(ctxNow(platform, { calls }), t.index, changes); });
    expect(editCalls(calls)).toHaveLength(1);
    const [name, slot, dx, dy] = editCalls(calls)[0] as [string, number, number, number];
    expect([name, slot]).toEqual(['setSlotOffset', t.index]);
    expect(dx).toBeCloseTo(15 / K / cell.k.x, 6);
    expect(dy).toBeCloseTo(6 / K / cell.k.y, 6);
    const page = builder().albumPages[3];
    const item = planPage({ page, albumSize: builder().albumSize, pageIndex: 3, photoCount: builder().uploadedPhotos.length }).items
      .find((i): i is PhotoItem => i.kind === 'photo' && i.slotIndex === t.index)!;
    expect(item.pan.x).toBeCloseTo(g.live.pan.x, 6);
    expect(item.pan.y).toBeCloseTo(g.live.pan.y, 6);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[3].slotOffsetsX ?? []).toEqual(before.x);
    expect(builder().albumPages[3].slotOffsetsY ?? []).toEqual(before.y);
  });

  it('a pinch: one setSlotScale; a move and a pinch in one gesture are two undo steps, each changing something', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await openOn(platform, 5);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    const start = builder().albumPages[5];
    const photo = builder().uploadedPhotos[t.photoIndex!];
    const cellNow = () => frameCell(builder().albumPages[5], t.index, builder().albumSize, 5)!;
    const g = new FramingGesture({ w: photo.width, h: photo.height }, cellNow(), storedFraming(start, t.index, cellNow()), K);
    const calls: Call[] = [];
    const step = async (touches: { x: number; y: number }[]) => {
      const changes = g.touches(touches);
      if (changes.length) await act(async () => { storeFraming(ctxNow(platform, { calls }), t.index, changes); });
    };
    // Two fingers first (a pinch to 2×), one lifted (the zoom is stored), then a move.
    await step([{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    await step([{ x: 50, y: 100 }, { x: 250, y: 100 }]);
    await step([{ x: 50, y: 100 }]);
    expect(editCalls(calls)).toEqual([['setSlotScale', t.index, 2]]);
    await step([{ x: 50, y: 130 }]);
    await act(async () => { storeFraming(ctxNow(platform, { calls }), t.index, g.end()); });
    expect(editCalls(calls).map(([k]) => k)).toEqual(['setSlotScale', 'setSlotOffset']);
    const moved = builder().albumPages[5];
    expect(moved.slotScales?.[t.index]).toBe(2);
    // Undo once: the move goes, the zoom stays. Undo again: the zoom goes.
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[5].slotScales?.[t.index]).toBe(2);
    expect(builder().albumPages[5].slotOffsetsY?.[t.index] ?? 0).toBe(start.slotOffsetsY?.[t.index] ?? 0);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[5].slotScales?.[t.index] ?? 1).toBe(start.slotScales?.[t.index] ?? 1);
  });

  it('a second tap on the selected photo puts it down (a full-page photo has no page around it to tap)', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await openOn(platform, 3);
    const t = firstPhoto(platform);
    expect(await tapOn(platform, t)).toBe('select');
    expect(ctxNow(platform).selected?.key).toBe(t.key);
    expect(await tapOn(platform, t)).toBe('rule');
    expect(ctxNow(platform).selected).toBeNull();
  });

  it('a zoom that makes the photo print soft says so (slotGeometry\'s line), once', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    let ctx = await openOn(platform, 2);
    const t = firstPhoto(platform);
    const photo = builder().uploadedPhotos[t.photoIndex!];
    const cell = frameCell(ctx.page, t.index, builder().albumSize, 2)!;
    expect(softAt(photo, cell, 1)).toBe(false);
    expect(softAt(photo, cell, 10)).toBe(true);
    const said: string[] = [];
    await act(async () => { storeFraming(ctxNow(platform, { said }), t.index, [{ kind: 'scale', zoom: 10 }]); });
    expect(said).toEqual([SOFT_MESSAGE]);
    ctx = ctxNow(platform, { said });
    await act(async () => { storeFraming(ctx, t.index, [{ kind: 'scale', zoom: 9 }]); });
    expect(said).toEqual([SOFT_MESSAGE]); // already soft: not said again
  });
});

describe('Swap photo, then a tap on the other one', () => {
  it('on the same page: the two frames swap (fillSlot → placePhoto, framing travels with each photo), in one undo step', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    const p = pageWith(2);
    let ctx = await openOn(platform, p);
    await act(async () => { builder().setSlotScale(photosOn(ctx)[0].index, 1.7); });
    ctx = ctxNow(platform);
    const [a, b] = photosOn(ctx);
    await tapOn(platform, a);
    ctx = ctxNow(platform);
    const swap = selectedActionsFor(ctx.selected!, ctx).find((x) => x.id === 'swap')!;
    expect(swap.label).toBe(words.SWAP_PHOTO);
    swap.onPress(ctx.selected!, ctx);
    expect(pendingSwap()).toEqual({ photoIndex: a.photoIndex, pageIndex: p, slotIndex: a.index });
    const before = builder().albumPages;
    const expected = placePhoto(before, p, b.index, a.photoIndex!).pages[p];
    const by = await tapOn(platform, b);
    expect(by).toBe('rule');
    expect(pendingSwap()).toBeNull();
    const after = builder().albumPages[p];
    expect(after.slotFills).toEqual(expected.slotFills);
    expect(after.slotScales).toEqual(expected.slotScales);
    expect(after.slotOffsetsX).toEqual(expected.slotOffsetsX);
    expect(after.slotFills?.[b.index]).toBe(a.photoIndex);
    expect(after.slotFills?.[a.index]).toBe(b.photoIndex);
    expect(after.slotScales?.[b.index]).toBe(1.7); // the zoom went with its photo
    // The frame tapped is selected, showing the photo that came.
    expect(ctxNow(platform).selected?.key).toBe(b.key);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[p].slotFills).toEqual(before[p].slotFills);
  });

  it('across pages: turn the page and tap; the album is placePhoto\'s, and the customer is told (swapNotice)', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    const p = pageWith(1, 2), q = pageWith(1, p + 3);
    let ctx = await openOn(platform, p);
    const a = photosOn(ctx)[0];
    await tapOn(platform, a);
    ctx = ctxNow(platform);
    selectedActionsFor(ctx.selected!, ctx).find((x) => x.id === 'swap')!.onPress(ctx.selected!, ctx);
    ctx = await openOn(platform, q);
    expect(pendingSwap()?.pageIndex).toBe(p); // kept while the page turned
    const c = photosOn(ctx)[0];
    const before = builder().albumPages;
    const expected = placePhoto(before, q, c.index, a.photoIndex!).pages;
    const said: string[] = [];
    let took = false;
    await act(async () => { took = swapOnTap(c, ctxNow(platform, { said })); });
    expect(took).toBe(true);
    expect(builder().albumPages[p].slotFills).toEqual(expected[p].slotFills);
    expect(builder().albumPages[q].slotFills).toEqual(expected[q].slotFills);
    expect(said).toEqual([`Swapped with the photo on page ${p + 1}`]);
    expect(said[0]).toBe(swapNotice({ pageIndex: p, slotIndex: a.index }, q, false));
  });

  it('into an empty frame on another page it moves there (that frame empties), and a tap on the photo itself calls it off', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    const p = pageWith(1, 1), q = pageWith(2, p + 2);
    let ctx = await openOn(platform, q);
    const emptied = photosOn(ctx)[1];
    await act(async () => { builder().clearSlot(emptied.index); });
    ctx = await openOn(platform, p);
    const a = photosOn(ctx)[0];
    await tapOn(platform, a);
    ctx = ctxNow(platform);
    selectedActionsFor(ctx.selected!, ctx).find((x) => x.id === 'swap')!.onPress(ctx.selected!, ctx);
    // A tap on the waiting photo itself: called off, nothing changes.
    const pagesBefore = builder().albumPages;
    await tapOn(platform, a);
    expect(pendingSwap()).toBeNull();
    expect(builder().albumPages).toBe(pagesBefore);
    selectedActionsFor(ctx.selected!, ctx).find((x) => x.id === 'swap')!.onPress(ctx.selected!, ctx);
    ctx = await openOn(platform, q);
    const empty = ctx.targets.find((t) => t.kind === 'emptySlot' && t.index === emptied.index)!;
    expect(empty).toBeDefined();
    const said: string[] = [];
    await act(async () => { swapOnTap(empty, ctxNow(platform, { said })); });
    expect(builder().albumPages[q].slotFills?.[empty.index]).toBe(a.photoIndex);
    expect(builder().albumPages[p].slotFills?.[a.index]).toBeNull();
    expect(said).toEqual([`Moved here from page ${p + 1} — that page has an empty frame now`]);
  });
});

describe('Replace photo, Remove photo and "Add a photo"', () => {
  it('Replace photo opens "Add a photo" for the frame; photos are tagged with their page; a photo from another page swaps in, said', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    let ctx = await openOn(platform, 4);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    const sheets: { id: string; params: unknown }[] = [];
    ctx = ctxNow(platform, { sheets });
    const replace = selectedActionsFor(ctx.selected!, ctx).find((a) => a.id === 'replace')!;
    expect(replace.label).toBe(words.REPLACE_PHOTO);
    replace.onPress(ctx.selected!, ctx);
    expect(sheets).toEqual([{ id: 'photos:pick', params: { kind: 'slot', index: t.index } }]);
    expect(sheetById('photos:pick')).not.toBeNull();
    // The tags: this page, another page's number, none for a photo not placed.
    const placed = placedPhotoPages(builder().albumPages);
    const tags = photoTags(ctx);
    builder().uploadedPhotos.forEach((_p, i) => {
      const on = placed.get(i);
      expect(tags[i]).toBe(on === undefined ? null : on === 4 ? 'This page' : `Page ${on + 1}`);
    });
    // Picking the photo on page 9.
    const other = builder().albumPages[9].slotFills!.find((f) => f != null)!;
    const before = builder().albumPages;
    const expected = placePhoto(before, 4, t.index, other).pages;
    const said: string[] = [];
    const calls: Call[] = [];
    await act(async () => { placePicked(ctxNow(platform, { said, calls }), { kind: 'slot', index: t.index }, other); });
    expect(editCalls(calls)).toEqual([['fillSlot', t.index, other]]);
    expect(builder().albumPages[4].slotFills).toEqual(expected[4].slotFills);
    expect(builder().albumPages[9].slotFills).toEqual(expected[9].slotFills);
    expect(said).toEqual(['Swapped with the photo on page 10']);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[4].slotFills).toEqual(before[4].slotFills);
    expect(builder().albumPages[9].slotFills).toEqual(before[9].slotFills);
  });

  it('Remove photo empties the frame (clearSlot); a tap on it opens "Add to this box" with "Add Photo" first, which opens "Add a photo"', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    let ctx = await openOn(platform, 3);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    ctx = ctxNow(platform);
    const actions = selectedActionsFor(ctx.selected!, ctx);
    expect(actions.map((a) => a.id)).toEqual(['replace', 'swap', 'mask', 'filter', 'remove']);
    const remove = actions.find((a) => a.id === 'remove')!;
    expect(remove.label).toBe('Remove photo');
    expect(remove.danger).toBe(true);
    const calls: Call[] = [];
    await act(async () => { remove.onPress(ctx.selected!, ctxNow(platform, { calls })); });
    expect(editCalls(calls)).toEqual([['clearSlot', t.index]]);
    expect(fills(builder(), 3)[t.index]).toBeNull();
    ctx = ctxNow(platform);
    const empty = ctx.targets.find((x) => x.kind === 'emptySlot' && x.index === t.index)!;
    const sheets: { id: string; params: unknown }[] = [];
    expect(await tapOn(platform, empty, sheets)).toBe('add');
    expect(sheets[0].id).toBe(ADD_TO_BOX_SHEET);
    const choices = addChoicesFor('emptySlot');
    expect(choices[0]).toMatchObject({ id: 'photo', label: 'Add Photo', desc: 'Place one of your photos here', short: 'Photo' });
    expect(addChoicesFor('emptyBox').some((c) => c.id === 'photo')).toBe(false); // a caption box takes words (SlotChooser)
    const next: { id: string; params: unknown }[] = [];
    choices[0].onPick(empty, ctxNow(platform, { sheets: next }));
    expect(next).toEqual([{ id: 'photos:pick', params: { kind: 'slot', index: t.index } }]);
    // The photo just taken out is not placed any more: no tag, no line, back in.
    expect(photoTags(ctxNow(platform))[t.photoIndex!]).toBeNull();
    const said: string[] = [];
    await act(async () => { placePicked(ctxNow(platform, { said }), { kind: 'slot', index: t.index }, t.photoIndex!); });
    expect(fills(builder(), 3)[t.index]).toBe(t.photoIndex);
    expect(said).toEqual([]);
  });

  it('a caption box\'s photo: a tap opens "Add a photo" for the box; a pick goes in with setTextSlotPhoto on this page', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const p = builder().albumPages.findIndex((pg, i) => i > 0 && (getTemplateById(pg.templateId ?? '')?.textSlots?.length ?? 0) > 0);
    expect(p).toBeGreaterThan(0);
    let ctx = await openOn(platform, p);
    const box = ctx.targets.find((x) => x.kind === 'emptyBox')!;
    await act(async () => { builder().setTextSlotPhoto(box.index, 7, p); });
    ctx = ctxNow(platform);
    const boxPhoto = ctx.targets.find((x) => x.kind === 'boxPhoto' && x.index === box.index)!;
    expect(boxPhoto).toBeDefined();
    const sheets: { id: string; params: unknown }[] = [];
    expect(await tapOn(platform, boxPhoto, sheets)).toBe('rule');
    expect(sheets).toEqual([{ id: 'photos:pick', params: { kind: 'box', index: box.index } }]);
    const calls: Call[] = [];
    await act(async () => { placePicked(ctxNow(platform, { calls }), { kind: 'box', index: box.index }, 12); });
    expect(editCalls(calls)).toEqual([['setTextSlotPhoto', box.index, 12, p]]);
    expect(builder().albumPages[p].textSlotFills?.[box.index]).toBe(12);
  });
});

describe('Mask, Filter and "Megy, fix this page"', () => {
  it('a mask and a filter mark the page the customer\'s (the studio line shows); an edge says its warning; Megy puts the page back', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await openOn(platform, 6);
    const t = firstPhoto(platform);
    const said: string[] = [];
    const calls: Call[] = [];
    await act(async () => { pickMask(ctxNow(platform, { said, calls }), t.index, 'circle'); });
    await act(async () => { pickLook(ctxNow(platform, { said, calls }), t.index, 'bw'); });
    await act(async () => { pickMask(ctxNow(platform, { said, calls }), t.index, 'torn'); });
    expect(editCalls(calls)).toEqual([['setSlotMask', t.index, 'circle'], ['setSlotLook', t.index, 'bw'], ['setSlotMask', t.index, 'torn']]);
    const page = builder().albumPages[6];
    expect(page.slotMasks?.[t.index]).toBe('torn');
    expect(page.slotLooks?.[t.index]).toBe('bw');
    expect(page.studio).toBe(true);
    expect(said).toEqual([edgeGuardMessage('torn')]);
    expect(edgeGuardMessage('circle')).toBeNull();
    await act(async () => { pickLook(ctxNow(platform), t.index, 'none'); });
    expect(builder().albumPages[6].slotLooks?.[t.index]).toBeNull();
    const fixSaid: string[] = [];
    await act(async () => { fixStudioPage(ctxNow(platform, { said: fixSaid })); });
    expect(builder().albumPages[6].studio).toBe(false);
    expect(builder().albumPages[6].slotMasks).toEqual([]);
    expect(fixSaid).toEqual([words.STUDIO_FIXED]);
  });
});

describe('Change layout', () => {
  it('the page\'s own layout first ("✓ Current"), then the ones that hold its photos (layoutChoicesForPage, the 16% rule)', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    const p = pageWith(2);
    const ctx = await openOn(platform, p);
    const offered = layoutChoices(ctx).map((t) => t.id);
    expect(offered[0]).toBe(ctx.page.templateId);
    expect(offered).toEqual(layoutChoicesForPage(ctx.page, builder().uploadedPhotos, builder().albumSize).map((t) => t.id));
    expect(new Set(offered).size).toBe(offered.length);
    expect(toolsFor(ctx).find((t) => t.id === 'changeLayout')?.label).toBe('Change layout');
  });

  it('a layout that holds every photo is applied at once (applyPageLayout, one undo step); one that can\'t asks first, and "a new page" keeps every photo', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    const p = pageWith(2);
    let ctx = await openOn(platform, p);
    const n = photosOn(ctx).length;
    const before = builder().albumPages;
    const same = layoutChoices(ctx).find((t) => t.id !== ctx.page.templateId && photosHeld(t) >= n);
    expect(same).toBeDefined();
    if (same) {
      const calls: Call[] = [];
      let ask: ReturnType<typeof chooseLayout> = null;
      await act(async () => { ask = chooseLayout(ctxNow(platform, { calls }), same); });
      expect(ask).toBeNull();
      expect(editCalls(calls).map(([k, ...a]) => [k, ...a])).toEqual([['layoutChangeLoses', same.id], ['applyPageLayout', same.id]]);
      expect(builder().albumPages[p].templateId).toBe(same.id);
      await act(async () => { builder().undo(); });
      expect(builder().albumPages[p].templateId).toBe(before[p].templateId);
    }
    ctx = ctxNow(platform);
    const one = getTemplatesForAlbum(builder().albumSize).find((t) => photosHeld(t) === 1 && !(t.textSlots?.length))!;
    let ask: ReturnType<typeof chooseLayout> = null;
    await act(async () => { ask = chooseLayout(ctx, one); });
    expect(ask).toMatchObject({ t: { id: one.id }, photos: n - 1 });
    expect(builder().albumPages).toBe(before); // nothing yet: it asks
    const placedBefore = new Set(builder().albumPages.flatMap((pg) => (pg.slotFills ?? []).filter((f) => f != null)));
    await act(async () => { applyLayout(ctxNow(platform), ask!, 'new-page'); });
    expect(builder().albumPages.length).toBeGreaterThan(before.length);
    expect(builder().albumPages[p].templateId).toBe(one.id);
    const placedAfter = new Set(builder().albumPages.flatMap((pg) => (pg.slotFills ?? []).filter((f) => f != null)));
    expect(placedAfter).toEqual(placedBefore);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages.length).toBe(before.length);
  });
});

describe('pages: add, delete, and the blank pages reminder', () => {
  it('at 40 pages none can be deleted (said, not offered); a page added goes after this one; then this one can go', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    let ctx = await openOn(platform, 10);
    expect(builder().albumPages.length).toBe(40);
    expect(canDeletePage(ctx)).toBe(false);
    let deleted = true;
    await act(async () => { deleted = deleteThisPage(ctxNow(platform)); });
    expect(deleted).toBe(false);
    expect(builder().albumPages.length).toBe(40);
    const said: string[] = [];
    await act(async () => { addPageAfter(ctxNow(platform, { said })); });
    expect(builder().albumPages.length).toBe(41);
    expect(builder().currentPageIndex).toBe(11);
    expect(isBlankPage(builder().albumPages[11])).toBe(true);
    expect(said).toEqual([words.PAGE_ADDED]);
    ctx = ctxNow(platform);
    expect(canDeletePage(ctx)).toBe(true);
    const page12 = builder().albumPages[12];
    await act(async () => { builder().goToPage(5); });
    const gone = builder().albumPages[5];
    const said2: string[] = [];
    await act(async () => { deleteThisPage(ctxNow(platform, { said: said2 })); });
    expect(builder().albumPages.length).toBe(40);
    expect(builder().albumPages).not.toContain(gone);
    expect(builder().albumPages[11]).toBe(page12);
    expect(said2).toEqual(['Page 6 deleted.']);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[5]).toBe(gone);
  });

  it('blank pages: "N pages are blank", the last ones deleted in one step (never under 40), Edit goes to the next one', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await openOn(platform, 20);
    await act(async () => { addPageAfter(ctxNow(platform)); });
    await act(async () => { addPageAfter(ctxNow(platform)); });
    await act(async () => { builder().goToPage(3); });
    let ctx = ctxNow(platform);
    const plan = blankPlan(ctx);
    expect(plan).toEqual(blankPagePlan(builder().albumPages));
    expect(plan.blank).toEqual([21, 22]);
    expect(plan.deletable).toEqual([21, 22]);
    expect(nextBlankPage(ctx)).toBe(21);
    await act(async () => { builder().goToPage(22); });
    expect(nextBlankPage(ctxNow(platform))).toBe(21); // after the last, the first again
    const said: string[] = [];
    let n = 0;
    await act(async () => { n = deleteBlankPages(ctxNow(platform, { said })); });
    expect(n).toBe(2);
    expect(builder().albumPages.length).toBe(40);
    expect(said).toEqual([deletedBlankNote(2, 40)]);
    // At 40: a page emptied stays (the floor), and it is the only blank one.
    await act(async () => { builder().goToPage(7); });
    for (const t of photosOn(ctxNow(platform))) await act(async () => { builder().clearSlot(t.index); });
    ctx = ctxNow(platform);
    expect(isBlankPage(ctx.page)).toBe(true);
    {
      expect(blankPlan(ctx)).toMatchObject({ blank: [7], deletable: [], staying: 1 });
      expect(nextBlankPage(ctx)).toBeNull(); // "Edit" would go nowhere: not shown
      let none = -1;
      await act(async () => { none = deleteBlankPages(ctxNow(platform)); });
      expect(none).toBe(0);
    }
  });
});

describe('photos added from the phone while editing', () => {
  const header = (uri: string, i: number): PhotoHeader => ({ uri, readable: true, size: 2_000_000 + i, width: 4000, height: 3000, colorSpace: null, needsSrgb: false });
  const inspect = async (uris: string[]) => uris.map((u, i) => header(u, i));
  function picked(names: string[]): DraftPhoto[] {
    return addToDraft(emptyDraft(), names.map((name, i) => ({
      key: `k:new-${name}`, source: 'gallery' as const, uri: `content://media/external/images/media/${9100 + i}`, name, width: 4000, height: 3000,
      capturedAt: Date.UTC(2026, 9, 20, 10, i), modifiedAt: null, addedAt: i,
    })), 1).draft.photos;
  }

  it('only the photos picked on the trip go in, the honest count is said, and nothing the album has is taken out', async () => {
    await madeAlbum(SCENARIOS[0]);
    const before = builder().uploadedPhotos.length;
    const leftOutBefore = builder().uploadedPhotos.filter((p) => p.leftOut).length;
    // The Photos step's list holds only the new photos (an album opened from the account).
    let line: string | null = null;
    await act(async () => { line = await addPickedPhotos(builder(), picked(['NEW_1.jpg', 'NEW_2.jpg']), new Set(), inspect); });
    await settle();
    expect(line).toBe('2 photos added.');
    expect(builder().uploadedPhotos.length).toBe(before + 2);
    expect(builder().uploadedPhotos.filter((p) => p.leftOut).length).toBe(leftOutBefore);
    // Nothing new on the list: nothing to say.
    const again = picked(['NEW_1.jpg']);
    await act(async () => { line = await addPickedPhotos(builder(), again, new Set(again.map((p) => p.key)), inspect); });
    expect(line).toBeNull();
    expect(words.addedLine({ added: 1, restored: 0, skipped: 1, unreadable: 0 })).toBe('1 photo added · 1 already in your album.');
    expect(words.addedLine({ added: 0, restored: 2, skipped: 0, unreadable: 1 })).toBe("2 photos put back in their places · 1 photo couldn't be opened on this phone.");
  });

  it('a trip: started on the way to the picker, the list noted when the editor is left, taken once when it is back', () => {
    expect(takeIntake()).toBeNull();
    intakeLeaving(() => new Set(['a'])); // no trip: nothing noted
    expect(takeIntake()).toBeNull();
    beginIntake({ id: 'photos:pick', params: { kind: 'slot', index: 1 } });
    expect(takeIntake()).toBeNull(); // not left yet
    intakeLeaving(() => new Set(['a', 'b']));
    intakeLeaving(() => new Set(['c'])); // noted once
    const trip = takeIntake()!;
    expect([...trip.before!]).toEqual(['a', 'b']);
    expect(trip.reopen).toEqual({ id: 'photos:pick', params: { kind: 'slot', index: 1 } });
    expect(takeIntake()).toBeNull();
  });
});

describe('what the photos part adds to the screen', () => {
  it('tools, buttons, "Add Photo", sheets, the move-and-zoom overlay and the lines over the page, in the website\'s order', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const restore = isolateRegistry(['core', 'photos']);
    try {
      let ctx = await openOn(platform, 3);
      const tools = toolsFor(ctx);
      expect(tools.map((t) => [t.id, t.label, !!t.wide])).toEqual([
        ['addPhotos', 'Add photos', false], ['changeLayout', 'Change layout', false], ['pages', words.PAGES_TOOL, true],
      ]);
      const sheets: { id: string; params: unknown }[] = [];
      tools[1].onPress(ctxNow(platform, { sheets }));
      tools[2].onPress(ctxNow(platform, { sheets }));
      expect(sheets.map((s) => s.id)).toEqual(['photos:layout', 'photos:pages']);
      for (const id of ['photos:pick', 'photos:layout', 'photos:mask', 'photos:filter', 'photos:pages']) expect(sheetById(id)).not.toBeNull();
      expect(overlayComponents()).toContain(FramingOverlay);
      expect(bannersFor().map((b) => b.id)).toEqual(['photos-swap', 'photos-studio', 'photos-blank', 'photos-intake']);
      const t = firstPhoto(platform);
      await tapOn(platform, t);
      ctx = ctxNow(platform, { sheets });
      const buttons = selectedActionsFor(ctx.selected!, ctx);
      expect(buttons.map((b) => b.label)).toEqual(['Replace photo', 'Swap photo', 'Mask', 'Filter', 'Remove photo']);
      buttons[2].onPress(ctx.selected!, ctx);
      buttons[3].onPress(ctx.selected!, ctx);
      expect(sheets.slice(-2)).toEqual([{ id: 'photos:mask', params: { slot: t.index } }, { id: 'photos:filter', params: { slot: t.index } }]);
      // A tap on a photo is the screen's (it selects); the first ones say how to move it.
      const said: string[] = [];
      const other = photosOn(ctxNow(platform)).find((x) => x.key !== t.key) ?? t;
      await act(async () => { runTap(other, ctxNow(platform, { said })); });
      expect(said.every((s) => s === words.MOVE_HINT)).toBe(true);
    } finally { restore(); }
  });

});
