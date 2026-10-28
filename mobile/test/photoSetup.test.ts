/* The photo permission set-up that lives in git (android/ is made by
   prebuild), the app's own native module, and the words on the photo
   screens. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as words from '../src/lib/pickWords';

const root = path.join(__dirname, '..');
const appJson = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')) as {
  expo: { android: { blockedPermissions?: string[] }; plugins: (string | [string, Record<string, unknown>])[] };
};

describe('photo access set-up', () => {
  const mediaPlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-media-library') as [string, Record<string, unknown>] | undefined;

  it('asks for photos only: no videos, no music, no photo locations', () => {
    expect(mediaPlugin).toBeDefined();
    expect(mediaPlugin![1].granularPermissions).toEqual(['photo']);
    expect(mediaPlugin![1].isAccessMediaLocationEnabled).toBe(false);
  });

  it('keeps permissions the app does not need out of the Android manifest', () => {
    expect(appJson.expo.android.blockedPermissions).toEqual(expect.arrayContaining([
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.ACCESS_MEDIA_LOCATION',
    ]));
    // READ_MEDIA_IMAGES (all photos) and READ_MEDIA_VISUAL_USER_SELECTED
    // (Android 14 "Allow limited access") must stay.
    expect(appJson.expo.android.blockedPermissions).not.toContain('android.permission.READ_MEDIA_IMAGES');
    expect(appJson.expo.android.blockedPermissions).not.toContain('android.permission.READ_MEDIA_VISUAL_USER_SELECTED');
  });

  it('the app\'s own Files module is an Android Expo module autolinking finds', () => {
    const cfg = JSON.parse(readFileSync(path.join(root, 'modules', 'photo-files', 'expo-module.config.json'), 'utf8')) as { platforms: string[]; android: { modules: string[] } };
    expect(cfg.platforms).toEqual(['android']);
    expect(cfg.android.modules).toEqual(['expo.modules.megyphotofiles.PhotoFilesModule']);
    const kt = readFileSync(path.join(root, 'modules', 'photo-files', 'android', 'src', 'main', 'java', 'expo', 'modules', 'megyphotofiles', 'PhotoFilesModule.kt'), 'utf8');
    expect(kt).toMatch(/Name\("MegyPhotoFiles"\)/);
    expect(kt).toMatch(/takePersistableUriPermission/);
    expect(kt).toMatch(/inJustDecodeBounds = true/); // reads the size without loading the picture
    const js = readFileSync(path.join(root, 'modules', 'photo-files', 'index.ts'), 'utf8');
    expect(js).toMatch(/requireOptionalNativeModule<PhotoFilesNative>\('MegyPhotoFiles'\)/);
  });

  it('Files never copies a photo into the app', () => {
    const src = readFileSync(path.join(root, 'src', 'lib', 'filePhotos.ts'), 'utf8');
    expect(src).toMatch(/copyToCacheDirectory: false/);
    expect(src).toMatch(/multiple: true/);
    expect(src).toMatch(/type: 'image\/\*'/);
  });
});

describe('words on the photo screens', () => {
  it('asks for photo access in plain words', () => {
    expect(words.ASK_LINE).toBe('Megy Prints needs to see your photos so you can pick them for your album.');
    expect(words.ALLOW_PHOTOS).toBe('Allow access to photos');
    expect(words.FILES).toBe('Choose from Files');
  });

  it('short, plain sentences: no Tagalog, no "slow 3G", no taglines', () => {
    for (const [name, text] of Object.entries(words)) {
      expect([name, /\b(po|naman|ang|mga|ito)\b/i.test(text)]).toEqual([name, false]);
      expect([name, /3G/i.test(text)]).toEqual([name, false]);
      expect([name, text.split(/[.!?]/).every((s) => s.trim().split(/\s+/).length <= 20)]).toEqual([name, true]);
    }
  });
});
