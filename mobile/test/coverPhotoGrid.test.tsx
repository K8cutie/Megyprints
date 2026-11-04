/* ══════════════════════════════════════════════════════════════════════════
   THE COVER'S PHOTOS ARE A GRID YOU SCROLL DOWN, NOT A ROW YOU SWIPE SIDEWAYS
   (owner, 2026-11-04, on the app's cover step: "just show all the photos to
   choose from not a side scrolling thing"; only the app, the website keeps
   its row).

   Still ABOVE the cover (owner, 2026-11-01: "should put the pics on top"), so
   the grid has a height of its own and scrolls inside it: an album's 150
   photos must not push the cover off the screen, and a tap shows on the cover
   right under it.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { Dimensions } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { COLUMNS, CoverPhotoGrid, gridTile, offsetToShow, TILE_GAP } from '../src/components/CoverPhotoGrid';
import { YOUR_PHOTOS } from '../src/editor/cover/words';

const flat = (style: unknown): Record<string, number | string> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[]);
const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const WIDE = 412;
const photos: UploadedPhoto[] = Array.from({ length: 150 }, (_, i) => ({
  id: `p${i}`, name: `p${i}.jpg`, previewUrl: `content://media/${i}`, type: 'image/jpeg', size: 1, width: 4000, height: 3000,
} as UploadedPhoto));

beforeEach(() => {
  const dims = { width: WIDE, height: 915, scale: 2.625, fontScale: 1 };
  Dimensions.set({ window: dims, screen: dims });
});

describe('the grid', () => {
  it('five photos across, filling the screen between its margins, no sideways scroll', async () => {
    await render(<CoverPhotoGrid photos={photos} onCover={null} onPick={() => {}} pad={24} />);
    expect(COLUMNS).toBe(5);
    const tile = gridTile(WIDE, 24);
    expect(tile * COLUMNS + TILE_GAP * (COLUMNS - 1)).toBeCloseTo(WIDE - 48, 5); // the same margin both sides
    expect(flat(screen.getByTestId('cover-photo-p0').props.style).width).toBe(tile);
    const grid = screen.getByTestId('cover-photo-grid');
    expect(grid.props.horizontal).toBeFalsy();
    expect(screen.getByText(YOUR_PHOTOS)).toBeOnTheScreen();
  });

  it('it scrolls inside a height of its own, so the cover stays under it', async () => {
    await render(<CoverPhotoGrid photos={photos} onCover={null} onPick={() => {}} pad={24} rows={3.5} />);
    const grid = screen.getByTestId('cover-photo-grid');
    expect(flat(grid.props.style).maxHeight).toBe(3.5 * (gridTile(WIDE, 24) + TILE_GAP));
    expect(grid.props.nestedScrollEnabled).toBe(true);
    // A tap on a photo while the title's keyboard is up picks it, first time.
    expect(grid.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('a few photos: no empty space under them (the height is only an upper limit)', async () => {
    await render(<CoverPhotoGrid photos={photos.slice(0, 3)} onCover={null} onPick={() => {}} pad={24} rows={3.5} />);
    expect(flat(screen.getByTestId('cover-photo-grid').props.style).height).toBeUndefined();
  });

  it('a tap puts that photo on the cover, and the photo on the cover says so', async () => {
    const onPick = jest.fn();
    await render(<CoverPhotoGrid photos={photos} onCover="p2" onPick={onPick} pad={24} />);
    await fireEvent.press(screen.getByTestId('cover-photo-p7'));
    expect(onPick).toHaveBeenCalledWith(photos[7]);
    expect(screen.getByTestId('cover-photo-p2').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('cover-photo-p2').props.accessibilityLabel).toBe('On the cover');
    expect(screen.getByTestId('cover-photo-p7').props.accessibilityState).toEqual({ selected: false });
  });
});

describe('opening with a photo already on the cover', () => {
  // 70 px rows (64 px tiles, 6 apart): a 245 px grid shows rows 0, 1 and 2 whole.
  it('scrolls to its row only when that row is out of sight; a tap never moves the grid', () => {
    expect(offsetToShow(0, 64, 245)).toBeNull();
    expect(offsetToShow(14, 64, 245)).toBeNull(); // row 2: 2 x 70 + 64 = 204
    expect(offsetToShow(15, 64, 245)).toBe(3 * 70); // row 3: 274, past the bottom
    expect(offsetToShow(149, 64, 245)).toBe(29 * 70);
    expect(offsetToShow(-1, 64, 245)).toBeNull(); // no album photo on the cover
    expect(offsetToShow(20, 64, 0)).toBeNull(); // not laid out yet
  });
});

describe('where it is', () => {
  it('above the cover on the cover step and on Design your cover', () => {
    const step = read('src/app/album-cover.tsx');
    expect(step.indexOf('<CoverPhotoGrid')).toBeGreaterThan(0);
    expect(step.indexOf('<CoverPhotoGrid')).toBeLessThan(step.indexOf('testID="cover-picture"'));
    const editor = read('src/editor/cover/CoverScreen.tsx');
    expect(editor.indexOf('<CoverPhotoGrid')).toBeGreaterThan(0);
    expect(editor.indexOf('<CoverPhotoGrid')).toBeLessThan(editor.indexOf('<CoverStage'));
  });

  it('only the app: the website keeps its row', () => {
    const web = fs.readFileSync(path.join(__dirname, '..', '..', 'src/pages/builder/CoverEditor.tsx'), 'utf8');
    expect(web).toContain('data-testid="cover-photo-row"');
  });
});
