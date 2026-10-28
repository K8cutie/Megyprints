/* The "Edit pages" screen says what the website's editor says for the same
   control (src/editor/editorWords.ts). The website's words live in its .tsx
   files (with its icons, so they can't be shared as they are): each phrase
   the app reuses must still be in the website's file, so a change on one side
   shows here. "Click to add:" is shared code (chooserFit CHOOSER_TITLE). */
import fs from 'node:fs';
import path from 'node:path';
import { CHOOSER_TITLE } from '@web/pages/builder/chooserFit';
import * as words from '../src/editor/editorWords';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const web = {
  review: read('src/pages/builder/MobileReview.tsx'),
  turn: read('src/pages/builder/PageTurnBar.tsx'),
  preview: read('src/pages/builder/BuilderPreview.tsx'),
  chooser: read('src/pages/builder/SlotChooser.tsx'),
  retired: read('src/pages/builder/RemoveGraphicModal.tsx'),
  megy: read('src/assistant/MegyAssistant.tsx'),
  missing: read('src/pages/builder/MissingPhotosBar.tsx'),
};
const app = {
  screen: read('mobile/src/editor/EditPagesScreen.tsx'),
  preview: read('mobile/src/app/preview.tsx'),
};

describe("the editor uses the website's words", () => {
  it('the way in from the Preview (BuilderPreview.tsx) and the line over the page (MobileReview.tsx)', () => {
    expect(web.preview).toContain(`<ChevronLeft size={14} /> ${words.EDIT_PAGES}`);
    expect(app.preview).toContain('EDIT_PAGES');
    expect(words.pageLine(2, 40)).toBe('Page 3 of 40 · tap a photo to style it');
    expect(web.review).toContain('Page {idx + 1} of {total} · tap a photo to style it');
  });

  it('the page turn (PageTurnBar.tsx)', () => {
    expect(web.turn).toContain(`/> ${words.PREVIOUS_PAGE}`);
    expect(web.turn).toContain(`${words.NEXT_PAGE} <ChevronRight`);
    expect(web.turn).toContain(`/>} ${words.DONE_PREVIEW}`);
    expect(web.turn).toContain(`/> ${words.BACK_TO_PREVIEW}`);
  });

  it('Undo and Redo (MegyAssistant.tsx History)', () => {
    expect(web.megy).toContain(`<span>${words.UNDO}</span>`);
    expect(web.megy).toContain(`<span>${words.REDO}</span>`);
  });

  it('an empty frame or box (BuilderPreview.tsx EmptyChooserBox) and "Add to this box" (SlotChooser.tsx)', () => {
    expect(CHOOSER_TITLE).toBe('Click to add:');
    expect(web.preview).toContain(`options={${JSON.stringify(words.SLOT_OPTIONS).replace(/"/g, "'").replace(/,/g, ', ')}}`);
    expect(web.preview).toContain(`options={${JSON.stringify(words.BOX_OPTIONS).replace(/"/g, "'").replace(/,/g, ', ')}}`);
    expect(web.preview).toContain(`quote: '${words.ROLL_LABELS.quote}'`);
    expect(web.preview).toContain(`text: '${words.ROLL_LABELS.text}'`);
    expect(web.chooser).toContain(words.ADD_TO_THIS_BOX);
    for (const c of Object.values(words.CHOICE_WORDS)) expect(web.chooser).toContain(`label: '${c.label}', desc: '${c.desc}'`);
    expect(web.chooser).toContain(`aria-label="${words.CLOSE}"`);
  });

  it('a retired graphic or sticker (RemoveGraphicModal.tsx) and Remove photo (PageView)', () => {
    for (const c of Object.values(words.RETIRED_COPY)) {
      expect(web.retired).toContain(`title: '${c.title}'`);
      expect(web.retired).toContain(`body: '${c.body}'`);
    }
    expect(web.retired).toContain(words.KEEP_IT);
    expect(web.retired).toContain(`/> ${words.REMOVE}`);
    expect(web.preview).toContain(`aria-label="${words.REMOVE_PHOTO}"`);
  });

  it('photos missing on this phone (MissingPhotosBar.tsx)', () => {
    expect(web.missing).toContain('Add the photos');
    expect(app.screen).toContain('Add the photos');
  });
});
