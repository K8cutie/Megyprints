import { dayKey, dayLabel, formatCount, gridRows, groupByDay, NO_DATE, sortNewestFirst, type Dated } from '../src/lib/photoDays';

// Dates are built in the test machine's own time zone, as the phone does.
const at = (y: number, m: number, d: number, h = 12, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const now = new Date(2026, 9, 28, 15, 0); // Wednesday, October 28, 2026

describe('the grid, one block per day', () => {
  it('names days in plain words', () => {
    expect(dayLabel(dayKey(at(2026, 10, 28, 9)), now)).toBe('Today');
    expect(dayLabel(dayKey(at(2026, 10, 27, 23, 59)), now)).toBe('Yesterday');
    expect(dayLabel(dayKey(at(2026, 10, 26)), now)).toBe('Monday, October 26');
    expect(dayLabel(dayKey(at(2025, 12, 20)), now)).toBe('Saturday, December 20, 2025');
    expect(dayLabel(NO_DATE, now)).toBe('No date');
    expect(dayKey(null)).toBe(NO_DATE);
  });

  it('"Yesterday" works across a month and a year', () => {
    expect(dayLabel(dayKey(at(2026, 9, 30)), new Date(2026, 9, 1, 8))).toBe('Yesterday');
    expect(dayLabel(dayKey(at(2025, 12, 31)), new Date(2026, 0, 1, 8))).toBe('Yesterday');
  });

  it('sorts newest first; photos with no time go last, in their order', () => {
    const items: Dated[] = [
      { id: 'old', time: at(2026, 1, 1) },
      { id: 'none1', time: null },
      { id: 'new', time: at(2026, 10, 27) },
      { id: 'none2', time: null },
      { id: 'mid', time: at(2026, 5, 5) },
    ];
    expect(sortNewestFirst(items).map((p) => p.id)).toEqual(['new', 'mid', 'old', 'none1', 'none2']);
  });

  it('groups by day, and rows hold a heading then four photos at a time', () => {
    const items: Dated[] = sortNewestFirst([
      ...Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, time: at(2026, 10, 28, 8, i) })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `y${i}`, time: at(2026, 10, 27, 8, i) })),
      { id: 'x', time: at(2026, 10, 20) },
    ]);
    const days = groupByDay(items, now);
    expect(days.map((d) => [d.label, d.items.length])).toEqual([['Today', 6], ['Yesterday', 4], ['Tuesday, October 20', 1]]);
    const rows = gridRows(days, 4);
    expect(rows.map((r) => (r.kind === 'day' ? `# ${r.day.label}` : r.items.map((p) => p.id).join(' ')))).toEqual([
      '# Today', 't5 t4 t3 t2', 't1 t0',
      '# Yesterday', 'y3 y2 y1 y0',
      '# Tuesday, October 20', 'x',
    ]);
    // Keys are unique (the list needs them).
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('builds the rows for 20,000 photos quickly', () => {
    const many: Dated[] = Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), time: at(2026, 10, 28) - i * 47 * 60_000 }));
    const t0 = Date.now();
    const rows = gridRows(groupByDay(sortNewestFirst(many), now), 4);
    const photos = rows.reduce((n, r) => (r.kind === 'photos' ? n + r.items.length : n), 0);
    expect(photos).toBe(20_000);
    expect(rows.filter((r) => r.kind === 'day').length).toBeGreaterThan(600);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('writes big counts with commas', () => {
    expect(formatCount(7)).toBe('7');
    expect(formatCount(2345)).toBe('2,345');
    expect(formatCount(1234567)).toBe('1,234,567');
  });
});
