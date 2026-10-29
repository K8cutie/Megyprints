/* ══════════════════════════════════════════════════════════════════════════
   PART 3: THE COVER EDITOR (src/editor/cover), what it says and how it is
   reached. This file belongs to the cover part.

     • its words are the website's own for the same control (CoverEditor.tsx,
       PageColorPicker.tsx, FontList.tsx, BuilderPreview.tsx), each still in
       the website's file, so a change on one side shows here;
     • the calls it makes are the ones CoverEditor.tsx makes (the website's
       source still says them: test/editorCoverEdits.test.ts makes them on
       the real builder);
     • the way in: a "Cover" tile before page 1 in the Edit pages strip that
       opens the cover screen's own route (src/app/edit-cover.tsx);
     • no Undo or Redo on the cover screen (the cover is not in the album's
       history, as the website's cover editor has none).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { router } from 'expo-router';
import { BLANK_COVER_MESSAGE as WEB_BLANK } from '@web/pages/builder/orderReadiness';
import { editorParts, stripTiles } from '../src/editor/registry';
import '../src/editor/parts';
import { BLANK_COVER_MESSAGE } from '../src/editor/cover/coverChecks';
import { COVER_ROUTE } from '../src/editor/cover';
import { COVER_PAPER, TITLE_SIZE, ZOOM_RANGE } from '../src/editor/cover/coverEdits';
import { COVER_PHOTOS_SHOWN } from '../src/builder/albumFlow';
import * as W from '../src/editor/cover/words';

const REPO = path.resolve(__dirname, '..', '..');
/** A file's text, its line ends as \n whatever the checkout made them (Windows: \r\n). */
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8').replace(/\r\n/g, '\n');
const web = {
  cover: read('src/pages/builder/CoverEditor.tsx'),
  designer: read('src/pages/builder/BackgroundDesigner.tsx'),
  colours: read('src/pages/builder/PageColorPicker.tsx'),
  fonts: read('src/pages/builder/FontList.tsx'),
  preview: read('src/pages/builder/BuilderPreview.tsx'),
};
const app = {
  screen: read('mobile/src/editor/cover/CoverScreen.tsx'),
  route: read('mobile/src/app/edit-cover.tsx'),
  layout: read('mobile/src/app/_layout.tsx'),
};

