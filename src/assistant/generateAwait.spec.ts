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
  uploadedPhotos: [{ id: 'a' }],
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
