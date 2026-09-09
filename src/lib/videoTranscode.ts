/* ── Memory-clip transcode (browser-side) ──────────────────────────────────
   A phone records what it likes: 4K/60 at ~400 MB a minute, HEVC, portrait
   with rotation metadata. What a scanned memory page needs is the opposite —
   one small H.264/AAC MP4 with the moov atom at the FRONT so it starts
   playing on the first bytes, on whatever phone scans the printed page.

   So every picked clip is re-encoded here before it is staged:

     · A 700 MB 4K clip becomes ~30-70 MB. Controlling the OUTPUT is what
       replaced the old 100 MB input cap, which rejected ordinary phone video
       (2026-09-10) — the customer had no way to fix it inside the app.
     · H.264 + AAC in MP4 is the ONLY combination every scanner plays. WebM
       (what MediaRecorder produces on Android) does not play on iPhones, so
       an Android-made memory would be dead for half the family. That is why
       this goes through WebCodecs and a muxer rather than MediaRecorder.
     · Two quality tiers (owner, 2026-09-10): STANDARD 720p is included with
       every album, HD 1080p is a one-time paid upgrade. The tier is chosen
       when the first memory is added, so each clip is encoded straight to its
       target — there is no second pass and nothing to re-encode at checkout.

   Runs at roughly 1x real time in the BACKGROUND after the QR is placed, so
   the 3-tap add flow is untouched. Every failure path degrades to "keep the
   original file" — a memory is never lost to a transcode problem.        */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export type ClipQuality = 'standard' | 'hd';

/** Long edge, short edge and bitrate per tier. A 2-minute HD clip lands near
 *  67 MB — inside the bucket's 100 MB object limit with room for audio and
 *  container overhead. Standard is roughly half that. */
export const QUALITY_TARGETS: Record<ClipQuality, { longEdge: number; shortEdge: number; bitrate: number; label: string }> = {
  standard: { longEdge: 1280, shortEdge: 720, bitrate: 2_200_000, label: '720p' },
  hd: { longEdge: 1920, shortEdge: 1080, bitrate: 4_500_000, label: '1080p' },
};

export const AUDIO_BITRATE = 128_000;
/** A keyframe every 2s so a scanner can seek without re-downloading. */
const KEYFRAME_INTERVAL_SEC = 2;
/** Frames the encoder may have queued before we pause the source. Without
 *  this a slow phone queues every frame of a 2-minute clip (~3 MB each as a
 *  VideoFrame) and the tab is killed. */
const MAX_QUEUED_FRAMES = 24;
/** Phone cameras shoot 24-60 fps; 30 is a safe encode target and the muxer
 *  takes real per-frame timestamps regardless, so motion stays correct. */
const TARGET_FPS = 30;
/** AVC profiles to try, most-compatible first. All reach level 4.0 (1080p). */
const AVC_CODECS = ['avc1.4d0028', 'avc1.640028', 'avc1.42002a', 'avc1.42001f'];
const AAC_CODEC = 'mp4a.40.2';

export interface TranscodeResult {
  blob: Blob;
  width: number;
  height: number;
  /** False when the source carried no audio (a silent recording). */
  hasAudio: boolean;
}

/** Everything the pipeline needs. When false the original file is kept. */
export function transcodeSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype
  );
}

/** Output dimensions for a source frame: never upscale, cap the long edge and
 *  the short edge for the tier (so portrait clips stay portrait), and round to
 *  even — H.264 cannot encode odd dimensions. */
export function targetDimensions(w: number, h: number, quality: ClipQuality = 'hd'): { width: number; height: number } {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 };
  const t = QUALITY_TARGETS[quality];
  const scale = Math.min(1, t.longEdge / Math.max(w, h), t.shortEdge / Math.min(w, h));
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(w * scale), height: even(h * scale) };
}

/** First AVC config the device will actually encode. Prefers the hardware
 *  encoder — a phone doing 1080p in software drops frames and overheats. */
async function pickVideoConfig(width: number, height: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
    for (const codec of AVC_CODECS) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: TARGET_FPS,
        hardwareAcceleration,
        // mp4-muxer needs avcC-style descriptions, not Annex-B start codes.
        avc: { format: 'avc' },
      };
      try {
        if ((await VideoEncoder.isConfigSupported(config)).supported) return config;
      } catch { /* try the next combination */ }
    }
  }
  return null;
}

/** Load the file into a hidden <video> and wait for its metadata. */
function loadVideo(file: Blob): Promise<{ el: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'auto';
    el.muted = true;        // required for programmatic play() on mobile
    el.playsInline = true;  // iOS: never go fullscreen
    // Attached but invisible: a detached element is throttled, and iOS refuses
    // to decode one at all, which stalls the frame pump.
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const fail = () => {
      URL.revokeObjectURL(url);
      el.remove();
      reject(new Error('This video could not be read on this device.'));
    };
    el.onerror = fail;
    el.onloadedmetadata = () => {
      if (!(el.videoWidth > 0) || !(el.videoHeight > 0)) { fail(); return; }
      resolve({ el, url });
    };
    document.body.appendChild(el);
    el.src = url;
  });
}

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

/** Decode the source's audio to PCM. null = the clip is genuinely silent (no
 *  audio track, or a container this device cannot decode). The whole file has
 *  to be in memory for this, which is what the input-size cap guards. */
