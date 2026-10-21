/* ══════════════════════════════════════════════════════════════════════════
   ALBUM STATS for the owner console (owner, 2026-10-21: "a statistical page
   for the admin, it helps us study patterns"). The database hands over one
   row of numbers per saved album (admin_album_stats, migration 0048, owner
   only); this file turns those rows into what the Album stats tab shows:
   photos per album, photo shapes, sizes and occasions, pages per album, and
   how varied the pages came out.

   Only albums saved to the cloud are counted: an album made without signing
   in stays on the customer's phone.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase, supabaseConfigured } from './supabase';
import { getTemplateById, photoSlotCount } from '../pages/builder/pageTemplates';
import type { PageTemplate } from '../pages/builder/types';

/** One album, as admin_album_stats() returns it. */
export interface AlbumStatsRow {
  album_size: string | null;
  occasion: string | null;
  photos: number;
  left_out: number;
  portrait: number;
  landscape: number;
  square: number;
  extra_wide: number;
  extra_tall: number;
  unknown_shape: number;
  paid: boolean;
  made_on: string;
  /** "<layout id>|<photos on the page>|<boxes holding something>", in page order. */
  pages: string[] | null;
  total_matching: number;
}

/** Newest albums the page reads at most (the database caps it at 5,000). Each
 *  album is about 2 KB, so 1,000 keeps a load near 2 MB. */
export const ALBUM_STATS_LIMIT = 1000;

