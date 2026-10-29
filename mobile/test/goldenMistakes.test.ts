/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE MISTAKES THE GOLDEN CHECK MUST CATCH, and the phone's golden run
   drawing what the check draws (the golden check's third file: see
   goldenPages.test.ts for why and how).

   The check is only worth something if it fails on a real mistake. Each case
   draws a golden page or cover with one small error put in on purpose (in
   the plan, or in the drawing code itself), and the pixel and ink bars alone
   must catch it (the line check is left out here: it would catch some of
   these from the data before a pixel is drawn). Their scores:
   tools/golden/out/mistakes.json.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import type { SkImage } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { AlphaType, ColorType } from '@shopify/react-native-skia/lib/commonjs/skia/types';
import { ChromeSampling, halve } from '../src/render/sampling';
import type { PagePlan } from '../src/render/pagePlan';
import type { CoverPlan } from '../src/render/coverPlan';
import { PageDrawer } from '../src/render/drawPage';
import { PageText } from '../src/render/pageText';
import { BUNDLED_FONTS } from '../src/render/fontTable';
import { fontFiles, fontPath, pixelsOf, REPO_ROOT } from './golden/headless';
import { appWords } from './golden/words';
import { G, WEB, caseNamed, check, checkCover, coverNamed, draw, finishGolden, goldenLists, photoOf, recordMistake, setupGolden, type WebCase } from './golden/harness';
import { runGoldenPages, CAMERA_PHOTO, type GoldenBundle, type PhoneReport, type ToSrgb } from '../src/dev/goldenRun';
import { appCoverWords } from '../src/render/drawCover';
import { makeTextureTile } from '../src/render/textureTile';

const { golden } = goldenLists();
const pageNames = golden.cases.map((c) => c.name);
const coverNames = golden.covers.map((c) => c.name);

beforeAll(setupGolden, 600_000);
afterAll(() => finishGolden('mistakes'));

type Item = PagePlan['items'][number];
const nudge = (plan: PagePlan, f: (it: Item, i: number) => Item): PagePlan => ({ ...plan, items: plan.items.map(f) });
const styleOf = (it: Item, over: Record<string, unknown>): Item =>
  (it.kind === 'boxText' || it.kind === 'freeText' ? ({ ...it, style: { ...it.style, ...over } } as Item) : it);
const failsOn = (failures: string[], kind: RegExp) => expect(failures).toEqual(expect.arrayContaining([expect.stringMatching(kind)]));
const PIXELS = /^(page|tile)/;
const INK = /ink|block|sits/;
const run = (name: string, mutate: (p: PagePlan) => PagePlan, options: Parameters<typeof check>[2] = {}): string[] => {
  if (!pageNames.includes(name)) throw new Error(`golden page ${name} is gone: pick another for this check`);
  const r = check(name, mutate(caseNamed(name).plan), options);
  r.img.dispose();
  recordMistake(name, r);
  return r.failures;
};
const runCover = (name: string, mutate: (p: CoverPlan) => CoverPlan, options: Parameters<typeof checkCover>[2] = {}): string[] => {
  if (!coverNames.includes(name)) throw new Error(`golden cover ${name} is gone: pick another for this check`);
  const r = checkCover(name, mutate(coverNamed(name).plan), options);
  r.img.dispose();
  recordMistake(name, r);
  return r.failures;
};

