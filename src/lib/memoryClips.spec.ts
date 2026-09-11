import { describe, it, expect } from 'vitest';
import {
  clipExtFor, clipMimeFor, clipObjectPath, publicClipUrl, isHostedClipUrl, checkClipMeta,
  MAX_CLIP_BYTES, MAX_INPUT_BYTES, MAX_CLIP_SECONDS, CLIP_BUCKET,
} from './memoryClips';
import { targetDimensions, transcodeSupported, QUALITY_TARGETS } from './videoTranscode';

/* ══════════════════════════════════════════════════════════════════════════
   HOSTED MEMORY CLIPS — the pure half (caps, naming, URLs).
   These are the contracts the storage policy (migration 0030) and the resolver
   (api/m.mjs) rely on: an object name is `<code>.<ext>` with a code-shaped
   code and one of four extensions; a clip URL is exactly the bucket's public
   prefix on the project origin. Drift here = uploads rejected or clips not
   recognised as ours.
   ══════════════════════════════════════════════════════════════════════════ */

const BASE = 'https://lvbsrbmikunynphlbckt.supabase.co';
const POLICY_NAME = /^[a-z2-9]{4,32}\.(mp4|mov|webm|m4v)$/; // verbatim from 0030

describe('clip extension mapping', () => {
  it('maps the four accepted mimes, and falls back to the file name when the mime is blank/generic (Android camera)', () => {
    expect(clipExtFor({ type: 'video/mp4', name: 'a.MP4' })).toBe('mp4');
    expect(clipExtFor({ type: 'video/quicktime', name: 'IMG_1.MOV' })).toBe('mov');
    expect(clipExtFor({ type: 'video/webm' })).toBe('webm');
    expect(clipExtFor({ type: 'video/x-m4v' })).toBe('m4v');
    expect(clipExtFor({ type: '', name: 'VID_2026.mp4' })).toBe('mp4');
    expect(clipExtFor({ type: 'application/octet-stream', name: 'clip.mov' })).toBe('mov');
  });
  it('rejects everything else (images, unknown containers, no extension)', () => {
    expect(clipExtFor({ type: 'image/jpeg', name: 'x.jpg' })).toBeNull();
    expect(clipExtFor({ type: 'video/x-matroska', name: 'x.mkv' })).toBeNull();
    expect(clipExtFor({ type: '', name: 'noext' })).toBeNull();
  });
  it('upload mime round-trips to the bucket allowlist', () => {
    expect(clipMimeFor('mp4')).toBe('video/mp4');
    expect(clipMimeFor('mov')).toBe('video/quicktime');
    expect(clipMimeFor('webm')).toBe('video/webm');
    expect(clipMimeFor('m4v')).toBe('video/x-m4v');
  });
});

describe('object naming ↔ storage policy', () => {
  it('every minted-shape code + accepted ext produces a name the INSERT policy accepts', () => {
    for (const code of ['abcd', 'k7m2p9qz', 'zz99zz99zz99zz99zz99zz99zz99zz99'])
      for (const ext of ['mp4', 'mov', 'webm', 'm4v'] as const)
        expect(clipObjectPath(code, ext)).toMatch(POLICY_NAME);
  });
  it('a path-traversal or foreign-bucket name can never be produced', () => {
    // The helper only ever joins code + ext; no separators can enter the name.
    expect(clipObjectPath('k7m2p9qz', 'mp4')).not.toContain('/');
  });
});

describe('public clip URL ↔ resolver recognition', () => {
  it('builds the bucket public URL on the project origin', () => {
    expect(publicClipUrl('k7m2p9qz', 'mp4', BASE)).toBe(`${BASE}/storage/v1/object/public/${CLIP_BUCKET}/k7m2p9qz.mp4`);
    expect(publicClipUrl('k7m2p9qz', 'mov', BASE + '/')).toBe(`${BASE}/storage/v1/object/public/${CLIP_BUCKET}/k7m2p9qz.mov`);
  });
  it('recognises our clips and ONLY our clips', () => {
    expect(isHostedClipUrl(publicClipUrl('k7m2p9qz', 'mp4', BASE), BASE)).toBe(true);
    expect(isHostedClipUrl(`${BASE}/storage/v1/object/public/print-pdfs/x.pdf`, BASE)).toBe(false); // another bucket
    expect(isHostedClipUrl(`${BASE}/rest/v1/qr_memories`, BASE)).toBe(false);                    // the API
    expect(isHostedClipUrl(`https://evil.example/storage/v1/object/public/${CLIP_BUCKET}/a.mp4`, BASE)).toBe(false); // other origin
    expect(isHostedClipUrl('https://youtu.be/abc123', BASE)).toBe(false);
    expect(isHostedClipUrl('not a url', BASE)).toBe(false);
    expect(isHostedClipUrl(publicClipUrl('k7m2p9qz', 'mp4', BASE), '')).toBe(false);            // unconfigured → never
  });
});

