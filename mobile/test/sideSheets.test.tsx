/* ══════════════════════════════════════════════════════════════════════════
   A SHEET'S GRID FITS THE SHEET (owner, 2026-11-04, with a screenshot:
   "Choose a layout" with the phone on its side, "the layout is cut").

   On its side a sheet is a panel down the right (SheetPlacement 'side'), but
   the grids measured their tiles from the whole screen, so one layout filled
   the panel and ran past its edge and bottom, and no other could be seen.
   They measure the sheet's own room now (useSheetBodyWidth: the panel, less
   the system's buttons at its right edge), and a long list fills the panel's
   height instead of stopping at a share of the screen.
   ══════════════════════════════════════════════════════════════════════════ */
import { Dimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import type { PageTemplate } from '@web/pages/builder/types';
import { layoutChangeLeftovers, relayPageOnTemplate } from '@web/pages/builder/useBuilderState';
import { SCENARIOS } from '../../tools/parity/scenarios';
import type { AppPlatform } from '../src/builder/appPlatform';
import { SheetPlacement, sidePanelWidth, type Placement } from '../src/editor/core/EditorSheet';
import { layoutChoices } from '../src/editor/photos/actions';
import { LayoutSheet } from '../src/editor/photos/LayoutSheet';
import { PickPhotoSheet } from '../src/editor/photos/sheets';
import '../src/editor/parts';
import { editThePages } from '../src/editor/scope';
import { space } from '../src/lib/theme';
import { act, builder, ctxOn, madeAlbum, useEditorBench } from './editorHarness';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../src/builder/usePagePicture', () => ({
  usePagePicture: () => ({ uri: null, notDrawn: [], missing: 0, error: null }),
  preparePagePicture: async () => {},
  forgetPhotoPictures: () => {},
  PRIORITY: { editing: 3, shown: 2, thumbnail: 1, ahead: 0 },
}));

useEditorBench();

const flat = (style: unknown): Record<string, number | string> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);
const UPRIGHT = { width: 412, height: 915, scale: 2.625, fontScale: 1 };
const TURNED = { width: 915, height: 412, scale: 2.625, fontScale: 1 };
/** Three-button navigation at the right edge, the camera at the left. */
const TURNED_INSETS: EdgeInsets = { top: 0, right: 48, bottom: 0, left: 32 };
const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** The panel's room for a grid: its width, less the system's buttons and the body's padding. */
const panelRoom = sidePanelWidth(TURNED.width) - TURNED_INSETS.right - space.md * 2;

afterEach(() => {
  Dimensions.set({ window: UPRIGHT, screen: UPRIGHT });
});

function inPlace(placement: Placement, insets: EdgeInsets, sheet: React.ReactElement) {
  return (
    <SafeAreaInsetsContext.Provider value={insets}>
      <SheetPlacement.Provider value={placement}>{sheet}</SheetPlacement.Provider>
    </SafeAreaInsetsContext.Provider>
  );
}

describe('"Choose a layout"', () => {
  const tiles = () => screen.getAllByTestId(/^photos-layout-t/);

  it('on its side: two layouts fit across the panel, whole, not cut at its edge', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    Dimensions.set({ window: TURNED, screen: TURNED });
    await render(inPlace('side', TURNED_INSETS, <LayoutSheet ctx={ctxOn(platform)} params={undefined} close={() => {}} />));
    const w = Number(flat(tiles()[0].props.style).width);
    expect(w).toBeGreaterThan(100);
    expect(w * 2 + 12).toBeLessThanOrEqual(panelRoom);
  });

  it('on its side: the list fills the panel\'s height, it does not stop at a share of the screen', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    Dimensions.set({ window: TURNED, screen: TURNED });
    await render(inPlace('side', TURNED_INSETS, <LayoutSheet ctx={ctxOn(platform)} params={undefined} close={() => {}} />));
    const grid = flat(screen.getByTestId('photos-layout-grid').props.style);
    expect(grid.flex).toBe(1);
    expect(grid.maxHeight).toBeUndefined();
  });

  it('upright: three across the screen, in a sheet short enough to leave the page in view, like Mask', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await render(inPlace('bottom', NO_INSETS, <LayoutSheet ctx={ctxOn(platform)} params={undefined} close={() => {}} />));
    const w = Number(flat(tiles()[0].props.style).width);
    expect(w).toBe(Math.floor((UPRIGHT.width - space.md * 2 - 12 * 2) / 3));
    expect(flat(screen.getByTestId('photos-layout-sheet').props.style).maxHeight).toBe('42%');
  });
});

