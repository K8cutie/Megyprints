/* ══════════════════════════════════════════════════════════════════════════
   MY ALBUMS DELETES AN ALBUM (owner, 2026-11-05: "ive created so much test
   album. Do i have an option to delete existing albums?", "add it", "just add a
   warning that album deletion is permanent"). The website has had it in Your
   Projects; the app does the same with the same delete (useAlbumSyncWith). An
   order keeps its own copy of the album (0002: album_id on delete set null).
   ══════════════════════════════════════════════════════════════════════════ */
import { Alert, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { AlbumRow } from '../src/lib/albums';
import { DELETE_ALBUM_TITLE, deleteAlbumMessage } from '../src/lib/albums';

const mockList: { albums: AlbumRow[]; remove: jest.Mock } = { albums: [], remove: jest.fn() };
const mockPhone: { onScreen: string | undefined; letGo: jest.Mock; clearDraft: jest.Mock } = { onScreen: undefined, letGo: jest.fn(), clearDraft: jest.fn() };

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Redirect: () => null }));
jest.mock('../src/lib/auth', () => ({ useAuth: () => ({ session: { user: { id: 'user-1' } }, loading: false }) }));
jest.mock('../src/lib/draftStore', () => ({ useDraft: () => ({ clear: mockPhone.clearDraft }) }));
jest.mock('../src/lib/useMyAlbums', () => ({
  useMyAlbums: () => ({ albums: mockList.albums, loading: false, failed: false, retrying: false, retry: jest.fn(), remove: mockList.remove }),
}));
jest.mock('../src/builder/BuilderProvider', () => ({
  useBuilder: () => ({
    builder: {
      albumTitle: 'x', albumPages: [], uploadedPhotos: [], isLoadingCloud: false, lastSavedAt: null,
      getAlbumId: () => mockPhone.onScreen, goToPage: jest.fn(), loadAlbum: jest.fn(), letDeletedAlbumGo: mockPhone.letGo,
    },
    platform: { deviceStore: { getItem: () => null, setItem: () => {} } },
  }),
}));

import Albums from '../src/app/albums';

const row = (id: string, name: string): AlbumRow => ({ id, name, size: '8x8', sizeLabel: '8×8', pages: 40, updatedAt: '2026-11-04T00:00:00Z' } as AlbumRow);

/** The question Android shows, and what it asked. */
let asked: { title: string; message: string; buttons: AlertButton[] } | null = null;
beforeEach(() => {
  asked = null;
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    asked = { title: title ?? '', message: message ?? '', buttons: buttons ?? [] };
  });
  mockList.albums = [row('a1', 'Beach week'), row('a2', 'HK 2026')];
  mockList.remove = jest.fn(async () => true);
  mockPhone.onScreen = undefined;
  mockPhone.letGo.mockClear();
  mockPhone.clearDraft.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });

const tapDelete = async (id: string) => { await fireEvent.press(screen.getByTestId(`album-delete-${id}`)); };
const answer = async (text: string) => { await act(async () => { await asked!.buttons.find((b) => b.text === text)!.onPress?.(); }); };

describe('the words', () => {
  it('say it is permanent, plainly, and that orders stay', () => {
    expect(DELETE_ALBUM_TITLE).toBe('Delete this album?');
    const words = deleteAlbumMessage('Beach week');
    expect(words).toContain('Beach week');
    expect(words).toMatch(/permanent/);
    expect(words).toMatch(/can't get it back/);
    expect(words).toMatch(/orders stay/i);
  });
});

describe('each album has Delete', () => {
  it('named for TalkBack, and big enough for a thumb', async () => {
    await render(<Albums />);
    const del = screen.getByTestId('album-delete-a1');
    expect(del.props.accessibilityLabel).toBe('Delete Beach week');
    expect(screen.getByTestId('album-delete-a2')).toBeOnTheScreen();
  });

  it('it asks first, and nothing is deleted until the answer is yes', async () => {
    await render(<Albums />);
    await tapDelete('a1');
    expect(asked!.title).toBe(DELETE_ALBUM_TITLE);
    expect(asked!.message).toBe(deleteAlbumMessage('Beach week'));
    expect(asked!.buttons.map((b) => b.text)).toEqual(['Keep it', 'Delete album']);
    expect(asked!.buttons[1].style).toBe('destructive');
    expect(mockList.remove).not.toHaveBeenCalled();
    await answer('Keep it');
    expect(mockList.remove).not.toHaveBeenCalled();
  });

  it('yes deletes that album; another album on the phone is left alone', async () => {
    mockPhone.onScreen = 'a2';
    await render(<Albums />);
    await tapDelete('a1');
    await answer('Delete album');
    expect(mockList.remove).toHaveBeenCalledWith('a1');
    expect(mockPhone.letGo).not.toHaveBeenCalled();
    expect(mockPhone.clearDraft).not.toHaveBeenCalled();
  });

  it('the album on the phone: the phone lets it go too, so it is not saved back', async () => {
    mockPhone.onScreen = 'a1';
    await render(<Albums />);
    await tapDelete('a1');
    await answer('Delete album');
    expect(mockList.remove).toHaveBeenCalledWith('a1');
    expect(mockPhone.letGo).toHaveBeenCalledTimes(1);
    expect(mockPhone.clearDraft).toHaveBeenCalledTimes(1);
  });

  it('when it could not be deleted: it says so on the card, and the phone keeps the album', async () => {
    mockPhone.onScreen = 'a1';
    mockList.remove = jest.fn(async () => false);
    await render(<Albums />);
    await tapDelete('a1');
    await answer('Delete album');
    expect(screen.getByText('Could not delete Beach week. Check that the phone is online, then try again.')).toBeOnTheScreen();
    expect(mockPhone.letGo).not.toHaveBeenCalled();
  });
});