describe('caps', () => {
  it('owner caps (2026-09-10): 2 minutes, a generous 400 MB source, 100 MB uploaded', () => {
    // Real memory clips run 30s-2min, so 60s cut off the top half of the range.
    expect(MAX_CLIP_SECONDS).toBe(120);
    // The source cap is generous because we re-encode; the OUTPUT is what has
    // to fit the bucket's object limit.
    expect(MAX_INPUT_BYTES).toBe(400 * 1024 * 1024);
    expect(MAX_CLIP_BYTES).toBe(100 * 1024 * 1024);
    expect(MAX_INPUT_BYTES).toBeGreaterThan(MAX_CLIP_BYTES);
  });

  it('accepts ordinary phone video that the OLD 100 MB source cap rejected', () => {
    // A 2-minute 1080p recording (~180 MB) and a 60-second 4K one (~350 MB)
    // both used to bounce with no way for the customer to fix it.
    expect(checkClipMeta({ size: 180e6, durationSec: 120, ext: 'mov' })).toEqual({ ok: true });
    expect(checkClipMeta({ size: 350e6, durationSec: 60, ext: 'mp4' })).toEqual({ ok: true });
  });

  it('accepts inside the caps, tolerates an unreadable duration, rejects past either cap or the wrong type', () => {
    expect(checkClipMeta({ size: 30e6, durationSec: 45, ext: 'mp4' })).toEqual({ ok: true });
    expect(checkClipMeta({ size: 30e6, durationSec: null, ext: 'mov' })).toEqual({ ok: true });
    expect(checkClipMeta({ size: 30e6, durationSec: 120.4, ext: 'mp4' })).toEqual({ ok: true }); // rounding slack
    const tooLong = checkClipMeta({ size: 30e6, durationSec: 121, ext: 'mp4' });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/2 minutes/);
    const tooBig = checkClipMeta({ size: MAX_INPUT_BYTES + 1, durationSec: 10, ext: 'mp4' });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toMatch(/too large/);
    const wrong = checkClipMeta({ size: 10, durationSec: 10, ext: null });
    expect(wrong.ok).toBe(false);
  });
});

describe('transcode targets — standard 720p included, HD 1080p paid', () => {
  it('caps the long AND short edge per tier, so portrait stays portrait', () => {
    expect(targetDimensions(3840, 2160, 'hd')).toEqual({ width: 1920, height: 1080 });
    expect(targetDimensions(2160, 3840, 'hd')).toEqual({ width: 1080, height: 1920 });
    expect(targetDimensions(3840, 2160, 'standard')).toEqual({ width: 1280, height: 720 });
    expect(targetDimensions(2160, 3840, 'standard')).toEqual({ width: 720, height: 1280 });
    expect(targetDimensions(2160, 2160, 'hd')).toEqual({ width: 1080, height: 1080 });
  });

  it('never upscales a small source', () => {
    expect(targetDimensions(640, 480, 'hd')).toEqual({ width: 640, height: 480 });
    expect(targetDimensions(1280, 720, 'hd')).toEqual({ width: 1280, height: 720 });
  });

  it('always returns EVEN dimensions — H.264 cannot encode odd ones', () => {
    for (const [w, h] of [[1921, 1081], [1079, 1919], [999, 555], [4001, 2251]]) {
      for (const q of ['standard', 'hd'] as const) {
        const d = targetDimensions(w, h, q);
        expect(d.width % 2, `${w}x${h} ${q}`).toBe(0);
        expect(d.height % 2, `${w}x${h} ${q}`).toBe(0);
      }
    }
  });

  it('degenerate input yields no target rather than a crash', () => {
    expect(targetDimensions(0, 0, 'hd')).toEqual({ width: 0, height: 0 });
    expect(targetDimensions(NaN, 100, 'hd')).toEqual({ width: 0, height: 0 });
  });

  it('HD really is the bigger tier, and both stay inside the bucket limit', () => {
    expect(QUALITY_TARGETS.hd.shortEdge).toBeGreaterThan(QUALITY_TARGETS.standard.shortEdge);
    expect(QUALITY_TARGETS.hd.bitrate).toBeGreaterThan(QUALITY_TARGETS.standard.bitrate);
    // Worst case: a full 2-minute clip plus audio, against the 100 MB object cap.
    for (const q of ['standard', 'hd'] as const) {
      const bytes = ((QUALITY_TARGETS[q].bitrate + 128_000) / 8) * MAX_CLIP_SECONDS;
      expect(bytes, `${q} worst case`).toBeLessThan(MAX_CLIP_BYTES);
    }
  });

  it('reports no transcode support in a DOM-less environment (callers keep the original)', () => {
    expect(transcodeSupported()).toBe(false);
  });
});

describe('serializeUploads — the Order-page prefetch and the Pay tap never race the same clips', () => {
  it('runs callers one at a time, in order, and each gets its own result', async () => {
    const { serializeUploads } = await import('./memoryClips');
    const log: string[] = [];
    let release!: () => void;
    const first = serializeUploads(async () => { log.push('a:start'); await new Promise<void>((r) => { release = r; }); log.push('a:end'); return 'A'; });
    const second = serializeUploads(async () => { log.push('b:start'); return 'B'; });
    await new Promise((r) => setTimeout(r, 5));
    expect(log).toEqual(['a:start']); // b has NOT started while a is in flight
    release();
    expect(await first).toBe('A');
    expect(await second).toBe('B');
    expect(log).toEqual(['a:start', 'a:end', 'b:start']);
  });
  it('a failed early run never blocks the Pay-tap run behind it', async () => {
    const { serializeUploads } = await import('./memoryClips');
    const failed = serializeUploads(async () => { throw new Error('offline'); });
    const next = serializeUploads(async () => 'ok');
    await expect(failed).rejects.toThrow('offline');
    expect(await next).toBe('ok');
  });
  it('prefetch with nothing staged is a clean no-op', async () => {
    const { prefetchStagedClipUploads } = await import('./memoryClips');
    expect(await prefetchStagedClipUploads([])).toBe(true);
  });
});
