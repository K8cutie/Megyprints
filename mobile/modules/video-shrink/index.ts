/* The app's own native module that shrinks a memory video on the phone
   (android/src/main/java/expo/modules/megyvideoshrink/VideoShrinkModule.kt):
   one MP4 (HEVC when the phone has a hardware HEVC encoder that can make the
   full size, else H.264, with AAC sound) with its short side at most 720 (Standard) or 1080
   (HD) pixels, at most 30 frames a second, at the tier's bitrate, as the
   website's videoTranscode.ts does in the browser. Google's Media3
   Transformer does the work.

   An APK made before this module has none: videoShrinkAvailable is false and
   the video is kept as picked (the website does the same when its browser
   can't shrink). */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface VideoProbe {
  /** As shown (rotation applied). 0 = unknown. */
  width: number;
  height: number;
  /** -1 = unknown. */
  durationMs: number;
  hasAudio: boolean;
}

interface NativeVideoShrink {
  probe(uri: string): Promise<VideoProbe>;
  shrink(input: string, output: string, options: { shortEdge: number; videoBitrate: number; frameRate: number; hevcBitrate?: number; hdrMode?: number }): Promise<{ uri: string; size: number; codec?: 'hevc' | 'h264' }>;
  cancel(): Promise<boolean>;
  addListener(event: 'onShrinkProgress', listener: (e: { output: string; progress: number }) => void): { remove(): void };
}

const native = requireOptionalNativeModule<NativeVideoShrink>('MegyVideoShrink');

export const videoShrinkAvailable = !!native;

/** The video's length and size as shown; null without the module. */
export async function probeVideo(uri: string): Promise<VideoProbe | null> {
  if (!native) return null;
  try { return await native.probe(uri); } catch { return null; }
}

/** Shrink `input` into `output` (a file:// uri or path) for a quality
 *  target; progress 0–1. Rejects when it can't (the caller keeps the original).
 *  With `hevcBitrate`, HEVC when the phone can make it (owner, 2026-11-21);
 *  if HEVC fails on this phone, or comes out smaller than asked
 *  (ERR_HEVC_SMALL), H.264 at `bitrate` as before. */
export async function shrinkVideo(
  input: string,
  output: string,
  target: { shortEdge: number; bitrate: number; hevcBitrate?: number },
  onProgress: (fraction: number) => void = () => {},
): Promise<{ uri: string; size: number; codec?: 'hevc' | 'h264' }> {
  if (!native) throw new Error('This app version cannot shrink videos.');
  const outPath = output.replace(/^file:\/\//, '');
  const sub = native.addListener('onShrinkProgress', (e) => { if (e.output === outPath) onProgress(Math.max(0, Math.min(1, e.progress))); });
  const base = { shortEdge: target.shortEdge, videoBitrate: target.bitrate, frameRate: 30 };
  try {
    if (target.hevcBitrate) {
      try {
        return await native.shrink(input, outPath, { ...base, hevcBitrate: target.hevcBitrate });
      } catch (e) {
        // Stopped on purpose: stay stopped. Anything else: today's H.264.
        if ((e as { code?: string })?.code === 'ERR_CANCELLED') throw e;
      }
    }
    return await shrinkWithHdrWays((o) => native.shrink(input, outPath, { ...base, ...o }), Number(Platform.Version) || 0);
  } finally {
    sub.remove();
  }
}

/** Composition.HDR_MODE_* (Media3). */
export const HDR_MODE = { toneMapMediaCodec: 1, readAsNormal: 3 } as const;

/** A shrink failed in a way an HDR video fails (its frames, or HDR itself). */
export function isHdrFailure(e: unknown): boolean {
  const msg = `${(e as { message?: string })?.message ?? ''}`;
  return /FRAME_PROCESSING|HDR|DECODING_FORMAT_UNSUPPORTED|ENCODING_FORMAT_UNSUPPORTED/i.test(msg);
}

/** H.264, the native default first (an HDR video tone-mapped with OpenGL);
 *  when that fails the way HDR does (MP-2026-9M5572U: a phone without
 *  GL_EXT_YUV_target), the phone's own decoder tone-maps it (Android 12+),
 *  and last the HDR video is read as a normal one (its colours a little
 *  flat, but it is sent). Any other failure, or the last one: rejected, and
 *  the caller keeps the original (and says it is too big before any order). */
export async function shrinkWithHdrWays<T>(shrink: (o: { hdrMode?: number }) => Promise<T>, androidVersion: number): Promise<T> {
  try {
    return await shrink({});
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_CANCELLED' || !isHdrFailure(e)) throw e;
    if (androidVersion >= 31) {
      try { return await shrink({ hdrMode: HDR_MODE.toneMapMediaCodec }); } catch (e2) { if ((e2 as { code?: string })?.code === 'ERR_CANCELLED') throw e2; }
    }
    if (androidVersion >= 29) return shrink({ hdrMode: HDR_MODE.readAsNormal });
    throw e;
  }
}

/** Stop the video being shrunk. */
export async function cancelShrink(): Promise<void> {
  if (native) await native.cancel().catch(() => false);
}
