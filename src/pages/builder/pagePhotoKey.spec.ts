import { describe, it, expect } from 'vitest';
import { pagePhotoKey } from './pagePhotoKey';
import type { AlbumPage, UploadedPhoto } from './types';

/* The desktop editor (Fabric) repaints only when the page's fingerprint
   changes. After a reload every saved blob: URL is dead; IndexedDB hands back
   new URLs for the SAME photo indexes, so a fingerprint made of indexes never
   changed and the page stayed photo-less until the customer turned the page.
   The photo half of the fingerprint is these URLs. */
const page = (p: Partial<AlbumPage> = {}): AlbumPage => ({
  id: 'p', layout: 'freeform', size: '8x8', background: { type: 'solid', solid: '#FFFFFF' },
  photos: [], textElements: [], ...p,
});
const photo = (id: string, previewUrl: string): UploadedPhoto => ({ id, previewUrl, name: `${id}.jpg`, type: 'image/jpeg', size: 1, width: 640, height: 480 });

describe('pagePhotoKey', () => {
  const dead = [photo('a', 'blob:x/dead-a'), photo('b', 'blob:x/dead-b'), photo('c', 'blob:x/dead-c')];
  const live = [photo('a', 'blob:x/live-a'), photo('b', 'blob:x/live-b'), photo('c', 'blob:x/dead-c')];

  it('changes when the URLs behind the same slot indexes change (the reload case)', () => {
    const p = page({ slotFills: [0, 1] });
    expect(pagePhotoKey(p, dead)).not.toBe(pagePhotoKey(p, live));
  });

  it('counts photos inside caption boxes', () => {
    const p = page({ slotFills: [null], textSlotFills: [0] });
    expect(pagePhotoKey(p, dead)).not.toBe(pagePhotoKey(p, live));
  });

  it('counts a photo background (resolved by photo id, not by the stored URL)', () => {
    const p = page({ background: { type: 'image', image: 'blob:x/stale', photoId: 'b' } });
    expect(pagePhotoKey(p, dead)).not.toBe(pagePhotoKey(p, live));
  });

  it('ignores photos the page does not show — no repaint for a URL elsewhere in the album', () => {
    const p = page({ slotFills: [2] }); // photo c — the only one whose URL did not change
    expect(pagePhotoKey(p, dead)).toBe(pagePhotoKey(p, live));
  });

  it('tolerates empty slots, missing arrays and indexes past the end', () => {
    expect(() => pagePhotoKey(page({ slotFills: [null, 7] }), dead)).not.toThrow();
    expect(pagePhotoKey(page(), dead)).toBe(pagePhotoKey(page(), live));
  });
});
