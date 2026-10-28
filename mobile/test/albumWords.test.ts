/* The app's album steps say what the website says for the same step. The
   website's words live in its .tsx screens (with its icons, so they can't be
   shared as they are): each phrase the app reuses must still be in the
   website's file AND in the app's, so a change on one side shows here. */
import fs from 'node:fs';
import path from 'node:path';
import { COVER_PHOTOS_SHOWN, COVER_TO_PAGES, COVER_TO_PHOTOS, GENERATING_COPY, MAKE_ALBUM, SIZE_LINE, TO_COVER } from '../src/builder/albumFlow';

const REPO = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const web = {
  wizard: read('src/assistant/wizard.ts'),
  theme: read('src/assistant/AlbumThemeStep.tsx'),
  setup: read('src/pages/builder/BuilderSetup.tsx'),
  cover: read('src/pages/builder/CoverEditor.tsx'),
  making: read('src/pages/builder/GeneratingOverlay.tsx'),
  preview: read('src/pages/builder/BuilderPreview.tsx'),
  turn: read('src/pages/builder/PreviewTurnBar.tsx'),
};
const app = {
  name: read('mobile/src/app/album-name.tsx'),
  size: read('mobile/src/app/album-size.tsx'),
  cover: read('mobile/src/app/album-cover.tsx'),
  making: read('mobile/src/app/making.tsx'),
  preview: read('mobile/src/app/preview.tsx'),
};

describe("the app's album steps use the website's words", () => {
  it('the ways on (wizard.ts)', () => {
    for (const w of [MAKE_ALBUM, TO_COVER, COVER_TO_PAGES, COVER_TO_PHOTOS]) expect(web.wizard).toContain(`'${w}'`);
    expect(app.size).toContain(COVER_TO_PHOTOS);
  });

  it('"Making your album" (GeneratingOverlay.tsx)', () => {
    for (const w of Object.values(GENERATING_COPY)) expect(web.making).toContain(`'${w}'`);
    for (const w of ['Making your album', 'Please stand by while Megy does the magic. This takes a few seconds.']) {
      expect(web.making).toContain(w);
      expect(app.making).toContain(w);
    }
  });

  it('the sizes (BuilderSetup.tsx)', () => {
    for (const w of Object.values(SIZE_LINE)) expect(web.setup).toContain(`'${w}'`);
    expect(web.setup).toContain('Choose the size that fits your photos best. You can always change this later');
    expect(app.size).toContain('Choose the size that fits your photos best. You can always change this later');
  });

  it('the name and occasion (AlbumThemeStep.tsx)', () => {
    for (const w of ['Album name', "e.g. Maria's Debut, Our Boracay Trip", 'What is it about?', "e.g. Beach trip, Debut, Reunion, Lola's 80th", 'Something else',
      'Name your album and choose an occasion to continue.', 'Name your album to continue.', 'Choose an occasion to continue.', "It's how you'll find this album again in"]) {
      expect(web.theme).toContain(w);
      expect(app.name).toContain(w);
    }
  });

  it('the cover (CoverEditor.tsx)', () => {
    expect(web.cover).toContain(`COVER_PHOTOS_SHOWN = ${COVER_PHOTOS_SHOWN}`);
    for (const w of ['Design your cover', 'Pick 1 photo for the front cover', 'Your photos, best ones first. Tap one.', 'Cover title', 'e.g. The Cruz Family',
      'Too long for the front cover: part of it will be cut off in print. Shorten it', ', or make the text smaller', 'Make it fit (size ', 'Show fewer']) {
      expect(web.cover).toContain(w);
      expect(app.cover).toContain(w);
    }
  });

  it('the preview (BuilderPreview.tsx, PreviewTurnBar.tsx)', () => {
    for (const w of ['See it as an open book', 'One page at a time', 'Inside of the ']) {
      expect(web.preview).toContain(w);
      expect(app.preview).toContain(w);
    }
    expect(web.turn).toContain('Previous {word}');
    expect(web.turn).toContain('Next {word}');
    expect(app.preview).toContain('Previous ${word}');
    expect(app.preview).toContain('Next ${word}');
  });
});
