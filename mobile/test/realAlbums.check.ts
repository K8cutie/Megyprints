/* ══════════════════════════════════════════════════════════════════════════
   REAL-ALBUM REPLAY: every album customers made, through the app's own
   "can I make this album's print file?" check (print/printFiles.ts
   notDrawnPages), the one Place order runs before any order is made.

   WHY: 2026-11-23, the owner's Mini stopped at Place order with "the cover
   has font "Shrikhand", cursive bold". Every test passed, because the tests
   used albums we made. Run over the live database's albums, the same check
   found 17 of the 56 font + style pairs real albums use blocked. This file
   runs that check over EVERY real album, so a combination a customer picked
   is found here before the customer finds it (the bug hunt, 2026-11-24).

   Not part of the normal test run (no real albums are in the repository).
   Export the albums READ-ONLY first (scripts in docs/bug-hunt/README.md),
   then:
     REPLAY_ALBUMS=<albums.json> REPLAY_OUT=<report.json> \
       npx jest --testMatch "**\/test/realAlbums.check.ts"

   Every font of the 74 is treated as downloaded (Place order gets the
   album's fonts first, lib/checkout/phoneSend.ts): what is still listed is
   something the app can't print however good the phone's internet is.
   The report names albums by id only; it never copies words or photos.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import type { AlbumPage, AlbumSizePreset, CoverType, MaterialType } from '@web/pages/builder/types';
import { addDrawnFonts, BUNDLED_FONTS, type BundledFont } from '../src/render/fontTable';
import { WEBSITE_STYLES } from '../src/render/websiteFontStyles';
import { notDrawnPages, type PrintTools } from '../src/print/printFiles';
import { siteFile } from '../src/builder/siteFiles';
import { headlessPrintTools } from './print/headlessPrint';

interface Row {
  id: string;
  album_size: AlbumSizePreset;
  photo_count: number;
  photo_ids: string[] | null;
  pages: AlbumPage[] | null;
  cover_front: AlbumPage | null;
  order_cover: CoverType | null;
  order_material: MaterialType | null;
  orders: number;
  updated_at: string;
}

interface Result {
  id: string;
  size: string;
  cover: string;
  orders: number;
  updated: string;
  blocked: { page: string; notDrawn: string[] }[];
  crash: string | null;
}

const IN = process.env.REPLAY_ALBUMS;
const OUT = process.env.REPLAY_OUT;

/** The export's rows: a plain array, or the CLI's { rows } wrapper. */
function readRows(path: string): Row[] {
  const j = JSON.parse(fs.readFileSync(path, 'utf8')) as Row[] | { rows: Row[] };
  return Array.isArray(j) ? j : j.rows;
}

(IN ? describe : describe.skip)('every real album can be printed by the app', () => {
  let tools: PrintTools;
  beforeAll(async () => {
    ({ tools } = await headlessPrintTools());
    // Every font of the 74 on the phone, in the styles the website loads.
    const bundled = new Set(BUNDLED_FONTS.map((f) => f.face));
    const all: BundledFont[] = [];
    for (const [face, styles] of Object.entries(WEBSITE_STYLES)) {
      if (bundled.has(face)) continue;
      for (const s of styles) all.push({ face, weight: s.startsWith('7') ? 700 : 400, italic: s.endsWith('i'), file: `google-fonts:${face}-${s}.ttf` });
    }
    addDrawnFonts(all);
  }, 600_000);

  it('replays each album through the Place order check', () => {
    const rows = readRows(IN as string);
    const results: Result[] = [];
    for (const r of rows) {
      const cover: CoverType = r.order_cover ?? (r.album_size === '5.8x8.3' ? 'staple' : 'softcover');
      const res: Result = { id: r.id, size: r.album_size, cover, orders: Number(r.orders) || 0, updated: r.updated_at, blocked: [], crash: null };
      try {
        res.blocked = notDrawnPages(
          { albumSize: r.album_size, pages: r.pages ?? [], photoCount: Number(r.photo_count) || 0, photoIds: r.photo_ids ?? [], coverFront: r.cover_front },
          cover, { text: tools.text, files: siteFile }, r.order_material ?? 'matte',
        );
      } catch (e) {
        res.crash = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
      results.push(res);
    }
    const reasons = new Map<string, { albums: Set<string>; ordered: number }>();
    for (const r of results) {
      const seen = new Set<string>();
      for (const p of r.blocked) for (const n of p.notDrawn) seen.add(n.trim());
      if (r.crash) seen.add(`CRASH ${r.crash.slice(0, 160)}`);
      for (const k of seen) {
        const e = reasons.get(k) ?? { albums: new Set<string>(), ordered: 0 };
        e.albums.add(r.id);
        if (r.orders > 0) e.ordered++;
        reasons.set(k, e);
      }
    }
    const blocked = results.filter((r) => r.blocked.length || r.crash);
    const summary = {
      albums: results.length,
      blocked: blocked.length,
      blockedWithOrders: blocked.filter((r) => r.orders > 0).length,
      reasons: [...reasons.entries()]
        .map(([reason, e]) => ({ reason, albums: e.albums.size, withOrders: e.ordered }))
        .sort((a, b) => b.albums - a.albums),
    };
    if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, results: blocked }, null, 2));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    expect(results.length).toBe(rows.length);
  }, 600_000);
});
