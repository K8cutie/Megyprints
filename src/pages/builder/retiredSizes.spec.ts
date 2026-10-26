// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RETIRED_SIZES, liveAlbumSize, liveTemplateId, liftRetiredPage, liftRetiredPages } from './retiredSizes';
import { PAGE_TEMPLATES, getTemplateById, getTemplatesForAlbum, migrateRetiredPages } from './pageTemplates';
import { ALBUM_SIZES } from './types';
import { deserializeAlbum } from '../../lib/useAlbumSync';
import { albumDataFromDraft } from '../../lib/draftAlbum';
import { readDraftAlbumForOrder, DRAFT_STORAGE_KEY } from '../../lib/localDraft';

/* ══════════════════════════════════════════════════════════════════════════
   9×9 REMOVED (owner, 2026-10-24). An album saved at 9×9 opens as 8×8 with
   the same layouts and photos; the database refuses a new 9×9 order (0053).
   ══════════════════════════════════════════════════════════════════════════ */

/** Every layout a 9×9 page could carry before the removal (id/slots/boxes),
 *  listed from the registry as it stood: tiled, hand-made, gap fillers, the
 *  QR pages and the per-size square set. */
const OLD_9X9 = `
  tile-full-9x9/1/0 tile-banner-cap-9x9/1/1 tile-title-banner-9x9/1/1 tile-portrait-capR-9x9/1/1
  tile-portrait-capL-9x9/1/1 tile-two-sq-cap-9x9/2/1 tile-cap-two-sq-9x9/2/1
  tile-portrait-pair-cap-9x9/2/1 tile-twin-port-topcap-9x9/2/1 tile-portrait-capC-9x9/1/1
  tile-land-hero-splitcap-9x9/1/2 tile-l-frame-1x1-9x9/3/1 tile-trio-text-br-9x9/3/1
  tile-trio-text-tl-9x9/3/1 tile-quad-sq-9x9/4/0 tile-six-sq-text-9x9/6/1 tqr-99/2/0 t9x9-01/1/0
  t9x9-02/1/0 t9x9-03/1/0 t9x9-04/2/0 t9x9-05/2/0 t9x9-06/2/0 t9x9-07/2/0 t9x9-08/2/0 t9x9-09/3/0
  t9x9-10/3/0 t9x9-11/3/0 t9x9-12/3/0 t9x9-13/3/0 t9x9-14/4/0 t9x9-15/4/0 t9x9-16/4/0 t9x9-17/4/0
  t9x9-18/2/0 t9x9-19/5/0 t9x9-20/4/1 t9x9-21/6/0 t9x9-24/5/1 t9x9-25/6/1 t9x9-26/6/0 t9x9-28/5/1
  t9x9-29/6/0 t9x9-30/6/0 t9x9-31/5/1 t9x9-32/4/1 t9x9-33/4/1 t9x9-34/4/0 t9x9-22/3/1
  gap-9x9-43-1/1/0 gap-9x9-43-1c/1/1 gap-9x9-43-2/2/0 gap-9x9-43-2c/2/1 gap-9x9-43-2a/2/0
  gap-9x9-43-2b/2/0 gap-9x9-34-1/1/0 gap-9x9-34-1c/1/1 gap-9x9-34-2/2/0 gap-9x9-34-2c/2/1
  gap-9x9-34-2a/2/0 gap-9x9-34-2b/2/0 gap-9x9-32-1/1/0 gap-9x9-32-1c/1/1 gap-9x9-32-2/2/0
  gap-9x9-32-2c/2/1 gap-9x9-32-2a/2/0 gap-9x9-32-2b/2/0 gap-9x9-23-1/1/0 gap-9x9-23-1c/1/1
  gap-9x9-23-2/2/0 gap-9x9-23-2c/2/1 gap-9x9-23-2a/2/0 gap-9x9-23-2b/2/0 gap-9x9-11-1/1/0
  gap-9x9-11-1c/1/1 gap-9x9-11-2/2/0 gap-9x9-11-2c/2/1 gap-9x9-11-2a/2/0 gap-9x9-11-2b/2/0
  gap-9x9-169-1/1/0 gap-9x9-169-1c/1/1 gap-9x9-169-2/2/0 gap-9x9-169-2c/2/1 gap-9x9-169-2a/2/0
  gap-9x9-169-2b/2/0 gap-9x9-916-1/1/0 gap-9x9-916-1c/1/1 gap-9x9-916-2/2/0 gap-9x9-916-2c/2/1
  gap-9x9-916-2a/2/0 gap-9x9-916-2b/2/0 qr-badge-9x9-tl/2/0 qr-badge-9x9-tr/2/0 qr-badge-9x9-bl/2/0
  qr-badge-9x9-br/2/0 t99-fb-solo/1/0 t99-solo-portrait/1/0 t99-solo-landscape/1/0
  t99-solo-square/1/0 t99-fb-solo-ls-box-below/1/1 t99-fb-solo-ls-box-above/1/1
  t99-fb-solo-pt-box-right/1/1 t99-fb-solo-pt-box-left/1/1 t99-fb-solo-ls-twobox-below/1/2
  t99-fb-solo-ls-twobox-above/1/2 t99-fb-solo-pt-twobox-right/1/2 t99-fb-solo-pt-twobox-left/1/2
  t99-fb-duo-exact-v-gap/2/1 t99-fb-duo-exact-h-gap/2/1 t99-fb-trio-hero-left-gap/3/0
  t99-fb-trio-hero-right-gap/3/0 t99-fb-trio-hero-top-gap/3/0 t99-fb-trio-hero-bottom-gap/3/0
  t99-fb-sq-box-tl-gap/3/1 t99-fb-sq-box-tr-gap/3/1 t99-fb-sq-box-bl-gap/3/1 t99-fb-sq-box-br-gap/3/1
  t99-fb-quad-grid-gap/4/0 t99-fb-quad-hero-left-gap/4/0 t99-fb-quad-hero-right-gap/4/0
  t99-fb-quad-hero-top-gap/4/0 t99-fb-quad-hero-bottom-gap/4/0 t99-fb-quad-43-box-below-gap/4/1
  t99-fb-quad-43-box-above-gap/4/1 t99-fb-quad-34-box-right-gap/4/1 t99-fb-quad-34-box-left-gap/4/1
  t99-fb-duo-exact-v/2/1 t99-fb-duo-exact-h/2/1 t99-fb-trio-hero-left/3/0 t99-fb-trio-hero-right/3/0
  t99-fb-trio-hero-top/3/0 t99-fb-trio-hero-bottom/3/0 t99-fb-sq-box-tl/3/1 t99-fb-sq-box-tr/3/1
  t99-fb-sq-box-bl/3/1 t99-fb-sq-box-br/3/1
`.trim().split(/\s+/).map((t) => {
  const [id, slots, boxes] = t.split('/');
  return { id, slots: Number(slots), boxes: Number(boxes) };
});

