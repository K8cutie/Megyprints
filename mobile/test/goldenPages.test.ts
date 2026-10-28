/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   WHY THIS TEST: the riskiest part of the 2.0 app. When the app makes the
   print files itself, every page and the cover must come out the way the
   website's print renderer makes them today. A photo shifted a pixel, a
   caption broken onto a different line or drawn in the wrong colour, a frame
   line missing, a texture in the wrong tint, a QR code a pixel off, a
   sticker left out, a cover title without its shadow: the printed book is
   wrong and nobody sees it until it is in a customer's hands.

   So the app's renderer (src/render) draws the golden pages and covers (the
   website's own seeded album generator on all five sizes, plus hand-made
   pages: pans, zooms, every mask, washes, every frame, captions in every
   font style, quotes, titles, a Display P3 photo, page textures, memory QR
   codes, graphics, stickers, colour looks, soft and textured edges, corner
   art, photo backgrounds, a phone-size photo in small frames; and cover
   files, cover pages and the old cover form) headless in Node with Skia's
   CanvasKit build, and every one is compared, pixel by pixel, with the
   picture the website's printPipeline draws of it in headless Chromium
   (tools/golden/renderWeb.mjs, run again before the tests whenever the
   website's print code, the golden pages, the tool or the fonts changed
   since the last pictures: test/golden/webPictures.cjs). One with words is
   drawn twice on both sides, with and without them, so the words' own
   pixels are known exactly.

   Three files, run side by side (shared parts: test/golden/harness.ts):
   this one, every golden page; goldenCovers.test.ts, every cover file, the
   QR chip's printed size and every texture tile; goldenMistakes.test.ts,
   the mistakes the check must catch and the phone's golden run.

   The bars (the numbers, and why: test/golden/compare.ts):
     • everything but the words' ink: at most MAX_DIFF_OUTSIDE_WORDS of the
       pixels differ at pixelmatch 0.05; no 64 px tile more than
       MAX_TILE_DIFF off by 32 levels, nor its mean colour more than
       MAX_TILE_MEAN_LEVELS off;
     • each text's ink: the same amount and colour, block by block, sitting
       within 0.5 px of the website's;
     • each line: the line print drew, at print's spot, as wide, in print's
       colour, outline and shadow (test/golden/words.ts);
     • a golden page uses only what the app draws (notDrawn empty) and every
       picture it names opens.
   Outputs (the app's pictures, a diff picture per page, report-pages.json):
   tools/golden/out/.
   ══════════════════════════════════════════════════════════════════════════ */
import { check, caseNamed, finishGolden, goldenLists, record, setupGolden } from './golden/harness';

const { golden } = goldenLists();
const pageNames = golden.cases.map((c) => c.name);

beforeAll(setupGolden, 600_000);
afterAll(() => finishGolden('pages'));

describe('the app draws every golden page the way the website prints it', () => {
  it('has golden pages to compare', () => expect(pageNames.length).toBeGreaterThan(70));

  it.each(pageNames)('%s', (name) => {
    const { c, plan, W, H } = caseNamed(name);
    const r = check(name);
    record(c.name, c.kind, c.albumSize, c.checks, r, plan.notDrawn, W, H);

    expect(plan.notDrawn).toEqual([]); // a golden page only uses what the app draws
    expect(r.missing).toEqual([]); // and every picture it names opens
    expect(r.lines).toEqual([]);
    expect(r.failures).toEqual([]);
  }, 120_000);
});