async function decodePcm(file: Blob): Promise<AudioBuffer | null> {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  const ctx = new Ctor();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    return decoded.length > 0 && decoded.numberOfChannels > 0 ? decoded : null;
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

/** Encode decoded PCM as AAC into the muxer. */
async function encodeAudioTrack(
  pcm: AudioBuffer,
  channels: number,
  muxer: Muxer<ArrayBufferTarget>,
): Promise<void> {
  let failure: Error | null = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => { failure = e instanceof Error ? e : new Error(String(e)); },
  });
  encoder.configure({ codec: AAC_CODEC, sampleRate: pcm.sampleRate, numberOfChannels: channels, bitrate: AUDIO_BITRATE });

  const FRAMES = 1024;
  for (let offset = 0; offset < pcm.length && !failure; offset += FRAMES) {
    const count = Math.min(FRAMES, pcm.length - offset);
    // f32-planar: each channel's samples laid end to end.
    const data = new Float32Array(count * channels);
    for (let c = 0; c < channels; c++) {
      data.set(pcm.getChannelData(c).subarray(offset, offset + count), c * count);
    }
    const audio = new AudioData({
      format: 'f32-planar',
      sampleRate: pcm.sampleRate,
      numberOfFrames: count,
      numberOfChannels: channels,
      timestamp: Math.round((offset / pcm.sampleRate) * 1e6),
      data,
    });
    encoder.encode(audio);
    audio.close();
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
}

/** Pump frames from the playing <video> into the encoder, resizing on a
 *  canvas. Resolves with the frame count once playback ends. */
function encodeVideoTrack(
  el: HTMLVideoElement,
  encoder: VideoEncoder,
  width: number,
  height: number,
  onProgress?: (fraction: number) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) { reject(new Error('This device cannot process video.')); return; }

    const keyEvery = Math.max(1, Math.round(TARGET_FPS * KEYFRAME_INTERVAL_SEC));
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    let frames = 0;
    let settled = false;
    let paused = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      el.onended = null;
      el.onerror = null;
      if (err) reject(err); else resolve(frames);
    };

    // Backpressure: a phone whose encoder falls behind must not queue the
    // whole clip in memory. Pause the source, resume once the queue drains.
    const pump = () => {
      if (settled) return;
      if (encoder.encodeQueueSize > MAX_QUEUED_FRAMES) {
        if (!paused) { paused = true; el.pause(); }
        setTimeout(pump, 50);
        return;
      }
      if (paused) {
        paused = false;
        void el.play().catch(() => finish(new Error('Playback stopped while processing the video.')));
      }
    };

    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      if (settled) return;
      try {
        ctx.drawImage(el, 0, 0, width, height);
        const frame = new VideoFrame(canvas, {
          timestamp: Math.max(0, Math.round(meta.mediaTime * 1e6)),
          duration: Math.round(1e6 / TARGET_FPS),
        });
        encoder.encode(frame, { keyFrame: frames % keyEvery === 0 });
        frame.close();
        frames++;
        if (duration) onProgress?.(Math.min(1, meta.mediaTime / duration));
        pump();
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      el.requestVideoFrameCallback(onFrame);
    };

    el.onended = () => finish(frames > 0 ? undefined : new Error('No frames could be read from this video.'));
    el.onerror = () => finish(new Error('This video could not be read on this device.'));
    el.requestVideoFrameCallback(onFrame);
    void el.play().catch((e) => finish(e instanceof Error ? e : new Error('This device blocked video playback.')));
  });
}

/**
 * Re-encode `file` to an H.264/AAC MP4 at the tier's resolution, with the moov
 * atom front-loaded. Throws on any failure — callers keep the original file.
 */
export async function transcodeToMp4(
  file: Blob,
  quality: ClipQuality,
  onProgress?: (fraction: number) => void,
): Promise<TranscodeResult> {
  if (!transcodeSupported()) throw new Error('Video processing is not available on this device.');

  const { el, url } = await loadVideo(file);
  const cleanup = () => {
    try { el.pause(); } catch { /* ignore */ }
    el.removeAttribute('src');
    el.load();
    el.remove();
    URL.revokeObjectURL(url);
  };

  try {
    const { width, height } = targetDimensions(el.videoWidth, el.videoHeight, quality);
    if (!width || !height) throw new Error('This video has no readable picture.');
    const videoConfig = await pickVideoConfig(width, height, QUALITY_TARGETS[quality].bitrate);
    if (!videoConfig) throw new Error('This device cannot compress video.');

    // Audio is decoded FIRST: the muxer needs the track's channel count and
    // sample rate at construction, before any chunk can be added.
    const pcm = await decodePcm(file);
    const channels = pcm ? Math.min(2, pcm.numberOfChannels) : 0;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width, height },
      ...(pcm ? { audio: { codec: 'aac' as const, numberOfChannels: channels, sampleRate: pcm.sampleRate } } : {}),
      // moov at the front: the scanner plays on the first bytes instead of
      // waiting for the whole file to arrive.
      fastStart: 'in-memory' as const,
    });

    // A clip WITH sound must never become a silent memory: if AAC encoding
    // fails, throw and keep the original rather than ship silence.
    if (pcm) await encodeAudioTrack(pcm, channels, muxer);

    let encodeError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encodeError = e instanceof Error ? e : new Error(String(e)); },
    });
    encoder.configure(videoConfig);

    const frames = await encodeVideoTrack(el, encoder, width, height, onProgress);
    await encoder.flush();
    encoder.close();
    if (encodeError) throw encodeError;
    if (!frames) throw new Error('No frames could be read from this video.');

    muxer.finalize();
    onProgress?.(1);
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), width, height, hasAudio: !!pcm };
  } finally {
    cleanup();
  }
}
