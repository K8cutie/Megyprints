import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { summarizeAlbumStats, parsePage, type AlbumStatsRow } from './adminAlbumStats';
import { getTemplateById } from '../pages/builder/pageTemplates';

/* ══════════════════════════════════════════════════════════════════════════
   ALBUM STATS (owner, 2026-10-21: "a statistical page for the admin, it helps
   us study patterns"). The database sends one row of numbers per album
   (0048); summarizeAlbumStats turns them into the Album stats tab.
   ══════════════════════════════════════════════════════════════════════════ */

const row = (over: Partial<AlbumStatsRow>): AlbumStatsRow => ({
  album_size: '8x8', occasion: null, photos: 0, left_out: 0, portrait: 0, landscape: 0, square: 0,
  extra_wide: 0, extra_tall: 0, unknown_shape: 0, paid: false, made_on: '2026-10-21', pages: [], total_matching: 0, ...over,
});

const boxesOf = (id: string) => getTemplateById(id)?.textSlots?.length ?? 0;

describe('photos per album', () => {
  it('counts the photos in the album (left-out ones are not), with the middle, average, range and buckets', () => {
    const s = summarizeAlbumStats([
      row({ photos: 42, left_out: 2, total_matching: 3 }),
      row({ photos: 100 }),
      row({ photos: 250 }),
    ]);
    expect(s.albums).toBe(3);
    expect(s.matching).toBe(3);
    expect(s.photos).toMatchObject({ median: 100, average: 130, smallest: 40, biggest: 250, leftOut: 2 });
    expect(s.photos.buckets).toEqual([
      { label: 'Under 40', count: 0 },
      { label: '40–59', count: 1 },
      { label: '60–119', count: 1 },
      { label: '120–199', count: 0 },
      { label: '200 or more', count: 1 },
    ]);
  });

  it('says how many albums matched when the newest-first cap cut the list', () => {
    expect(summarizeAlbumStats([row({ total_matching: 2600 }), row({ total_matching: 2600 })]).matching).toBe(2600);
  });

  it('no albums: zeros, never NaN', () => {
    const s = summarizeAlbumStats([]);
    expect(s.albums).toBe(0);
    expect(s.photos).toMatchObject({ median: 0, average: 0, smallest: 0, biggest: 0 });
    expect(s.layouts).toMatchObject({ looksPerAlbum: 0, mostUsedLookPct: 0, boxPagesPct: 0, emptyBoxesPct: 0, totalPages: 0 });
    expect(JSON.stringify(s)).not.toMatch(/NaN|null/);
  });
});

describe('photo shapes', () => {
  it('totals every shape, and gives each album size its own mix', () => {
    const s = summarizeAlbumStats([
      row({ album_size: '8x8', portrait: 6, landscape: 3, square: 1 }),
      row({ album_size: '8x8', portrait: 4, landscape: 5, square: 0, extra_wide: 1 }),
      row({ album_size: '8x6', portrait: 1, landscape: 1, square: 2, extra_tall: 1, unknown_shape: 2 }),
    ]);
    expect(Object.fromEntries(s.shapes.total.map((b) => [b.label, b.count]))).toEqual({
      Portrait: 11, Landscape: 9, Square: 3, 'Extra wide (16:9)': 1, 'Extra tall (9:16)': 1,
    });
    expect(s.shapes.unknown).toBe(2); // kept apart, so the shares are of photos with a saved size
    expect(s.shapes.bySize).toEqual([
      { size: '8x8', albums: 2, portraitPct: 50, landscapePct: 40, squarePct: 5, otherPct: 5 },
      { size: '8x6', albums: 1, portraitPct: 20, landscapePct: 20, squarePct: 40, otherPct: 20 },
    ]);
  });
});

describe('sizes, occasions and pages', () => {
  it('tallies sizes and occasions, most first; an album without one is "Not set"', () => {
    const s = summarizeAlbumStats([
      row({ album_size: '8x8', occasion: 'Wedding' }),
      row({ album_size: '8x8', occasion: 'Wedding' }),
      row({ album_size: '6x6', occasion: null }),
      row({ album_size: null, occasion: 'Something else' }),
    ]);
    expect(s.sizes).toEqual([{ label: '8x8', count: 2 }, { label: '6x6', count: 1 }, { label: 'Not set', count: 1 }]);
    expect(s.occasions).toEqual([{ label: 'Wedding', count: 2 }, { label: 'Not set', count: 1 }, { label: 'Something else', count: 1 }]);
  });

  it('pages per album: middle, average and buckets', () => {
    const pages = (n: number) => Array.from({ length: n }, () => 't88-fb-solo|1|0');
    const s = summarizeAlbumStats([row({ pages: pages(40) }), row({ pages: pages(40) }), row({ pages: pages(58) }), row({ pages: pages(120) })]);
    expect(s.pages).toMatchObject({ median: 49, average: 64.5 }); // middle of 40, 40, 58, 120
    expect(s.pages.buckets.map((b) => b.count)).toEqual([0, 2, 1, 0, 1]);
  });
});

