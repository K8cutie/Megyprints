import { describe, it, expect } from 'vitest';
import { chooseResumeOffer } from './resumeOffer';
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
    expect(offer).toEqual({ kind: 'device', title: "Maria's Debut", photoCount: 48 });
  });

  it('offers the saved album when it changed later (worked on another device)', () => {
    const offer = chooseResumeOffer(draft(), [
      { id: 'b2', title: 'Boracay 2026', updatedAt: '2026-09-29T12:00:00Z' },
      { id: 'a1', title: "Maria's Debut", updatedAt: '2026-09-29T09:50:00Z' },
    ], 'me');
    expect(offer).toEqual({ kind: 'saved', albumId: 'b2', title: 'Boracay 2026', updatedAt: '2026-09-29T12:00:00Z' });
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
