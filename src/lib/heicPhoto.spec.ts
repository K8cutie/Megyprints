import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   iPHONE PHOTOS (HEIC) IN THE ALBUM (owner, 2026-10-11: "we need heic
   format to be recognized by the album"). Before: with a type from the
   picker, 44 HEIC photos went in with no picture, size or date; without
   one, they were left out as "not a photo". Fixtures are real HEIC files
   (libheif via pillow-heif), 64×48, with EXIF capture dates.
   ══════════════════════════════════════════════════════════════════════════ */

import { looksHeic, isHeifBytes, needsHeicConversion, jpegName, heicToJpeg, toAlbumPhoto, heicConverters } from './heicPhoto';
import { heifExifTiff } from './heifExif';
import { readCaptureTime } from '../pages/builder/exif';
import { kindOfPick } from './pickedFiles';

const fixture = (name: string, type = 'image/heic') =>
  new File([readFileSync(resolve(__dirname, '__fixtures__', name))], name.toUpperCase().replace('.HEIC', '.HEIC'), { type });
const jpegBytes = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])], { type: 'image/jpeg' });

afterEach(() => { vi.restoreAllMocks(); });

describe('knowing a HEIC', () => {
  it('by its type or its name', () => {
    expect(looksHeic({ type: 'image/heic', name: 'x' })).toBe(true);
    expect(looksHeic({ type: 'image/heif', name: 'x' })).toBe(true);
    expect(looksHeic({ type: '', name: 'IMG_4100.HEIC' })).toBe(true);
    expect(looksHeic({ type: '', name: 'photo.heif' })).toBe(true);
    expect(looksHeic({ type: 'image/jpeg', name: 'IMG_4100.JPG' })).toBe(false);
  });

  it('by its bytes, when the picker gave no type (and a JPEG is not one)', async () => {
    expect(await isHeifBytes(fixture('landscape-2026-09-12.heic'))).toBe(true);
    expect(await isHeifBytes(jpegBytes())).toBe(false);
    const unnamed = new File([readFileSync(resolve(__dirname, '__fixtures__', 'no-date.heic'))], 'shared-photo', { type: '' });
    expect(await needsHeicConversion(unnamed)).toBe(true);
    expect(await needsHeicConversion(new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' }))).toBe(false);
  });

  it('a HEIC with no type is a photo, not "left out" (Windows without the HEIC codec)', () => {
    expect(kindOfPick({ type: '', name: 'IMG_4100.HEIC' })).toBe('photo');
    expect(kindOfPick({ type: '', name: 'IMG_4100.heif' })).toBe('photo');
    expect(kindOfPick({ type: 'image/heic', name: 'IMG_4100.HEIC' })).toBe('photo');
  });
});

describe('the capture date (Megy orders pages by it)', () => {
  it('is read from the HEIC itself, even where exifr alone fails (a non-zero base offset)', async () => {
    const tiff = heifExifTiff(readFileSync(resolve(__dirname, '__fixtures__', 'landscape-2026-09-12.heic')));
    expect(tiff).not.toBeNull();
    expect(Buffer.from(tiff!.subarray(0, 4)).toString('hex')).toBe('4d4d002a'); // a TIFF header
    const t = await readCaptureTime(fixture('landscape-2026-09-12.heic'));
    expect(t).not.toBeNull();
    expect(new Date(t!).toISOString().slice(0, 16)).toMatch(/^2026-09-1[12]T/); // 09:37 local, any time zone
    const later = await readCaptureTime(fixture('portrait-2026-09-13.heic'));
    expect(later! - t!).toBeGreaterThan(24 * 3600 * 1000); // and in the right order
  });

  it('a HEIC with no EXIF has no date (not a crash)', async () => {
    expect(heifExifTiff(readFileSync(resolve(__dirname, '__fixtures__', 'no-date.heic')))).toBeNull();
    expect(await readCaptureTime(fixture('no-date.heic'))).toBeNull();
  });

  it('nonsense bytes are no date, never a throw', () => {
    expect(heifExifTiff(new Uint8Array(3))).toBeNull();
    expect(heifExifTiff(new Uint8Array([0, 0, 0, 1, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]))).toBeNull();
    const cut = readFileSync(resolve(__dirname, '__fixtures__', 'landscape-2026-09-12.heic')).subarray(0, 200);
    expect(heifExifTiff(cut)).toBeNull();
  });
});

describe('the JPEG the album keeps', () => {
  it('a HEIC becomes IMG_….jpg, image/jpeg: Safari\'s own decoder first', async () => {
    const native = vi.spyOn(heicConverters, 'native').mockResolvedValue(jpegBytes());
    const lib = vi.spyOn(heicConverters, 'libheif').mockResolvedValue(jpegBytes());
    const out = await heicToJpeg(fixture('landscape-2026-09-12.heic'));
    expect(out.name).toBe('LANDSCAPE-2026-09-12.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(native).toHaveBeenCalledTimes(1);
    expect(lib).not.toHaveBeenCalled();
  });

  it('where the browser can\'t open HEIC (Chrome), libheif does', async () => {
    vi.spyOn(heicConverters, 'native').mockResolvedValue(null);
    const lib = vi.spyOn(heicConverters, 'libheif').mockResolvedValue(jpegBytes());
    const out = await heicToJpeg(fixture('portrait-2026-09-13.heic'));
    expect(lib).toHaveBeenCalledTimes(1);
    expect(out.type).toBe('image/jpeg');
  });

  it('one that can\'t be opened says so by name', async () => {
    vi.spyOn(heicConverters, 'native').mockResolvedValue(null);
    vi.spyOn(heicConverters, 'libheif').mockRejectedValue(new Error('ERR_LIBHEIF'));
    await expect(heicToJpeg(fixture('no-date.heic'))).rejects.toThrow();
  });

  it('a JPEG or PNG passes through untouched', async () => {
    const native = vi.spyOn(heicConverters, 'native');
    const jpg = new File([jpegBytes()], 'a.jpg', { type: 'image/jpeg' });
    expect(await toAlbumPhoto(jpg)).toBe(jpg);
    expect(native).not.toHaveBeenCalled();
  });

  it('names', () => {
    expect(jpegName('IMG_4100.HEIC')).toBe('IMG_4100.jpg');
    expect(jpegName('a.heif')).toBe('a.jpg');
    expect(jpegName('shared-photo')).toBe('shared-photo.jpg');
  });

  it('every other way a photo comes in converts too (source guards)', () => {
    const src = (f: string) => readFileSync(resolve(__dirname, f), 'utf8');
    const state = src('../pages/builder/useBuilderState.ts');
    // The album's photos (both new and put back), replace, and the cover photo.
    expect(state.match(/await toAlbumPhoto\(file\)/g)?.length).toBe(2);
    expect(state).toMatch(/const replacePhoto = useCallback[\s\S]{0,300}void toAlbumPhoto\(file\)/);
    expect(state).toMatch(/const setCoverPhoto = useCallback\(async \(picked: File\) => \{[\s\S]{0,300}await toAlbumPhoto\(picked\)/);
    // A page's own background photo, and a guest's photo at an event.
    expect(src('../pages/builder/BackgroundDesigner.tsx')).toMatch(/void toAlbumPhoto\(file\)\.then/);
    expect(src('./eventImage.ts')).toMatch(/const source = file instanceof File \? await toAlbumPhoto\(file\) : file;\s*const img = await decodeImage\(source\);/);
  });

  it('the converter is loaded only when a HEIC arrives (a dynamic import, the no-eval build)', () => {
    const src = readFileSync(resolve(__dirname, 'heicPhoto.ts'), 'utf8');
    expect(src).toMatch(/await import\('heic-to\/csp'\)/);
    expect(src).not.toMatch(/^import .*heic-to/m);
    // …and the offline cache doesn't download its ~3 MB for every visitor.
    const vite = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf8');
    expect(vite).toMatch(/globIgnores:\s*\[[^\]]*'\*\*\/heic-to-\*\.js'/);
  });
});
