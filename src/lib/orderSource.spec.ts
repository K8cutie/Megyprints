// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ══════════════════════════════════════════════════════════════════════════
   WHICH POST AN ORDER CAME FROM (0063): a post's link carries ?p=TAG, the tag
   is kept on the device for 30 days, and an order placed in that time carries
   it. It is a note for the owner. The rule these tests hold it to: the tag
   never costs a sale. A bad tag, an old tag, or a database that doesn't have
   the column yet all end the same way, with the order placed.
   ══════════════════════════════════════════════════════════════════════════ */

const h = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  answers: [] as { data: unknown; error: unknown }[],
}));
const PLACED = { data: { id: 'order-1', order_number: 'MP-2026-ABCDEFG', status: 'pending_payment' }, error: null };

vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        h.inserts.push(row);
        return { select: () => ({ single: async () => h.answers.shift() ?? PLACED }) };
      },
    }),
  },
}));
vi.mock('./orderAlbum', async (original) => ({
  ...(await original<typeof import('./orderAlbum')>()),
  selectOrderAlbum: async () => ({
    id: 'album-1', title: 'Our year', album_type: null, album_size: '8x8', selected_template: null,
    photos_per_page: null, pages: [{}, {}], photos: [], cover_photo: null,
  }),
}));
// The print pipeline is not part of placing the order row.
vi.mock('../pages/builder/generateAlbumPdf', () => ({ generateAlbumPdf: vi.fn(), generateCoverWrapPdf: vi.fn() }));

import {
  normalizeSource, sourceFromUrl, captureOrderSource, storedOrderSource, isMissingSourceColumn,
  SOURCE_KEY, SOURCE_PATTERN, SOURCE_WINDOW_DAYS,
} from './orderSource';
import { createOrderFromAlbum } from './orders';
import { captureAffiliateRef, storedAffiliateRef } from './affiliates';
import { EMPTY_ADDRESS } from './contact';

const DAY = 86_400_000;
const open = (url: string) => window.history.replaceState(null, '', url);
const kept = () => JSON.parse(localStorage.getItem(SOURCE_KEY) ?? 'null') as { tag: string; at: number } | null;

beforeEach(() => {
  localStorage.clear();
  open('/');
  h.inserts.length = 0;
  h.answers.length = 0;
});

describe('what counts as a tag', () => {
  it('lower-case letters, digits and hyphens', () => {
    expect(normalizeSource('xmas-01')).toBe('xmas-01');
    expect(normalizeSource('a')).toBe('a');
  });
  it('is tidied the way the database tidies it', () => {
    expect(normalizeSource('  XMAS-01 ')).toBe('xmas-01');
  });
  it('anything else is no tag', () => {
    for (const bad of ['', '   ', '-xmas', 'xmas 01', 'xmas_01', 'x'.repeat(41), "x'; drop table orders;--", '<b>', null, undefined]) {
      expect(normalizeSource(bad)).toBeNull();
    }
  });
});

describe('reading the tag from a link', () => {
  it('before the #', () => {
    expect(sourceFromUrl('?p=xmas-01', '#/')).toBe('xmas-01');
  });
  it('inside the #/route?query', () => {
    expect(sourceFromUrl('', '#/builder?p=xmas-01')).toBe('xmas-01');
  });
  it('a link without one, or with a malformed one', () => {
    expect(sourceFromUrl('', '#/')).toBeNull();
    expect(sourceFromUrl('?album=abc', '#/order?order=1')).toBeNull();
    expect(sourceFromUrl('?p=not%20a%20tag', '')).toBeNull();
  });
});

describe('opening a tagged link', () => {
  it('keeps the tag with the time, and tidies it out of the address bar', () => {
    open('/?p=xmas-01&album=abc#/builder');
    expect(captureOrderSource(1000)).toBe('xmas-01');
    expect(kept()).toEqual({ tag: 'xmas-01', at: 1000 });
    expect(window.location.search).toBe('?album=abc');
    expect(window.location.hash).toBe('#/builder');
  });
  it("a link with an affiliate's code too: both are kept, each takes only its own word out", () => {
    for (const first of ['affiliate', 'post']) {
      localStorage.clear();
      open('/?ref=anna&p=xmas-01&album=abc#/builder');
      if (first === 'affiliate') { captureAffiliateRef(); captureOrderSource(); } else { captureOrderSource(); captureAffiliateRef(); }
      expect(storedOrderSource()).toBe('xmas-01');
      expect(storedAffiliateRef()).toBe('ANNA');
      expect(window.location.search).toBe('?album=abc');
      expect(window.location.hash).toBe('#/builder');
    }
  });
  it('tidies a tag that sat inside the #/route?query too', () => {
    open('/#/order?order=7&p=xmas-01');
    expect(captureOrderSource(1000)).toBe('xmas-01');
    expect(window.location.hash).toBe('#/order?order=7');
  });
  it('a visit without a tag keeps the earlier one', () => {
    open('/?p=xmas-01');
    captureOrderSource(1000);
    open('/#/builder');
    expect(captureOrderSource(2000)).toBeNull();
    expect(kept()).toEqual({ tag: 'xmas-01', at: 1000 });
  });
  it('the last tagged link opened wins', () => {
    open('/?p=xmas-01');
    captureOrderSource(1000);
    open('/?p=newyear-02');
    captureOrderSource(2000);
    expect(kept()).toEqual({ tag: 'newyear-02', at: 2000 });
  });
});

