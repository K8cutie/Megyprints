/* The shared code check, on a computer (Node: the engine the website's own
   tests use). Its answers must be exactly the ones in sharedCheckExpected.ts,
   which the app's "Shared code check" screen compares the phone's answers
   with. If a website change really changes an answer (a new layout, a
   different album from the same photos), update sharedCheckExpected.ts in
   the same PR and say why. */
import { SHARED_CHECK_EXPECTED } from '../src/lib/sharedCheckExpected';
import {
  albumFingerprint, compareWithExpected, fingerprint, mulberry32, pretendRoll, runSharedChecks, withSeed,
} from '../src/lib/sharedCheck';
import { generateAlbum } from '@web/pages/builder/generateAlbum';

describe('shared code check', () => {
  it('gives the expected answers on a computer', () => {
    const { lines } = runSharedChecks();
    const answers = Object.fromEntries(lines.map((l) => [l.id, l.value]));
    expect(answers).toEqual(SHARED_CHECK_EXPECTED);
    expect(compareWithExpected(lines, SHARED_CHECK_EXPECTED).every((c) => c.same)).toBe(true);
  });

  it('every answer has a label and the ids are unique', () => {
    const { lines } = runSharedChecks();
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
    for (const l of lines) expect(l.label.length).toBeGreaterThan(0);
  });

  it('a different answer is shown as different', () => {
    const lines = [{ id: 'min-photos', label: 'x', value: '39' }, { id: 'new-line', label: 'y', value: '1' }];
    expect(compareWithExpected(lines, SHARED_CHECK_EXPECTED).map((c) => c.same)).toEqual([false, false]);
  });

  it('the seed makes the same album every time, and puts Math.random back', () => {
    const real = Math.random;
    const photos = pretendRoll(60);
    const a = withSeed(7, () => albumFingerprint(generateAlbum(photos, '8x8')));
    const b = withSeed(7, () => albumFingerprint(generateAlbum(photos, '8x8')));
    const c = withSeed(8, () => albumFingerprint(generateAlbum(photos, '8x8')));
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(Math.random).toBe(real);
  });

  it('puts Math.random back even when the work throws', () => {
    const real = Math.random;
    expect(() => withSeed(1, () => { throw new Error('boom'); })).toThrow('boom');
    expect(Math.random).toBe(real);
  });

  it('mulberry32 and the album code are fixed functions', () => {
    const r = mulberry32(0x5eed);
    expect([r(), r(), r()].map((x) => x.toFixed(8))).toEqual(
      (() => { const s = mulberry32(0x5eed); return [s(), s(), s()].map((x) => x.toFixed(8)); })(),
    );
    expect(fingerprint('')).toBe('811c9dc5');
    expect(fingerprint('a')).toBe('e40c292c');
  });
});
