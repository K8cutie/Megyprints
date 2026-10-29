/* ══════════════════════════════════════════════════════════════════════════
   THE SAME EDITS ON THE WEBSITE AND IN THE APP (2.0, Phase 4).

   SCENARIOS[0]'s album is made on both sides (the website's builder in
   jsdom: tools/parity/webEdits.spec.ts, run again by this test; the app's
   steps here: test/editorHarness madeAlbum), then EDIT_PLAN's edits
   (tools/parity/scenarios.ts), each through that side's own editor. Here,
   the app editor's own code: a tap and the photos part's "Remove photo",
   its "Add a photo" pick (placePicked), its move and zoom (storeFraming,
   what the finger stores), its Change layout (chooseLayout), the text
   editor's Done (wordsFlow saveWords with contentOf, from the editor's own
   opening state), the Page colour sheet (pickPageColour), the cover editor's
   calls (coverEdits) and "Add a page" (addPageAfter). Every page and the
   cover must then be the same as the website's, field for field.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getTemplateById } from '@web/pages/builder/pageTemplates';
import { EDIT_PLAN, editedAlbum, SCENARIOS } from '../../tools/parity/scenarios';
import { selectedActionsFor } from '../src/editor/registry';
import { editThePages } from '../src/editor/scope';
import { addPageAfter, chooseLayout, layoutChoices, placePicked, storeFraming } from '../src/editor/photos/actions';
import { contentOf, editorStateOf, initialContent, saveWords, type WordsTarget } from '../src/editor/text/wordsFlow';
import { pickPageColour } from '../src/editor/text/PageColourSheet';
import { moveCoverTitle, panCoverPhoto, setTitleColour, setTitleFont, toggleTitleBold, toggleTitleShadow } from '../src/editor/cover/coverEdits';
import '../src/editor/parts';
import { REPO_ROOT } from './golden/headless';
import { act, builder, ctxOn, madeAlbum, settle, tapOn, useEditorBench } from './editorHarness';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true }, useFocusEffect: jest.fn() }));

useEditorBench();

interface WebEdits { steps: string[]; before: unknown; after: unknown }

/** The website's half, made now (a few seconds). */
function websiteEdits(): WebEdits {
  execSync('npx vitest run --config tools/parity/vitest.edits.config.ts', { cwd: REPO_ROOT, stdio: 'pipe', timeout: 300_000 });
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'tools', 'parity', 'out', 'web-edits.json'), 'utf8')) as WebEdits;
}

const firstPhotoOn = (platform: Awaited<ReturnType<typeof madeAlbum>>) => ctxOn(platform).targets.find((t) => t.kind === 'photo')!;
const step = async (fn: () => void) => { await act(async () => { fn(); }); await settle(); };

describe('the same edits on the website and in the app', () => {
  it('every page and the cover come out the same, field for field', async () => {
    const web = websiteEdits();
    expect(web.steps).toHaveLength(7);
    const platform = await madeAlbum(SCENARIOS[0]);
    await step(() => editThePages(builder()));
    // The same album before any edit.
    expect(editedAlbum(builder())).toEqual(web.before);

    // Remove photo (a tap, then the photos part's button), then "Add a photo".
    const R = EDIT_PLAN.remove;
    await step(() => builder().goToPage(R.page));
    const t = firstPhotoOn(platform);
    await tapOn(platform, t);
    let ctx = ctxOn(platform);
    const remove = selectedActionsFor(ctx.selected!, ctx).find((a) => a.id === 'remove')!;
    await step(() => remove.onPress(ctx.selected!, ctx));
    const fromPage = builder().albumPages[R.fromPage];
    const from = fromPage.slotFills![(fromPage.slotFills ?? []).findIndex((f) => f != null)]!;
    await step(() => placePicked(ctxOn(platform), { kind: 'slot', index: t.index }, from));

    // Move and zoom: what the finger stores (FramingGesture → storeFraming).
    const F = EDIT_PLAN.frame;
    await step(() => builder().goToPage(F.page));
    const f = firstPhotoOn(platform);
    await step(() => storeFraming(ctxOn(platform), f.index, [{ kind: 'offset', dx: F.dx, dy: F.dy }]));
    await step(() => storeFraming(ctxOn(platform), f.index, [{ kind: 'scale', zoom: F.zoom }]));

    // Change layout: the same choice (the first other layout that takes nothing off).
    await step(() => builder().goToPage(EDIT_PLAN.layout.page));
    ctx = ctxOn(platform);
    const layout = layoutChoices(ctx).find((x) => {
      if (x.id === ctx.page.templateId) return false;
      const l = builder().layoutChangeLoses(x.id);
      return l.photos === 0 && l.captions === 0;
    })!;
    let asked: unknown = 'not yet';
    await step(() => { asked = chooseLayout(ctxOn(platform), layout); });
    expect(asked).toBeNull(); // applied at once

    // The text editor's Done.
    const C = EDIT_PLAN.caption;
    const at = builder().albumPages.findIndex((p, i) => i >= C.from && (p.templateId ? getTemplateById(p.templateId)?.textSlots?.length ?? 0 : 0) > 0);
    await step(() => builder().goToPage(at));
    const target: WordsTarget = { kind: 'box', boxIndex: 0 };
    const page = builder().albumPages[at];
    const typed = { ...editorStateOf(initialContent(page, target)), text: C.text, fontSize: C.fontSize, fontFamily: C.fontFamily, color: C.color, bold: C.bold, alignment: C.alignment };
    await step(() => saveWords(builder(), page, at, target, contentOf(typed)));

    // Page colour.
    await step(() => builder().goToPage(EDIT_PLAN.colour.page));
    await step(() => pickPageColour(builder(), EDIT_PLAN.colour.hex));

    // The cover editor (its scope on while it is open).
    const V = EDIT_PLAN.cover;
    await step(() => builder().setEditScope('coverFront'));
    await step(() => { setTitleFont(builder(), V.font); });
    await step(() => { setTitleColour(builder(), V.color); });
    await step(() => { toggleTitleBold(builder()); });
    await step(() => { toggleTitleShadow(builder()); });
    await step(() => { panCoverPhoto(builder(), { focusX: 0.5, focusY: 0.5 }, 0.5 - V.focus.x, 0.5 - V.focus.y); });
    await step(() => { moveCoverTitle(builder(), { offsetX: 0, offsetY: 0 }, 0, V.titleUp); });
    await step(() => builder().setEditScope('interior'));

    // "Add a page".
    await step(() => builder().goToPage(EDIT_PLAN.addAfter));
    await step(() => addPageAfter(ctxOn(platform)));

    const app = editedAlbum(builder()) as { pages: unknown[]; cover: unknown };
    const site = web.after as { pages: unknown[]; cover: unknown };
    expect(app.pages).toHaveLength(site.pages.length);
    // Page by page, so a difference names its page.
    for (let i = 0; i < site.pages.length; i++) expect({ page: i + 1, fields: app.pages[i] }).toEqual({ page: i + 1, fields: site.pages[i] });
    expect(app.cover).toEqual(site.cover);
    // And the edits did land (not two unchanged albums).
    expect(app).not.toEqual(web.before);
  }, 300_000);
});
