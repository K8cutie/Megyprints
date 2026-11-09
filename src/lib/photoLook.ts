/* ══════════════════════════════════════════════════════════════════════════
   photoLook — what a photo LOOKS like, as numbers, so photos that show the
   same scene can be put together when the clock can't say so: a photo
   downloaded from Facebook or Messenger has no capture time and no place.

   The numbers are MobileNet v2's 1,280 (the layer before its labels), made
   on the device by the photo check's look pass (photoCheckRunner on the
   website). Two photos of the same scene point the same way: their LIKENESS
   (the cosine of the two) is high. Measured on the owner's 196 Hong Kong
   photos from Facebook (no time, no place, 2026-11-09):
     • any two photos of the trip: median 0.51, nine in ten under 0.61;
     • a photo and its closest other: median 0.81;
     • groups whose average likeness is at least 0.65 are scenes by eye
       (the Ocean Park gate, the castle selfies, Mystic Manor, the panda ride).

   Kept on the photo as text (PhotoCheck.look): one letter per number, 64
   steps on a square-root curve (small numbers keep their detail), 1,280
   letters a photo. Likeness from the text is within 0.01 of the model's own
   (photoLook.spec). It stays on this device: never saved to the account
   (checkForAccount).

   Pure arithmetic: the website and the 2.0 app both read it, and every rule
   is unit-tested.
   ══════════════════════════════════════════════════════════════════════════ */

/** The numbers in a look (MobileNet v2's last layer before its labels). */
export const LOOK_DIMS = 1280;
/** Photos at least this alike show the same scene. */
export const LOOK_ALIKE = 0.65;
/** Photos less alike than this share nothing a scene is made of. Any two
 *  photos of one trip sit near 0.5, so this alone never splits a scene:
 *  see generateAlbum's look split, which also wants a run of look-alikes on
 *  each side. */
export const LOOK_APART = 0.55;

/** The look pass only runs where it is quick: it stops for the visit when
 *  its first LOOK_GATE_PHOTOS photos took over LOOK_GATE_MS each on average
 *  (a slow phone then gets its album grouped by capture time alone, as
 *  before; Generate never waits on a pass that stopped). */
export const LOOK_GATE_MS = 300;
export const LOOK_GATE_PHOTOS = 5;