describe('"Choose a layout" stays open to try another (owner, 2026-11-05)', () => {
  /** The sheet on the page on screen, drawn again after a change as the editor does. */
  async function open(platform: AppPlatform) {
    const close = jest.fn();
    const sheet = () => inPlace('bottom', NO_INSETS, <LayoutSheet ctx={ctxOn(platform)} params={undefined} close={close} />);
    await render(sheet());
    const pick = async (id: string) => {
      await fireEvent.press(screen.getByTestId(`photos-layout-${id}`));
      await screen.rerender(sheet());
    };
    return { close, pick };
  }
  const ids = () => screen.getAllByTestId(/^photos-layout-t/).map((t) => String(t.props.testID));
  /** A page with photos, and layouts that hold them all (fewer frames would ask first). */
  async function onPageWithChoices() {
    const platform = await madeAlbum(SCENARIOS[2]);
    await act(async () => { editThePages(builder()); });
    for (let i = 0; i < builder().albumPages.length; i++) {
      await act(async () => { builder().goToPage(i); });
      const ctx = ctxOn(platform);
      const others = layoutChoices(ctx).filter((t) => {
        const left = layoutChangeLeftovers(ctx.page, t);
        return t.id !== ctx.page.templateId && left.photos.length === 0 && left.captions === 0;
      });
      if (others.length >= 2) return { platform, index: i, start: ctx.page, a: others[0], b: others[1] };
    }
    throw new Error('no page with two other layouts');
  }

  it('a pick changes the page and the sheet stays; "Current" moves; the tiles stay where they were', async () => {
    const { platform, index, a, b } = await onPageWithChoices();
    const { close, pick } = await open(platform);
    const order = ids();
    await pick(a.id);
    expect(builder().albumPages[index].templateId).toBe(a.id);
    expect(screen.getByTestId(`photos-layout-${a.id}`).props.accessibilityState.selected).toBe(true);
    await pick(b.id);
    expect(builder().albumPages[index].templateId).toBe(b.id);
    expect(screen.getByTestId(`photos-layout-${a.id}`).props.accessibilityState.selected).toBe(false);
    expect(screen.getByTestId(`photos-layout-${b.id}`).props.accessibilityState.selected).toBe(true);
    expect(ids()).toEqual(order);
    expect(close).not.toHaveBeenCalled();
  });

  it('each try starts from the page as it opened; its first layout brings it back as it was, zoom too; all the tries are one Undo', async () => {
    const found = await onPageWithChoices();
    const { platform, index, a, b } = found;
    const framed = builder().albumPages[index].slotFills?.findIndex((f) => f != null) ?? 0;
    await act(async () => { builder().setSlotScale(framed, 1.5); });
    const start = builder().albumPages[index];
    const { pick } = await open(platform);
    await pick(a.id);
    expect(builder().albumPages[index].slotScales?.[framed]).toBe(1); // a new layout, framing as on the website
    await pick(b.id);
    expect(builder().albumPages[index]).toEqual(relayPageOnTemplate(start, b));
    await pick(String(start.templateId));
    expect(builder().albumPages[index]).toBe(start);
    await pick(a.id);
    await pick(b.id);
    await act(async () => { builder().undo(); });
    expect(builder().albumPages[index]).toBe(start);
  });

  it('a tap on the layout it already has does nothing: no change, no Undo step', async () => {
    const { platform, index, start } = await onPageWithChoices();
    const { close, pick } = await open(platform);
    const before = builder().canUndo;
    await pick(String(start.templateId));
    expect(builder().albumPages[index]).toBe(start);
    expect(builder().canUndo).toBe(before);
    expect(close).not.toHaveBeenCalled();
  });

  it('a layout that can\'t hold every photo asks where they go, and closes after the answer', async () => {
    const platform = await madeAlbum(SCENARIOS[2]);
    await act(async () => { editThePages(builder()); });
    let fewer: PageTemplate | undefined;
    for (let i = 0; i < builder().albumPages.length && !fewer; i++) {
      await act(async () => { builder().goToPage(i); });
      const ctx = ctxOn(platform);
      fewer = layoutChoices(ctx).find((t) => layoutChangeLeftovers(ctx.page, t).photos.length > 0);
    }
    expect(fewer).toBeDefined();
    const pages = builder().albumPages.length;
    const { close, pick } = await open(platform);
    await fireEvent.scroll(screen.getByTestId('photos-layout-grid'), { nativeEvent: { contentOffset: { x: 0, y: 300 }, contentSize: { width: 300, height: 900 }, layoutMeasurement: { width: 300, height: 300 } } });
    await pick(fewer!.id);
    expect(screen.getByTestId('photos-layout-leftover')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(builder().albumPages.length).toBe(pages); // nothing yet: it asks
    await fireEvent.press(screen.getByTestId('photos-layout-back'));
    expect(screen.getByTestId('photos-layout-grid').props.contentOffset.y).toBe(300); // the same place in the list
    await pick(fewer!.id);
    await fireEvent.press(screen.getByTestId('photos-layout-new-page'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(builder().albumPages.length).toBeGreaterThan(pages);
  });
});

describe('"Add a photo" / "Replace photo"', () => {
  const cells = () => screen.getAllByTestId(/^photos-pick-\d+$/);

  it('on its side: three photos fit across the panel', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    Dimensions.set({ window: TURNED, screen: TURNED });
    await render(inPlace('side', TURNED_INSETS, <PickPhotoSheet ctx={ctxOn(platform)} params={{ kind: 'slot', index: 0 }} close={() => {}} />));
    expect(builder().uploadedPhotos.length).toBeGreaterThan(3);
    const w = Number(flat(cells()[0].props.style).width);
    expect(w).toBeGreaterThan(50);
    expect(w * 3 + 8 * 2).toBeLessThanOrEqual(panelRoom);
  });
});