describe('the check fails on each kind of small mistake', () => {
  it.each(['pan-zoom-portrait', 'masks-paths', 'gen-8x8-p5-t88-fb-duo-exact-h-gap'])('a photo moved 1/4 px on %s', (name) => {
    failsOn(run(name, (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, pan: { x: it.pan.x + 0.25, y: it.pan.y } } : it))), PIXELS);
  }, 120_000);

  it('a frame 1 px wider', () => {
    failsOn(run('gen-6x4-p19-t64-fb-duo-tall-gap', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, box: { ...it.box, w: it.box.w + 1 } } : it))), PIXELS);
  }, 120_000);

  it("a double frame's inset line not drawn", () => {
    failsOn(run('frame-double-dashed-radial', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, frame: { ...it.frame, decorated: false } } : it))), PIXELS);
  }, 120_000);

  it('a dashed border drawn solid', () => {
    failsOn(run('frame-double-dashed-radial', (p) => nudge(p, (it) => (it.kind === 'photo' ? { ...it, frame: { ...it.frame, borderStyle: 'solid' } } : it))), PIXELS);
  }, 120_000);

  it('a caption 1 px lower', () => {
    failsOn(run('64-caption-yellow', (p) => nudge(p, (it) => (it.kind === 'boxText' ? { ...it, centerY: it.centerY + 1 } : it))), /sits/);
  }, 120_000);

  it.each(['two-captions-shadow', 'quote-in-photo-frame', '64-caption-yellow', 'gradient-duo-caption'])('no words drawn on %s', (name) => {
    failsOn(run(name, (p) => p, { appWords: false }), INK);
  }, 120_000);

  it('a free title at opacity 0', () => {
    failsOn(run('free-title-outline', (p) => nudge(p, (it) => (it.kind === 'freeText' ? { ...it, opacity: 0 } : it))), INK);
  }, 120_000);

  it('the underline missing', () => {
    failsOn(run('caption-wraps-underlined', (p) => nudge(p, (it) => styleOf(it, { underline: false }))), INK);
  }, 120_000);

  it('the outline missing', () => {
    failsOn(run('free-title-outline', (p) => nudge(p, (it) => styleOf(it, { outlineWidth: 0 }))), INK);
  }, 120_000);

  it('the shadow missing', () => {
    failsOn(run('two-captions-shadow', (p) => nudge(p, (it) => styleOf(it, { shadow: false }))), INK);
  }, 120_000);

  it('a quote in the wrong colour (#FF0000 for #B85C38)', () => {
    failsOn(run('quote-in-photo-frame', (p) => nudge(p, (it) => (it.kind === 'boxText' && it.source === 'slot' ? styleOf(it, { color: '#FF0000' }) : it))), INK);
  }, 120_000);

  it('a caption in black instead of #2D2D2D', () => {
    failsOn(run('64-caption-yellow', (p) => nudge(p, (it) => styleOf(it, { color: '#000000' }))), INK);
  }, 120_000);

  it("a turned, stretched title's shadow offset turned with it (the old bug)", () => {
    const anyText = PageText as unknown as { pageOffset: (c: unknown, dx: number, dy: number) => { x: number; y: number } };
    const real = anyText.pageOffset;
    anyText.pageOffset = (_c, dx, dy) => ({ x: dx, y: dy });
    try {
      failsOn(run('title-shadow-alone', (p) => p), INK);
    } finally {
      anyText.pageOffset = real;
    }
  }, 120_000);

  it('the italic font files missing (Skia fakes the styles)', () => {
    const files = fontFiles().filter((f) => !f.font.italic);
    const fakeText = new PageText(G.Sk, files);
    const fakeDrawer = new PageDrawer(G.Sk, fakeText);
    failsOn(run('captions-italics', (p) => p, { using: fakeDrawer, usingText: fakeText }), INK);
  }, 120_000);
});

