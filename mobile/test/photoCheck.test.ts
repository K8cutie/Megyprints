/* Bug hunt B-D5 (2026-11-28, confirmed by Mother): a photo made 0 bytes on the
   phone was found only after the order was saved, and the order could then
   never be finished. Now every photo the pages and cover use is checked by
   its header before the order is saved. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstNotWhole, firstUnopenable, PhotoGoneError, photoGoneSavedWords, photoGoneWords } from '../src/lib/checkout/photoCheck';
import { PhotoNotOpenedError, photosUsed } from '../src/print/printFiles';
import { photosCheckLabel } from '../src/lib/checkout/placeRun';
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

  // Mother, 2026-11-28: these three got through the first check, because the
  // phone's photo list still gave a size, and stopped only after the order row.
  it('a photo whose header can\'t be read, even when the phone\'s list still shows a size: that one', () => {
    // Emptied, but the photo list not updated yet (its old size).
    expect(firstUnopenable(used, uris, [ok('content://a'), { uri: 'content://b', readable: true, size: 275_896, width: 0, height: 0 }, ok('content://c')])).toEqual({ page: 'page 2', index: 1 });
    // Broken: 51,200 random bytes.
    expect(firstUnopenable(used, uris, [{ uri: 'content://a', readable: true, size: 51_200, width: 0, height: 0 }, ok('content://b'), ok('content://c')])).toEqual({ page: 'page 1', index: 0 });
    // Only looks like a photo (a JPEG start, then text: 902 bytes).
    expect(firstUnopenable(used, uris, [ok('content://a'), ok('content://b'), { uri: 'content://c', readable: true, size: 902, width: 0, height: 0 }])).toEqual({ page: 'the cover', index: 2 });
  });

  it('a good photo is never stopped: a size the phone can\'t tell goes on when the header is read', () => {
    expect(firstUnopenable(used, uris, [{ uri: 'content://a', readable: true, size: 0, width: 4000, height: 3000 }, { uri: 'content://b', readable: true, size: 3_100_000, width: 3024, height: 4032 }, ok('content://c')])).toBeNull();
    // Not inspected at all (an older build): goes on.
    expect(firstUnopenable(used, uris, [])).toBeNull();
  });

  it('a page pointing at a photo the album has no address for: that one', () => {
    expect(firstUnopenable(used, ['content://a', '', 'content://c'], uris.map(ok))).toEqual({ page: 'page 2', index: 1 });
  });

  // Mother, 2026-11-28: a photo cut off halfway (its header whole) passed the
  // header check, made an order row, then failed. Now each photo is opened whole.
  it("a photo that doesn't open whole (cut off halfway): that one; one the phone can't tell about goes on", () => {
    const whole = (uri: string, w: boolean | null = true) => ({ uri, whole: w });
    expect(firstNotWhole(used, uris, uris.map((u) => whole(u)))).toBeNull();
    expect(firstNotWhole(used, uris, [whole('content://a'), whole('content://b', false), whole('content://c')])).toEqual({ page: 'page 2', index: 1 });
    expect(firstNotWhole(used, uris, [whole('content://a'), whole('content://b'), whole('content://c', false)])).toEqual({ page: 'the cover', index: 2 });
    // Android 8 and older can't tell (null), and an older build checks nothing: goes on.
    expect(firstNotWhole(used, uris, uris.map((u) => whole(u, null)))).toBeNull();
    expect(firstNotWhole(used, uris, [])).toBeNull();
  });

  it('the words: which photo, where, and what to do; for a saved order, how to finish it', () => {
    expect(photoGoneWords({ page: 'page 40', index: 62 })).toBe("Photo 63 on page 40 can't be opened on this phone: it may have been deleted, moved or damaged. Open page 40, put that photo in again or pick another one, then tap Place order again.");
    expect(photoGoneWords({ page: 'the cover', index: 0 })).toMatch(/^Photo 1 on the cover can't be opened .* Open the cover, /);
    // Not final (Mother): with the photo back on the phone, the same order finishes.
    expect(photoGoneSavedWords({ page: 'page 40', index: 62 })).toBe("Photo 63 on page 40 can't be opened on this phone. If you deleted it, put it back from your gallery's trash, then open Your orders and tap Finish sending. If you can't, cancel this order in Your orders and order the album again, or message us and we'll help.");
    // A photo that fails while the files are made (the order is saved by then) says the same.
    expect(new PhotoNotOpenedError('page 71', 154).message).toBe(photoGoneSavedWords({ page: 'page 71', index: 154 }));
    expect(photosCheckLabel(120, 557)).toBe('Checking your photos… 120 of 557');
    expect(photosCheckLabel(557, 557)).toBe('Checking your photos…');
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
    const whole = src.indexOf('if (broken) throw new PhotoGoneError(broken, !!o.placed);');
    expect(check).toBeGreaterThan(0);
    expect(whole).toBeGreaterThan(check);
    expect(whole).toBeLessThan(src.indexOf('return await sendOrder(o.plan,'));
    expect(src).toContain("const opens = await photosOpenWhole(wanted, (done, total) => o.onStep({ step: 'photosCheck', done, total })).catch(() => null);");
  });
});