describe('every 9×9 layout has an 8×8 twin', () => {
  it('all 136 old layouts are listed', () => expect(OLD_9X9).toHaveLength(136));

  it.each(OLD_9X9)('$id → its twin, with the same photos and boxes', ({ id, slots, boxes }) => {
    const twin = getTemplateById(liveTemplateId(id));
    expect(twin, liveTemplateId(id)).toBeDefined();
    expect(twin!.slots.length).toBe(slots);
    expect(twin!.textSlots?.length ?? 0).toBe(boxes);
  });

  const opened = (id: string, slots: number) =>
    migrateRetiredPages(liftRetiredPages([{ templateId: id, size: '9x9', slotFills: Array.from({ length: slots }, (_, i) => i) }]), '8x8')[0];

  it('a page on a layout 8×8 still deals keeps that exact layout and every photo', () => {
    const live = OLD_9X9.filter(({ id }) => getTemplateById(liveTemplateId(id))!.albumSizes.includes('8x8'));
    expect(live.length).toBe(37); // the square set as dealt today + the four QR pages
    for (const { id, slots } of live) {
      const page = opened(id, slots);
      expect(page.templateId, id).toBe(liveTemplateId(id));
      expect(page.slotFills, id).toEqual(Array.from({ length: slots }, (_, i) => i));
      expect(page.size).toBe('8x8');
    }
  });

  it('a page on a long-retired layout is re-laid just as the same 8×8 page is', () => {
    // (Some of those had 5 or 6 photos, more than any square layout dealt
    // today holds; an 8×8 album with one of them was already re-laid so.)
    for (const { id, slots } of OLD_9X9) {
      const fills = Array.from({ length: slots }, (_, i) => i);
      const eight = migrateRetiredPages([{ templateId: liveTemplateId(id), size: '8x8', slotFills: fills }], '8x8')[0];
      expect(opened(id, slots), id).toEqual(eight);
    }
  });
});

