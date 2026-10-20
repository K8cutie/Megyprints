/* Album stats tab — patterns across the albums customers saved (owner only).
   The numbers come from admin_album_stats (0048) via src/lib/adminAlbumStats.ts;
   this file only lays them out. */

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAlbumStats, summarizeAlbumStats, ALBUM_STATS_LIMIT, type AlbumStatsRow, type Bucket } from '../../lib/adminAlbumStats';

const BAR = '#B85C38';

export default function AlbumStatsPanel() {
  const [paidOnly, setPaidOnly] = useState(false);
  // The owner and Team accounts' albums are walkthroughs and tests: left out
  // unless asked for (158 of the first 240 saved albums were the owner's).
  const [includeOurs, setIncludeOurs] = useState(false);
  const [sinceDays, setSinceDays] = useState<number | null>(null);
  // Each answer remembers which switches it is for, so a switch flip shows
  // the spinner until its own answer lands (never the last one's numbers).
  const key = `${paidOnly}|${includeOurs}|${sinceDays}`;
  const [result, setResult] = useState<{ key: string; rows?: AlbumStatsRow[]; err?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAlbumStats({ paidOnly, includeOurs, sinceDays })
      .then((r) => { if (alive) setResult({ key, rows: r }); })
      .catch((e) => { if (alive) setResult({ key, err: e instanceof Error ? e.message : 'Couldn\'t load album stats' }); });
    return () => { alive = false; };
  }, [key, paidOnly, includeOurs, sinceDays]);

  const current = result?.key === key ? result : null;
  const err = current?.err ?? null;
  const rows = current?.rows ?? null;
  const s = useMemo(() => (rows ? summarizeAlbumStats(rows) : null), [rows]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle options={[['All saved albums', false], ['Ordered (paid)', true]]} value={paidOnly} onChange={setPaidOnly} />
        <Toggle options={[['All time', null], ['Last 30 days', 30]]} value={sinceDays} onChange={setSinceDays} />
        <Toggle options={[['Customers only', false], ['Include our own albums', true]]} value={includeOurs} onChange={setIncludeOurs} />
      </div>

      {err && <p className="text-sm text-red-600">Couldn't load album stats: {err}</p>}
      {!err && !s && <div className="py-24 flex justify-center text-light"><Loader2 className="w-6 h-6 animate-spin" /></div>}

      {s && (
        <>
          <p className="text-sm text-medium -mt-4" data-testid="stats-basis">
            {s.albums === 0
              ? (paidOnly ? 'No ordered albums in this period yet.' : 'No albums saved in this period yet.')
              : <>Based on <b className="text-dark">{s.albums.toLocaleString()}</b> {paidOnly ? 'ordered' : 'saved'} album{s.albums === 1 ? '' : 's'}
                  {s.matching > s.albums ? <> (the newest {ALBUM_STATS_LIMIT.toLocaleString()} of {s.matching.toLocaleString()})</> : null}.</>}
            {' '}{includeOurs ? 'Includes albums from the owner and Team accounts.' : 'Albums from the owner and Team accounts are left out.'}
            {' '}Albums made without signing in stay on the customer's phone, so they aren't counted.
          </p>

          {s.albums > 0 && (
            <>
              <Section title="Photos per album">
                <Tiles items={[
                  ['Middle album', `${fmt(s.photos.median)} photos`, 'half the albums have more, half fewer'],
                  ['Average', `${fmt(s.photos.average)} photos`],
                  ['Smallest', `${fmt(s.photos.smallest)} photos`],
                  ['Biggest', `${fmt(s.photos.biggest)} photos`],
                ]} />
                <BarList title="Albums by photo count" buckets={s.photos.buckets} unit="albums" />
                {s.photos.leftOut > 0 && (
                  <p className="text-xs text-light mt-2">Not counted above: {s.photos.leftOut.toLocaleString()} photos customers left out after Megy's photo check.</p>
                )}
              </Section>

              <Section title="Photo shapes">
                <BarList title="Photos by shape" buckets={s.shapes.total} unit="photos"
                  note={s.shapes.unknown > 0
                    ? `Not counted: ${s.shapes.unknown.toLocaleString()} photos saved without their size. Albums only keep photo sizes since 5 Oct 2026.`
                    : undefined} />
                <div className="rounded-xl border border-line bg-white overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-medium border-b border-line">
                        <th className="px-4 py-2 font-medium">Album size</th>
                        <th className="px-4 py-2 font-medium text-right">Albums</th>
                        <th className="px-4 py-2 font-medium text-right">Portrait</th>
                        <th className="px-4 py-2 font-medium text-right">Landscape</th>
                        <th className="px-4 py-2 font-medium text-right">Square</th>
                        <th className="px-4 py-2 font-medium text-right">Extra wide or tall</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line-soft">
                      {s.shapes.bySize.map((r) => (
                        <tr key={r.size}>
                          <td className="px-4 py-2 text-dark">{r.size}</td>
                          <td className="px-4 py-2 text-right text-dark">{r.albums.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-ink-warm">{r.portraitPct}%</td>
                          <td className="px-4 py-2 text-right text-ink-warm">{r.landscapePct}%</td>
                          <td className="px-4 py-2 text-right text-ink-warm">{r.squarePct}%</td>
                          <td className="px-4 py-2 text-right text-ink-warm">{r.otherPct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section title="Sizes and occasions">
                <div className="grid md:grid-cols-2 gap-4">
                  <BarList title="Album sizes" buckets={s.sizes} unit="albums" />
                  <BarList title="Occasions" buckets={s.occasions} unit="albums"
                    note={'Customers\' own words show only when 3 or more albums use them; the rest are "Something else".'} />
                </div>
                <div className="mt-6">
                  <Tiles items={[
                    ['Middle album', `${fmt(s.pages.median)} pages`],
                    ['Average', `${fmt(s.pages.average)} pages`],
                  ]} />
                  <BarList title="Albums by page count" buckets={s.pages.buckets} unit="albums" />
                </div>
              </Section>

              <Section title="Page layouts">
                <Tiles items={[
                  ['Different looks per album', fmt(s.layouts.looksPerAlbum), 'pages that print alike count once'],
                  ['Most-used look', `${s.layouts.mostUsedLookPct}% of pages`, 'in a typical album'],
                  ['Same look on the next page', `${fmt(s.layouts.sameLookNextPerAlbum)} times`, 'per album'],
                  ['Pages with a box', `${s.layouts.boxPagesPct}%`, `${s.layouts.totalPages.toLocaleString()} pages in all`],
                  ['Empty boxes', `${s.layouts.emptyBoxesPct}%`, `of ${s.layouts.boxes.toLocaleString()} boxes; they print as plain paper`],
                ]} />
                <div className="grid md:grid-cols-2 gap-4">
                  <BarList title="Pages, by what's on them" buckets={s.layouts.pageKinds} unit="pages" />
                  <BarList title="Most-used layouts" buckets={s.layouts.topLayouts} unit="pages" total={s.layouts.totalPages} />
                </div>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 }));

function Toggle<T>({ options, value, onChange }: { options: [string, T][]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
      {options.map(([label, v]) => (
        <button key={label} onClick={() => onChange(v)} aria-pressed={value === v}
          className="px-3 py-1.5 text-sm rounded-md transition-colors"
          style={value === v ? { background: BAR, color: '#fff' } : { color: '#6B6B6B' }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-dark mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Tiles({ items }: { items: [string, string, string?][] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
      {items.map(([label, value, hint]) => (
        <div key={label} className="rounded-xl border border-line bg-white p-4">
          <div className="text-xl font-semibold text-dark">{value}</div>
          <div className="text-sm text-medium mt-1">{label}</div>
          {hint && <div className="text-xs text-[#9B9B9B] mt-0.5">{hint}</div>}
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars, one row per bucket, each with its count and share written
 *  out (the numbers are the table; the bar only shows size at a glance). */
function BarList({ title, buckets, unit, total, note }: { title: string; buckets: Bucket[]; unit: string; total?: number; note?: string }) {
  const sum = total ?? buckets.reduce((n, b) => n + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <h3 className="text-sm font-medium text-dark mb-3">{title}</h3>
      <ul className="space-y-1.5">
        {buckets.map((b) => {
          const share = sum > 0 ? Math.round((100 * b.count) / sum) : 0;
          return (
            <li key={b.label} className="flex items-center gap-3 text-sm" title={`${b.label}: ${b.count.toLocaleString()} ${unit} (${share}%)`}>
              <span className="w-40 shrink-0 truncate text-ink-warm">{b.label}</span>
              <span className="flex-1 h-3 rounded-sm bg-[#F3EEE8] overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-r" style={{ width: `${(100 * b.count) / max}%`, background: BAR, minWidth: b.count ? 2 : 0 }} />
              </span>
              <span className="w-24 shrink-0 text-right text-dark tabular-nums">{b.count.toLocaleString()} <span className="text-light">· {share}%</span></span>
            </li>
          );
        })}
      </ul>
      {note && <p className="text-xs text-light mt-3">{note}</p>}
    </div>
  );
}
