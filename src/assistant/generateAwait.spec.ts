import { describe, it, expect } from 'vitest';
import { ActionEngine } from './actionEngine';
import type { BuilderActions } from '../pages/builder/useBuilderState';

/* ══════════════════════════════════════════════════════════════════════════
   THE "MAKING YOUR ALBUM" WAIT (owner, 2026-09-12): "there is an obvious
   delay when generating the album and it looks like it hanged." Megy's reply
   (and the toasts chained on it) must wait for the album to exist; the
   builder's `generating` phase drives the overlay that covers the wait.
   ══════════════════════════════════════════════════════════════════════════ */

const fakeBuilder = (log: string[]) => ({
  currentPage: { background: { type: 'solid', solid: '#fff' } },
  // 40 photos: the minimum an album can be made from (albumMinimum).
  uploadedPhotos: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` })),
  generateAlbum: async () => { log.push('start'); await new Promise((r) => setTimeout(r, 20)); log.push('done'); },
} as unknown as BuilderActions);

describe('generate_album replies only after the album exists', () => {
  it('generate_album', async () => {
    const log: string[] = [];
    const out = await new ActionEngine(fakeBuilder(log)).execute({ type: 'generate_album', rawMessage: 'generate album' });
    expect(log).toEqual(['start', 'done']);
    expect(out.success).toBe(true);
  });
  it('surprise_me', async () => {
    const log: string[] = [];
    const out = await new ActionEngine(fakeBuilder(log)).execute({ type: 'surprise_me', rawMessage: 'surprise me' });
    expect(log).toEqual(['start', 'done']);
    expect(out.success).toBe(true);
  });
  it('a generation that throws still answers (the builder clears the overlay in its finally)', async () => {
    const b = { ...fakeBuilder([]), generateAlbum: async () => { throw new Error('boom'); } } as unknown as BuilderActions;
    const out = await new ActionEngine(b).execute({ type: 'generate_album', rawMessage: 'generate album' });
    expect(out.success).toBe(false);
    expect(out.message).toBe('boom');
  });
});

describe('the 40-photo gate (owner, 2026-10-04: "a hard gate if there isnt a minimum of 40 images")', () => {
  const builderWith = (photos: { id: string; leftOut?: boolean }[], log: string[]) =>
    ({ ...fakeBuilder(log), uploadedPhotos: photos } as unknown as BuilderActions);
  const n = (count: number, leftOut = 0) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, leftOut: i < leftOut }));

  for (const type of ['generate_album', 'surprise_me'] as const) {
    it(`${type}: 14 photos → no album, Megy says how many more`, async () => {
      const log: string[] = [];
      const out = await new ActionEngine(builderWith(n(14), log)).execute({ type, rawMessage: type });
      expect(log).toEqual([]);
      expect(out.success).toBe(false);
      expect(out.message).toBe("Albums need at least 40 photos, one for every page. You have 14: add 26 more and I'll make your album.");
    });

    it(`${type}: 40 uploaded but 1 left out by the photo check is still short`, async () => {
      const log: string[] = [];
      const out = await new ActionEngine(builderWith(n(40, 1), log)).execute({ type, rawMessage: type });
      expect(log).toEqual([]);
      expect(out.message).toContain('You have 39: add 1 more');
    });

    it(`${type}: exactly 40 going in → the album is made`, async () => {
      const log: string[] = [];
      const out = await new ActionEngine(builderWith(n(41, 1), log)).execute({ type, rawMessage: type });
      expect(log).toEqual(['start', 'done']);
      expect(out.success).toBe(true);
    });
  }
});