describe('the converter', () => {
  it('9×9 opens as 8×8; every other size, and no size, stays as it is', () => {
    expect(liveAlbumSize('9x9')).toBe('8x8');
    for (const s of ALBUM_SIZES) expect(liveAlbumSize(s.preset)).toBe(s.preset);
    expect(liveAlbumSize(undefined)).toBeUndefined();
    expect(liveAlbumSize(null)).toBeNull();
  });

  it('moves a 9×9 page — size and layout — and keeps everything else on it', () => {
    const page = {
      id: 'p3', size: '9x9', templateId: 't99-fb-quad-grid-gap', slotFills: [4, 5, 6, 7],
      slotOffsetsX: [3, 0, 0, -2], textElements: [{ id: 't', text: 'Macau' }],
    };
    expect(liftRetiredPage(page)).toEqual({ ...page, size: '8x8', templateId: 't88-fb-quad-grid-gap' });
    // A row saved with the snake_case key is read the same way.
    expect(liftRetiredPage({ template_id: 'qr-badge-9x9-br', size: '9x9' })).toEqual({ template_id: 'qr-badge-8x8-br', size: '8x8' });
  });

  it('leaves every other page alone — the same objects, the same array', () => {
    const pages = [{ size: '8x8', templateId: 't88-fb-solo' }, { size: '6x6', templateId: 't66-fb-quad-grid-gap' }, { size: '8x8' }];
    expect(liftRetiredPages(pages)).toBe(pages);
    expect(liftRetiredPage(pages[0])).toBe(pages[0]);
    expect(liftRetiredPage(null)).toBeNull();
  });
});

describe('a 9×9 album read back in', () => {
  const pages9 = [
    { id: 'p0', size: '9x9', templateId: 't99-fb-solo', slotFills: [0] },
    { id: 'p1', size: '9x9', templateId: 'qr-badge-9x9-tl', slotFills: [1, null], qrFills: [null, { kind: 'clip', code: 'AAA' }] },
  ];
  const pages8 = [
    { id: 'p0', size: '8x8', templateId: 't88-fb-solo', slotFills: [0] },
    { id: 'p1', size: '8x8', templateId: 'qr-badge-8x8-tl', slotFills: [1, null], qrFills: [null, { kind: 'clip', code: 'AAA' }] },
  ];
  beforeEach(() => localStorage.clear());

  it('from the account (every cloud read): an 8×8 album, its pages and cover on 8×8', () => {
    const a = deserializeAlbum({
      id: 'a1', title: 'Quinn HK Trip', album_size: '9x9', pages: pages9,
      cover_front: { id: 'cover', size: '9x9', templateId: 'cover-hero' },
    });
    expect(a.sizePreset).toBe('8x8');
    expect(a.pages).toEqual(pages8);
    expect(a.coverFront).toEqual({ id: 'cover', size: '8x8', templateId: 'cover-hero' });
  });

  it('from this device, saved to the account at checkout', () => {
    const a = albumDataFromDraft({ albumId: 'a1', albumSize: '9x9', albumPages: pages9, coverFront: { id: 'cover', size: '9x9' } });
    expect(a.sizePreset).toBe('8x8');
    expect(a.pages).toEqual(pages8);
    expect(a.coverFront).toEqual({ id: 'cover', size: '8x8' });
  });

  it('from this device, priced at checkout: as the 8×8 it is now', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ albumId: 'a1', albumSize: '9x9', albumPages: pages9, editedAt: 5 }));
    expect(readDraftAlbumForOrder('a1')).toEqual({ albumId: 'a1', albumSize: '8x8', pages: pages8, editedAt: 5 });
  });
});

describe('9×9 is gone from the app, and the database agrees (0053)', () => {
  const SQL = readFileSync(resolve(__dirname, '../../../supabase/migrations/0053_remove_9x9.sql'), 'utf8');
  const quoted = (list: string) => list.match(/'([^']+)'/g)!.map((s) => s.slice(1, -1)).sort();

  it('no 9×9 size, and no layout made for one', () => {
    expect(ALBUM_SIZES.map((s) => s.preset)).not.toContain('9x9');
    const nine = PAGE_TEMPLATES.filter((t) => /9x9|99/.test(t.id) || (t.albumSizes as string[]).includes('9x9'));
    expect(nine.map((t) => t.id)).toEqual([]);
    expect(getTemplatesForAlbum('9x9' as never)).toEqual([]);
  });

  it('0053 refuses an order at exactly the sizes the app stopped making, and moves their albums', () => {
    const refused = quoted(SQL.match(/'\[\^0-9\.x\]', '', 'g'\) in \(([^)]*)\)/)![1]);
    expect(refused).toEqual(Object.keys(RETIRED_SIZES).sort());
    for (const size of refused) {
      expect(SQL).toContain(`set disabled_sizes = array_append(disabled_sizes, '${size}')`);
      expect(SQL).toContain(`set sizes = sizes - '${size}'`);
    }
    expect(SQL).toContain(`set album_size = '${RETIRED_SIZES['9x9']}'`);
  });

  it("0053's event-deal size check lists exactly the sizes the app makes", () => {
    expect(quoted(SQL.match(/deal_album_size in \(([^)]*)\)/)![1])).toEqual(ALBUM_SIZES.map((s) => s.preset).sort());
  });
});
