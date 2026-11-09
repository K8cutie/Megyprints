import { describe, it, expect } from 'vitest';
import { encodeLook, decodeLook, lookOf, likeness, orderByLook, createLookGate, LOOK_DIMS, LOOK_ALIKE, LOOK_APART, LOOK_GATE_MS, LOOK_GATE_PHOTOS, type Look } from './photoLook';
import { madeUpLooks } from '../test/madeUpLooks';
import { mulberry32 } from '../test/mulberry32';

/* ════════════════════════════════════════════════════════════════════════
   What a photo LOOKS like (lib/photoLook): the text a photo keeps, how
   alike two looks are, and the order that puts look-alikes together.
   ════════════════════════════════════════════════════════════════════════ */

/** Numbers shaped like the model's: none below zero, most small, a few large. */
function modelLike(seed: number): Float32Array {
  const rnd = mulberry32(seed);
  return Float32Array.from({ length: LOOK_DIMS }, () => { const r = rnd(); return r < 0.15 ? 0 : r ** 4 * 3; });
}
const unit = (v: Float32Array): Float32Array => {
  let s = 0;
  for (const x of v) s += x * x;
  const n = Math.sqrt(s);
  return v.map((x) => x / n);
};
const blend = (a: Float32Array, b: Float32Array, share: number) => a.map((x, i) => x * (1 - share) + b[i] * share);

describe('a look, kept as text', () => {
  it('is 1,280 letters, and likeness from the text is within 0.01 of the numbers\' own', () => {
    const base = modelLike(1);
    const others = [modelLike(2), blend(base, modelLike(3), 0.3), blend(base, modelLike(4), 0.6), base];
    const kept = encodeLook(base)!;
    expect(kept).toHaveLength(LOOK_DIMS);
    expect(kept).toMatch(/^[A-Za-z0-9+/]+$/);
    for (const o of others) {
      const real = likeness(unit(base), unit(o));
      const fromText = likeness(decodeLook(kept)!, decodeLook(encodeLook(o)!)!);
      expect(Math.abs(fromText - real), `real ${real.toFixed(4)} vs from text ${fromText.toFixed(4)}`).toBeLessThan(0.01);
    }
    // The same photo is 1 alike.
    expect(likeness(decodeLook(kept)!, decodeLook(kept)!)).toBeCloseTo(1, 5);
  });

  it('does not depend on how large the numbers are, only on which way they point', () => {
    const v = modelLike(5);
    expect(encodeLook(v.map((x) => x * 40))).toBe(encodeLook(v));
  });

  it('numbers that are not a look give no text; text that is not a look gives no look', () => {
    expect(encodeLook(new Float32Array(10))).toBeNull(); // the wrong count
    expect(encodeLook(new Float32Array(LOOK_DIMS))).toBeNull(); // nothing above zero
    expect(encodeLook(Float32Array.from({ length: LOOK_DIMS }, (_, i) => (i === 3 ? NaN : 1)))).toBeNull();
    expect(decodeLook(undefined)).toBeNull();
    expect(decodeLook('A'.repeat(LOOK_DIMS - 1))).toBeNull(); // too short
    expect(decodeLook('A'.repeat(LOOK_DIMS))).toBeNull(); // all zero
    expect(decodeLook('!'.repeat(LOOK_DIMS))).toBeNull(); // not our letters
    expect(decodeLook(42)).toBeNull();
  });

  it('lookOf reads a photo\'s look from its check; a photo the look pass has not seen has none', () => {
    const look = encodeLook(modelLike(6))!;
    const photo = { check: { look } };
    expect(lookOf(photo)).toBeInstanceOf(Float32Array);
    expect(lookOf(photo)).toBe(lookOf(photo)); // read once
    expect(lookOf({})).toBeNull();
    expect(lookOf({ check: {} })).toBeNull();
    expect(lookOf({ check: { look: 'not a look' } })).toBeNull();
  });
});

describe('the look pass only runs where it is quick', () => {
  it('stops when the first five photos took over 300 ms each on average; later photos are not counted', () => {
    expect([LOOK_GATE_MS, LOOK_GATE_PHOTOS]).toEqual([300, 5]);
    const slow = createLookGate();
    for (const ms of [400, 350, 320, 310]) { slow.took(ms); expect(slow.off).toBe(false); }
    slow.took(330); // average 342
    expect(slow.off).toBe(true);
    expect(slow.times()).toEqual([400, 350, 320, 310, 330]);
    // A slow start that averages out is fine (the first photo also warms the model up).
    const fine = createLookGate();
    for (const ms of [900, 60, 50, 40, 30]) fine.took(ms); // average 216
    expect(fine.off).toBe(false);
    // After the first five, one slow photo changes nothing.
    fine.took(5_000);
    expect(fine.off).toBe(false);
    expect(fine.times()).toHaveLength(5);
  });
});

