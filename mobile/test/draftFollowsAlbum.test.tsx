/* The photos picked on the phone belong to the album on the phone (beta
   round 3): another account signing in, or an album opened from My albums,
   used to keep the last album's picks: "Continue my album" carried them
   into the new account's album, and an opened album listed them as its
   own, ready to be made again from them. */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook } from '@testing-library/react-native';
import type { UploadedPhoto } from '@web/pages/builder/types';
import { draftFromAlbum, useDraftFollowsAlbum } from '../src/lib/draftFollowsAlbum';
import type { DraftPhoto } from '../src/lib/photoDraft';

const photo = (i: number, over: Partial<UploadedPhoto> = {}): UploadedPhoto => ({
  id: `p${i}`, previewUrl: `content://media/external/images/media/${100 + i}`, name: `IMG_${i}.jpg`,
  type: 'image/jpeg', size: 1000 + i, width: 4000, height: 3000, capturedAt: 1_700_000_000_000 + i * 1000, ...over,
});

describe('draftFromAlbum: the album\'s photos on this phone, as picked photos', () => {
  it('each photo by its address on the phone, with what it is', () => {
    const [d] = draftFromAlbum([photo(1)], () => undefined);
    expect(d).toMatchObject({
      key: 'media:101', source: 'gallery', uri: 'content://media/external/images/media/101', name: 'IMG_1.jpg',
      width: 4000, height: 3000, capturedAt: 1_700_000_001_000, size: 1001, mimeType: 'image/jpeg',
    });
  });

  it('a photo from Files stays a Files photo; a left-out photo stays left out', () => {
    const files = photo(2, { previewUrl: 'content://com.android.externalstorage.documents/document/primary%3ADCIM%2Fa.jpg' });
    const [f, l] = draftFromAlbum([files, photo(3, { leftOut: true })], () => undefined);
    expect(f.source).toBe('files');
    expect(f.key).toBe(`files:${files.previewUrl}`);
    expect(l.leftOut).toBe(true);
  });

  it('a photo missing on this phone keeps its old address; one never on this phone is not listed', () => {
    const missing = photo(4, { previewUrl: '' });
    const never = photo(5, { previewUrl: '' });
    const out = draftFromAlbum([missing, never, photo(6)], (id) => (id === 'p4' ? 'content://media/external/images/media/104' : undefined));
    expect(out.map((p) => p.uri)).toEqual(['content://media/external/images/media/104', 'content://media/external/images/media/106']);
  });
});

describe('useDraftFollowsAlbum', () => {
  type Props = { albumId: string | undefined; opening: boolean; photos: UploadedPhoto[] };
  async function setup(first: Props) {
    const replace = jest.fn<void, [DraftPhoto[]]>();
    const hook = await renderHook((p: Props) => useDraftFollowsAlbum(() => p.albumId, p.opening, p.photos, replace, () => undefined), { initialProps: first });
    return { replace, hook };
  }

  it('the app opening on its album keeps the picked photos as they are', async () => {
    const { replace, hook } = await setup({ albumId: 'a', opening: false, photos: [photo(1)] });
    await hook.rerender({ albumId: 'a', opening: false, photos: [photo(1), photo(2)] });
    expect(replace).not.toHaveBeenCalled();
  });

  it('another album opened: once it is in, the picked photos are its photos on this phone', async () => {
    const { replace, hook } = await setup({ albumId: 'a', opening: false, photos: [photo(1)] });
    // Opening: the pages come in first, the id and photos once the phone found them.
    await hook.rerender({ albumId: 'a', opening: true, photos: [photo(1)] });
    expect(replace).not.toHaveBeenCalled();
    await hook.rerender({ albumId: 'b', opening: false, photos: [photo(7), photo(8)] });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0][0].map((p) => p.name)).toEqual(['IMG_7.jpg', 'IMG_8.jpg']);
  });

  it('a fresh album (another account signing in, or Start a new album): no picked photos', async () => {
    const { replace, hook } = await setup({ albumId: 'a', opening: false, photos: [photo(1)] });
    await hook.rerender({ albumId: 'fresh', opening: false, photos: [] });
    expect(replace).toHaveBeenCalledWith([]);
  });

  it('the whole app does it (BuilderProvider)', () => {
    const provider = readFileSync(resolve(__dirname, '../src/builder/BuilderProvider.tsx'), 'utf8');
    expect(provider).toMatch(/useDraftFollowsAlbum\(/);
  });
});
