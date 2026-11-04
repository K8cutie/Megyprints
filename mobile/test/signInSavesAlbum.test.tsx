/* ══════════════════════════════════════════════════════════════════════════
   SIGNING IN PUTS THE PHONE'S ALBUM IN THE ACCOUNT, FROM ANY SCREEN (beta
   round 2, Mother reproduced 3 times: an album made signed out, then Sign in
   from Home → My albums said "No albums yet"; the album reached the account
   only when the Preview was opened again, or on the builder's 10-minute
   backup). The save "once more when the customer signs in later" lived in the
   Preview alone; it is the whole app's now (BuilderProvider), and My albums
   reads the list again when a save lands.
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { BuilderActions } from '@web/pages/builder/useBuilderState';
import { memoryStore } from '../src/builder/deviceStore';
import { accountSaveDue, useAccountSave } from '../src/builder/accountSave';

const mockListed: { calls: number; rows: unknown[] } = { calls: 0, rows: [] };
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('../src/lib/albums', () => ({
  ALBUMS_RETRY_MS: 20_000,
  listMyAlbums: async () => { mockListed.calls += 1; return mockListed.rows; },
}));
import { useMyAlbums } from '../src/lib/useMyAlbums';

function fakeBuilder(madeAt: number, save: () => Promise<boolean>) {
  return {
    albumPages: madeAt ? [{ madeAt }] : [],
    getAlbumId: () => 'album-1',
    manualSave: jest.fn(save),
  } as unknown as BuilderActions & { manualSave: jest.Mock };
}

describe('the album made on the phone goes to the account when you sign in', () => {
  it('signed out: nothing is sent; signing in sends it once, wherever you are', async () => {
    const store = memoryStore();
    const b = fakeBuilder(1_000, async () => true);
    const { rerender } = await renderHook(({ signedIn }: { signedIn: boolean }) => useAccountSave(b, store, signedIn), { initialProps: { signedIn: false } });
    expect(b.manualSave).not.toHaveBeenCalled();
    await rerender({ signedIn: true });
    await waitFor(() => expect(accountSaveDue(store, 'album-1', 1_000)).toBe(false));
    expect(b.manualSave).toHaveBeenCalledTimes(1);
    // Signed out and in again: it is in the account already.
    await rerender({ signedIn: false });
    await rerender({ signedIn: true });
    expect(b.manualSave).toHaveBeenCalledTimes(1);
  });

  it('a save that did not go through is tried again at the next chance, never twice at once', async () => {
    const store = memoryStore();
    let answer: (ok: boolean) => void = () => {};
    const b = fakeBuilder(1_000, () => new Promise<boolean>((r) => { answer = r; }));
    const { rerender } = await renderHook(({ signedIn }: { signedIn: boolean }) => useAccountSave(b, store, signedIn), { initialProps: { signedIn: true } });
    expect(b.manualSave).toHaveBeenCalledTimes(1);
    // Signed out and in while the first save is still on its way: not sent again.
    await rerender({ signedIn: false });
    await rerender({ signedIn: true });
    expect(b.manualSave).toHaveBeenCalledTimes(1);
    answer(false);
    await waitFor(() => expect(b.manualSave.mock.results[0]).toBeDefined());
    await rerender({ signedIn: false });
    await rerender({ signedIn: true });
    await waitFor(() => expect(b.manualSave).toHaveBeenCalledTimes(2));
  });

  it('no album made yet: nothing to send', async () => {
    const store = memoryStore();
    const b = fakeBuilder(0, async () => true);
    await renderHook(() => useAccountSave(b, store, true));
    expect(b.manualSave).not.toHaveBeenCalled();
  });

  it('the whole app does it (BuilderProvider), not only the Preview', () => {
    const provider = readFileSync(resolve(__dirname, '../src/builder/BuilderProvider.tsx'), 'utf8');
    expect(provider).toMatch(/useAccountSave\(builder, p\.deviceStore, signedIn\)/);
    // One place sends it: the Preview no longer has its own copy.
    const preview = readFileSync(resolve(__dirname, '../src/app/preview.tsx'), 'utf8');
    expect(preview).not.toMatch(/accountSaveDue/);
  });
});

describe('My albums shows an album saved after the list opened', () => {
  beforeEach(() => { mockListed.calls = 0; mockListed.rows = []; });

  it('reads the list again when a save lands, with no "Getting your albums" in between', async () => {
    const { result, rerender } = await renderHook(({ savedAt }: { savedAt: number }) => useMyAlbums('user-1', savedAt), { initialProps: { savedAt: 0 } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.albums).toEqual([]);
    expect(mockListed.calls).toBe(1);
    mockListed.rows = [{ id: 'album-1', name: 'Mother Sync Check' }];
    await rerender({ savedAt: 5_000 });
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.albums).toHaveLength(1));
    expect(mockListed.calls).toBe(2);
  });

  it('My albums passes the builder\'s last save', () => {
    const albums = readFileSync(resolve(__dirname, '../src/app/albums.tsx'), 'utf8');
    expect(albums).toMatch(/useMyAlbums\(userId, builder\.lastSavedAt\?\.getTime\(\) \?\? 0\)/);
  });
});
