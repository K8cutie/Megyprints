/* ══════════════════════════════════════════════════════════════════════════
   PART 1 (PHOTOS, LAYOUTS, PAGES) IN THE "EDIT PAGES" SCREEN.

   This file belongs to the photos part (src/editor/photos): its job adds to
   it. Today the part gives a selected photo one button, the website's phone
   editor's trash button: "Remove photo" (PageView onRemoveFromSlot →
   clearSlot), one undo step.
   ══════════════════════════════════════════════════════════════════════════ */
import { SCENARIOS } from '../../tools/parity/scenarios';
import { selectedActionsFor } from '../src/editor/registry';
import { editThePages } from '../src/editor/scope';
import '../src/editor/parts';
import { act, builder, ctxOn, fills, firstPhoto, madeAlbum, tapOn, useEditorBench } from './editorHarness';

useEditorBench();

describe('a selected photo', () => {
  it('"Remove photo" takes it out of its frame (clearSlot), and Undo puts it back', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await act(async () => { editThePages(builder()); });
    await act(async () => { builder().goToPage(3); });
    const before = fills(builder(), 3);
    const t = firstPhoto(platform);
    await tapOn(platform, t);
    const ctx = ctxOn(platform);
    const buttons = selectedActionsFor(ctx.selected!, ctx);
    const remove = buttons.find((a) => a.id === 'remove')!;
    expect(remove.label).toBe('Remove photo');
    expect(remove.danger).toBe(true);
    await act(async () => { remove.onPress(ctx.selected!, ctx); });
    expect(fills(builder(), 3)[t.index]).toBeNull();
    await act(async () => { builder().undo(); });
    expect(fills(builder(), 3)).toEqual(before);
  });
});