/** Counts the first photos' times; `off` once they were too slow. */
export function createLookGate(): { took(ms: number): void; readonly off: boolean; times(): number[] } {
  const first: number[] = [];
  let off = false;
  return {
    took(ms) {
      if (first.length >= LOOK_GATE_PHOTOS) return;
      first.push(ms);
      if (first.length === LOOK_GATE_PHOTOS && first.reduce((a, b) => a + b, 0) / LOOK_GATE_PHOTOS > LOOK_GATE_MS) off = true;
    },
    get off() { return off; },
    times: () => [...first],
  };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const STEPS = LETTERS.length - 1;
const VALUE_OF = new Map([...LETTERS].map((c, i) => [c, (i / STEPS) ** 2]));

/** A look as numbers, length 1 (so likeness is a plain dot product). */
export type Look = Float32Array;

/** The text kept for a look, or null when the numbers are not a look (the
 *  wrong count, or nothing above zero). The model's numbers are never below
 *  zero; one that is counts as zero. */
export function encodeLook(values: ArrayLike<number>): string | null {
  if (values.length !== LOOK_DIMS) return null;
  let max = 0;
  for (let i = 0; i < LOOK_DIMS; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return null;
    if (v > max) max = v;
  }
  if (!(max > 0)) return null;
  let out = '';
  for (let i = 0; i < LOOK_DIMS; i++) out += LETTERS[Math.round(Math.sqrt(Math.max(0, values[i]) / max) * STEPS)];
  return out;
}

/** The look a kept text holds, or null when it is not one. */
export function decodeLook(text: unknown): Look | null {
  if (typeof text !== 'string' || text.length !== LOOK_DIMS) return null;
  const v = new Float32Array(LOOK_DIMS);
  let sum = 0;
  for (let i = 0; i < LOOK_DIMS; i++) {
    const x = VALUE_OF.get(text[i]);
    if (x === undefined) return null;
    v[i] = x;
    sum += x * x;
  }
  if (!(sum > 0)) return null;
  const norm = Math.sqrt(sum);
  for (let i = 0; i < LOOK_DIMS; i++) v[i] /= norm;
  return v;
}

/** Each check's look, read once (a check object is never changed in place). */
const READ = new WeakMap<object, Look | null>();

/** A photo's look, or null when the look pass has not seen it. */
export function lookOf(photo: { check?: { look?: string } | null }): Look | null {
  const check = photo.check;
  if (!check || typeof check.look !== 'string') return null;
  let look = READ.get(check);
  if (look === undefined) {
    look = decodeLook(check.look);
    READ.set(check, look);
  }
  return look;
}

/** How alike two looks are: 1 = the same picture, about 0.5 = two photos of
 *  the same trip that show different things. */
export function likeness(a: Look, b: Look): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export interface LookOrder {
  /** Every look's index, look-alikes next to each other, and groups that
   *  are most alike next to each other. */
  order: number[];
  /** The groups whose average likeness is at least `alike`, in that order
   *  (a look like no other is a group of one). */
  groups: number[][];
}

/** Looks sorted so that look-alikes sit together. The two most alike groups
 *  are joined, again and again (their likeness is the average over every
 *  pair between them), until one is left: the order is how they were joined.
 *  The groups are the ones standing when the best pair first fell under
 *  `alike`. Whichever of two joined groups holds the earliest index goes
 *  first, so the same looks always give the same order and it leans on the
 *  order the photos came in. */
export function orderByLook(looks: Look[], alike = LOOK_ALIKE): LookOrder {
  const n = looks.length;
  if (n === 0) return { order: [], groups: [] };
  const sim = new Float32Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = likeness(looks[i], looks[j]);
      sim[i * n + j] = s;
      sim[j * n + i] = s;
    }
  }
  const members: (number[] | null)[] = looks.map((_, i) => [i]);
  // Each standing group's most alike other group.
  const best = new Int32Array(n).fill(-1);
  const bestSim = new Float32Array(n).fill(-Infinity);
  const findBest = (i: number) => {
    let b = -1;
    let s = -Infinity;
    for (let k = 0; k < n; k++) {
      if (k === i || !members[k]) continue;
      const v = sim[i * n + k];
      if (v > s) { s = v; b = k; }
    }
    best[i] = b;
    bestSim[i] = s;
  };
  for (let i = 0; i < n; i++) findBest(i);
  let groups: number[][] | null = null;
  const standing = () => (members.filter((m) => m) as number[][]).sort((a, b) => a[0] - b[0]).map((m) => [...m]);
  for (let left = n; left > 1; left--) {
    let i = -1;
    for (let k = 0; k < n; k++) if (members[k] && (i < 0 || bestSim[k] > bestSim[i])) i = k;
    const j = best[i];
    if (!groups && bestSim[i] < alike) groups = standing();
    const a = members[i]!;
    const b = members[j]!;
    const [first, second] = Math.min(...a) <= Math.min(...b) ? [a, b] : [b, a];
    // The joined group's likeness to every other: the average over its pairs.
    for (let k = 0; k < n; k++) {
      if (k === i || k === j || !members[k]) continue;
      const v = (a.length * sim[i * n + k] + b.length * sim[j * n + k]) / (a.length + b.length);
      sim[i * n + k] = v;
      sim[k * n + i] = v;
    }
    members[i] = [...first, ...second];
    members[j] = null;
    findBest(i);
    for (let k = 0; k < n; k++) {
      if (k === i || !members[k]) continue;
      // An average is never above the larger of its two parts, so only a
      // group whose best was one of the two joined needs a new look round.
      if (best[k] === i || best[k] === j) findBest(k);
    }
  }
  const order = members.find((m) => m)!;
  if (!groups) groups = [[...order]];
  // The groups in the order's own sequence, each in the order's sequence.
  const at = new Map(order.map((idx, p) => [idx, p]));
  groups = groups.map((g) => [...g].sort((x, y) => at.get(x)! - at.get(y)!)).sort((x, y) => at.get(x[0])! - at.get(y[0])!);
  return { order: [...order], groups };
}