describe('the check fails on each kind of small mistake in textures, QR codes, graphics and covers', () => {
  const bg = (p: PagePlan, over: Record<string, unknown>): PagePlan => ({ ...p, background: { ...p.background, ...over } as PagePlan['background'] });

  it('a texture in the wrong tint (cream for sage)', () => {
    failsOn(run('texture-linen-sage', (p) => bg(p, { color: '#efe9df' })), PIXELS);
  }, 120_000);

  it('a texture a shade off its tint (#8a9a7a drawn #929a7a)', () => {
    failsOn(run('texture-linen-sage', (p) => bg(p, { color: '#929a7a' })), PIXELS);
  }, 120_000);

  it('a faded texture drawn at full strength (its opacity ignored)', () => {
    failsOn(run('texture-marble-faded', (p) => bg(p, { alpha: 1 })), PIXELS);
  }, 120_000);

  it('a texture tile 1 px too big (the print tile size worked out wrong)', () => {
    failsOn(run('texture-leather', (p) => bg(p, { tilePx: (p.background as { tilePx: number }).tilePx + 1 })), PIXELS);
  }, 120_000);

  it.each(['qr-chip-88', 'qr-chip-64', 'qr-in-caption-box'])('a QR code shifted 1 px on %s', (name) => {
    failsOn(run(name, (p) => nudge(p, (it) => (it.kind === 'qr' ? { ...it, x: it.x + 1 } : it))), PIXELS);
  }, 120_000);

  it('a moved QR turned 1 degree too far', () => {
    failsOn(run('qr-moved-turned-64', (p) => nudge(p, (it) => (it.kind === 'freeQr' ? { ...it, rot: it.rot + 1 } : it))), PIXELS);
  }, 120_000);

  it('a sticker missing', () => {
    failsOn(run('stickers-88', (p) => ({ ...p, items: p.items.filter((it) => !(it.kind === 'freeGraphic' && it.source === 'sticker' && it.index === 1)) })), PIXELS);
  }, 120_000);

  it('a sticker turned the wrong way', () => {
    failsOn(run('stickers-64', (p) => nudge(p, (it) => (it.kind === 'freeGraphic' ? { ...it, rot: -it.rot } : it))), PIXELS);
  }, 120_000);

  it('a graphic in a frame drawn 2 px smaller', () => {
    failsOn(run('graphic-in-frame', (p) => nudge(p, (it) => (it.kind === 'graphic' ? { ...it, x: it.x + 1, y: it.y + 1, side: it.side - 2 } : it))), PIXELS);
  }, 120_000);

  it('a colour look missing (sepia drawn plain)', () => {
    failsOn(run('looks-four', (p) => nudge(p, (it) => (it.kind === 'photo' && it.look === 'sepia' ? { ...it, look: null } : it))), PIXELS);
  }, 120_000);

  it("torn paper's white rim missing", () => {
    const realGet = G.assets.get;
    G.assets.get = (src) => (src.endsWith('torn-rim.png') ? null : realGet(src));
    try {
      // A missing overlay draws the plain photo (print's own fallback): the pixels must show it.
      failsOn(run('textured-edges', (p) => p), PIXELS);
    } finally {
      G.assets.get = realGet;
    }
  }, 120_000);

  it('corner art 1 % too big', () => {
    failsOn(run('corners-88', (p) => nudge(p, (it) => (it.kind === 'corner' ? { ...it, size: it.size * 1.01 } : it))), PIXELS);
  }, 120_000);

  it('a big photo drawn from the full picture, not Chrome\'s halved copy', () => {
    // The same page drawn by a drawer that never halves (plain bilinear on the whole photo).
    const plain = new PageDrawer(G.Sk, G.text);
    (plain as unknown as { sampling: { decoded: (img: unknown) => unknown } }).sampling.decoded = (img) => img;
    failsOn(run('big-photo-small-frames', (p) => p, { using: plain }), PIXELS);
  }, 120_000);

  type Step = CoverPlan['steps'][number];
  const coverSteps = (p: CoverPlan, f: (s: Step) => Step): CoverPlan => ({ ...p, steps: p.steps.map(f) });

  it("a cover title's floating shadow missing", () => {
    failsOn(runCover('cover-88-hard-photo', (p) => coverSteps(p, (s) => (s.kind === 'front'
      ? { ...s, plan: nudge(s.plan, (it) => styleOf(it, { shadow: false })) } : s))), INK);
  }, 300_000);

  it('the spine line missing', () => {
    failsOn(runCover('cover-88-soft-texture', (p) => ({ ...p, steps: p.steps.filter((s) => !(s.kind === 'line' && s.line.turn)) })), PIXELS);
  }, 300_000);

  it("the spine in the title's own colour (white on the cream spine)", () => {
    failsOn(runCover('cover-88-hard-photo', (p) => coverSteps(p, (s) => (s.kind === 'line' && s.line.turn
      ? { ...s, line: { ...s.line, style: { ...s.line.style, color: '#FFFFFF' } } } : s))), INK);
  }, 300_000);

  it("the front page not carried round the hardcover's turn-in (no mirrored edge)", () => {
    failsOn(runCover('cover-88-hard-photo', (p) => coverSteps(p, (s) => (s.kind === 'front' ? { ...s, mirror: { top: 0, right: 0, bottom: 0, left: 0 } } : s))), PIXELS);
  }, 300_000);

  it('the front mirrored past its trim WITH its words (edge words repeated in the turn-in)', () => {
    // drawCover mirrors the front page drawn under its words (as print does);
    // this puts back the first version's mistake: mirroring the page with them.
    const d = G.drawer as unknown as {
      renderTrim: (...a: unknown[]) => SkImage;
      mirrorEdges: (canvas: unknown, img: SkImage, box: unknown, m: unknown) => void;
    };
    const realTrim = d.renderTrim, realMirror = d.mirrorEdges;
    let lastFull: SkImage | null = null;
    d.renderTrim = (...a: unknown[]) => {
      const img = realTrim.apply(G.drawer, a);
      lastFull = (a[2] as { words?: boolean } | undefined)?.words ? img : null;
      return img;
    };
    d.mirrorEdges = (canvas, img, box, m) => realMirror.call(G.drawer, canvas, lastFull ?? img, box, m);
    try {
      failsOn(runCover('cover-88-hard-edge-words', (p) => p), PIXELS);
    } finally {
      d.renderTrim = realTrim;
      d.mirrorEdges = realMirror;
    }
  }, 300_000);

  it('the back lockup 1 px off', () => {
    failsOn(runCover('cover-88-hard-photo', (p) => coverSteps(p, (s) => (s.kind === 'line' && !s.line.turn && s.line.style.text === 'Megy Prints'
      ? { ...s, line: { ...s.line, y: s.line.y + 1 } } : s))), /^text 1: sits/);
  }, 300_000);
});

