/* ══════════════════════════════════════════════════════════════════════════
   MY ALBUMS OPENS AN ALBUM (owner, 2026-11-05: "Why cant i open the albums is
   that just a list"). It was a list only. The website opens each album in its
   builder (UserProjectsSection: /builder?album=<id> → loadAlbum); the app does
   the same with the same loadAlbum, then goes where "Continue my album" goes.
   ══════════════════════════════════════════════════════════════════════════ */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { AlbumRow } from '../src/lib/albums';

const mockNav = { push: jest.fn() };
const mockList: { albums: AlbumRow[] } = { albums: [] };
/** The account's albums as the cloud has them, and what is on the phone. */
const mockCloud: {
  online: boolean;
  onScreen: string | undefined;
  asked: string[];
  rows: Record<string, { title: string; pages: unknown[] }>;
  release: (() => void) | null;
  hold: boolean;
  /** The page the builder is on (the Preview opens there: at the cover from page 0), and each move and push in order. */
  page: number;
  steps: string[];
} = { online: true, onScreen: undefined, asked: [], rows: {}, release: null, hold: false, page: 0, steps: [] };

jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => { mockCloud.steps.push(`push ${String(a[0])}`); mockNav.push(...a); } }, Redirect: () => null }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } }, loading: false }) }));
jest.mock('../src/lib/useMyAlbums', () => ({
  useMyAlbums: () => ({ albums: mockList.albums, loading: false, failed: false, retrying: false, retry: jest.fn() }),
}));
// The website's builder, as far as opening an album goes: loadAlbum reads the
// row and puts it on screen (getAlbumId is its albumIdRef); a failed read
// leaves the album on screen as it was (albumCloud.load returns null).
jest.mock('../src/builder/BuilderProvider', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { memoryStore } = jest.requireActual('../src/builder/deviceStore') as typeof import('../src/builder/deviceStore');
  const store = memoryStore();
  return {
    useBuilder: () => {
      const [st, setSt] = React.useState({ title: 'On the phone', pages: [] as unknown[], loading: false });
      const builder = {
        albumTitle: st.title, albumPages: st.pages, uploadedPhotos: [], isLoadingCloud: st.loading,
        getAlbumId: () => mockCloud.onScreen,
        currentPageIndex: mockCloud.page,
        goToPage: (i: number) => { mockCloud.page = i; mockCloud.steps.push(`page ${i}`); },
        loadAlbum: async (id: string) => {
          mockCloud.asked.push(id);
          setSt((s) => ({ ...s, loading: true }));
          if (mockCloud.hold) await new Promise<void>((r) => { mockCloud.release = r; });
          const row = mockCloud.rows[id];
          if (!mockCloud.online || !row) { setSt((s) => ({ ...s, loading: false })); return; }
          mockCloud.onScreen = id;
          setSt({ title: row.title, pages: row.pages, loading: false });
        },
      };
      return { builder, platform: { deviceStore: store } };
    },
  };
});

import Albums from '../src/app/albums';

/** 40 pages with photos on them: a made album (wizardSteps.albumIsBuilt). */
const madePages = Array.from({ length: 40 }, (_, i) => ({ slotFills: [i], photos: [] }));
const row = (id: string, name: string): AlbumRow => ({ id, name, size: '8x8', sizeLabel: '8×8', pages: 40, updatedAt: '2026-11-04T10:00:00Z' });

beforeEach(() => {
  mockNav.push.mockClear();
  mockList.albums = [row('a1', 'Beach week'), row('a2', 'HK 2026')];
  mockCloud.online = true;
  mockCloud.onScreen = undefined;
  mockCloud.asked = [];
  mockCloud.hold = false;
  mockCloud.release = null;
  mockCloud.rows = { a1: { title: 'Beach week', pages: madePages }, a2: { title: 'HK 2026', pages: madePages } };
  mockCloud.page = 0;
  mockCloud.steps = [];
});

describe('My albums opens the album you tap', () => {
  it('each album says Open, and tapping it opens that album at its pages', async () => {
    await render(<Albums />);
    expect(screen.getByTestId('album-open-a1')).toHaveTextContent(/Open/);
    expect(screen.getByRole('button', { name: /Open Beach week/ })).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('album-open-a2'));
    expect(mockCloud.asked).toEqual(['a2']);
    expect(mockNav.push).toHaveBeenCalledWith('/preview');
  });

  it('it opens at its cover, not at the page the album before it was left on (Mother, round 4: page 37 of the last one)', async () => {
    mockCloud.page = 36;
    await render(<Albums />);
    await fireEvent.press(screen.getByTestId('album-open-a2'));
    expect(mockCloud.steps).toEqual(['page 0', 'push /preview']);
  });

  it('while it opens, the card says so and a second tap opens nothing else', async () => {
    mockCloud.hold = true;
    await render(<Albums />);
    fireEvent.press(screen.getByTestId('album-open-a1'));
    expect(await screen.findByText('Opening…')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('album-open-a2'));
    expect(mockCloud.asked).toEqual(['a1']);
    mockCloud.release?.();
    await waitFor(() => expect(mockNav.push).toHaveBeenCalledTimes(1));
    expect(mockNav.push).toHaveBeenCalledTimes(1);
    expect(mockNav.push).toHaveBeenCalledWith('/preview');
  });

  it('when it cannot be read, it stays on My albums and says why, in plain words', async () => {
    mockCloud.online = false;
    await render(<Albums />);
    await fireEvent.press(screen.getByTestId('album-open-a1'));
    expect(screen.getByText('Could not open Beach week. Check that the phone is online, then try again.')).toBeOnTheScreen();
    expect(mockNav.push).not.toHaveBeenCalled();
    // Online again: the same tap opens it.
    mockCloud.online = true;
    await fireEvent.press(screen.getByTestId('album-open-a1'));
    expect(mockNav.push).toHaveBeenCalledWith('/preview');
    expect(screen.queryByText(/Could not open/)).toBeNull();
  });
});
