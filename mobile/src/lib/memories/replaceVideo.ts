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
   ══════════════════════════════════════════════════════════════════════════ */
import { HEVC_BITRATES, QUALITY_TARGETS, versionedClipUrl, type ClipExt, type ClipQuality, type StagedClip } from './clips';
import { memoryCodesInSnapshot } from './memories';
import { checkPicked, type PickedVideo } from '../../editor/memories/memoryFlow';

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
  /** The quality to make it at (replaceQuality on the account's orders);
   *  none, or it fails: HD, never less than was paid for. */
  quality?(code: string): Promise<ClipQuality>;
  supabaseUrl: string;
  now(): number;
}

/** The orders' part replaceQuality reads. */
export interface OrderVideoQuality { hd_memories: boolean | null; status: string; album_snapshot: unknown }

/** Replace video's quality: HD when an order that prints this QR paid for HD
 *  videos (orders.hd_memories), Standard when every order printing it is
 *  Standard. No such order (or none read): HD, never less than was paid. */
export function replaceQuality(orders: readonly OrderVideoQuality[] | null, code: string): ClipQuality {
  const printing = (orders ?? []).filter((o) => o.status !== 'cancelled' && memoryCodesInSnapshot(o.album_snapshot).includes(code));
  if (!printing.length) return 'hd';
  return printing.some((o) => o.hd_memories) ? 'hd' : 'standard';
}

/** The video replaced, or the words why not. `destination`: the memory's new
 *  address. `onStep`: the words for where it has got, while it works. */
export async function replaceMemoryVideo(
  code: string,
  v: PickedVideo,
  d: ReplaceDeps,
  onStep: (text: string) => void = () => {},
): Promise<{ ok: true; text: string; destination: string } | { ok: false; text: string }> {
  const checked = checkPicked(v);
  if (!checked.ok) return { ok: false, text: checked.error };
  try {
    let file: { uri: string; size: number; ext: ClipExt } = { uri: v.uri, size: v.size, ext: checked.ext };
    if (d.shrink) {
      onStep(preparingVideo(0));
      const q: ClipQuality = d.quality ? await d.quality(code).catch((): ClipQuality => 'hd') : 'hd';
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
