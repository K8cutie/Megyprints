import { describe, it, expect } from 'vitest';
import { photosToForget } from './photoKeeping';

// Photos exist ONLY on the customer's device. Deleting the wrong one is a blank
// page in a saved album that nobody can ever restore, so these lock the rule
// that a thrown-away draft may only take photos nothing else can reach.

describe('photosToForget — what a thrown-away draft may delete', () => {
  it('forgets the photos of an anonymous draft that never touched an account', () => {
    expect(photosToForget({ photoIds: ['a', 'b', 'a'] }, false)).toEqual(['a', 'b']);
  });

  it('keeps everything while someone is signed in — the draft is a saved album', () => {
    expect(photosToForget({ photoIds: ['a', 'b'] }, true)).toEqual([]);
  });

  it('keeps a draft that was worked on under an account, even after signing out', () => {
    expect(photosToForget({ photoIds: ['a'], accountId: 'user-1' }, false)).toEqual([]);
  });

  it('keeps everything when there is no draft to judge', () => {
    expect(photosToForget(null, false)).toEqual([]);
  });

  it('never reaches past the draft itself (no store-wide wipe)', () => {
    expect(photosToForget({ photoIds: [] }, false)).toEqual([]);
  });
});
