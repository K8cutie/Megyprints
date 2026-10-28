/* The ML Kit settings the comparison reports describe (src/lib/faceModel.ts
   FACE_MODEL) are the ones the app's native module really uses
   (modules/photo-pixels/.../PhotoPixelsModule.kt takeFaceFinder): if one
   copy changes without the other, this fails. */
import fs from 'node:fs';
import path from 'node:path';
import { FACE_MODEL } from '../src/lib/faceModel';

jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

const KOTLIN = path.join(__dirname, '..', 'modules', 'photo-pixels', 'android', 'src', 'main', 'java', 'expo', 'modules', 'megyphotopixels', 'PhotoPixelsModule.kt');
const kt = fs.readFileSync(KOTLIN, 'utf8');
const gradle = fs.readFileSync(path.join(__dirname, '..', 'modules', 'photo-pixels', 'android', 'build.gradle'), 'utf8');

/** The FaceDetectorOptions builder in takeFaceFinder. */
const builder = /FaceDetectorOptions\.Builder\(\)([\s\S]*?)\.build\(\)/.exec(kt)?.[1] ?? '';
const setting = (name: string) => new RegExp(`\\.${name}\\(FaceDetectorOptions\\.([A-Z_]+)\\)`).exec(builder)?.[1];

describe("FACE_MODEL says what the native module asks ML Kit for", () => {
  it('finds the one options builder', () => {
    expect(kt.match(/FaceDetectorOptions\.Builder\(\)/g)).toHaveLength(1);
    expect(builder).not.toBe('');
  });

  it('the same modes', () => {
    expect(setting('setPerformanceMode')).toBe(`PERFORMANCE_MODE_${FACE_MODEL.performanceMode.toUpperCase()}`);
    expect(setting('setLandmarkMode')).toBe(`LANDMARK_MODE_${FACE_MODEL.landmarks.toUpperCase()}`);
    expect(setting('setClassificationMode')).toBe(`CLASSIFICATION_MODE_${FACE_MODEL.classification.toUpperCase()}`);
    expect(setting('setContourMode')).toBe(`CONTOUR_MODE_${FACE_MODEL.contours.toUpperCase()}`);
  });

  it('the same smallest face', () => {
    expect(builder).toMatch(/\.setMinFaceSize\(MIN_FACE_SIZE\)/);
    const min = /const val MIN_FACE_SIZE = ([\d.]+)f/.exec(kt)?.[1];
    expect(Number(min)).toBe(FACE_MODEL.minFaceSize);
  });

  it('the same library and version', () => {
    const [, name, version] = /^(com\.google\.mlkit:face-detection):([\d.]+) \(bundled model\)$/.exec(FACE_MODEL.library) ?? [];
    expect(gradle).toContain(`"${name}:${version}"`);
  });
});
