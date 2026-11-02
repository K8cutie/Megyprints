/* ══════════════════════════════════════════════════════════════════════════
   "REPLACE VIDEO" IN MY MEMORIES (the website's MyMemories.tsx replaceClip):
   the same code and printed QR, a new video. The picked video is checked
   (the website's words), uploaded over the old one, and the memory points at
   it with a NEW address (the same file with a version, "?v=…"): every phone
   that played the old video keeps it cached a year under the old address.

   One step more than the website: a video over the bucket's 100 MB is shrunk
   on the phone first (HD, so nothing the album paid for is lost); the
   website uploads what was picked and the bucket refuses one that big.
   ══════════════════════════════════════════════════════════════════════════ */
import { MAX_CLIP_BYTES, QUALITY_TARGETS, versionedClipUrl, type ClipExt, type StagedClip } from './clips';
import { checkPicked, type PickedVideo } from '../../editor/memories/memoryFlow';

export const REPLACED = 'Video replaced ✓ — same QR, new memory';
export const NOT_REPOINTED = 'Uploaded, but could not re-point the QR. Try again.';
export const REPLACE_FAILED = 'Could not replace the video.';

export interface ReplaceDeps {
  /** clips.ts uploadClip (upsert when `replace`). */
  upload(clip: Pick<StagedClip, 'code' | 'ext' | 'uri' | 'size' | 'replace'>): Promise<void>;
  /** The phone's shrinker; null when this APK has none. */
  shrink: ((input: string, target: { shortEdge: number; bitrate: number }) => Promise<{ uri: string; size: number }>) | null;
  relink(code: string, destination: string): Promise<boolean>;
  supabaseUrl: string;
  now(): number;
}

/** The video replaced, or the words why not. `destination`: the memory's new address. */
export async function replaceMemoryVideo(code: string, v: PickedVideo, d: ReplaceDeps): Promise<{ ok: true; text: string; destination: string } | { ok: false; text: string }> {
  const checked = checkPicked(v);
  if (!checked.ok) return { ok: false, text: checked.error };
  try {
    let file: { uri: string; size: number; ext: ClipExt } = { uri: v.uri, size: v.size, ext: checked.ext };
    if (file.size > MAX_CLIP_BYTES && d.shrink) {
      const out = await d.shrink(file.uri, QUALITY_TARGETS.hd).catch(() => null);
      if (out && out.size > 0 && out.size < file.size) file = { uri: out.uri, size: out.size, ext: 'mp4' };
    }
    await d.upload({ code, ext: file.ext, uri: file.uri, size: file.size, replace: true });
    const next = versionedClipUrl(code, file.ext, d.now(), d.supabaseUrl);
    if (!(await d.relink(code, next))) return { ok: false, text: NOT_REPOINTED };
    return { ok: true, text: REPLACED, destination: next };
  } catch (e) {
    return { ok: false, text: e instanceof Error && e.message ? e.message : REPLACE_FAILED };
  }
}
