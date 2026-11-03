/* The app's own native module that shrinks a memory video on the phone
   (android/src/main/java/expo/modules/megyvideoshrink/VideoShrinkModule.kt):
   one H.264 + AAC MP4 with its short side at most 720 (Standard) or 1080
   (HD) pixels, at most 30 frames a second, at the tier's bitrate, as the
   website's videoTranscode.ts does in the browser. Google's Media3
   Transformer does the work.

   An APK made before this module has none: videoShrinkAvailable is false and
   the video is kept as picked (the website does the same when its browser
   can't shrink). */
import { requireOptionalNativeModule } from 'expo';

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
  shrink(input: string, output: string, options: { shortEdge: number; videoBitrate: number; frameRate: number }): Promise<{ uri: string; size: number }>;
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
 *  target; progress 0–1. Rejects when it can't (the caller keeps the original). */
export async function shrinkVideo(
  input: string,
  output: string,
  target: { shortEdge: number; bitrate: number },
  onProgress: (fraction: number) => void = () => {},
): Promise<{ uri: string; size: number }> {
  if (!native) throw new Error('This app version cannot shrink videos.');
  const outPath = output.replace(/^file:\/\//, '');
  const sub = native.addListener('onShrinkProgress', (e) => { if (e.output === outPath) onProgress(Math.max(0, Math.min(1, e.progress))); });
  try {
    return await native.shrink(input, outPath, { shortEdge: target.shortEdge, videoBitrate: target.bitrate, frameRate: 30 });
  } finally {
    sub.remove();
  }
}

/** Stop the video being shrunk. */
export async function cancelShrink(): Promise<void> {
  if (native) await native.cancel().catch(() => false);
}
