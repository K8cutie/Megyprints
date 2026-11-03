/* ══════════════════════════════════════════════════════════════════════════
   "CHOOSE FROM FILES" OPENS IN THE PHONE'S CAMERA FOLDER (owner, 2026-11-02:
   "when selecting pictures please make the phone's photo folder the default
   directory"). Android's Files picker opened wherever it liked (often
   Downloads), and expo-document-picker can't say where to start, so the
   app's own photo module opens it (modules/photo-files pickPhotos):
     • it asks Android for photos, many at once, starting in DCIM/Camera, and
       reads only the picker's answer (nothing copied);
     • its answer becomes album photos exactly as before (filesToPhotos);
     • closed without picking: nothing;
     • an APK without it: the older picker, as before.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { getDocumentAsync } from 'expo-document-picker';
import { pickFromFiles } from '../src/lib/filePhotos';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
const mockNative: { value: Record<string, jest.Mock> | null } = { value: null };
jest.mock('expo', () => ({ requireOptionalNativeModule: () => new Proxy({}, { get: (_t, k: string) => mockNative.value?.[k], has: () => true }) }));

const KT = fs.readFileSync(path.join(__dirname, '..', 'modules/photo-files/android/src/main/java/expo/modules/megyphotofiles/PhotoFilesModule.kt'), 'utf8').replace(/\r\n/g, '\n');
const uri = (n: number) => `content://com.android.externalstorage.documents/document/primary%3ADCIM%2FCamera%2FIMG_${n}.jpg`;
const describe1 = (uris: string[]) => uris.map((u) => ({ uri: u, kept: true, readable: true, width: 4000, height: 3000, rotation: 0, takenAt: '2026:10:26 14:03:12', takenOffset: '+08:00' }));

beforeEach(() => { (getDocumentAsync as jest.Mock).mockReset(); });

describe('the app\'s own Files picker', () => {
  it('its answer becomes album photos as before; the older picker is not opened', async () => {
    const pickPhotos = jest.fn(async () => ({
      canceled: false,
      assets: [
        { uri: uri(1), name: 'IMG_1.jpg', mimeType: 'image/jpeg', size: 2_000_000, lastModified: 1_761_000_000_000 },
        { uri: uri(2), name: 'IMG_2.heic', mimeType: 'image/heic', size: null, lastModified: null },
      ],
    }));
    const describe = jest.fn(async (uris: string[]) => describe1(uris));
    mockNative.value = { pickPhotos, describe };
    const pick = await pickFromFiles(55);
    expect(pickPhotos).toHaveBeenCalledTimes(1);
    expect(getDocumentAsync).not.toHaveBeenCalled();
    expect(describe).toHaveBeenCalledWith([uri(1), uri(2)]);
    expect(pick!.photos.map((p) => [p.uri, p.name, p.mimeType, p.size ?? null, p.modifiedAt, p.width, p.source])).toEqual([
      [uri(1), 'IMG_1.jpg', 'image/jpeg', 2_000_000, 1_761_000_000_000, 4000, 'files'],
      [uri(2), 'IMG_2.heic', 'image/heic', null, null, 4000, 'files'],
    ]);
    expect(pick!.kept).toEqual([uri(1), uri(2)]);
  });

  it('closed without picking: nothing', async () => {
    mockNative.value = { pickPhotos: jest.fn(async () => ({ canceled: true, assets: [] })), describe: jest.fn() };
    expect(await pickFromFiles()).toBeNull();
    expect(getDocumentAsync).not.toHaveBeenCalled();
  });

  it('an APK without it: the older picker, photos only, many at once, nothing copied', async () => {
    mockNative.value = { describe: jest.fn(async (uris: string[]) => describe1(uris)) };
    (getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    expect(await pickFromFiles()).toBeNull();
    expect(getDocumentAsync).toHaveBeenCalledWith({ type: 'image/*', multiple: true, copyToCacheDirectory: false });
  });
});

describe('what it asks Android for', () => {
  it('photos, many at once, starting in the camera folder; only the picker\'s answer is read', () => {
    expect(KT).toContain('private const val CAMERA_FOLDER_ID = "primary:DCIM/Camera"');
    expect(KT).toContain('AsyncFunction("pickPhotos")');
    expect(KT).toContain('Intent(Intent.ACTION_OPEN_DOCUMENT)');
    expect(KT).toContain('addCategory(Intent.CATEGORY_OPENABLE)');
    expect(KT).toContain('type = "image/*"');
    expect(KT).toContain('putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)');
    expect(KT).toContain('putExtra(DocumentsContract.EXTRA_INITIAL_URI, DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", CAMERA_FOLDER_ID))');
    expect(KT).toContain('if (requestCode != PICK_PHOTOS_CODE) return@OnActivityResult');
    const picked = KT.slice(KT.indexOf('private fun pickedFile'), KT.indexOf('private fun pickedFile') + 1200);
    expect(picked).not.toContain('openInputStream');
  });
});
