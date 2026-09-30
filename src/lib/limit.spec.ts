import { describe, it, expect } from 'vitest';
import { createLimiter } from './limit';

describe('createLimiter', () => {
  it('never runs more than max jobs at once, and runs them all', async () => {
    const limit = createLimiter(3);
    let active = 0, peak = 0;
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => limit(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, Math.random() * 4));
      active--;
      return i;
    })));
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 25 }, (_, i) => i));
  });

  it('a failing job rejects on its own and frees its slot', async () => {
    const limit = createLimiter(1);
    const bad = limit(async () => { throw new Error('boom'); });
    const good = limit(async () => 'ok');
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('ok');
  });
});
