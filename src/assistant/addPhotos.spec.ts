import { describe, it, expect } from 'vitest';
import { ActionEngine } from './actionEngine';
import type { BuilderActions } from './actionEngine';

/* ══════════════════════════════════════════════════════════════════════════
   The upload confirmation must report what was ACTUALLY added.

   addPhotos() skips files already in the album (same name + size). That is the
   normal case on a phone: the picker caps a selection, so the customer picks
   again with an overlapping batch. Reporting the SELECTED count there told them
   "100 photos uploaded" while adding 60 — which reads like photos went missing.
   ══════════════════════════════════════════════════════════════════════════ */

const engineWith = (added: number, skipped: number) => {
  const builder = { addPhotos: () => ({ added, skipped }) } as unknown as BuilderActions;
  return new ActionEngine(builder);
};

// `count` files selected; the mock decides how they split into added/skipped.
const run = (engine: ActionEngine, count: number) =>
  engine.execute({
    type: 'add_photos',
    payload: { files: Array.from({ length: count }, (_, i) => new File([''], `p${i}.jpg`)) },
    rawMessage: 'add photos',
  } as never);

describe('add_photos confirmation message', () => {
  it('reports every photo when none are duplicates', async () => {
    const r = await run(engineWith(3, 0), 3);
    expect(r.message).toBe('3 photos added.');
    expect(r.success).toBe(true);
  });

  it('uses the singular for one photo', async () => {
    const r = await run(engineWith(1, 0), 1);
    expect(r.message).toBe('1 photo added.');
  });

  it('does NOT overstate a partially-deduped batch', async () => {
    const r = await run(engineWith(60, 40), 100);
    // the bug this guards: previously reported "100 photos uploaded"
    expect(r.message).toBe('60 photos added · 40 already in your album.');
    expect(r.message).not.toContain('100');
  });

  it('explains an all-duplicates pick, and does not call it a failure', async () => {
    const r = await run(engineWith(0, 100), 100);
    expect(r.message).toBe('100 already in your album.');
    expect(r.success).toBe(true); // a no-op, not an error
  });

  it('still rejects an empty selection', async () => {
    const r = await run(engineWith(0, 0), 0);
    expect(r.message).toBe('No photos to add.');
    expect(r.success).toBe(false);
  });
});
