import { describe, it, expect } from 'vitest';
import { chooseResumeOffer, chooseResumeOffers, RESUME_LIST_MAX, type ResumeOffer, type SavedAlbumSummary } from './resumeOffer';
import type { LocalDraftSummary } from './localDraft';

// "Resume where you left off?" must open the album the customer changed LAST.
// Offering an older copy rolls their work back in front of them.

const draft = (over: Partial<LocalDraftSummary> = {}): LocalDraftSummary => ({
  title: "Maria's Debut",
  albumId: 'a1',
  accountId: 'me',
  photoCount: 48,
  editedAt: Date.parse('2026-09-29T10:00:00Z'),
  hasContent: true,
  ...over,
});

describe('chooseResumeOffer', () => {
  it('offers the album on this device when it is the newest work', () => {
    const offer = chooseResumeOffer(draft(), [{ id: 'a1', title: "Maria's Debut", updatedAt: '2026-09-29T09:50:00Z' }], 'me');
    expect(offer).toEqual({ kind: 'device', id: 'device', title: "Maria's Debut", photoCount: 48 });
  });

  it('offers the saved album when it changed later (worked on another device)', () => {
    const offer = chooseResumeOffer(draft(), [
      { id: 'b2', title: 'Boracay 2026', updatedAt: '2026-09-29T12:00:00Z' },
      { id: 'a1', title: "Maria's Debut", updatedAt: '2026-09-29T09:50:00Z' },
    ], 'me');
    expect(offer).toEqual({ kind: 'saved', id: 'b2', albumId: 'b2', title: 'Boracay 2026', updatedAt: '2026-09-29T12:00:00Z' });
  });

  it('the same album edited later on another device comes from the cloud, not the stale copy here', () => {
    const offer = chooseResumeOffer(draft(), [{ id: 'a1', title: "Maria's Debut", updatedAt: '2026-09-29T11:00:00Z' }], 'me');
    expect(offer).toMatchObject({ kind: 'saved', albumId: 'a1' });
  });

  it('picks the newest saved album regardless of list order', () => {
    const offer = chooseResumeOffer(null, [
      { id: 'old', title: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'new', title: 'New', updatedAt: '2026-09-01T00:00:00Z' },
    ], 'me');
    expect(offer).toMatchObject({ kind: 'saved', albumId: 'new' });
  });

  it('ignores another account’s draft on a shared device', () => {
    const offer = chooseResumeOffer(draft({ accountId: 'someone-else' }), [], 'me');
    expect(offer).toBeNull();
  });

  it('a draft started before signing in counts as the customer’s', () => {
    expect(chooseResumeOffer(draft({ accountId: null }), [], 'me')).toMatchObject({ kind: 'device' });
  });

  it('an old draft with no timestamp loses to a saved album', () => {
    const offer = chooseResumeOffer(draft({ editedAt: 0 }), [{ id: 'a1', title: 'X', updatedAt: '2026-09-01T00:00:00Z' }], 'me');
    expect(offer).toMatchObject({ kind: 'saved' });
  });

  it('borrows the saved name when the draft on this device has none', () => {
    const offer = chooseResumeOffer(draft({ title: '' }), [{ id: 'a1', title: "Maria's Debut", updatedAt: '2026-09-01T00:00:00Z' }], 'me');
    expect(offer).toMatchObject({ kind: 'device', title: "Maria's Debut" });
  });

  it('skips an empty unnamed album (opened the builder and left) — offers the real one', () => {
    const offer = chooseResumeOffer(null, [
      { id: 'junk', title: 'My Album', photoCount: 0, updatedAt: '2026-09-29T12:00:00Z' },
      { id: 'real', title: "Maria's Debut", photoCount: 40, updatedAt: '2026-09-20T00:00:00Z' },
    ], 'me');
    expect(offer).toMatchObject({ kind: 'saved', albumId: 'real' });
  });

  it('a NAMED album with no photos yet is still where they left off', () => {
    const offer = chooseResumeOffer(null, [{ id: 'n', title: 'Boracay 2026', photoCount: 0, updatedAt: '2026-09-29T12:00:00Z' }], 'me');
    expect(offer).toMatchObject({ kind: 'saved', albumId: 'n' });
  });

  it('nothing to resume → no prompt', () => {
    expect(chooseResumeOffer(null, [], 'me')).toBeNull();
  });
});

// Owner, 2026-10-11: "if there are several existing albums ... show on the pop
// up the last 3 albums". Newest first; the first is the one chosen to start.
describe('chooseResumeOffers: the last 3 albums', () => {
  const saved = (id: string, day: number, over: Partial<SavedAlbumSummary> = {}): SavedAlbumSummary =>
    ({ id, title: id, photoCount: 40, updatedAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`, ...over });
  const ids = (list: ResumeOffer[]) => list.map((o) => o.id);

  it('lists the 3 newest, newest first, from any order', () => {
    const list = chooseResumeOffers(null, [saved('a', 1), saved('d', 20), saved('b', 5), saved('c', 10)], 'me');
    expect(ids(list)).toEqual(['d', 'c', 'b']);
    expect(RESUME_LIST_MAX).toBe(3);
  });

  it('fewer albums, fewer rows; one album is the box as it always was', () => {
    expect(ids(chooseResumeOffers(null, [saved('a', 1), saved('b', 2)], 'me'))).toEqual(['b', 'a']);
    expect(ids(chooseResumeOffers(null, [saved('a', 1)], 'me'))).toEqual(['a']);
    expect(chooseResumeOffers(null, [], 'me')).toEqual([]);
  });

  it('the album on this device and its saved copy are ONE row: the newer copy', () => {
    // This device changed it last: the device row, and no saved a1 row.
    const here = chooseResumeOffers(draft(), [saved('a1', 1), saved('b', 2)], 'me');
    expect(ids(here)).toEqual(['device', 'b']);
    // Another phone changed it last: the saved a1 row, and no device row.
    const there = chooseResumeOffers(draft(), [saved('a1', 30), saved('b', 2)], 'me');
    expect(ids(there)).toEqual(['a1', 'b']);
  });

  it('a draft here that was never saved sits in the list by its date', () => {
    const list = chooseResumeOffers(
      draft({ albumId: undefined, editedAt: Date.parse('2026-09-15T00:00:00Z') }),
      [saved('new', 20), saved('old', 2), saved('older', 1)], 'me');
    expect(ids(list)).toEqual(['new', 'device', 'old']);
  });

  it('empty leftovers never take a row (and never push a real album off the list)', () => {
    const list = chooseResumeOffers(null, [
      saved('junk1', 29, { title: 'My Album', photoCount: 0 }),
      saved('junk2', 28, { title: 'My Album', photoCount: 0 }),
      saved('a', 3), saved('b', 2), saved('c', 1),
    ], 'me');
    expect(ids(list)).toEqual(['a', 'b', 'c']);
  });

  it('another account’s draft on this device is never listed', () => {
    expect(ids(chooseResumeOffers(draft({ accountId: 'someone-else' }), [saved('b', 2)], 'me'))).toEqual(['b']);
  });

  it('carries each album’s small picture; the device row borrows its saved copy’s', () => {
    const list = chooseResumeOffers(draft(), [saved('a1', 1, { coverPhoto: 'data:a1' }), saved('b', 2, { coverPhoto: 'data:b' })], 'me');
    expect(list.map((o) => o.coverPhoto)).toEqual(['data:a1', 'data:b']);
  });
});