/* The phone's golden run (src/dev/goldenRun.ts: the debug screen of a
   -GoldenPages test build) must draw exactly what this check draws, so that
   comparing the phone's pictures with the website's tests the phone's Skia
   and nothing else. Run here with CanvasKit on five pages (a caption, a
   frame, corner art over a texture, a QR chip, the Display P3 photo), a
   cover file and two texture tiles, its pictures must be the ones check()
   and checkCover() draw, pixel for pixel, with the same lines and boxes; a
   photo the colour step converts is drawn a second time with the converted
   file; and the timing pass runs (its 12 MP photo made and drawn). */
describe("the phone's golden run draws what this check draws", () => {
  it('the same pictures, words and boxes, and a second picture after the colour step', async () => {
    const names = ['frame-double-dashed-radial', '64-caption-yellow', 'corners-64', 'qr-chip-64', 'photo-display-p3'];
    const coverName = 'cover-64-soft-plain';
    const tiles = G.manifest.tiles.slice(0, 2);
    const b64 = (file: string) => fs.readFileSync(file).toString('base64');
    const cases = G.set.cases.filter((c) => names.includes(c.name));
    const bundle: GoldenBundle = {
      madeFrom: { madeAt: 'test', chromium: G.manifest.chromium, pagesSha256: '', renderer: G.manifest.fingerprint.renderer.hash, tools: G.manifest.fingerprint.tools.hash, fonts: G.manifest.fingerprint.fonts },
      appRenderer: 'test',
      photos: G.set.photos,
      photoFiles: G.manifest.photos.map((p) => ({ file: p.file, sha256: '', base64: b64(path.join(WEB, p.file)) })),
      fonts: BUNDLED_FONTS.map((f) => ({ file: f.file, base64: b64(fontPath(f.file)) })),
      assetFiles: G.manifest.assets.map((a) => ({ url: a.url, base64: b64(path.join(WEB, a.file)) })),
      cases: cases.map((c) => {
        const w = G.manifest.cases.find((x) => x.name === c.name) as WebCase;
        return { name: c.name, albumSize: c.albumSize, pageIndex: c.pageIndex, kind: c.kind, page: c.page, width: w.width, height: w.height, bare: !!w.bare };
      }),
      covers: G.set.covers.filter((c) => c.name === coverName).map((c) => {
        const w = G.manifest.covers.find((x) => x.name === c.name) as WebCase;
        return { name: c.name, albumSize: c.albumSize, pageCount: c.pageCount, cover: c.cover, material: c.material, coverFront: c.coverFront, coverDesign: c.coverDesign, width: w.width, height: w.height };
      }),
      tiles,
    };
    const written = new Map<string, Uint8Array | string>();
    // A stand-in for the phone's srgbCopy: says the P3 file was converted (same bytes back).
    const toSrgb: ToSrgb = async ({ file, bytes }) => ({ colorSpace: file.endsWith('photo-8.png') ? 'Display P3' : 'sRGB IEC61966-2.1', converted: file.endsWith('photo-8.png'), bytes });
    const report = await runGoldenPages(G.Sk, bundle, { write: async (n, c) => { written.set(n, c); } }, { toSrgb, timingPages: ['64-caption-yellow'], lightWeightTrials: [0.35] });

    expect(report.pages.map((p) => p.file)).toEqual([...cases.map((c) => `${c.name}.png`), 'photo-display-p3.srgb.png', `${coverName}.png`]);
    expect(report.pages.every((p) => !p.error)).toBe(true);
    expect(report.pages.flatMap((p) => p.missing ?? [])).toEqual([]);
    expect(report.photos.filter((p) => p.converted).map((p) => p.file)).toEqual(['photos/photo-8.png']);
    const pngPixels = (name: string) => {
      const bytes = written.get(name);
      if (!(bytes instanceof Uint8Array)) throw new Error(`the run wrote no ${name}`);
      const img = G.Sk.Image.MakeImageFromEncoded(G.Sk.Data.fromBytes(bytes));
      if (!img) throw new Error(`${name} is not a picture`);
      const px = pixelsOf(img);
      img.dispose();
      return px;
    };
    const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
    for (const entry of report.pages.filter((p) => p.kind !== 'cover')) {
      const L = caseNamed(entry.name);
      const full = draw(L.plan, { words: true });
      full.img.dispose();
      expect([entry.width, entry.height]).toEqual([L.W, L.H]);
      expect(same(pngPixels(entry.file), full.rgba)).toBe(true);
      expect(entry.words).toEqual(appWords(L.plan, G.text));
      expect(entry.notDrawn).toEqual(L.plan.notDrawn);
      expect(entry.bareFile != null).toBe(!!L.web.bare);
      if (entry.bareFile) {
        const bare = draw(L.plan, { words: false });
        bare.img.dispose();
        expect(same(pngPixels(entry.bareFile), bare.rgba)).toBe(true);
      }
    }
    // The cover file, with and without its words, as checkCover draws it.
    const coverEntry = report.pages.find((p) => p.kind === 'cover');
    if (!coverEntry) throw new Error('the run drew no cover');
    const C = coverNamed(coverName);
    const coverPx = (words: boolean) => {
      const img = G.covers.render(C.plan, photoOf, { words, assets: G.assets.get });
      const px = pixelsOf(img);
      img.dispose();
      return px;
    };
    expect([coverEntry.width, coverEntry.height]).toEqual([C.W, C.H]);
    expect(same(pngPixels(coverEntry.file), coverPx(true))).toBe(true);
    expect(coverEntry.bareFile).toBe(`${coverName}.bare.png`);
    expect(same(pngPixels(coverEntry.bareFile as string), coverPx(false))).toBe(true);
    expect(coverEntry.words).toEqual(appCoverWords(C.plan, G.text));
    expect(coverEntry.notDrawn).toEqual([]);
    // The texture tiles, as makeTextureTile draws them.
    expect(report.tiles?.map((t) => t.error ?? 'drawn')).toEqual(tiles.map(() => 'drawn'));
    for (const [i, t] of tiles.entries()) {
      const img = makeTextureTile(G.Sk, t.name, t.color ?? undefined, t.px);
      expect(same(pngPixels(report.tiles?.[i].phoneFile as string), pixelsOf(img))).toBe(true);
      img.dispose();
    }
    // The timing pass ran with a 12 MP photo.
    expect(report.timing?.photo).toBe(`${CAMERA_PHOTO.width}x${CAMERA_PHOTO.height} JPEG`);
    expect(report.timing?.pages.map((p) => [p.name, p.error ?? 'drawn'])).toEqual([['64-caption-yellow', 'drawn']]);
    const json = JSON.parse(written.get('report.json') as string) as PhoneReport;
    expect(json.pages.length).toBe(7);
    // The light-weight trial: the cover (its words are cream) drawn again
    // with its light letters given the trial weight, as the drawer draws it.
    expect(report.lightWeight?.map((e) => [e.name, e.px, e.error ?? 'drawn'])).toEqual([[coverName, 0.35, 'drawn']]);
    const was = G.text.setLightWeight(0.35);
    try {
      expect(same(pngPixels(report.lightWeight?.[0].file as string), coverPx(true))).toBe(true);
    } finally {
      G.text.setLightWeight(was);
    }
    // ...and the weight changes what is drawn (CanvasKit draws none by default).
    expect(same(pngPixels(report.lightWeight?.[0].file as string), coverPx(true))).toBe(false);
  }, 300_000);
});

