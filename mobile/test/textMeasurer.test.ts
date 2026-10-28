/* ══════════════════════════════════════════════════════════════════════════
   THE APP'S CAPTION MEASURER GIVES THE WEBSITE'S CAPTION FIT.

   The album builder (shared code) asks textFit whether a caption fits its box
   and, when it doesn't, the largest size at which it would (the website shows
   "Make it fit (size 22)" and makes a new caption smaller to fit). The
   website measures with Chromium's canvas; the app with the page renderer's
   Skia fonts (src/builder/textMeasurer.ts). This holds the app's answers, for
   every caption in tools/golden/fitCases.ts (the golden pages' captions, 216
   made to need shrinking in every bundled font and style, two cover titles),
   to the answers the website's own textFit gives in headless Chromium with
   the same font files (tools/golden/fitWeb.mjs, run again here when the
   website's textFit, the cases or the fonts changed):
     • the same box, the same "fits", the same "fits at" size, the same room
       ("Write a line for this photo" writes for that many letters), except
       where a line sits within 0.2 px of the box's edge, so that Chromium
       and Skia measuring it 0.02 px apart wraps it differently: such a
       caption is named in the log, and at most 1% of them may be (measured:
       1 of 252, "happy day" in DM Sans bold at 42 px, 0.005 px inside the
       box in Skia; the website then says size 41, the app 42);
     • every word and every whole line measured within 0.2 px of Chromium
       (measured: worst 0.15 px, DM Sans regular, where Chromium on Windows
       rounds each glyph's advance a little differently).
   Skia runs headless here (CanvasKit); the phone's own Skia measured the
   golden lines within the same bars (PR #219).
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AlbumPage, AlbumSizePreset } from '@web/pages/builder/types';
import { captionBoxSize, captionFits, coverTitleFit, quoteRoom } from '@web/pages/builder/textFit';
import { PageText } from '../src/render/pageText';
import { BUNDLED_FONTS } from '../src/render/fontTable';
import { parseCssFont, skiaTextMeasurer } from '../src/builder/textMeasurer';
import { headlessSkia, fontFiles, fontPath, REPO_ROOT } from './golden/headless';

interface FitCase { name: string; page: AlbumPage; albumSize: AlbumSizePreset; pageIndex: number; boxIndex: number; cover?: boolean }
interface Answer { name: string; box: { w: number; h: number }; fit: { fits: boolean; fitsAt: number | null } | null; room: number | null; font: string; widths: { text: string; width: number }[] }
interface FitFile { fingerprint: { sources: string; tools: string; fonts: string }; chromium: string; cases: FitCase[]; answers: Answer[] }

const TOOL = path.join(REPO_ROOT, 'tools', 'golden');
const OUT = path.join(TOOL, 'web-fit', 'textfit.json');

function stale(): string | null {
  if (!fs.existsSync(OUT)) return 'not made yet';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fitFingerprint } = require(path.join(TOOL, 'fitSources.cjs')) as { fitFingerprint: (fonts: string[]) => FitFile['fingerprint'] };
  const now = fitFingerprint(BUNDLED_FONTS.map((f) => fontPath(f.file)));
  const was = (JSON.parse(fs.readFileSync(OUT, 'utf8')) as FitFile).fingerprint;
  if (was.sources !== now.sources) return "the website's textFit (or a file it imports) changed";
  if (was.tools !== now.tools) return 'the fit tools changed';
  if (was.fonts !== now.fonts) return 'the font files changed';
  return null;
}

function ensureWebAnswers(): FitFile {
  const why = stale();
  if (why) {
    if (!fs.existsSync(path.join(TOOL, 'node_modules', 'playwright-core'))) {
      throw new Error(`The website's caption answers must be made again (${why}): run "npm ci" in tools/golden, then the tests again.`);
    }
    console.log(`Asking the website's textFit again (${why})…`);
    execFileSync(process.execPath, [path.join(TOOL, 'fitWeb.mjs')], { cwd: TOOL, stdio: 'inherit', timeout: 300_000 });
    const still = stale();
    if (still) throw new Error(`fitWeb.mjs ran, but its answers are still out of date: ${still}`);
  }
  return JSON.parse(fs.readFileSync(OUT, 'utf8')) as FitFile;
}

const web = ensureWebAnswers();
let measurer: ReturnType<typeof skiaTextMeasurer>;

beforeAll(async () => {
  const Sk = await headlessSkia();
  measurer = skiaTextMeasurer(new PageText(Sk, fontFiles()));
}, 60_000);

describe('reading a CSS font the way textFit writes it', () => {
  it('style, weight, size and the family list', () => {
    expect(parseCssFont('italic bold 24px "DM Sans", sans-serif')).toEqual({ family: '"DM Sans", sans-serif', size: 24, bold: true, italic: true });
    expect(parseCssFont('normal normal 18.5px Georgia, "Times New Roman", serif')).toEqual({ family: 'Georgia, "Times New Roman", serif', size: 18.5, bold: false, italic: false });
    expect(parseCssFont('normal 700 30px "Dancing Script", cursive')).toMatchObject({ bold: true, size: 30 });
    expect(parseCssFont('16px serif')).toEqual({ family: 'serif', size: 16, bold: false, italic: false });
    // textFit writes the style, then the weight: 'normal' as the weight keeps the italic.
    expect(parseCssFont('italic normal 48px "Playfair Display", serif')).toMatchObject({ italic: true, bold: false, size: 48 });
    expect(parseCssFont('normal bold 20px x')).toMatchObject({ italic: false, bold: true });
  });
  it('the measurer keeps the font it is given, like a canvas', () => {
    measurer.font = 'normal bold 40px "Playfair Display", serif';
    expect(measurer.font).toBe('normal bold 40px "Playfair Display", serif');
    const bold = measurer.measureText('Sunday lunch').width;
    measurer.font = 'normal normal 40px "Playfair Display", serif';
    expect(measurer.measureText('Sunday lunch').width).toBeLessThan(bold);
  });
});

describe("the app's caption fit is the website's", () => {
  const cases = web.cases;
  const byName = new Map(web.answers.map((a) => [a.name, a]));

  it(`has the website's answer for all ${cases.length} captions (${web.answers.filter((a) => a.fit && !a.fit.fits).length} too long for their box)`, () => {
    expect(cases.length).toBeGreaterThan(200);
    for (const c of cases) expect(byName.has(c.name)).toBe(true);
  });

  /** The app's measurer with every width moved by `d` px: a caption whose
   *  answer flips within that is on the edge of its box. */
  const nudged = (d: number) => ({
    get font() { return measurer.font; },
    set font(v: string) { measurer.font = v; },
    measureText: (t: string) => ({ width: measurer.measureText(t).width + d }),
  });
  const answer = (c: FitCase, m: Parameters<typeof captionFits>[3]) => {
    const el = c.page.textElements.find((t) => t.boxIndex === c.boxIndex)!;
    const box = captionBoxSize(c.page, c.boxIndex, c.albumSize, c.pageIndex, { coverMode: !!c.cover })!;
    return {
      box,
      fit: c.cover ? coverTitleFit(c.page, c.albumSize, m) : captionFits(el.text, el, box, m),
      room: quoteRoom(box, el, 100, m),
    };
  };

  it('the same box, fit, "fits at" size and room for every caption, except a line within 0.2 px of its box edge', () => {
    const wrong: string[] = [];
    const edge: string[] = [];
    for (const c of cases) {
      const w = byName.get(c.name)!;
      const app = answer(c, measurer);
      if (JSON.stringify(app.box) !== JSON.stringify(w.box)) { wrong.push(`${c.name}: box ${JSON.stringify(app.box)} vs ${JSON.stringify(w.box)}`); continue; }
      const same = (a: ReturnType<typeof answer>) => JSON.stringify(a.fit) === JSON.stringify(w.fit) && a.room === w.room;
      if (same(app)) continue;
      // Within the measuring bar of the box edge: the website's answer is the
      // app's with its widths moved by at most 0.2 px. Named, and few.
      const msg = `${c.name}: app ${JSON.stringify(app.fit)} room ${app.room}, website ${JSON.stringify(w.fit)} room ${w.room}`;
      if (same(answer(c, nudged(0.2))) || same(answer(c, nudged(-0.2)))) edge.push(msg);
      else wrong.push(msg);
    }
    console.log(`caption fit: ${cases.length - wrong.length - edge.length} of ${cases.length} identical; on the box edge (a line within 0.2 px of it): ${edge.length ? edge.join('; ') : 'none'}`);
    expect(wrong).toEqual([]);
    expect(edge.length).toBeLessThanOrEqual(Math.ceil(cases.length * 0.01));
  });

  it('every word and whole line measured within 0.2 px of Chromium', () => {
    let worst = { d: 0, what: '' };
    let n = 0;
    for (const w of web.answers) {
      measurer.font = w.font;
      for (const { text, width } of w.widths) {
        const d = Math.abs(measurer.measureText(text).width - width);
        n++;
        if (d > worst.d) worst = { d, what: `${w.name} "${text}" (${w.font}): app ${measurer.measureText(text).width.toFixed(3)}, Chromium ${width.toFixed(3)}` };
      }
    }
    console.log(`caption widths: ${n} measured, worst ${worst.d.toFixed(4)} px off${worst.what ? ` (${worst.what})` : ''}`);
    expect(worst.d).toBeLessThan(0.2);
  });
});
