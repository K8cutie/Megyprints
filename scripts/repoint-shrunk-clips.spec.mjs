import { describe, it, expect } from 'vitest';
import { planFor } from './repoint-shrunk-clips.mjs';

/* The one-off fix for memory rows made before checkout named the uploaded
   file: a row at <code>.mov whose phone uploaded <code>.mp4 moves to the .mp4.
   Anything else is left as it is. */

const BASE = 'https://proj.supabase.co/storage/v1/object/public/memory-clips';
const row = (dest) => ({ code: 'k7m2p9qz', destination: dest });

describe('which rows the one-off moves', () => {
  it('.mov missing, .mp4 there: moved to the .mp4', () => {
    expect(planFor(row(`${BASE}/k7m2p9qz.mov`), ['k7m2p9qz.mp4'])).toEqual({ action: 'move', ext: 'mov', to: `${BASE}/k7m2p9qz.mp4` });
    expect(planFor(row(`${BASE}/k7m2p9qz.webm`), ['k7m2p9qz.mp4'])).toMatchObject({ action: 'move', to: `${BASE}/k7m2p9qz.mp4` });
  });
  it('a ?v= version is kept', () => {
    expect(planFor(row(`${BASE}/k7m2p9qz.m4v?v=12`), ['k7m2p9qz.mp4'])).toMatchObject({ action: 'move', to: `${BASE}/k7m2p9qz.mp4?v=12` });
  });
  it('its own file is there: left alone (even when an .mp4 is there too)', () => {
    expect(planFor(row(`${BASE}/k7m2p9qz.mov`), ['k7m2p9qz.mov', 'k7m2p9qz.mp4'])).toEqual({ action: 'ok' });
  });
  it('neither file: dead, not moved', () => {
    expect(planFor(row(`${BASE}/k7m2p9qz.mov`), [])).toEqual({ action: 'dead', ext: 'mov' });
    expect(planFor(row(`${BASE}/k7m2p9qz.mov`), ['k7m2p9qzxx.mp4'])).toEqual({ action: 'dead', ext: 'mov' });
  });
  it('an MP4 row, a link, or a destination naming another code: skipped', () => {
    expect(planFor(row(`${BASE}/k7m2p9qz.mp4`), [])).toEqual({ action: 'skip' });
    expect(planFor(row('https://youtu.be/k7m2p9qz.mov'), ['k7m2p9qz.mp4'])).toEqual({ action: 'skip' });
    expect(planFor(row(`${BASE}/w4n8r2ta.mov`), ['k7m2p9qz.mp4'])).toEqual({ action: 'skip' });
    expect(planFor({ code: 'k7m2p9qz', destination: null }, ['k7m2p9qz.mp4'])).toEqual({ action: 'skip' });
  });
});
