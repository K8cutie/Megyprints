/* ══════════════════════════════════════════════════════════════════════════
   "REPLACE VIDEO" IN MY MEMORIES (the website's MyMemories.tsx replaceClip):
   the same code and printed QR, a new video. The picked video is checked
   (the website's words), uploaded over the old one, and the memory points at
   it with a NEW address (the same file with a version, "?v=…"): every phone
   that played the old video keeps it cached a year under the old address.

   One step more than the website: EVERY replacement is shrunk on the phone
   first, like a new video (HD, HEVC where the phone can make it, so nothing
   the album paid for is lost). Before 2.1.5 only a video over the bucket's
   limit was, so a 2-minute phone video (about 116 MB) went up as recorded and
   the free plan's 50 MB cap refused it (owner, 2026-11-21: "Keep, fix it").
   The shrunk copy is kept only when it is smaller; the customer sees how far
   it has got. It is made at the quality the album's videos were paid for
   (replaceQuality), as a new video is: always-HD made a 110 s video 64 MB on
   a phone without an HEVC chip (emulator, 2026-11-21), over the 50 MB cap.

   And as long as the album paid for (replaceLimits): up to 3 or 5 minutes
   when an order printing this QR bought longer videos (orders.video_minutes,
   0067), else 2 (owner, 2026-11-21: "Yes, fix it"). Before, a replacement
   was always up to 2 minutes, even on an album that paid for 5.
   ══════════════════════════════════════════════════════════════════════════ */
import { HEVC_BITRATES, QUALITY_TARGETS, versionedClipUrl, type ClipExt, type ClipQuality, type StagedClip } from './clips';
import { memoryCodesInSnapshot } from './memories';
import { checkPicked, type PickedVideo } from '../../editor/memories/memoryFlow';
import { BASE_VIDEO_SECONDS, LONGEST_VIDEO_SECONDS } from '@web/lib/pricing';

export const REPLACED = 'Video replaced ✓ — same QR, new memory';
export const NOT_REPOINTED = 'Uploaded, but could not re-point the QR. Try again.';
export const REPLACE_FAILED = 'Could not replace the video.';
export const preparingVideo = (fraction: number) =>
  `Preparing the video… ${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
export const UPLOADING_VIDEO = 'Uploading the video…';

export interface ReplaceDeps {
  /** clips.ts uploadClip (upsert when `replace`). */
  upload(clip: Pick<StagedClip, 'code' | 'ext' | 'uri' | 'size' | 'replace'>): Promise<void>;
  /** The phone's shrinker (progress 0–1); null when this APK has none. */
  shrink: ((
    input: string,
    target: { shortEdge: number; bitrate: number; hevcBitrate?: number },
    onProgress: (fraction: number) => void,
  ) => Promise<{ uri: string; size: number }>) | null;
  relink(code: string, destination: string): Promise<boolean>;
  /** The quality and length the album paid for (replaceLimits on the
   *  account's orders); none, or it fails: NO_ORDER_LIMITS. */
  limits?(code: string): Promise<ReplaceLimits>;
  supabaseUrl: string;
  now(): number;
}

/** The orders' part replaceLimits reads. `video_minutes` is absent before
 *  0067 (every video up to 2 minutes). */
export interface OrderVideoQuality { hd_memories: boolean | null; status: string; album_snapshot: unknown; video_minutes?: number | null }

/** What a replacement may be: made at `quality`, up to `maxSeconds` long. */
export interface ReplaceLimits { quality: ClipQuality; maxSeconds: number }

/** No order read: HD (never less quality than was paid for) and 2 minutes
 *  (never longer than was paid for). */
export const NO_ORDER_LIMITS: ReplaceLimits = { quality: 'hd', maxSeconds: BASE_VIDEO_SECONDS };

/** Replace video's limits, from the orders that print this QR (not
 *  cancelled). Quality: HD when one paid for HD videos (orders.hd_memories),
 *  Standard when all are Standard. Length: the longest any paid for
 *  (orders.video_minutes 3 or 5), else 2 minutes. No such order:
 *  NO_ORDER_LIMITS. */
export function replaceLimits(orders: readonly OrderVideoQuality[] | null, code: string): ReplaceLimits {
  const printing = (orders ?? []).filter((o) => o.status !== 'cancelled' && memoryCodesInSnapshot(o.album_snapshot).includes(code));
  if (!printing.length) return NO_ORDER_LIMITS;
  const seconds = (m: number | null | undefined) => (m === 5 ? LONGEST_VIDEO_SECONDS : m === 3 ? 180 : BASE_VIDEO_SECONDS);
  return {
    quality: printing.some((o) => o.hd_memories) ? 'hd' : 'standard',
    maxSeconds: Math.max(...printing.map((o) => seconds(o.video_minutes))),
  };
}

/** The video replaced, or the words why not. `destination`: the memory's new
 *  address. `onStep`: the words for where it has got, while it works. */
export async function replaceMemoryVideo(
  code: string,
  v: PickedVideo,
  d: ReplaceDeps,
  onStep: (text: string) => void = () => {},
): Promise<{ ok: true; text: string; destination: string } | { ok: false; text: string }> {
  const limits = d.limits ? await d.limits(code).catch(() => NO_ORDER_LIMITS) : NO_ORDER_LIMITS;
  const checked = checkPicked(v, limits.maxSeconds);
  if (!checked.ok) return { ok: false, text: checked.error };
  try {
    let file: { uri: string; size: number; ext: ClipExt } = { uri: v.uri, size: v.size, ext: checked.ext };
    if (d.shrink) {
      onStep(preparingVideo(0));
      const q = limits.quality;
      const out = await d.shrink(file.uri, { ...QUALITY_TARGETS[q], hevcBitrate: HEVC_BITRATES[q] }, (f) => onStep(preparingVideo(f)))
        .catch(() => null);
      if (out && out.size > 0 && out.size < file.size) file = { uri: out.uri, size: out.size, ext: 'mp4' };
    }
    onStep(UPLOADING_VIDEO);
    await d.upload({ code, ext: file.ext, uri: file.uri, size: file.size, replace: true });
    const next = versionedClipUrl(code, file.ext, d.now(), d.supabaseUrl);
    if (!(await d.relink(code, next))) return { ok: false, text: NOT_REPOINTED };
    return { ok: true, text: REPLACED, destination: next };
  } catch (e) {
    return { ok: false, text: e instanceof Error && e.message ? e.message : REPLACE_FAILED };
  }
}