describe("the cover editor uses the website's words", () => {
  it('the header, the line under the cover, the tabs (CoverEditor.tsx) and the caption (BuilderPreview.tsx)', () => {
    expect(web.cover).toContain(`>${W.DESIGN_YOUR_COVER}</h2>`);
    expect(web.cover).toContain(`data-testid="cover-one-photo">${W.ONE_PHOTO}</p>`);
    expect(web.cover).toContain(W.BACK_NOTE);
    expect(web.cover).toContain(`{ key: 'background', label: '${W.TABS.background}' }`);
    expect(web.cover).toContain(`{ key: 'text', label: '${W.TABS.text}' }`);
    expect(web.preview).toContain(`data-testid="preview-caption">${W.FRONT_COVER}</span>`);
    expect(web.preview).toContain(`<Pencil size={13} /> ${W.EDIT_COVER}`);
  });

  it('the Background tab (CoverEditor.tsx, PageColorPicker.tsx)', () => {
    expect(web.cover).toContain(`>${W.YOUR_PHOTOS}</span>`);
    expect(web.cover).toContain(`'${W.SHOW_FEWER}'`);
    expect(web.cover).toContain('`Show all ${coverPhotos.length} photos`');
    expect(W.showAllPhotos(57)).toBe('Show all 57 photos');
    expect(web.cover).toContain(`mb-1.5">${W.COLOUR}</span>`);
    expect(web.cover).toContain(`>${W.ZOOM}</span>`);
    expect(web.cover).toContain(`\n                  ${W.RESET}\n`);
    expect(web.cover).toContain(W.DRAG_HINT);
    expect(web.cover).toContain(`<X size={12} /> ${W.REMOVE_PHOTO}`);
    expect(web.colours).toContain('Use {current.name.toLowerCase()} on every page');
    expect(W.useOnEveryPage('Blue')).toBe('Use blue on every page');
  });

  it('the Text tab (CoverEditor.tsx, FontList.tsx)', () => {
    expect(web.cover).toContain(`>${W.COVER_TITLE}</span>`);
    expect(web.cover).toContain(`placeholder="${W.TITLE_PLACEHOLDER}"`);
    expect(web.cover).toContain("Too long for the front cover: part of it will be cut off in print. Shorten it{titleFit.fitsAt ? ', or make the text smaller' : ''}.");
    expect(W.tooLongLine(true)).toBe('Too long for the front cover: part of it will be cut off in print. Shorten it, or make the text smaller.');
    expect(W.tooLongLine(false)).toBe('Too long for the front cover: part of it will be cut off in print. Shorten it.');
    expect(web.cover).toContain('Make it fit (size {titleFit.fitsAt})');
    expect(W.makeItFit(22)).toBe('Make it fit (size 22)');
    expect(web.cover).toContain(`mb-1">${W.FONT}</span>`);
    expect(web.cover).toContain(`mb-1">${W.ALIGNMENT}</span>`);
    expect(web.cover).toContain('title={`Align ${a}`}');
    expect(W.alignLabel('center')).toBe('Align center');
    expect(web.cover).toContain(`mb-1">${W.STYLE}</span>`);
    expect(web.cover).toContain(`label: '${W.BOLD}'`);
    expect(web.cover).toContain(`label: '${W.ITALIC}'`);
    expect(web.cover).toContain(`title="${W.SHADOW_HINT}"`);
    expect(web.cover).toContain(`\n                  ${W.SHADOW}\n`);
    expect(web.cover).toContain(`>${W.SIZE}</span>`);
    expect(web.cover).toContain('{title.fontSize}px');
    expect(W.sizeLine(32)).toBe('32px');
    expect(web.cover).toContain(`\n          ${W.DONE}\n`);
    expect(web.fonts).toContain(`aria-label="${W.FONTS_LABEL}"`);
  });

  it('the blank cover warning is the website\'s (orderReadiness, shared); the colour warning follows its spine note', () => {
    expect(BLANK_COVER_MESSAGE).toBe(WEB_BLANK);
    expect(BLANK_COVER_MESSAGE).toBe('Your front cover is blank: no title or photo on it.');
    expect(web.cover).toContain("Your colour wouldn't show on the spine");
    expect(W.TITLE_HARD_TO_SEE.startsWith("Your colour wouldn't show on")).toBe(true);
    expect(W.useInk('White')).toBe('Use white');
  });

  it('the photos shown before "Show all" are the website\'s count', () => {
    expect(web.cover).toContain(`export const COVER_PHOTOS_SHOWN = ${COVER_PHOTOS_SHOWN};`);
  });
});

