/* Bug hunt B-D5 (2026-11-28, confirmed by Mother): a photo made 0 bytes on the
   phone was found only after the order was saved, and the order could then
   never be finished. Now every photo the pages and cover use is checked by
   its header before the order is saved. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstUnopenable, PhotoGoneError, photoGoneSavedWords, photoGoneWords } from '../src/lib/checkout/photoCheck';
import { photosUsed } from '../src/print/printFiles';
import { fixtureCheckoutAlbum } from '../src/lib/checkout/fixtureAlbum';

const ok = (uri: string) => ({ uri, readable: true, size: 2_400_000, width: 4000, height: 3000 });

describe('the photo check before an order is saved', () => {
  const used = [{ page: 'page 1', index: 0 }, { page: 'page 2', index: 1 }, { page: 'the cover', index: 2 }];
  const uris = ['content://a', 'content://b', 'content://c'];

  it('every photo opens: nothing to say', () => {
    expect(firstUnopenable(used, uris, uris.map(ok))).toBeNull();
  });

  it('a photo the phone can no longer open (deleted, access taken back): that one, where it is used', () => {
    expect(firstUnopenable(used, uris, [ok('content://a'), { ...ok('content://b'), readable: false }, ok('content://c')])).toEqual({ page: 'page 2', index: 1 });
  });

  it('a 0-byte file (no header, no bytes): that one', () => {
    expect(firstUnopenable(used, uris, [ok('content://a'), ok('content://b'), { uri: 'content://c', readable: true, size: 0, width: 0, height: 0 }])).toEqual({ page: 'the cover', index: 2 });
  });

  it('a photo whose size or header the phone just can\'t tell goes on, as before (no good photo is stopped)', () => {
    expect(firstUnopenable(used, uris, [{ uri: 'content://a', readable: true, size: 0, width: 4000, height: 3000 }, { uri: 'content://b', readable: true, size: 2_000_000, width: 0, height: 0 }, ok('content://c')])).toBeNull();
    // Not inspected at all (an older build): goes on.
    expect(firstUnopenable(used, uris, [])).toBeNull();
  });

  it('a page pointing at a photo the album has no address for: that one', () => {
    expect(firstUnopenable(used, ['content://a', '', 'content://c'], uris.map(ok))).toEqual({ page: 'page 2', index: 1 });
  });

  it('the words: which photo, where, and what to do; for a saved order, how out', () => {
    expect(photoGoneWords({ page: 'page 40', index: 62 })).toBe("Photo 63 on page 40 can't be opened on this phone: it may have been deleted or moved. Open page 40, put that photo in again or pick another one, then tap Place order again.");
    expect(photoGoneWords({ page: 'the cover', index: 0 })).toMatch(/^Photo 1 on the cover can't be opened .* Open the cover, /);
    expect(photoGoneSavedWords({ page: 'page 40', index: 62 })).toBe("Photo 63 on page 40 can't be opened on this phone, so this order can't be finished here. Cancel it in Your orders and order the album again, or message us and we'll help.");
    expect(new PhotoGoneError({ page: 'page 40', index: 62 }, false).message).toBe(photoGoneWords({ page: 'page 40', index: 62 }));
    expect(new PhotoGoneError({ page: 'page 40', index: 62 }, true).message).toBe(photoGoneSavedWords({ page: 'page 40', index: 62 }));
  });
});

describe('which photos an album uses (the same lists the print files draw from)', () => {
  it("every page's photos, each with its page", () => {
    const a = fixtureCheckoutAlbum();
    const list = photosUsed({ albumSize: a.albumSize, pages: a.pages, photoCount: a.photoUris.length, photoIds: a.photoIds, coverFront: null }, { cover: 'softcover', material: 'matte' }, undefined as never);
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list.map((u) => u.page)).size).toBeGreaterThan(1);
    for (const u of list) {
      expect(u.page).toMatch(/^page \d+$/);
      expect(u.index).toBeGreaterThanOrEqual(0);
      expect(u.index).toBeLessThan(a.photoUris.length);
    }
  });

  it('the send checks them before any order row', () => {
    const src = readFileSync(path.join(__dirname, '../src/lib/checkout/phoneSend.ts'), 'utf8').replace(/\r\n/g, '\n');
    const check = src.indexOf('if (gone) throw new PhotoGoneError(gone, !!o.placed);');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf('return await sendOrder(o.plan,'));
  });
});