describe('page layouts', () => {
  it('a page token is layout | photos | boxes holding something', () => {
    expect(parsePage('t88-fb-solo-pt-box-left|1|1')).toEqual({ id: 't88-fb-solo-pt-box-left', photos: 1, filled: 1 });
    expect(parsePage('|0|0')).toEqual({ id: '', photos: 0, filled: 0 });
    expect(parsePage('garbage')).toEqual({ id: 'garbage', photos: 0, filled: 0 });
  });

  it('kinds of page, box pages, empty boxes, looks per album, the most-used look and same look on the next page', () => {
    // The real 8x8 layouts this test leans on.
    expect(boxesOf('t88-fb-solo')).toBe(0);
    expect(boxesOf('t88-fb-solo-pt-box-left')).toBe(1);
    expect(boxesOf('t88-fb-solo-pt-twobox-right')).toBe(2);
    expect(boxesOf('t88-fb-duo-exact-v-gap')).toBe(1);
    const s = summarizeAlbumStats([row({
      pages: [
        't88-fb-solo|1|0',
        't88-fb-solo|1|0',                 // same look as the page before
        't88-fb-solo-pt-box-left|1|1',     // its one box holds a quote
        't88-fb-solo-pt-twobox-right|1|0', // two empty boxes
        't88-fb-duo-exact-v-gap|2|5',      // "5" can't fill more boxes than it has
        '|0|0',                            // a blank page
      ],
    })]);
    expect(Object.fromEntries(s.layouts.pageKinds.map((b) => [b.label, b.count]))).toEqual({
      'Full-page photo': 2, '1 photo + box': 2, '1 photo': 0, '2 photos': 1, '3 photos': 0, '4 or more photos': 0, Blank: 1,
    });
    expect(s.layouts.totalPages).toBe(6);
    expect(s.layouts.boxPagesPct).toBe(50);       // 3 of 6 pages
    expect(s.layouts.boxes).toBe(4);              // 1 + 2 + 1
    expect(s.layouts.emptyBoxesPct).toBe(50);     // 2 of 4 (the duo's box counts as filled once)
    expect(s.layouts.looksPerAlbum).toBe(5);      // solo, box-left, twobox, duo, blank
    expect(s.layouts.mostUsedLookPct).toBe(33);   // the full page: 2 of 6
    expect(s.layouts.sameLookNextPerAlbum).toBe(1);
    expect(s.layouts.topLayouts[0]).toEqual({ label: 'Full Page', count: 2 });
  });

  it('two layouts that print the same are one look; an unknown layout still counts, by its id', () => {
    const s = summarizeAlbumStats([row({ pages: ['t88-retired-xyz|1|0', 't88-retired-xyz|1|0', 't88-fb-solo|1|0'] })]);
    expect(s.layouts.looksPerAlbum).toBe(2);
    expect(s.layouts.topLayouts[0]).toEqual({ label: 'Unknown layout (t88-retired-xyz)', count: 2 });
  });
});

describe('the database side (0048)', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0048_admin_album_stats.sql'), 'utf8');
  it('is owner only, and anon holds no EXECUTE', () => {
    expect(sql).toMatch(/operator_role\(\) is distinct from 'owner'/);
    expect(sql).toMatch(/revoke all on function public\.admin_album_stats\(boolean, boolean, timestamptz, integer\) from public;/);
    expect(sql).toMatch(/revoke execute on function public\.admin_album_stats\(boolean, boolean, timestamptz, integer\) from anon;/);
  });
  it('leaves out the owner and Team accounts by default (their albums are tests)', () => {
    expect(sql).toMatch(/p_exclude_team boolean default true/);
    expect(sql).toMatch(/public\.operator_roles r where lower\(r\.email\) = lower\(u\.email\)/);
  });
  it('returns no ids, titles, photo names or captions', () => {
    const returns = sql.slice(sql.indexOf('returns table'), sql.indexOf('language plpgsql'));
    for (const banned of [/\bid\b/, /\buser_id\b/, /\btitle\b/, /\bname\b/, /\bcaption/, /\bemail\b/]) {
      expect(returns, String(banned)).not.toMatch(banned);
    }
  });
  it('the occasion chips match the app\'s own list', async () => {
    const { COMMON_THEMES } = await import('./albumTheme');
    const listed = sql.match(/lower\(k\.occ\) in \(([^)]*)\)/)![1].split(',').map((w) => w.trim().replace(/'/g, ''));
    expect(listed).toEqual(COMMON_THEMES.map((t) => t.toLowerCase()));
  });
});
