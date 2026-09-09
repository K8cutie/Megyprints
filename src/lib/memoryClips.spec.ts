import { describe, it, expect } from 'vitest';
import {
  clipExtFor, clipMimeFor, clipObjectPath, publicClipUrl, isHostedClipUrl, checkClipMeta,
  MAX_CLIP_BYTES, MAX_CLIP_SECONDS, CLIP_BUCKET,
} from './memoryClips';

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
  it('owner caps: 60 seconds, 100 MB', () => {
    expect(MAX_CLIP_SECONDS).toBe(60);
    expect(MAX_CLIP_BYTES).toBe(100 * 1024 * 1024);
  });
  it('accepts a clip inside both caps, tolerates an unreadable duration, rejects over either cap or wrong type', () => {
    expect(checkClipMeta({ size: 30e6, durationSec: 45, ext: 'mp4' })).toEqual({ ok: true });
    expect(checkClipMeta({ size: 30e6, durationSec: null, ext: 'mov' })).toEqual({ ok: true });
    expect(checkClipMeta({ size: 30e6, durationSec: 60.4, ext: 'mp4' })).toEqual({ ok: true }); // rounding slack
    const tooLong = checkClipMeta({ size: 30e6, durationSec: 61, ext: 'mp4' });
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toMatch(/60 seconds/);
    const tooBig = checkClipMeta({ size: MAX_CLIP_BYTES + 1, durationSec: 10, ext: 'mp4' });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toMatch(/100 MB/);
    const wrong = checkClipMeta({ size: 10, durationSec: 10, ext: null });
    expect(wrong.ok).toBe(false);
  });
});