/* The renderer halves a picture with a Skia shader (sampling.ts halveOnce),
   where the first version ran a JavaScript loop (`halve`, kept as the
   reference). On every picture file the golden pages draw halved (each test
   photo, the Display P3 one and the 3200 px one included, each mask edge,
   QR code, graphic, sticker and corner art), the Skia halving must give
   the loop's bytes exactly, once and twice halved: so the speed-up cannot
   move a golden number. */
describe('the Skia halving prepares every golden picture file as the JavaScript loop did', () => {
  it('each photo file, mask edge, QR code, graphic, sticker and corner art, halved once and twice, byte for byte', () => {
    const info = (w: number, h: number) => ({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul });
    const read = (img: SkImage): Uint8Array => {
      const px = img.readPixels(0, 0, info(img.width(), img.height()));
      if (!(px instanceof Uint8Array)) throw new Error('no pixels');
      return px;
    };
    const masks = fs.readdirSync(path.join(REPO_ROOT, 'public', 'masks')).filter((f) => f.endsWith('.png')).map((f) => {
      const img = G.assets.get(`/masks/${f}`);
      if (!img) throw new Error(`no mask edge ${f}`);
      return { name: `/masks/${f}`, img };
    });
    // Every QR code, graphic, sticker and corner art the golden pages draw.
    const named = new Map<string, string>();
    for (const c of G.set.cases) {
      for (const it of caseNamed(c.name).plan.items) {
        if ((it.kind === 'qr' || it.kind === 'freeQr' || it.kind === 'graphic' || it.kind === 'corner' || it.kind === 'freeGraphic') && !named.has(it.src)) named.set(it.src, `${c.name} ${it.kind} ${named.size}`);
      }
    }
    const graphics = [...named].map(([src, name]) => {
      const img = G.assets.get(src);
      if (!img) throw new Error(`no picture for ${name}`);
      return { name, img };
    });
    const pictures = [...G.photos.map((img, i) => ({ name: G.manifest.photos[i].file, img })), ...masks, ...graphics];
    expect(graphics.length).toBeGreaterThanOrEqual(8);
    const sampling = new ChromeSampling(G.Sk);
    const differ: string[] = [];
    for (const { name, img } of pictures) {
      let ref: { px: Uint8Array; w: number; h: number } = { px: read(img), w: img.width(), h: img.height() };
      for (const level of [1, 2]) {
        ref = halve(ref.px, ref.w, ref.h);
        const got = sampling.decoded(img, level);
        if (got.width() !== ref.w || got.height() !== ref.h || Buffer.compare(Buffer.from(read(got)), Buffer.from(ref.px)) !== 0) differ.push(`${name} level ${level}`);
      }
    }
    sampling.dispose();
    expect(differ).toEqual([]);
  }, 300_000);
});
