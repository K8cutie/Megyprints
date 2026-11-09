import { mulberry32 } from './mulberry32';
import { encodeLook, LOOK_DIMS } from '../lib/photoLook';

/* ══════════════════════════════════════════════════════════════════════════
   MADE-UP LOOKS FOR THE SPECS (lib/photoLook). A real look is MobileNet's
   1,280 numbers for a photo; the specs can't run the model, so they build
   looks that sit where the real ones were measured (the owner's 196 Hong
   Kong photos, 2026-11-09):
     • two photos of the same PLACE: about 0.8 alike (real: a photo and its
       closest other, median 0.81);
     • two photos of different places: about 0.45 alike (real: any two
       photos of the trip, median 0.51);
     • two places of the same AREA (the gate and the sign of one park):
       about 0.6 alike, between the two.
   Each look = what every photo shares + its place + its own noise, each a
   handful of the 1,280 numbers (so two unrelated parts barely overlap).
   Same seed, same looks.
   ══════════════════════════════════════════════════════════════════════════ */

type Part = Float32Array;

export interface MadeUpLooks {
  /** A new place; `area`: a place already made that this one is near. */
  place(area?: Place): Place;
  /** A photo's look at a place, as the text a photo keeps (PhotoCheck.look). */
  shot(at: Place): string;
}
export interface Place { part: Part; area: Part }

export function madeUpLooks(seed: number): MadeUpLooks {
  const rnd = mulberry32(seed);
  /** 24 of the numbers from `from` up to `to`, length 1. What every photo
   *  shares, the places and each photo's own noise take theirs from
   *  different stretches, so a photo's noise never looks like a place. */
  const part = (from: number, to: number): Part => {
    const v = new Float32Array(LOOK_DIMS);
    for (let k = 0; k < 24; k++) v[from + Math.floor(rnd() * (to - from))] = 0.5 + rnd();
    let s = 0;
    for (const x of v) s += x * x;
    const n = Math.sqrt(s);
    return v.map((x) => x / n);
  };
  const shared = part(0, 40);
  const somewhere = () => part(40, 640);
  const own = () => part(640, LOOK_DIMS);
  // Shares of a look's length, squared: everything 0.44, the area 0.14,
  // the place 0.24, the photo's own 0.18. Same place: 0.82 alike; same
  // area: 0.58; nothing but the trip: 0.44 (a little more where two
  // places happen to share a number).
  const mix = (at: Place, own: Part): string => {
    const v = new Float32Array(LOOK_DIMS);
    for (let i = 0; i < LOOK_DIMS; i++) {
      v[i] = Math.sqrt(0.44) * shared[i] + Math.sqrt(0.14) * at.area[i] + Math.sqrt(0.24) * at.part[i] + Math.sqrt(0.18) * own[i];
    }
    return encodeLook(v)!;
  };
  return {
    place: (area) => ({ part: somewhere(), area: area ? area.area : somewhere() }),
    shot: (at) => mix(at, own()),
  };
}
