import { describe, it, expect } from 'vitest';
import { faceGroupCentre } from './faceCentre';

/* The face-group centre is shared by the website (face-api.js boxes) and the
   2.0 app (ML Kit boxes): the same boxes must give the same point. */
describe('faceGroupCentre', () => {
  it('no face → null (the photo is centred as usual)', () => {
    expect(faceGroupCentre([], 800, 600)).toBeNull();
  });

  it('one face → the middle of that face, 0–1 of the picture', () => {
    expect(faceGroupCentre([{ x: 100, y: 60, width: 200, height: 240 }], 800, 600)).toEqual({ x: 0.25, y: 0.3 });
  });

  it('a group → the middle of the box around everyone', () => {
    const c = faceGroupCentre([
      { x: 40, y: 100, width: 80, height: 80 },
      { x: 600, y: 300, width: 120, height: 120 },
    ], 800, 600)!;
    expect(c.x).toBeCloseTo((40 + 720) / 2 / 800, 12);
    expect(c.y).toBeCloseTo((100 + 420) / 2 / 600, 12);
  });

  it('a box past the edge is clamped into the picture', () => {
    expect(faceGroupCentre([{ x: -300, y: 500, width: 100, height: 400 }], 800, 600)).toEqual({ x: 0, y: 1 });
  });
});