describe('how long a tag counts', () => {
  it(`for ${SOURCE_WINDOW_DAYS} days`, () => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify({ tag: 'xmas-01', at: 0 }));
    expect(storedOrderSource(SOURCE_WINDOW_DAYS * DAY)).toBe('xmas-01');
  });
  it('after that it is forgotten', () => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify({ tag: 'xmas-01', at: 0 }));
    expect(storedOrderSource(SOURCE_WINDOW_DAYS * DAY + 1)).toBeNull();
    expect(localStorage.getItem(SOURCE_KEY)).toBeNull();
  });
  it('something else in its place is no tag', () => {
    for (const junk of ['not json', '{}', '{"tag":"BAD TAG","at":1}', '{"tag":"ok","at":"soon"}', 'null']) {
      localStorage.setItem(SOURCE_KEY, junk);
      expect(storedOrderSource(1)).toBeNull();
    }
  });
});

describe('the order row', () => {
  const place = () => createOrderFromAlbum({
    userId: 'user-1',
    albumId: 'album-1',
    specs: { material: 'matte', cover: 'softcover', size: '8x8' } as Parameters<typeof createOrderFromAlbum>[0]['specs'],
    shipping: {
      name: 'Maria Santos',
      phone: '09171234567',
      address: {
        ...EMPTY_ADDRESS, regionCode: 'r', regionName: 'NCR', provinceCode: 'p', provinceName: 'Metro Manila',
        cityCode: 'c', cityName: 'Quezon City', barangayCode: 'b', barangayName: 'Bagumbayan',
        street: '12 Mabini St', zip: '1110',
      },
    },
    amount: 1500,
  });

  it('carries the tag of the link the visit came from', async () => {
    open('/?p=xmas-01');
    captureOrderSource();
    await expect(place()).resolves.toMatchObject({ order_number: 'MP-2026-ABCDEFG' });
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].source).toBe('xmas-01');
  });

  it('never names the column when there is no tag', async () => {
    await place();
    expect(h.inserts).toHaveLength(1);
    expect('source' in h.inserts[0]).toBe(false);
  });

  it('on a database without the column, goes again without the tag and is placed', async () => {
    open('/?p=xmas-01');
    captureOrderSource();
    h.answers.push({ data: null, error: { code: 'PGRST204', message: "Could not find the 'source' column of 'orders' in the schema cache" } });
    await expect(place()).resolves.toMatchObject({ order_number: 'MP-2026-ABCDEFG' });
    expect(h.inserts).toHaveLength(2);
    expect(h.inserts[0].source).toBe('xmas-01');
    expect('source' in h.inserts[1]).toBe(false);
    // Everything else about the order is the same the second time.
    const without = (row: Record<string, unknown>, ...keys: string[]) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
    expect(without(h.inserts[1], 'status_history')).toEqual(without(h.inserts[0], 'source', 'status_history'));
  });

  it('any other refusal is not sent twice', async () => {
    open('/?p=xmas-01');
    captureOrderSource();
    h.answers.push({ data: null, error: { code: '23514', message: 'violates check constraint' } });
    await expect(place()).rejects.toThrow(/Could not place your order/);
    expect(h.inserts).toHaveLength(1);
  });
});

describe('telling a missing column from any other refusal', () => {
  it('the two ways the database says it', () => {
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'source' column of 'orders' in the schema cache" })).toBe(true);
    expect(isMissingSourceColumn({ code: '42703', message: 'column "source" of relation "orders" does not exist' })).toBe(true);
  });
  it('another column, another error, or none', () => {
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'tester_code' column of 'orders' in the schema cache" })).toBe(false);
    expect(isMissingSourceColumn({ code: 'PGRST204', message: "Could not find the 'resource' column" })).toBe(false);
    expect(isMissingSourceColumn({ code: '23514', message: "source" })).toBe(false);
    expect(isMissingSourceColumn(null)).toBe(false);
  });
});

describe('migration 0063', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/0063_order_source.sql'), 'utf8');
  const triggerFn = sql.slice(sql.indexOf('function public.orders_source()'), sql.indexOf('revoke all on function public.orders_source()'));

  it('keeps the same tag rule as the app', () => {
    expect(triggerFn).toContain(`'${SOURCE_PATTERN.source}'`);
  });
  it('blanks a bad tag; it never refuses the order', () => {
    expect(triggerFn).toMatch(/new\.source := null/);
    expect(triggerFn).not.toMatch(/raise/i);
  });
  it('runs when an order is placed, and leaves prices and status alone', () => {
    expect(sql).toMatch(/create trigger orders_source_trg\s+before insert on public\.orders/);
    for (const column of ['amount', 'quoted_amount', 'quote', 'status', 'payment_status']) {
      expect(triggerFn).not.toMatch(new RegExp(`new\\.${column}\\b`));
    }
  });
  it('the summary is the owner’s only', () => {
    expect(sql).toMatch(/if not public\.is_owner\(\) then\s+raise exception 'not authorized'/);
    expect(sql).toMatch(/revoke all on function public\.owner_order_sources\(\) from public, anon;/);
  });
});