describe('the made-up looks the specs use sit where the real ones were measured', () => {
  it('same place about 0.8 alike, same area about 0.6, another place about 0.45', () => {
    const looks = madeUpLooks(7);
    const gate = looks.place();
    const sign = looks.place(gate); // the same park
    const castle = looks.place();
    const at = (p: ReturnType<typeof looks.place>) => decodeLook(looks.shot(p))!;
    for (let k = 0; k < 20; k++) {
      const same = likeness(at(gate), at(gate));
      const area = likeness(at(gate), at(sign));
      const far = likeness(at(gate), at(castle));
      expect(same).toBeGreaterThan(LOOK_ALIKE + 0.08);
      expect(area).toBeGreaterThan(LOOK_APART);
      expect(area).toBeLessThan(LOOK_ALIKE);
      expect(far).toBeLessThan(LOOK_APART - 0.02);
    }
  });
});

/** The textbook way, slowly: join the two groups with the highest average
 *  likeness until the best is under `alike`. */
function groupsTheSlowWay(looks: Look[], alike: number): number[][] {
  let groups = looks.map((_, i) => [i]);
  const avg = (a: number[], b: number[]) => { let s = 0; for (const x of a) for (const y of b) s += likeness(looks[x], looks[y]); return s / (a.length * b.length); };
  for (;;) {
    let best = -Infinity; let bi = -1; let bj = -1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) { const s = avg(groups[i], groups[j]); if (s > best) { best = s; bi = i; bj = j; } }
    if (bi < 0 || best < alike) break;
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups = groups.filter((_, k) => k !== bj);
  }
  return groups.map((g) => [...g].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}
const sortedGroups = (groups: number[][]) => groups.map((g) => [...g].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);

describe('orderByLook: look-alikes sit together', () => {
  /** 30 photos at 6 places (two of them in one park), shuffled. */
  function shuffledTrip(seed: number) {
    const looks = madeUpLooks(seed);
    const park = looks.place();
    const places = [park, looks.place(park), looks.place(), looks.place(), looks.place(), looks.place()];
    const counts = [7, 5, 6, 4, 3, 5];
    const shots = places.flatMap((p, k) => Array.from({ length: counts[k] }, () => ({ place: k, look: decodeLook(looks.shot(p))! })));
    const rnd = mulberry32(seed + 99);
    for (let i = shots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shots[i], shots[j]] = [shots[j], shots[i]]; }
    return shots;
  }

  it('each place is one group, its photos side by side, and the two places of one park next to each other', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const shots = shuffledTrip(seed);
      const { order, groups } = orderByLook(shots.map((s) => s.look));
      expect([...order].sort((a, b) => a - b)).toEqual(shots.map((_, i) => i)); // every photo, once
      expect(groups.map((g) => new Set(g.map((i) => shots[i].place)).size), `seed ${seed}: one place a group`).toEqual([1, 1, 1, 1, 1, 1]);
      expect(groups.map((g) => g.length).sort()).toEqual([3, 4, 5, 5, 6, 7]);
      expect(groups.flat()).toEqual(order); // the groups, in the order's own sequence
      const placeOrder = groups.map((g) => shots[g[0]].place);
      expect(Math.abs(placeOrder.indexOf(0) - placeOrder.indexOf(1)), `seed ${seed}: the park's two places are neighbours`).toBe(1);
    }
  });

  it('the same looks always give the same order, and it starts with the group that holds the first photo', () => {
    const shots = shuffledTrip(11);
    const a = orderByLook(shots.map((s) => s.look));
    const b = orderByLook(shots.map((s) => s.look));
    expect(b).toEqual(a);
    expect(a.groups[0]).toContain(0);
  });

  it('gives the groups the textbook way gives (join the two most alike, until none is alike enough)', () => {
    for (const seed of [21, 22, 23]) {
      const rnd = mulberry32(seed);
      // Looks with every likeness in between: a few shared pieces in random shares.
      const pieces = Array.from({ length: 8 }, (_, k) => unit(modelLike(seed * 10 + k)));
      const looks = Array.from({ length: 40 }, () => {
        const v = new Float32Array(LOOK_DIMS);
        for (const p of pieces) { const w = rnd() < 0.35 ? rnd() : 0; for (let i = 0; i < LOOK_DIMS; i++) v[i] += w * p[i]; }
        for (let i = 0; i < LOOK_DIMS; i++) v[i] += 0.02;
        return unit(v);
      });
      for (const alike of [0.5, 0.65, 0.8, 0.95]) {
        expect(sortedGroups(orderByLook(looks, alike).groups), `seed ${seed} at ${alike}`).toEqual(groupsTheSlowWay(looks, alike));
      }
    }
  });

  it('no looks, one look, and looks that are nothing alike', () => {
    expect(orderByLook([])).toEqual({ order: [], groups: [] });
    const one = decodeLook(encodeLook(modelLike(31))!)!;
    expect(orderByLook([one])).toEqual({ order: [0], groups: [[0]] });
    const looks = madeUpLooks(32);
    const apart = [looks.place(), looks.place(), looks.place()].map((p) => decodeLook(looks.shot(p))!);
    expect(orderByLook(apart).groups.map((g) => g.length)).toEqual([1, 1, 1]);
  });
});
