import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MEGY_MASCOT_WIDTHS, MEGY_MASCOT_SRCSET, megyMascotUrl } from './megyMascot';
import MegyMascot from '../components/MegyMascot';

/* ══════════════════════════════════════════════════════════════════════════
   MEGY'S PICTURE WAS 1.5 MB (bad-signal tester, 2026-10-09).
   The home card showed a 1024px, 1,557,821-byte PNG at 96 CSS px. On slow 3G
   that one picture took ~14 s, and the service worker precached it on every
   install. The app now ships shrunk copies (scripts/build-mascot.mjs) and the
   browser picks one by screen density. These keep it that way.
   ══════════════════════════════════════════════════════════════════════════ */

const ROOT = resolve(__dirname, '../..');
const PUBLIC = join(ROOT, 'public');

/** The most a phone can fetch for Megy on the home card: any one copy. */
const PER_COPY_BUDGET = 50 * 1024;
/** The service worker precaches every PNG in public/, so all copies count. */
const ALL_COPIES_BUDGET = 100 * 1024;

function png(file: string) {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString('latin1'), `${file} is not a PNG`).toBe('PNG');
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  const colorType = b[25];
  // Walk the chunks for tRNS (how a palette PNG carries alpha).
  let hasTRNS = false;
  for (let p = 8; p < b.length; ) {
    const len = b.readUInt32BE(p);
    const type = b.subarray(p + 4, p + 8).toString('latin1');
    if (type === 'tRNS') hasTRNS = true;
    if (type === 'IEND') break;
    p += 12 + len;
  }
  // 4 = grey+alpha, 6 = RGBA, 3 = palette (alpha only with tRNS).
  const hasAlpha = colorType === 4 || colorType === 6 || (colorType === 3 && hasTRNS);
  return { width, height, hasAlpha, bytes: b.length };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx|css|html)$/.test(e.name) && !/\.spec\.ts$/.test(e.name) ? [p] : [];
  });
}

describe('the Megy pictures the app ships', () => {
  it.each(MEGY_MASCOT_WIDTHS.map((w) => [w]))('the %ipx copy is that size, see-through, and under budget', (w) => {
    const file = join(PUBLIC, megyMascotUrl(w));
    const p = png(file);
    expect(p.width).toBe(w);
    expect(p.height).toBe(w);
    expect(p.hasAlpha).toBe(true); // her soft glow sits on the card, not on a box
    expect(p.bytes).toBeLessThanOrEqual(PER_COPY_BUDGET);
  });

  it('all copies together stay under budget (the service worker precaches each one)', () => {
    const total = MEGY_MASCOT_WIDTHS.reduce((s, w) => s + statSync(join(PUBLIC, megyMascotUrl(w))).size, 0);
    expect(total).toBeLessThanOrEqual(ALL_COPIES_BUDGET);
  });

  it('public/ holds only those copies, so the 1.5 MB master cannot ship (or be precached) again', () => {
    const shipped = readdirSync(PUBLIC).filter((f) => f.startsWith('megy-character')).sort();
    const expected = MEGY_MASCOT_WIDTHS.map((w) => megyMascotUrl(w).slice(1)).sort();
    expect(shipped).toEqual(expected);
  });
});

describe('every Megy on screen goes through <MegyMascot>', () => {
  it('no source file points at a Megy picture by path except src/lib/megyMascot.ts', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((f) => !f.endsWith(join('lib', 'megyMascot.ts')))
      .filter((f) => readFileSync(f, 'utf8').includes('megy-character'))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the home card uses it at 96px', () => {
    const home = readFileSync(join(ROOT, 'src/pages/Home.tsx'), 'utf8');
    expect(home).toMatch(/<MegyMascot size=\{96\}/);
  });

  it('offers every copy and says how big she is drawn, with a reserved box', () => {
    // HTML attribute names are case-insensitive; React writes srcSet as-is.
    const markup = renderToStaticMarkup(createElement(MegyMascot, { size: 96 }));
    const html = markup.slice(markup.indexOf('<img'));
    for (const w of MEGY_MASCOT_WIDTHS) expect(MEGY_MASCOT_SRCSET).toContain(`${megyMascotUrl(w)} ${w}w`);
    expect(html.toLowerCase()).toContain(`srcset="${MEGY_MASCOT_SRCSET}"`);
    expect(html).toContain('sizes="96px"');
    expect(html).toContain('width="96"');
    expect(html).toContain('height="96"');
    expect(html).toContain('class="w-24 h-24"');
    expect(html).toContain('alt="Megy"');
  });
});
