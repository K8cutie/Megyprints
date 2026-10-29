/* ══════════════════════════════════════════════════════════════════════════
   THE REGISTRY THE EDITOR'S PARTS PLUG INTO (2.0, Phase 4).

   Photos, words and the cover are built apart, each in its own folder, and
   reach the "Edit pages" screen only through src/editor/registry.ts. Here,
   with the part folders taken out (isolateRegistry: only the screen's own
   'core' part stays), so whatever the parts add later never changes it:
     • the four parts register themselves from src/editor/parts.ts;
     • a tap: a part's rule goes first, in order; a rule that hands it on
       lets the screen select; an empty frame or box opens "Add to this box"
       only when a part offers something for it; a retired graphic or sticker
       opens the screen's own sheet (the website's RemoveGraphicModal);
     • "Add to this box", the tools, the buttons for the selected element and
       the lines over the page come in the website's order (ORDER), whichever
       part adds them; a wide tool is kept apart; sheets are found by their
       full id.
   ══════════════════════════════════════════════════════════════════════════ */
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { Target } from '../src/editor/hitTest';
import {
  ADD_TO_BOX_SHEET, ORDER, addChoicesFor, bannersFor, editorParts, isolateRegistry, registerEditorPart,
  runTap, selectedActionsFor, sheetById, stripTiles, toolsFor,
} from '../src/editor/registry';
import '../src/editor/parts';
import { act, builder, ctxOn, firstPhoto, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

describe('the parts', () => {
  it('the screen\'s own part and the three part folders register themselves; sheets are found by their full id', () => {
    expect(editorParts().map((p) => p.id).sort()).toEqual(['core', 'cover', 'photos', 'text']);
    expect(sheetById(ADD_TO_BOX_SHEET)).not.toBeNull();
    expect(sheetById('core:retired')).not.toBeNull();
    expect(sheetById('core:nothing')).toBeNull();
    expect(sheetById('no-colon')).toBeNull();
  });

  it('isolateRegistry takes the part folders out and puts them all back', () => {
    const restore = isolateRegistry(['core']);
    try {
      expect(editorParts().map((p) => p.id)).toEqual(['core']);
      const off = registerEditorPart({ id: 'test-a' });
      expect(editorParts().map((p) => p.id).sort()).toEqual(['core', 'test-a']);
      off();
      expect(editorParts().map((p) => p.id)).toEqual(['core']);
    } finally { restore(); }
    expect(editorParts().map((p) => p.id).sort()).toEqual(['core', 'cover', 'photos', 'text']);
  });
});

describe('what a tap does', () => {
  let restore: (() => void) | null = null;
  beforeEach(() => { restore = isolateRegistry(['core']); });
  afterEach(() => { restore?.(); restore = null; });

  it('a rule goes first; an empty frame opens "Add to this box" only when a part offers something; a retired graphic opens its sheet', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { builder().goToPage(5); });
    const photo = firstPhoto(platform);
    await act(async () => { builder().clearSlot(photo.index); });
    const empty = ctxOn(platform).targets.find((x) => x.key === photo.key)!;
    expect(empty.kind).toBe('emptySlot');

    // Nothing offered for an empty frame: the tap selects it only.
    expect(addChoicesFor('emptySlot')).toHaveLength(0);
    const sheets: { id: string; params: unknown }[] = [];
    let by = '';
    await act(async () => { by = runTap(empty, ctxOn(platform, sheets)); });
    expect(by).toBe('select');
    expect(sheets).toHaveLength(0);
    expect(ctxOn(platform).selected?.key).toBe(empty.key);

    // A part offers "Add Photo": the tap opens "Add to this box" for that frame.
    registerEditorPart({ id: 'test-photo', addChoices: [{ id: 'photo', label: 'Add Photo', desc: 'Place one of your photos here', short: 'Photo', kinds: ['emptySlot'], order: ORDER.addChoices.photo, onPick: () => {} }] });
    await act(async () => { by = runTap(empty, ctxOn(platform, sheets)); });
    expect(by).toBe('add');
    expect(sheets.map((s) => s.id)).toEqual([ADD_TO_BOX_SHEET]);
    expect((sheets[0].params as { target: Target }).target.key).toBe(empty.key);

    // A rule for the kind takes the tap before the screen; one that hands it on does not.
    const seen: string[] = [];
    registerEditorPart({ id: 'test-rules', taps: [
      { kinds: ['emptySlot'], order: 2, onTap: () => { seen.push('second'); return true; } },
      { kinds: ['emptySlot'], order: 1, onTap: () => { seen.push('first'); return false; } },
    ] });
    await act(async () => { by = runTap(empty, ctxOn(platform, sheets)); });
    expect(by).toBe('rule');
    expect(seen).toEqual(['first', 'second']);
    expect(sheets).toHaveLength(1);

    // A retired graphic in a frame: the screen's own sheet, and it is selected.
    const graphic: Target = { ...empty, kind: 'slotGraphic' };
    await act(async () => { by = runTap(graphic, ctxOn(platform, sheets)); });
    expect(by).toBe('rule');
    expect(sheets[sheets.length - 1].id).toBe('core:retired');
  });

  it('a photo: selected, with the buttons the parts give a photo, in order, and only where they say they are shown', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { builder().goToPage(2); });
    registerEditorPart({ id: 'test-b', selectedActions: [
      { id: 'later', label: 'Later', kinds: ['photo'], order: 50, onPress: () => {} },
      { id: 'never', label: 'Never', kinds: ['photo'], shown: () => false, onPress: () => {} },
      { id: 'words', label: 'Words', kinds: ['boxText'], onPress: () => {} },
    ] });
    registerEditorPart({ id: 'test-a', selectedActions: [{ id: 'sooner', label: 'Sooner', kinds: ['photo'], order: 10, onPress: () => {} }] });
    const t = firstPhoto(platform);
    let by = '';
    await act(async () => { by = runTap(t, ctxOn(platform)); });
    expect(by).toBe('select');
    const ctx = ctxOn(platform);
    expect(ctx.selected?.key).toBe(t.key);
    expect(selectedActionsFor(ctx.selected!, ctx).map((a) => a.id)).toEqual(['sooner', 'later']);
  });
});

