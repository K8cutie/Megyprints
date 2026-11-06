/* ══════════════════════════════════════════════════════════════════════════
   THE NEW "EDIT PAGES" LAYOUT (owner, 2026-11-03, from the drawings at
   https://claude.ai/artifact/8cVAvMvpJTF6yJH3B2MdQy):
     • the strip of page numbers is gone; "Page 13 of 72", big over the page,
       opens "Go to a page": the cover first, then every page, the one on
       screen marked; a tap goes there;
     • the picked thing's buttons in rows, all in view, the one that removes
       (red) last;
     • on its side: the editor turns with the phone, the page on the left,
       the buttons in a panel down the right, and every sheet opens in that
       panel's place instead of from the bottom.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { dangerLast } from '../src/editor/actionRows';
import { EditorSheet, SheetPlacement, SIDE_PANEL_W, sidePanelWidth } from '../src/editor/core/EditorSheet';
import { GO_TO_PAGE, pageCount } from '../src/editor/editorWords';
import { editorPictureWidth } from '../src/editor/pagePictureWidth';
import { PagePicker } from '../src/editor/PagePicker';
import { pageTargets } from '../src/editor/hitTest';
import { selectedActionsFor, type EditorContext } from '../src/editor/registry';
import '../src/editor/parts';
import { act, builder, ctxOn, madeAlbum, useEditorBench } from './editorHarness';

useEditorBench();

const SCREEN = fs.readFileSync(path.join(__dirname, '..', 'src/editor/EditPagesScreen.tsx'), 'utf8').replace(/\r\n/g, '\n');
const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);

describe('"Page 13 of 72" and "Go to a page"', () => {
  function fakeCtx() {
    const goToPage = jest.fn();
    return { ctx: { builder: { goToPage } } as unknown as EditorContext, goToPage };
  }

  it('the words: the page count, and the list it opens', () => {
    expect(pageCount(12, 72)).toBe('Page 13 of 72');
    expect(GO_TO_PAGE).toBe('Go to a page');
  });

  it('the cover first, then every page, the one on screen marked; a tap goes there and closes the list', async () => {
    const { ctx, goToPage } = fakeCtx();
    const close = jest.fn();
    await render(<PagePicker ctx={ctx} total={72} index={12} close={close} />);
    expect(screen.getByText(GO_TO_PAGE)).toBeOnTheScreen();
    expect(screen.getByTestId('edit-picker-cover')).toHaveTextContent('Cover');
    for (const n of [1, 13, 72]) expect(screen.getByTestId(`edit-picker-page-${n}`)).toHaveTextContent(String(n));
    expect(screen.queryByTestId('edit-picker-page-73')).toBeNull();
    expect(screen.getByTestId('edit-picker-page-13').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('edit-picker-page-60').props.accessibilityState).toEqual({ selected: false });
    await fireEvent.press(screen.getByTestId('edit-picker-page-60'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(goToPage).toHaveBeenCalledWith(59);
  });

  it('the page on screen: only closes; the cover: opens the cover editor', async () => {
    const { ctx, goToPage } = fakeCtx();
    const close = jest.fn();
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    try {
      await render(<PagePicker ctx={ctx} total={40} index={2} close={close} />);
      await fireEvent.press(screen.getByTestId('edit-picker-page-3'));
      expect(goToPage).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByTestId('edit-picker-cover'));
      expect(close).toHaveBeenCalledTimes(2);
      expect(push).toHaveBeenCalledWith('/edit-cover');
    } finally {
      push.mockRestore();
    }
  });

  it('the screen: no strip of page numbers; the count opens the list', () => {
    expect(SCREEN).not.toContain('edit-strip');
    expect(SCREEN).not.toContain('stripTiles');
    expect(SCREEN).toContain('onPress={() => setPicking(true)}');
    expect(SCREEN).toContain('testID="edit-counter"');
    expect(SCREEN).toContain('{pageCount(index, total)}');
    expect(SCREEN).toContain('{picking && <PagePicker ctx={ctx} total={total} index={index} close={() => setPicking(false)} />}');
  });
});

describe('the picked thing\'s buttons: in rows, all in view, the red one last', () => {
  it('the order: the parts\' own, then any that removes', () => {
    const a = (id: string, danger = false) => ({ id, danger });
    expect(dangerLast([a('replace'), a('remove', true), a('swap'), a('mask')]).map((x) => x.id)).toEqual(['replace', 'swap', 'mask', 'remove']);
    expect(dangerLast([])).toEqual([]);
  });

  it('a photo on a real album: Replace, Swap, Mask, Filter, then Remove photo', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    const b = builder();
    const i = b.albumPages.findIndex((_p, k) => pageTargets({ page: b.albumPages[k], albumSize: b.albumSize, pageIndex: k, photoCount: b.uploadedPhotos.length }).targets.some((t) => t.kind === 'photo'));
    await act(async () => { builder().goToPage(i); });
    const ctx = ctxOn(platform);
    const photo = ctx.targets.find((t) => t.kind === 'photo')!;
    expect(dangerLast(selectedActionsFor(photo, ctx)).map((x) => x.label)).toEqual(['Replace photo', 'Swap photo', 'Mask', 'Filter', 'Remove photo']);
  });

  it('the screen: a wrapping row, not a sideways scroll', () => {
    expect(SCREEN).toContain('const actions = dangerLast(selected ? selectedActionsFor(selected, ctx) : []);');
    expect(SCREEN).toContain("actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },");
    expect(SCREEN).not.toMatch(/<ScrollView horizontal[^>]*testID="edit-selected-actions"/);
  });
});

describe('on its side', () => {
  it('the editor turns with the phone; the page on the left, the panel down the right with the way back, the count and Undo', () => {
    expect(SCREEN).toContain("useTurnsWithThePhone('edit-pages', focused);");
    expect(SCREEN).toContain('const sideways = isSideways(screenW, screenH);');
    expect(SCREEN).toContain('headerShown: !sideways,');
    expect(SCREEN).toContain('<SheetPlacement.Provider value="side">');
    expect(SCREEN).toContain('<SheetPlacement.Provider value="bottom">');
    expect(SCREEN).toContain("style={[styles.panel, { width: sidePanelWidth(screenW) }]}");
    const panel = SCREEN.slice(SCREEN.indexOf('testID="edit-panel"'), SCREEN.indexOf('{controls}', SCREEN.indexOf('testID="edit-panel"')));
    for (const piece of ['testID="edit-back-to-preview"', '{counter}', '<HeaderUndo']) expect(panel).toContain(piece);
  });

  it('the page picture is drawn for the short side: turning the phone draws nothing again', () => {
    expect(SCREEN).toContain('const px = editorPictureWidth(screenW, screenH);');
    expect(editorPictureWidth(412, 915)).toBe(editorPictureWidth(915, 412));
  });

  it('a sheet opens as a panel down the right, the page left in view; upright, from the bottom as before', async () => {
    const shown = (placement: 'side' | 'bottom') => render(
      <SheetPlacement.Provider value={placement}>
        <EditorSheet title="Filter" onClose={() => {}} testID="sheet"><Text>Black &amp; white</Text></EditorSheet>
      </SheetPlacement.Provider>,
    );
    await shown('side');
    const side = flat(screen.getByTestId('sheet').props.style);
    expect(side.width).toBe(sidePanelWidth(750));
    expect(side.borderTopLeftRadius).toBeUndefined();
    expect(screen.getByText('Black & white')).toBeOnTheScreen();
    expect(flat(screen.getByTestId('sheet-dim').props.style).backgroundColor).toBeUndefined();
    await shown('bottom');
    const bottom = flat(screen.getByTestId('sheet').props.style);
    expect(bottom.width).toBeUndefined();
    expect(bottom.borderTopLeftRadius).toBe(16);
  });

  it('a sheet whose edits show on the page (Mask, Filter), upright: no dimming, and short enough to leave the page in view', async () => {
    await render(
      <SheetPlacement.Provider value="bottom">
        <EditorSheet title="Mask" onClose={() => {}} live scroll testID="sheet"><Text>Circle</Text></EditorSheet>
      </SheetPlacement.Provider>,
    );
    expect(flat(screen.getByTestId('sheet').props.style).maxHeight).toBe('42%');
    expect(flat(screen.getByTestId('sheet-dim').parent?.props.style).backgroundColor).toBeUndefined();
    expect(screen.getByText('Circle')).toBeOnTheScreen();
  });

  it('the panel is never more than 46% of the screen', () => {
    expect(sidePanelWidth(915)).toBe(SIDE_PANEL_W);
    expect(sidePanelWidth(640)).toBe(Math.round(640 * 0.46));
  });
});