describe("the cover editor makes CoverEditor's calls (the website's source still says them)", () => {
  it('a photo, a colour, the crop, Remove photo', () => {
    // BackgroundDesigner in the cover's photo-only mode, as CoverEditor passes it.
    expect(web.cover).toContain('onChange={(bg) => b.setPageBackground(bg)}');
    expect(web.designer).toContain("onClick={() => onChange({ type: 'image', image: p.previewUrl, photoId: p.id, opacity: background.opacity ?? 100 })}");
    expect(web.cover).toContain('onPick={(hex) => b.setPageColor(hex)} onPickAll={(hex) => b.applyPageColorToAllPages(hex)}');
    expect(web.cover).toContain('focusX: clamp01(d.fx - (e.clientX - d.x) / Math.max(1, dims.w)),');
    expect(web.cover).toContain('focusY: clamp01(d.fy - (e.clientY - d.y) / Math.max(1, dims.h)),');
    expect(web.cover).toContain('onChange={(e) => b.setBackgroundCrop({ zoom: Number(e.target.value) })}');
    expect(web.cover).toContain(`min={${ZOOM_RANGE.min}}\n                max={${ZOOM_RANGE.max}}\n                step={${ZOOM_RANGE.step}}`);
    expect(web.cover).toContain('b.setBackgroundCrop({ focusX: 0.5, focusY: 0.5, zoom: 1 })');
    expect(web.cover).toContain(`b.setPageBackground({ type: 'solid', solid: '${COVER_PAPER}' })`);
    expect(web.cover).toContain('!(bg as { photoId?: string }).photoId && ('); // Remove photo: not an album photo
  });

  it('the title: one merge call for every control, Shadow on = no setting, the size range, the drag kept on the cover', () => {
    expect(web.cover).toContain('const updateTitle = (patch: Partial<typeof title>) => b.setBoxText(0, { text: title.text, ...patch });');
    expect(web.cover).toContain('onChange={(e) => updateTitle({ text: e.target.value })}');
    expect(web.cover).toContain('onChange={(f) => updateTitle({ fontFamily: f })}');
    expect(web.cover).toContain('onChange={(c) => updateTitle({ color: c })}');
    expect(web.cover).toContain('onClick={() => updateTitle({ alignment: a })}');
    expect(web.cover).toContain('onClick={() => updateTitle({ [key]: !on } as Partial<typeof title>)}');
    expect(web.cover).toContain('onClick={() => updateTitle({ shadow: title.shadow ? false : undefined })}');
    expect(web.cover).toContain('onClick={() => updateTitle({ fontSize: titleFit.fitsAt! })}');
    expect(web.cover).toContain('onChange={(e) => updateTitle({ fontSize: Number(e.target.value) })}');
    expect(web.cover).toContain(`min={${TITLE_SIZE.min}}\n              max={${TITLE_SIZE.max}}\n              step={1}`);
    expect(web.cover).toContain('const clampOx = (v: number) => clampRange(v, -baseFx, 1 - boxFw - baseFx);');
    expect(web.cover).toContain('const clampOy = (v: number) => clampRange(v, -baseFy, 1 - boxFh - baseFy);');
    expect(web.cover).toContain('b.setBoxTextOffset(0,');
    // The title's defaults (CoverEditor's `title`), as coverTitleOf reads them.
    for (const d of ["fontFamily: titleEl?.fontFamily ?? DEFAULT_TITLE_FONT", "color: titleEl?.color ?? '#2D2D2D'", 'bold: titleEl?.bold ?? true', 'fontSize: titleEl?.fontSize ?? 32', 'shadow: titleEl?.shadow !== false']) {
      expect(web.cover).toContain(d);
    }
  });

  it('the cover scope: on while the editor is open, the pages again when it goes', () => {
    expect(web.cover).toContain("setEditScope('coverFront');\n    return () => setEditScope('interior');");
    expect(app.screen).toContain("setEditScope('coverFront');");
    expect(app.screen).toContain("setEditScope('interior');");
    expect(app.screen).toContain('useFocusEffect(');
  });
});

describe('the way in, and no Undo on the cover', () => {
  it('a "Cover" tile before page 1 in the Edit pages strip opens the cover screen', () => {
    expect(editorParts().some((p) => p.id === 'cover')).toBe(true);
    const tile = stripTiles().find((t) => t.id === 'cover')!;
    expect(tile.label).toBe(W.COVER_TILE);
    const push = jest.spyOn(router, 'push').mockImplementation(() => {});
    try {
      tile.onPress({} as never);
      expect(push).toHaveBeenCalledWith(COVER_ROUTE);
    } finally { push.mockRestore(); }
    expect(COVER_ROUTE).toBe('/edit-cover');
    expect(fs.existsSync(path.join(REPO, 'mobile/src/app/edit-cover.tsx'))).toBe(true);
    expect(app.route).toContain("export { default } from '../editor/cover/CoverScreen';");
    // Its own title, so the app's layout needs no line for it.
    expect(app.screen).toContain('const HEADER = { title: W.DESIGN_YOUR_COVER };');
    expect(app.screen).toContain('<Stack.Screen options={HEADER} />');
    expect(app.layout).not.toContain('edit-cover');
  });

  it('the cover screen offers no Undo or Redo (the cover is not in the album\'s history)', () => {
    for (const w of ['.undo', '.redo', 'canUndo', 'canRedo', 'headerRight', 'UNDO', 'REDO']) expect(app.screen).not.toContain(w);
    expect(web.cover).not.toMatch(/\bundo\b/i);
  });
});
