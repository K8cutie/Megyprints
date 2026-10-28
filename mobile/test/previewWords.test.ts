/* The Preview's own rules (2.0, Phase 3 review fixes):
     • it sends the album to the account ONCE per album made (and once more
       after signing in), not every time it opens: re-saving an unchanged
       album moves its "last changed" time, and a website tab working from
       the older copy is then asked "edited on another device?" for nothing;
     • photos this phone no longer has are named, page by page, with the way
       to put them back (the website's MissingPhotosBar, for a phone). */
import { memoryStore } from '../src/builder/deviceStore';
import { accountSaveDue, markAccountSaved } from '../src/builder/accountSave';
import { missingOnPhoneMessage, NOT_DRAWN_LINE, PAGE_NOT_SHOWN } from '../src/builder/screenWords';

describe('the Preview sends the album to the account once per album made', () => {
  it('due the first time, not again for the same album as made then', () => {
    const store = memoryStore();
    expect(accountSaveDue(store, 'album-1', 1_000)).toBe(true);
    markAccountSaved(store, 'album-1', 1_000);
    expect(accountSaveDue(store, 'album-1', 1_000)).toBe(false);
  });

  it('due again when the album is made again, or for another album', () => {
    const store = memoryStore();
    markAccountSaved(store, 'album-1', 1_000);
    expect(accountSaveDue(store, 'album-1', 2_000)).toBe(true);
    expect(accountSaveDue(store, 'album-2', 1_000)).toBe(true);
  });

  it('never for an album with no id or never made', () => {
    const store = memoryStore();
    expect(accountSaveDue(store, undefined, 1_000)).toBe(false);
    expect(accountSaveDue(store, 'album-1', 0)).toBe(false);
  });
});

describe('what the Preview says', () => {
  it('names the pages missing a photo, and how to put them back', () => {
    expect(missingOnPhoneMessage({ count: 0, pages: [], cover: false } as never)).toBe('');
    expect(missingOnPhoneMessage({ count: 1, pages: [4], cover: false } as never))
      .toBe("1 photo on page 4 isn't on this phone any more, so it shows as an empty space. Pick the same photo again and Megy puts it back in its place.");
    expect(missingOnPhoneMessage({ count: 3, pages: [2, 9], cover: true } as never))
      .toBe("3 photos on pages 2 and 9 and the cover aren't on this phone any more, so they show as an empty space. Pick the same photos again and Megy puts each one back in its place.");
    expect(missingOnPhoneMessage({ count: 9, pages: [1, 2, 3, 4, 5, 6, 7], cover: false } as never)).toMatch(/^9 photos on 7 pages /);
  });

  it('no developer words on screen: no font names, no raw errors', () => {
    expect(NOT_DRAWN_LINE).not.toMatch(/Cinzel|Georgia|font "/);
    expect(PAGE_NOT_SHOWN).not.toMatch(/Error|undefined/);
  });
});
