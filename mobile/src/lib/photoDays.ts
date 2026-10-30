/* ══════════════════════════════════════════════════════════════════════════
   THE PICK-PHOTOS GRID: newest first, one block per day.

   The grid is a single virtualized list (FlashList). Each list item is a
   whole row: a day's heading, or up to `columns` photos of that day. Rows
   all have a fixed height, so the list stays smooth with thousands of
   photos: only the rows on screen exist.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Dated {
  id: string;
  /** Milliseconds, or null when the phone has no time for it. */
  time: number | null;
}

export interface Day<T extends Dated> {
  /** 'YYYY-MM-DD' in the phone's time zone, or NO_DATE. */
  key: string;
  label: string;
  items: T[];
}

export type GridRow<T extends Dated> =
  | { kind: 'day'; key: string; day: Day<T> }
  | { kind: 'photos'; key: string; dayKey: string; items: T[] };

export const NO_DATE = 'no-date';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n: number) => String(n).padStart(2, '0');

/** The day a time falls on, in the phone's own time zone. */
export function dayKey(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return NO_DATE;
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Today", "Yesterday", "Monday, October 26", or with the year when it is
 *  not this year: "Saturday, December 20, 2025". */
export function dayLabel(key: string, now: Date = new Date()): string {
  if (key === NO_DATE) return 'No date';
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  if (key === dayKey(now.getTime())) return 'Today';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday.getTime())) return 'Yesterday';
  const base = `${WEEKDAYS[day.getDay()]}, ${MONTHS[m - 1]} ${d}`;
  return y === now.getFullYear() ? base : `${base}, ${y}`;
}

/** Newest first; photos with no time go last, keeping their order. */
export function sortNewestFirst<T extends Dated>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const ta = a.item.time;
      const tb = b.item.time;
      if (ta == null && tb == null) return a.i - b.i;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb - ta || a.i - b.i;
    })
    .map(({ item }) => item);
}

/** Splits photos (already newest first) into days. */
export function groupByDay<T extends Dated>(items: readonly T[], now: Date = new Date()): Day<T>[] {
  const days: Day<T>[] = [];
  let current: Day<T> | null = null;
  for (const item of items) {
    const key = dayKey(item.time);
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(key, now), items: [] };
      days.push(current);
    }
    current.items.push(item);
  }
  return days;
}

/** The list's rows: each day's heading, then its photos `columns` at a time. */
export function gridRows<T extends Dated>(days: readonly Day<T>[], columns: number): GridRow<T>[] {
  const cols = Math.max(1, Math.floor(columns));
  const rows: GridRow<T>[] = [];
  for (const day of days) {
    rows.push({ kind: 'day', key: `day:${day.key}`, day });
    for (let i = 0; i < day.items.length; i += cols) {
      rows.push({ kind: 'photos', key: `row:${day.key}:${i / cols}`, dayKey: day.key, items: day.items.slice(i, i + cols) });
    }
  }
  return rows;
}

/** "2,345": thousands with a comma (no Intl needed). */
export function formatCount(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
