// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { trashSpot, TRASH_SIZE, TRASH_INSET } from './trashSpot';
import { PageView } from './BuilderPreview';
import { qrBadgeTemplate } from './pageTemplates';
import type { AlbumPage } from './types';

/* ══════════════════════════════════════════════════════════════════════════
   THE QR NEVER SITS ON "REMOVE PHOTO" (1-star testers, 2026-10-04, the
   Commuter): on a 1-photo page, a video memory with its corner on Auto
   landed top-right — on top of the photo's trash button, half hiding it. A
   tap meant for the QR could delete the photo. The button now takes the
   first corner no QR covers.
   ══════════════════════════════════════════════════════════════════════════ */

const page = { x: 0, y: 0, w: 400, h: 400 };
const chip = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
  const s = 60, p = 21;
  return { x: corner.endsWith('l') ? p : 400 - p - s, y: corner.startsWith('t') ? p : 400 - p - s, w: s, h: s };
};

describe('trashSpot', () => {
  it('no QR → top-right, as always', () => {
    expect(trashSpot(page, [])).toEqual({ top: TRASH_INSET, right: TRASH_INSET });
  });
  it.each([
    ['tr', { top: TRASH_INSET, left: TRASH_INSET }],
    ['tl', { top: TRASH_INSET, right: TRASH_INSET }],
    ['br', { top: TRASH_INSET, right: TRASH_INSET }],
    ['bl', { top: TRASH_INSET, right: TRASH_INSET }],
  ] as const)('a QR in the %s corner → %o', (corner, spot) => {
    expect(trashSpot(page, [chip(corner)])).toEqual(spot);
  });
  it('QRs in both top corners → bottom-right', () => {
    expect(trashSpot(page, [chip('tr'), chip('tl')])).toEqual({ bottom: TRASH_INSET, right: TRASH_INSET });
  });
});

describe('PageView: the photo\'s trash button keeps clear of the QR', () => {
  let root: Root | null = null;
  let host: HTMLDivElement;
  afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); });
  const render = async (corner: 'tr' | 'tl') => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const t = qrBadgeTemplate('8x8', corner)!;
    const p = {
      id: 'p', layout: 'freeform', size: '8x8', templateId: t.id, slotFills: [0, null], photos: [], textElements: [],
      background: { type: 'solid', solid: '#FFFFFF' },
      qrFills: [null, { kind: 'clip', code: 'abc', destination: 'https://x.test/m/abc', qrPngDataUrl: 'data:image/png;base64,AAAA' }],
    } as unknown as AlbumPage;
    const photos = [{ id: 'ph', previewUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', name: 'a.jpg', type: 'image/jpeg', size: 1, width: 1200, height: 1200 }];
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root!.render(createElement('div', { style: { position: 'relative', width: 400, height: 400 } },
      createElement(PageView, { page: p, photos, singleW: 400, H: 400, pageIndex: 0, editable: true, onRemoveFromSlot: () => {} } as never))); });
    const btn = host.querySelector<HTMLElement>('button[aria-label="Remove photo"]')!;
    const qr = [...host.querySelectorAll<HTMLImageElement>('img')].find((i) => i.src.startsWith('data:image/png'))!.parentElement!;
    const px = (v: string) => parseFloat(v);
    const q = { x: px(qr.style.left), y: px(qr.style.top), w: px(qr.style.width), h: px(qr.style.height) };
    // The button's box on the page (the photo fills the whole full-bleed page).
    const b = {
      x: btn.style.left ? px(btn.style.left) : 400 - px(btn.style.right) - TRASH_SIZE,
      y: btn.style.top ? px(btn.style.top) : 400 - px(btn.style.bottom) - TRASH_SIZE,
      w: TRASH_SIZE, h: TRASH_SIZE,
    };
    const overlap = !(b.x + b.w <= q.x || q.x + q.w <= b.x || b.y + b.h <= q.y || q.y + q.h <= b.y);
    return { btn, overlap };
  };
  it('QR top-right (the tester\'s page) → the trash moves top-left, no overlap', async () => {
    const { btn, overlap } = await render('tr');
    expect(overlap).toBe(false);
    expect(btn.style.left).toBe(`${TRASH_INSET}px`);
  });
  it('QR top-left → the trash stays top-right', async () => {
    const { btn, overlap } = await render('tl');
    expect(overlap).toBe(false);
    expect(btn.style.right).toBe(`${TRASH_INSET}px`);
  });
});
