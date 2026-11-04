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
import { render, screen } from '@testing-library/react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { SCENARIOS } from '../../tools/parity/scenarios';
import { SheetPlacement, sidePanelWidth, type Placement } from '../src/editor/core/EditorSheet';
import { LayoutSheet } from '../src/editor/photos/LayoutSheet';
import { PickPhotoSheet } from '../src/editor/photos/sheets';
import '../src/editor/parts';
import { space } from '../src/lib/theme';
import { builder, ctxOn, madeAlbum, useEditorBench } from './editorHarness';

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

  it('upright: as before, two across the screen, the list at most 62% of it', async () => {
    const platform = await madeAlbum(SCENARIOS[0]);
    await render(inPlace('bottom', NO_INSETS, <LayoutSheet ctx={ctxOn(platform)} params={undefined} close={() => {}} />));
    const w = Number(flat(tiles()[0].props.style).width);
    expect(w).toBe(Math.floor((UPRIGHT.width - space.md * 2 - 12) / 2));
    expect(flat(screen.getByTestId('photos-layout-grid').props.style).maxHeight).toBe(Math.round(UPRIGHT.height * 0.62));
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
