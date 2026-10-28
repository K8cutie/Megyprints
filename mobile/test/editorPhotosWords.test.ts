/* The photos part says what the website's editor says for the same control
   (src/editor/photos/words.ts). The website's words live in its .tsx files
   (with its icons, so they can't be shared as they are): each phrase the app
   reuses must still be in the website's file, so a change on one side shows
   here. Lines from shared code (swapNotice, the blank pages reminder,
   GUARD/SOFT messages, MASKS and LOOKS labels) are the website's own and
   are imported, not copied. */
import fs from 'node:fs';
import path from 'node:path';
import * as words from '../src/editor/photos/words';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const web = {
  review: read('src/pages/builder/MobileReview.tsx'),
  studio: read('src/pages/builder/StudioPhone.tsx'),
  props: read('src/pages/builder/PropertiesPanel.tsx'),
  layout: read('src/pages/builder/LayoutPicker.tsx'),
  engine: read('src/assistant/actionEngine.ts'),
  blank: read('src/pages/builder/blankPages.ts'),
  missing: read('src/pages/builder/MissingPhotosBar.tsx'),
};

describe("the photos part uses the website's words", () => {
  it('the tools and the "Add a photo" sheet (MobileReview.tsx)', () => {
    expect(web.review).toContain(`<ImagePlus size={18} /> ${words.ADD_PHOTOS}`);
    expect(web.review).toContain(`<LayoutGrid size={18} /> ${words.CHANGE_LAYOUT}`);
    expect(web.review).toContain(`>${words.ADD_A_PHOTO}</span>`);
    expect(web.review).toContain(`<ImagePlus size={16} /> ${words.UPLOAD_MORE}`);
    expect(web.review).toContain(`>${words.NO_PHOTOS_YET}</p>`);
    expect(web.review).toContain(`'${words.THIS_PAGE}' : \`Page \${onPage + 1}\``);
    expect(words.pageTag(2)).toBe('Page 3');
  });

  it('photos missing on this phone, picked again (MissingPhotosBar.tsx)', () => {
    expect(web.missing).toContain(`<ImagePlus size={14} /> ${words.ADD_THE_PHOTOS}`);
  });

  it('a page the customer changed, and Megy putting it back (MobileReview.tsx)', () => {
    expect(web.review).toContain(`>${words.STUDIO_YOURS} · Regenerate skips it</span>`);
    expect(web.review).toContain(`<Wand2 size={11} /> ${words.STUDIO_FIX}`);
    expect(web.review).toContain(`sayGuard('${words.STUDIO_FIXED}')`);
  });

  it('Replace photo (PropertiesPanel.tsx), Mask and Filter (StudioPhone.tsx)', () => {
    expect(web.props).toContain(`title="${words.REPLACE_PHOTO}"`);
    expect(web.studio).toContain(`data-testid="pill-mask">${words.MASK}</button>`);
    expect(web.studio).toContain(`data-testid="pill-filter">${words.FILTER}</button>`);
    expect(web.studio).toContain(`label: '${words.ORIGINAL}'`);
    expect(web.studio).toContain(`>${words.MASK_HINT}</p>`);
  });

  it('"Change layout" and its question (LayoutPicker.tsx)', () => {
    expect(web.layout).toContain(`>${words.LAYOUT_TITLE}</span>`);
    expect(web.layout).toContain(`'${words.LAYOUT_CURRENT}'`);
    expect(web.layout).toContain(`>${words.LAYOUT_NONE}</p>`);
    expect(web.layout).toContain(words.LAYOUT_MEMORY_NOTE);
    // The question, piece by piece as the website writes it…
    for (const piece of [
      '“{t.name}” holds {holds} {holds === 1 ? \'photo\' : \'photos\'}.',
      "'One photo on this page doesn’t fit it.' : `${photos} photos on this page don’t fit it.`} Where should {photos === 1 ? 'it' : 'they'} go?",
      "It has no box for {captions === 1 ? 'the caption' : 'the captions'} on this page, so {captions === 1 ? 'it goes' : 'they go'} with the old layout.",
      'Put {them} on a new page after this one',
      'The album gets one more page.',
      'Take {them} out of the album',
      "{photos === 1 ? 'It stays' : 'They stay'} in your photos, ready to place again.",
      'Use this layout',
      '‹ Choose another layout',
    ]) expect(web.layout).toContain(piece);
    // …and as the app puts it together.
    const one = words.leftoverWords('Full Page', 1, 1, 0);
    expect(one).toMatchObject({
      heading: '“Full Page” holds 1 photo.', photos: 'One photo on this page doesn’t fit it. Where should it go?', captions: null,
      newPage: 'Put it on a new page after this one', leaveOut: 'Take it out of the album', leaveOutDesc: 'It stays in your photos, ready to place again.',
    });
    const two = words.leftoverWords('Two Across', 2, 3, 2);
    expect(two).toMatchObject({
      heading: '“Two Across” holds 2 photos.', photos: '3 photos on this page don’t fit it. Where should they go?',
      captions: 'It has no box for the captions on this page, so they go with the old layout.',
      newPage: 'Put them on a new page after this one', leaveOutDesc: 'They stay in your photos, ready to place again.',
    });
    expect(words.leftoverWords('X', 1, 0, 1).photos).toBeNull();
  });

  it("adding and deleting pages, and photos added (Megy's chat: actionEngine.ts)", () => {
    expect(web.engine).toContain(`message: '${words.PAGE_ADDED}'`);
    expect(web.engine).toContain('message: `Page ${idx + 1} deleted.`');
    expect(words.pageDeleted(5)).toBe('Page 6 deleted.');
    expect(web.engine).toContain("`${restored} photo${restored > 1 ? 's' : ''} put back in ${restored > 1 ? 'their places' : 'its place'}");
    expect(web.engine).toContain("`${added} photo${added > 1 ? 's' : ''} added`");
    expect(web.engine).toContain('`${skipped} already in your album`');
    expect(web.engine).toContain("`${parts.join(' · ')}.`");
    expect(words.addedLine({ added: 3, restored: 1, skipped: 2, unreadable: 0 })).toBe('1 photo put back in its place · 3 photos added · 2 already in your album.');
    expect(words.addedLine({ added: 0, restored: 0, skipped: 0, unreadable: 0 })).toBeNull();
  });

  it("the app's own lines say what happens, in the website's way of saying the 40-page floor (blankPages.ts)", () => {
    expect(web.blank).toContain('`Albums need at least ${MIN_ALBUM_PAGES} pages, so ');
    expect(words.CANT_DELETE_PAGE).toBe("Albums need at least 40 pages, so a page can't be deleted.");
    expect(words.deletePageLabel(4)).toBe('Delete page 5');
    for (const w of [words.SWAP_PHOTO, words.SWAP_LINE, words.CANCEL, words.MOVE_HINT, words.PAGES_TOOL, words.PAGES_TITLE, words.ADD_PAGE, words.ADD_PAGE_DESC, words.DELETE_PAGE_DESC]) {
      expect(w.trim()).toBe(w);
      expect(w.length).toBeGreaterThan(0);
      expect(w).not.toMatch(/[A-Z]{3,}/); // no shouting
    }
  });
});
