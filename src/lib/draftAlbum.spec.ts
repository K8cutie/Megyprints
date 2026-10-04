// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { albumDataFromDraft, draftAlbumForAccount } from './draftAlbum';
import { DRAFT_STORAGE_KEY } from './localDraft';

/* ══════════════════════════════════════════════════════════════════════════
   A GUEST WHO SIGNS UP AT CHECKOUT GETS THEIR ORDER (1-star testers,
   2026-10-04: "After signing up at checkout, Place order refuses the album
   and sends the guest back to the builder" — and that detour wiped their
   address). Checkout now saves the device's draft to the new account itself.
   ══════════════════════════════════════════════════════════════════════════ */

const draft = (over: Record<string, unknown> = {}) => localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
  albumId: 'album-1', title: 'Guest HK Trip', albumSize: '6x8', accountId: null,
  albumPages: Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, slotFills: [i] })),
  uploadedPhotos: [{ id: 'a', name: 'a.jpg', previewUrl: 'blob:x', leftOut: true, kept: true, check: { v: 1, sharp: 5, hash: 'ff' } }, { id: 'b', name: 'b.jpg' }],
  coverFront: { id: 'cover' },
  ...over,
}));

beforeEach(() => localStorage.clear());

describe('albumDataFromDraft — the draft as the album row', () => {
  it('id, name, size, pages, cover, and photo metadata (never the photo bytes)', () => {
    draft();
    const a = albumDataFromDraft(JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY)!));
    expect(a).toMatchObject({ id: 'album-1', title: 'Guest HK Trip', sizePreset: '6x8', coverFront: { id: 'cover' } });
    expect(a.pages).toHaveLength(40);
    expect(a.photos).toEqual([{ id: 'a', name: 'a.jpg', check: { v: 1, sharp: 5, hash: 'ff' }, kept: true, leftOut: true }, { id: 'b', name: 'b.jpg' }]);
    expect(JSON.stringify(a)).not.toContain('blob:');
  });
});

describe('draftAlbumForAccount — only a guest\'s draft, or this account\'s', () => {
  it('a guest draft (no account yet) can be saved to the account that just signed up', () => {
    draft();
    expect(draftAlbumForAccount('user-1', 'album-1')?.id).toBe('album-1');
  });
  it('this account\'s own draft too', () => {
    draft({ accountId: 'user-1' });
    expect(draftAlbumForAccount('user-1', 'album-1')).not.toBeNull();
  });
  it('NEVER another account\'s album left on a shared device', () => {
    draft({ accountId: 'someone-else' });
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
  });
  it('not a different album, an empty one, or a missing draft', () => {
    draft();
    expect(draftAlbumForAccount('user-1', 'album-2')).toBeNull();
    draft({ albumPages: [] });
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    expect(draftAlbumForAccount('user-1', 'album-1')).toBeNull();
  });
});

describe('checkout saves it instead of sending the guest away (source guard)', () => {
  const src = readFileSync(resolve(__dirname, '../pages/Order.tsx'), 'utf8');
  it('an unsaved hand-over is saved to the new account before ordering', () => {
    expect(src).toMatch(/if \(albumId && handoff\?\.albumId === albumId && !handoff\.saved\) await saveDraftToAccount\(albumId\);/);
  });
  it('an album missing from the account is saved, then ordered (once)', () => {
    expect(src).toMatch(/e instanceof AlbumNotSavedError\) \|\| !albumId \|\| !\(await saveDraftToAccount\(albumId\)\)\) throw e;\s*created = await orderIt\(\);/);
  });
  it('the builder\'s own reset saves a leaving draft through the same shape', () => {
    expect(readFileSync(resolve(__dirname, '../pages/builder/useBuilderState.ts'), 'utf8')).toMatch(/albumDataFromDraft\(stored as StoredDraft\)/);
  });
});
