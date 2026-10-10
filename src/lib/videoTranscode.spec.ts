import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeFrameClock } from './videoTranscode';

/* ══════════════════════════════════════════════════════════════════════════
   VIDEO MEMORIES COMPRESS AGAIN (1-star testers, 2026-10-04: "Every video
   crashed the app and took my album down with it"). The compressor stamped
   each frame with the playing video's mediaTime, and the first frame caught
   is never at 0 — so the muxer refused the track ("The first chunk for your
   media track must have a timestamp of 0"), inside the encoder's callback
   where nothing caught it: the page crashed in the testers' browser, and in
   Chrome every clip silently stayed uncompressed. Checked on 4 clips in real
   Chrome, including one whose first frame is at exactly 0 s.
   ══════════════════════════════════════════════════════════════════════════ */

describe('makeFrameClock — frame timestamps count from the first frame caught', () => {
  it('the first frame is at 0 even when the video reports 0.033 s', () => {
    const clock = makeFrameClock();
    expect(clock(0.033333)).toBe(0);
    expect(clock(0.066667)).toBe(33334);
    expect(clock(0.1)).toBe(66667);
  });

  it('a clip whose first frame really is at 0 is unchanged', () => {
    const clock = makeFrameClock();
    expect(clock(0)).toBe(0);
    expect(clock(1 / 30)).toBe(33333);
  });

  it('a repeated or backwards time is skipped (the muxer needs rising timestamps)', () => {
    const clock = makeFrameClock();
    expect(clock(0.5)).toBe(0);
    expect(clock(0.5)).toBeNull();
    expect(clock(0.4)).toBeNull();
    expect(clock(0.55)).toBe(50000);
  });

  it('nonsense times are skipped, not encoded', () => {
    const clock = makeFrameClock();
    expect(clock(Number.NaN)).toBeNull();
    expect(clock(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clock(2)).toBe(0);
  });
});

describe('the compressor can never crash the page', () => {
  const src = readFileSync(resolve(__dirname, 'videoTranscode.ts'), 'utf8');

  it('the muxer shifts a late first chunk instead of refusing it', () => {
    expect(src).toMatch(/new Muxer\(\{[\s\S]*?firstTimestampBehavior: 'offset'/);
  });

  it('frames are stamped by the clock, not raw mediaTime', () => {
    expect(src).toMatch(/const timestamp = clock\(meta\.mediaTime\)/);
    expect(src).not.toMatch(/timestamp: Math\.max\(0, Math\.round\(meta\.mediaTime \* 1e6\)\)/);
  });

  it('a muxer throw inside an encoder callback becomes the error (the original clip is kept)', () => {
    expect(src).toMatch(/output: \(chunk, meta\) => \{\s*if \(encodeError\) return;\s*try \{ muxer\.addVideoChunk\(chunk, meta\); \} catch/);
    expect(src).toMatch(/output: \(chunk, meta\) => \{\s*if \(failure\) return;\s*try \{ muxer\.addAudioChunk\(chunk, meta\); \} catch/);
  });
});