describe('the website\'s order, whichever part adds what', () => {
  let restore: (() => void) | null = null;
  beforeEach(() => { restore = isolateRegistry(); });
  afterEach(() => { restore?.(); restore = null; });

  it('"Add to this box": Add Photo, Add Quote, Your Text (SlotChooser); tools: Add photos, Change layout, Page colour (MobileReview)', () => {
    const pick = () => {};
    // Registered "wrong way round", by two parts, as two jobs might.
    registerEditorPart({
      id: 'test-text',
      addChoices: [
        { id: 'text', label: 'Your Text', desc: '', short: 'Text', kinds: ['emptySlot', 'emptyBox'], order: ORDER.addChoices.text, onPick: pick },
        { id: 'quote', label: 'Add Quote', desc: '', short: 'Quote', kinds: ['emptySlot', 'emptyBox'], order: ORDER.addChoices.quote, onPick: pick },
      ],
      tools: [{ id: 'colour', label: 'Page colour', order: ORDER.tools.pageColour, onPress: pick }],
      banners: [{ id: 'second', order: 20, Component: () => null }],
    });
    registerEditorPart({
      id: 'test-photos',
      addChoices: [{ id: 'photo', label: 'Add Photo', desc: '', short: 'Photo', kinds: ['emptySlot'], order: ORDER.addChoices.photo, onPick: pick }],
      tools: [
        { id: 'layout', label: 'Change layout', order: ORDER.tools.changeLayout, onPress: pick },
        { id: 'add', label: 'Add photos', order: ORDER.tools.addPhotos, onPress: pick },
        { id: 'memory', label: 'Add memory video', order: ORDER.tools.memoryVideo, wide: true, onPress: pick },
        { id: 'hidden', label: 'Hidden', shown: () => false, onPress: pick },
      ],
      banners: [{ id: 'first', order: 10, Component: () => null }],
      stripStart: [{ id: 'cover', label: 'Cover', onPress: pick }],
    });
    expect(addChoicesFor('emptySlot').map((c) => c.label)).toEqual(['Add Photo', 'Add Quote', 'Your Text']);
    expect(addChoicesFor('emptyBox').map((c) => c.label)).toEqual(['Add Quote', 'Your Text']);
    const ctx = {} as never;
    expect(toolsFor(ctx).map((t) => t.label)).toEqual(['Add photos', 'Change layout', 'Page colour', 'Add memory video']);
    expect(toolsFor(ctx).filter((t) => t.wide).map((t) => t.id)).toEqual(['memory']);
    expect(bannersFor().map((b) => b.id)).toEqual(['first', 'second']);
    expect(stripTiles().map((t) => t.label)).toEqual(['Cover']);
  });
});
