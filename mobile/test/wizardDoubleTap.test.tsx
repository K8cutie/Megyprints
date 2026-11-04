/* ══════════════════════════════════════════════════════════════════════════
   A DOUBLE TAP ON NEXT GOES ONE STEP (beta round 2, Mother: on "Name your
   album", two taps 75 to 420 ms apart landed on "Your photos". The second
   tap hit the Album size screen's Next, in the same spot, while that screen
   slid in, and the size was never chosen. Two taps 16 ms apart pushed Album
   size twice).

   Each step's way forward goes once per visit (useOncePerVisit), and a
   screen that has just come on top ignores it for ARRIVING_MS.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';

const mockNav = { push: jest.fn() };
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockNav.push(...a) },
  // On top once, as the screen opens.
  useFocusEffect: (fn: () => void) => { const { useEffect: on } = jest.requireActual('react'); on(() => fn(), []); },
}));
/** The phone's store, new for each test (the occasion is kept in it). */
const mockStore: { now: unknown } = { now: null };
jest.mock('../src/builder/BuilderProvider', () => {
  const builder = { albumTitle: '', albumSize: '8x8', albumPages: [], coverFront: null, setAlbumTitle: () => {}, setAlbumSize: () => {} };
  return { useBuilder: () => ({ builder, platform: { deviceStore: mockStore.now, occasion: { listen: () => () => {} }, occasionChanged: () => {} } }) };
});
jest.mock('../src/lib/supabase', () => ({ supabase: {}, supabaseConfigured: false }));

import { memoryStore } from '../src/builder/deviceStore';
import { ARRIVING_MS, useOncePerVisit } from '../src/lib/useOncePerVisit';
import AlbumName from '../src/app/album-name';
import AlbumSize from '../src/app/album-size';

// The phone's clock, moved by hand.
let clock = Date.UTC(2026, 10, 4, 1, 0);
beforeEach(() => { mockNav.push.mockClear(); mockStore.now = memoryStore(); jest.spyOn(Date, 'now').mockImplementation(() => clock); });
afterEach(() => { jest.restoreAllMocks(); });
const later = (ms: number) => act(async () => { clock += ms; });

describe('the guard (useOncePerVisit)', () => {
  it('ignores a tap while the screen is still coming on; then one go per visit', async () => {
    const go = jest.fn();
    const { result } = await renderHook(() => useOncePerVisit());
    result.current(go)();
    expect(go).not.toHaveBeenCalled();
    await later(ARRIVING_MS);
    result.current(go)();
    result.current(go)();
    expect(go).toHaveBeenCalledTimes(1);
    expect(ARRIVING_MS).toBe(500);
  });

  it('a go that did not leave (it answered false) lets the next tap go', async () => {
    const { result } = await renderHook(() => useOncePerVisit());
    await later(ARRIVING_MS);
    let calls = 0;
    const stay = () => { calls++; return false; };
    result.current(stay)();
    result.current(stay)();
    expect(calls).toBe(2);
    let wait: (left: boolean) => void = () => {};
    const later2 = () => { calls++; return new Promise<boolean>((r) => { wait = r; }); };
    result.current(later2)();
    result.current(later2)();
    expect(calls).toBe(3);
    await act(async () => { wait(false); });
    result.current(later2)();
    expect(calls).toBe(4);
  });
});

describe('Name your album → Album size', () => {
  async function filledName() {
    await render(<AlbumName />);
    await fireEvent.changeText(screen.getByTestId('album-name'), "Lola's 90th");
    await fireEvent.press(screen.getByTestId('occasion-Birthday'));
    await later(ARRIVING_MS);
  }

  it('a double tap on Next opens Album size once', async () => {
    await filledName();
    await fireEvent.press(screen.getByTestId('name-next'));
    await fireEvent.press(screen.getByTestId('name-next'));
    expect(mockNav.push).toHaveBeenCalledTimes(1);
    expect(mockNav.push).toHaveBeenCalledWith('/album-size');
  });

  it('Next tapped before the name is in says what is missing, and still goes once it is', async () => {
    await render(<AlbumName />);
    await later(ARRIVING_MS);
    await fireEvent.press(screen.getByTestId('name-next'));
    expect(screen.getByTestId('step-one-status')).toHaveTextContent('Name your album and choose an occasion to continue.');
    await fireEvent.changeText(screen.getByTestId('album-name'), "Lola's 90th");
    await fireEvent.press(screen.getByTestId('occasion-Birthday'));
    await fireEvent.press(screen.getByTestId('name-next'));
    expect(mockNav.push).toHaveBeenCalledWith('/album-size');
  });

  it('Album size ignores the second tap while it comes on: the size is chosen there, never skipped', async () => {
    await render(<AlbumSize />);
    // The double tap's second tap, a moment after the screen opened.
    await later(120);
    await fireEvent.press(screen.getByTestId('size-next'));
    expect(mockNav.push).not.toHaveBeenCalled();
    await later(ARRIVING_MS);
    await fireEvent.press(screen.getByTestId('size-next'));
    expect(mockNav.push).toHaveBeenCalledWith('/photos');
  });
});

describe('every step\'s way forward has the guard', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, '../src/app', f), 'utf8');
  it.each(['album-name.tsx', 'album-size.tsx', 'photos.tsx', 'album-cover.tsx'])('%s', (f) => {
    expect(src(f)).toMatch(/const once = useOncePerVisit\(\);/);
  });
});