export async function fetchAlbumStats(opts: { paidOnly: boolean; includeOurs: boolean; sinceDays: number | null }): Promise<AlbumStatsRow[]> {
  if (!supabaseConfigured) return [];
  const since = opts.sinceDays == null ? null : new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString();
  const { data, error } = await supabase.rpc('admin_album_stats', {
    p_paid_only: opts.paidOnly,
    p_exclude_team: !opts.includeOurs,
    p_since: since,
    p_limit: ALBUM_STATS_LIMIT,
  });
  if (error) {
    if (error.code === '42501') throw new Error('Only the owner account can see album stats.');
    if (error.code === 'PGRST202' || /admin_album_stats/.test(error.message)) {
      throw new Error('Album stats need migration 0048_admin_album_stats.sql in Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as AlbumStatsRow[];
}

/** A labelled count, for a bar or a table row. */
export interface Bucket { label: string; count: number }

export interface AlbumStats {
  /** Albums counted, and how many matched before the newest-first cap. */
  albums: number;
  matching: number;
  photos: { median: number; average: number; smallest: number; biggest: number; buckets: Bucket[]; leftOut: number };
  /** Shapes of the photos whose size was saved; `unknown` = photos saved
   *  without one (albums saved before 5 Oct 2026 don't carry sizes). */
  shapes: { total: Bucket[]; unknown: number; bySize: { size: string; albums: number; portraitPct: number; landscapePct: number; squarePct: number; otherPct: number }[] };
  sizes: Bucket[];
  occasions: Bucket[];
  pages: { median: number; average: number; buckets: Bucket[] };
  layouts: {
    /** Different printed looks in an album, on average. */
    looksPerAlbum: number;
    /** Share of an album's pages that use its most-used look, on average (0–100). */
    mostUsedLookPct: number;
    /** Times a page has the same look as the page before it, per album on average. */
    sameLookNextPerAlbum: number;
    boxPagesPct: number;
    boxes: number;
    emptyBoxesPct: number;
    pageKinds: Bucket[];
    topLayouts: Bucket[];
    totalPages: number;
  };
}

const PHOTO_BUCKETS: { label: string; max: number }[] = [
  { label: 'Under 40', max: 39 },
  { label: '40–59', max: 59 },
  { label: '60–119', max: 119 },
  { label: '120–199', max: 199 },
  { label: '200 or more', max: Infinity },
];
const PAGE_BUCKETS: { label: string; max: number }[] = [
  { label: 'Under 40', max: 39 },
  { label: '40', max: 40 },
  { label: '41–60', max: 60 },
  { label: '61–100', max: 100 },
  { label: 'Over 100', max: Infinity },
];
const PAGE_KINDS = ['Full-page photo', '1 photo + box', '1 photo', '2 photos', '3 photos', '4 or more photos', 'Blank'] as const;

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function bucketize(values: number[], edges: { label: string; max: number }[]): Bucket[] {
  const out = edges.map((e) => ({ label: e.label, count: 0 }));
  for (const v of values) out[edges.findIndex((e) => v <= e.max)].count++;
  return out;
}
function tally(keys: string[]): Bucket[] {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** How a page prints: its photo and box frames, wherever they sit. Two layouts
 *  with different names that print the same get the same look. */
function lookOf(t: PageTemplate | undefined, id: string): string {
  if (!t) return `?${id}`;
  const r = (v: number) => v.toFixed(2);
  return (t.fullBleed ? 'FB' : 'M') + '|'
    + t.slots.filter((s) => s.kind !== 'qr').map((s) => `${r(s.x)},${r(s.y)},${r(s.width)},${r(s.height)}`).join(';') + '|'
    + (t.textSlots ?? []).map((s) => `${r(s.x)},${r(s.y)},${r(s.width)},${r(s.height)}`).join(';');
}
function coversWholePage(t: PageTemplate): boolean {
  const s = t.slots.find((x) => x.kind !== 'qr');
  return !!t.fullBleed && !!s && s.x <= 0.001 && s.y <= 0.001 && s.width >= 0.999 && s.height >= 0.999;
}

export function parsePage(token: string): { id: string; photos: number; filled: number } {
  const [id = '', photos = '0', filled = '0'] = token.split('|');
  return { id, photos: Number(photos) || 0, filled: Number(filled) || 0 };
}

/** Turn the rows into the page's numbers. Pure; no network. */
export function summarizeAlbumStats(rows: AlbumStatsRow[]): AlbumStats {
  const inAlbum = rows.map((r) => Math.max(0, r.photos - r.left_out));
  const pageCounts = rows.map((r) => (r.pages ?? []).length);

  const shapeTotals = { portrait: 0, landscape: 0, square: 0, extra_wide: 0, extra_tall: 0, unknown_shape: 0 };
  const bySize = new Map<string, { albums: number; portrait: number; landscape: number; square: number; other: number }>();
  for (const r of rows) {
    for (const k of Object.keys(shapeTotals) as (keyof typeof shapeTotals)[]) shapeTotals[k] += r[k];
    const size = r.album_size || 'Not set';
    const s = bySize.get(size) ?? { albums: 0, portrait: 0, landscape: 0, square: 0, other: 0 };
    s.albums++;
    s.portrait += r.portrait;
    s.landscape += r.landscape;
    s.square += r.square;
    s.other += r.extra_wide + r.extra_tall;
    bySize.set(size, s);
  }

  let totalPages = 0, boxPages = 0, boxes = 0, filledBoxes = 0;
  const looksPerAlbum: number[] = [];
  const mostUsed: number[] = [];
  const sameNext: number[] = [];
  const kinds = new Map<string, number>(PAGE_KINDS.map((k) => [k, 0]));
  const layoutNames = new Map<string, number>();
  for (const r of rows) {
    const pages = (r.pages ?? []).map(parsePage);
    if (!pages.length) continue;
    const looks: string[] = [];
    for (const p of pages) {
      const t = p.id ? getTemplateById(p.id) : undefined;
      const boxCount = t?.textSlots?.length ?? 0;
      totalPages++;
      if (boxCount > 0) boxPages++;
      boxes += boxCount;
      filledBoxes += Math.min(p.filled, boxCount);
      const kind = p.photos === 0 ? 'Blank'
        : p.photos === 1 ? (t && boxCount === 0 && photoSlotCount(t) === 1 && coversWholePage(t) ? 'Full-page photo' : boxCount > 0 ? '1 photo + box' : '1 photo')
        : p.photos === 2 ? '2 photos' : p.photos === 3 ? '3 photos' : '4 or more photos';
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      const name = t?.name ?? (p.id ? `Unknown layout (${p.id})` : 'No layout');
      layoutNames.set(name, (layoutNames.get(name) ?? 0) + 1);
      looks.push(lookOf(t, p.id));
    }
    const freq = new Map<string, number>();
    looks.forEach((l) => freq.set(l, (freq.get(l) ?? 0) + 1));
    looksPerAlbum.push(freq.size);
    mostUsed.push((100 * Math.max(...freq.values())) / looks.length);
    let same = 0;
    for (let i = 1; i < looks.length; i++) if (looks[i] === looks[i - 1]) same++;
    sameNext.push(same);
  }

  return {
    albums: rows.length,
    matching: rows.length ? Math.max(rows.length, Number(rows[0].total_matching) || 0) : 0,
    photos: {
      median: median(inAlbum),
      average: round1(average(inAlbum)),
      smallest: inAlbum.length ? Math.min(...inAlbum) : 0,
      biggest: inAlbum.length ? Math.max(...inAlbum) : 0,
      buckets: bucketize(inAlbum, PHOTO_BUCKETS),
      leftOut: rows.reduce((n, r) => n + r.left_out, 0),
    },
    shapes: {
      total: [
        { label: 'Portrait', count: shapeTotals.portrait },
        { label: 'Landscape', count: shapeTotals.landscape },
        { label: 'Square', count: shapeTotals.square },
        { label: 'Extra wide (16:9)', count: shapeTotals.extra_wide },
        { label: 'Extra tall (9:16)', count: shapeTotals.extra_tall },
      ],
      unknown: shapeTotals.unknown_shape,
      bySize: [...bySize].map(([size, s]) => {
        const known = s.portrait + s.landscape + s.square + s.other;
        return { size, albums: s.albums, portraitPct: pct(s.portrait, known), landscapePct: pct(s.landscape, known), squarePct: pct(s.square, known), otherPct: pct(s.other, known) };
      }).sort((a, b) => b.albums - a.albums || a.size.localeCompare(b.size)),
    },
    sizes: tally(rows.map((r) => r.album_size || 'Not set')),
    occasions: tally(rows.map((r) => r.occasion || 'Not set')),
    pages: { median: median(pageCounts), average: round1(average(pageCounts)), buckets: bucketize(pageCounts, PAGE_BUCKETS) },
    layouts: {
      looksPerAlbum: round1(average(looksPerAlbum)),
      mostUsedLookPct: Math.round(average(mostUsed)),
      sameLookNextPerAlbum: round1(average(sameNext)),
      boxPagesPct: pct(boxPages, totalPages),
      boxes,
      emptyBoxesPct: pct(boxes - filledBoxes, boxes),
      pageKinds: PAGE_KINDS.map((k) => ({ label: k, count: kinds.get(k) ?? 0 })),
      topLayouts: [...layoutNames].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      totalPages,
    },
  };
}
