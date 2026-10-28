/**
 * @jest-environment node
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE GOLDEN COVERS, THE QR CHIP'S SIZE AND THE TEXTURE TILES (the golden
   check's second file: see goldenPages.test.ts for why and how).

   Each cover file the app draws (coverPlan.ts, drawCover.ts: the flat wrap,
   back, spine and front) is held to the picture the website's cover print
   code makes of it (renderCoverWrapForPrint, caught before its JPEG, its
   word patches laid on), with the same bars as a page; the cover's lines to
   the lines print drew (on the wrap, and on the front page's own canvas).
   Each texture tile (all 16, own colour and tinted) to the tile print
   prepares before repeating it. Report: tools/golden/out/report-covers.json.
   ══════════════════════════════════════════════════════════════════════════ */
import path from 'node:path';
import { makeTextureTile } from '../src/render/textureTile';
import { pixelsOf, readPng, writeImage } from './golden/headless';
import { tileFailures } from './golden/compare';
import { G, OUT, WEB, caseNamed, checkCover, coverNamed, finishGolden, goldenLists, record, setupGolden, tileResults, type WebTile } from './golden/harness';
import { KNOWN_PLATFORM_DIFFERENCES } from './golden/known';

const { golden, manifest } = goldenLists();
const coverNames = golden.covers.map((c) => c.name);
const tileFiles = manifest.tiles.map((t) => t.file);

beforeAll(setupGolden, 600_000);
afterAll(() => finishGolden('covers'));

describe('the app draws every golden cover file the way the website prints it', () => {
  it('has covers to compare (cover pages and the old form, soft and hard)', () => {
    expect(coverNames.length).toBeGreaterThanOrEqual(3);
    expect(golden.covers.some((c) => !c.coverFront)).toBe(true);
    expect(new Set(golden.covers.map((c) => c.cover)).size).toBeGreaterThan(1);
  });

  it.each(coverNames)('%s', (name) => {
    const { c, plan, W, H } = coverNamed(name);
    const r = checkCover(name);
    record(c.name, 'cover', `${c.albumSize} ${c.cover}`, c.checks, r, plan.notDrawn, W, H);

    expect(plan.notDrawn).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.lines).toEqual([]);
    // A cover whose only failure is a measured difference of the platform the
    // website pictures are made on (test/golden/known.ts says which and why).
    const known = KNOWN_PLATFORM_DIFFERENCES[name];
    if (known) {
      expect(r.failures).toHaveLength(1);
      expect(r.failures[0]).toMatch(known);
    } else {
      expect(r.failures).toEqual([]);
    }
  }, 300_000);
});

describe("the memory QR chip's printed size (from the shared templates, as print sizes it)", () => {
  const qrSide = (name: string): number => {
    const it = caseNamed(name).plan.items.find((x) => x.kind === 'qr');
    if (!it || it.kind !== 'qr') throw new Error(`${name} has no QR chip`);
    return it.side;
  };
  it('0.9 inch on a 6x4 page (270 px at 300 DPI)', () => expect(qrSide('qr-chip-64')).toBeCloseTo(270, 6));
  it('1.2 inch of the page width on an 8x8, trimmed by the spine reserve to 1.10-1.15 inch', () => {
    const inches = qrSide('qr-chip-88') / 300;
    expect(inches).toBeGreaterThanOrEqual(1.1);
    expect(inches).toBeLessThanOrEqual(1.15);
  });
});

describe('every page texture tile, as print prepares it before repeating it', () => {
  it('has all 16 textures, own colour at the 8x8 tile size and tinted at the 6x4 one', () => expect(tileFiles.length).toBe(32));

  it.each(tileFiles)('%s', (file) => {
    const t = G.manifest.tiles.find((x) => x.file === file) as WebTile;
    const img = makeTextureTile(G.Sk, t.name, t.color ?? undefined, t.px);
    const app = pixelsOf(img);
    writeImage(path.join(OUT, 'tiles', path.basename(file)), img);
    img.dispose();
    const ref = readPng(G.Sk, path.join(WEB, file));
    expect([ref.width, ref.height]).toEqual([t.px, t.px]);
    const r = tileFailures(ref.data, app);
    tileResults.push({ file, maxLevels: r.maxLevels, meanLevels: r.meanLevels });
    expect(r.failures).toEqual([]);
  }, 60_000);
});
